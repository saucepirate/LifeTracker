from fastapi import APIRouter, HTTPException
from datetime import date, timedelta
import database
from models.trips import TripCreate, TripUpdate, AttendeeCreate, AttendeeUpdate

router = APIRouter()

DEFAULT_PACKING_CATEGORIES = [
    'Clothing', 'Toiletries', 'Electronics', 'Documents', 'Medication', 'Miscellaneous'
]

TRIP_COLOR_HEX = {
    'blue':   '#4A90D9',
    'teal':   '#2BAE8E',
    'amber':  '#E8A624',
    'purple': '#8B5CF6',
    'coral':  '#E8614A',
    'green':  '#4CAF50',
    'pink':   '#E879A4',
    'gray':   '#8A8A8A',
}


def _color_hex(color):
    return TRIP_COLOR_HEX.get(color, TRIP_COLOR_HEX['blue'])


def _trip_summary(conn, row, today=None):
    if today is None:
        today = date.today().isoformat()
    t = dict(row)
    t['color_hex'] = _color_hex(t['color'])

    start = t['start_date']
    t['days_until'] = (date.fromisoformat(start) - date.fromisoformat(today)).days if start >= today else None

    if t.get('tag_id'):
        t['open_task_count'] = conn.execute(
            "SELECT COUNT(*) FROM tasks t2 JOIN task_tags tt ON tt.task_id = t2.id "
            "WHERE tt.tag_id = ? AND t2.status = 'pending'",
            (t['tag_id'],)
        ).fetchone()[0]
        t['total_task_count'] = conn.execute(
            "SELECT COUNT(*) FROM tasks t2 JOIN task_tags tt ON tt.task_id = t2.id WHERE tt.tag_id = ?",
            (t['tag_id'],)
        ).fetchone()[0]
    else:
        t['open_task_count'] = 0
        t['total_task_count'] = 0

    t['packing_total'] = conn.execute(
        "SELECT COUNT(*) FROM packing_items WHERE trip_id = ?", (t['id'],)
    ).fetchone()[0]
    t['packing_checked'] = conn.execute(
        "SELECT COUNT(*) FROM packing_items WHERE trip_id = ? AND checked = 1", (t['id'],)
    ).fetchone()[0]

    t['budget_committed'] = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ? AND phase = 'pre_trip'",
        (t['id'],)
    ).fetchone()[0]
    t['budget_spent'] = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ? AND phase = 'in_trip'",
        (t['id'],)
    ).fetchone()[0]

    return t


def _trip_full(conn, trip_id, today=None):
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        return None
    t = _trip_summary(conn, row, today)
    attendees = conn.execute(
        "SELECT * FROM trip_attendees WHERE trip_id = ? ORDER BY sort_order, id",
        (trip_id,)
    ).fetchall()
    t['attendees'] = [dict(a) for a in attendees]
    return t


# ── Trips CRUD ─────────────────────────────────────────────────

@router.get("")
def list_trips():
    conn = database.get_connection()
    today = date.today().isoformat()
    rows = conn.execute("SELECT * FROM trips ORDER BY start_date ASC").fetchall()
    upcoming, planning, past = [], [], []
    for row in rows:
        t = _trip_summary(conn, row, today)
        if t['status'] == 'Completed' or t['end_date'] < today:
            past.append(t)
        elif t['status'] == 'Planning':
            planning.append(t)
        else:
            upcoming.append(t)
    conn.close()
    return {"upcoming": upcoming, "planning": planning, "past": past, "total": len(rows)}


@router.post("", status_code=201)
def create_trip(body: TripCreate):
    conn = database.get_connection()

    tag_id = None
    for attempt in [body.name, f"{body.name} Trip"]:
        try:
            row = conn.execute(
                "INSERT INTO tags (name, color, is_system) VALUES (?, ?, 1) RETURNING id",
                (attempt, body.color)
            ).fetchone()
            tag_id = row[0]
            break
        except Exception:
            continue

    c = conn.execute(
        """INSERT INTO trips (name, destination, start_date, end_date, status, color, tag_id)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.name, body.destination, body.start_date, body.end_date, body.status, body.color, tag_id)
    )
    trip_id = c.fetchone()[0]

    for i, cat in enumerate(DEFAULT_PACKING_CATEGORIES):
        conn.execute(
            "INSERT INTO packing_categories (trip_id, name, sort_order) VALUES (?, ?, ?)",
            (trip_id, cat, i)
        )

    me = conn.execute("SELECT value FROM settings WHERE key = 'user_name'").fetchone()
    if me and me['value'] and me['value'] != 'there':
        conn.execute(
            "INSERT INTO trip_attendees (trip_id, name, is_me, sort_order) VALUES (?, ?, 1, 0)",
            (trip_id, me['value'])
        )

    conn.commit()
    trip = _trip_full(conn, trip_id)
    conn.close()
    return trip


@router.get("/{trip_id}")
def get_trip(trip_id: int):
    conn = database.get_connection()
    trip = _trip_full(conn, trip_id)
    conn.close()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return trip


@router.put("/{trip_id}")
def update_trip(trip_id: int, body: TripUpdate):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found.")

    updates = {}
    for field in ['name', 'destination', 'start_date', 'end_date', 'status', 'color',
                  'flight_confirmation', 'hotel_confirmation', 'car_rental', 'address',
                  'emergency_contact', 'passport_notes',
                  'custom_field_1_label', 'custom_field_1_value',
                  'custom_field_2_label', 'custom_field_2_value', 'budget_currency']:
        val = getattr(body, field)
        if val is not None:
            updates[field] = val

    if body.clear_budget_total:
        updates['budget_total'] = None
    elif body.budget_total is not None:
        updates['budget_total'] = body.budget_total

    if updates:
        set_clause = ', '.join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE trips SET {set_clause} WHERE id = ?", (*updates.values(), trip_id))

    if row['tag_id']:
        if body.name is not None:
            try:
                conn.execute(
                    "UPDATE tags SET name = ? WHERE id = ? AND is_system = 1",
                    (body.name, row['tag_id'])
                )
            except Exception:
                pass
        if body.color is not None:
            conn.execute(
                "UPDATE tags SET color = ? WHERE id = ? AND is_system = 1",
                (body.color, row['tag_id'])
            )

    conn.commit()
    trip = _trip_full(conn, trip_id)
    conn.close()
    return trip


@router.delete("/{trip_id}", status_code=204)
def delete_trip(trip_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found.")
    tag_id = row['tag_id']
    conn.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
    if tag_id:
        conn.execute("DELETE FROM tags WHERE id = ? AND is_system = 1", (tag_id,))
    conn.commit()
    conn.close()


# ── Overview ───────────────────────────────────────────────────

@router.get("/{trip_id}/overview")
def get_overview(trip_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM trips WHERE id = ?", (trip_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found.")
    trip = dict(row)
    today = date.today().isoformat()
    day_after = (date.today() + timedelta(days=2)).isoformat()

    open_tasks, next_due = 0, None
    if trip.get('tag_id'):
        open_tasks = conn.execute(
            "SELECT COUNT(*) FROM tasks t JOIN task_tags tt ON tt.task_id = t.id "
            "WHERE tt.tag_id = ? AND t.status = 'pending'",
            (trip['tag_id'],)
        ).fetchone()[0]
        nd = conn.execute(
            "SELECT title, due_date FROM tasks t JOIN task_tags tt ON tt.task_id = t.id "
            "WHERE tt.tag_id = ? AND t.status = 'pending' AND t.due_date IS NOT NULL "
            "ORDER BY t.due_date ASC LIMIT 1",
            (trip['tag_id'],)
        ).fetchone()
        next_due = dict(nd) if nd else None

    budget_committed = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ? AND phase = 'pre_trip'",
        (trip_id,)
    ).fetchone()[0]
    budget_spent = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ? AND phase = 'in_trip'",
        (trip_id,)
    ).fetchone()[0]

    packing_total = conn.execute(
        "SELECT COUNT(*) FROM packing_items WHERE trip_id = ?", (trip_id,)
    ).fetchone()[0]
    packing_checked = conn.execute(
        "SELECT COUNT(*) FROM packing_items WHERE trip_id = ? AND checked = 1", (trip_id,)
    ).fetchone()[0]

    itinerary_preview = conn.execute(
        "SELECT * FROM itinerary_entries WHERE trip_id = ? AND entry_date BETWEEN ? AND ? "
        "ORDER BY entry_date, start_time, sort_order",
        (trip_id, today, day_after)
    ).fetchall()

    conn.close()
    return {
        "open_task_count": open_tasks,
        "next_due_task": next_due,
        "budget_committed": budget_committed,
        "budget_spent": budget_spent,
        "budget_total": trip['budget_total'],
        "budget_currency": trip['budget_currency'],
        "packing_checked": packing_checked,
        "packing_total": packing_total,
        "itinerary_preview": [dict(e) for e in itinerary_preview],
    }


# ── Attendees ──────────────────────────────────────────────────

@router.get("/{trip_id}/attendees")
def list_attendees(trip_id: int):
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM trip_attendees WHERE trip_id = ? ORDER BY sort_order, id",
        (trip_id,)
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/{trip_id}/attendees", status_code=201)
def add_attendee(trip_id: int, body: AttendeeCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Trip not found.")
    if body.is_me:
        conn.execute("UPDATE trip_attendees SET is_me = 0 WHERE trip_id = ?", (trip_id,))
    c = conn.execute(
        "INSERT INTO trip_attendees (trip_id, name, is_me, sort_order) VALUES (?, ?, ?, ?) RETURNING *",
        (trip_id, body.name, body.is_me, body.sort_order)
    )
    row = c.fetchone()
    conn.commit()
    conn.close()
    return dict(row)


@router.put("/{trip_id}/attendees/{att_id}")
def update_attendee(trip_id: int, att_id: int, body: AttendeeUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM trip_attendees WHERE id = ? AND trip_id = ?", (att_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Attendee not found.")

    if body.is_me:
        conn.execute("UPDATE trip_attendees SET is_me = 0 WHERE trip_id = ?", (trip_id,))

    name = body.name if body.name is not None else row['name']
    is_me = body.is_me if body.is_me is not None else row['is_me']
    sort_order = body.sort_order if body.sort_order is not None else row['sort_order']

    conn.execute(
        "UPDATE trip_attendees SET name = ?, is_me = ?, sort_order = ? WHERE id = ?",
        (name, is_me, sort_order, att_id)
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM trip_attendees WHERE id = ?", (att_id,)).fetchone()
    conn.close()
    return dict(updated)


@router.delete("/{trip_id}/attendees/{att_id}", status_code=204)
def delete_attendee(trip_id: int, att_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM trip_attendees WHERE id = ? AND trip_id = ?", (att_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Attendee not found.")
    conn.execute("DELETE FROM trip_attendees WHERE id = ?", (att_id,))
    conn.commit()
    conn.close()
