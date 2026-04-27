from fastapi import APIRouter, HTTPException
import json
from datetime import date
import database
from models.tasks import RecurrenceCreate, RecurrenceUpdate
import business

router = APIRouter()


def _fmt(row):
    r = dict(row)
    r['days_of_week'] = json.loads(r['days_of_week'] or '[]')
    r['tag_ids'] = json.loads(r['tag_ids'] or '[]')
    r['active'] = bool(r['active'])
    return r


@router.post("/generate")
def generate():
    business.generate_recurring_tasks()
    return {"status": "ok"}


@router.get("")
def list_recurrences():
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM task_recurrences WHERE active = 1 ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return {"items": [_fmt(r) for r in rows], "total": len(rows)}


@router.post("", status_code=201)
def create_recurrence(body: RecurrenceCreate):
    conn = database.get_connection()
    result = conn.execute(
        """INSERT INTO task_recurrences
           (title, notes, priority, goal_id, cadence, interval_value, days_of_week, day_of_month, tag_ids)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (
            body.title, body.notes, body.priority, body.goal_id,
            body.cadence, body.interval_value,
            json.dumps(body.days_of_week or []),
            body.day_of_month,
            json.dumps(body.tag_ids),
        )
    ).fetchone()
    conn.commit()
    conn.close()
    return _fmt(result)


@router.put("/{rec_id}")
def update_recurrence(rec_id: int, body: RecurrenceUpdate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM task_recurrences WHERE id = ?", (rec_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Recurrence not found.")

    fields = {}
    if body.title is not None:          fields['title'] = body.title
    if body.notes is not None:          fields['notes'] = body.notes
    if body.priority is not None:       fields['priority'] = body.priority
    if body.goal_id is not None:        fields['goal_id'] = body.goal_id
    if body.cadence is not None:        fields['cadence'] = body.cadence
    if body.interval_value is not None: fields['interval_value'] = body.interval_value
    if body.days_of_week is not None:   fields['days_of_week'] = json.dumps(body.days_of_week)
    if body.day_of_month is not None:   fields['day_of_month'] = body.day_of_month
    if body.tag_ids is not None:        fields['tag_ids'] = json.dumps(body.tag_ids)
    if body.active is not None:         fields['active'] = body.active
    if body.end_date is not None:       fields['end_date'] = body.end_date or None

    scheduling_changed = any(
        f in fields for f in ('cadence', 'interval_value', 'end_date')
    )

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE task_recurrences SET {set_clause} WHERE id = ?",
            list(fields.values()) + [rec_id]
        )

    if scheduling_changed:
        # Clear stale future pending tasks so generation rebuilds on new schedule
        conn.execute(
            "DELETE FROM tasks WHERE recurrence_id = ? AND status = 'pending' AND due_date > ?",
            (rec_id, date.today().isoformat())
        )

    conn.commit()
    conn.close()

    if scheduling_changed:
        business.generate_recurring_tasks()

    conn2 = database.get_connection()
    updated = conn2.execute("SELECT * FROM task_recurrences WHERE id = ?", (rec_id,)).fetchone()
    conn2.close()
    return _fmt(updated)


@router.delete("/{rec_id}", status_code=204)
def delete_recurrence(rec_id: int):
    conn = database.get_connection()
    conn.execute("UPDATE task_recurrences SET active = 0 WHERE id = ?", (rec_id,))
    conn.execute("DELETE FROM tasks WHERE recurrence_id = ? AND status = 'pending'", (rec_id,))
    conn.commit()
    conn.close()
