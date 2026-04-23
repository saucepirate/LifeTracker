from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import date as _date, datetime, timedelta
import calendar as _cal
import database
import business
from pydantic import BaseModel

router = APIRouter()


class EventCreate(BaseModel):
    title: str
    date: str
    end_date: Optional[str] = None
    all_day: bool = True
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None
    note_id: Optional[int] = None
    task_id: Optional[int] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    end_date: Optional[str] = None
    all_day: Optional[bool] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None
    note_id: Optional[int] = None
    task_id: Optional[int] = None
    clear_note_id: bool = False
    clear_task_id: bool = False


def _event_full(conn, event_id):
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not row:
        return None
    e = dict(row)
    e['all_day'] = bool(e['all_day'])
    if e.get('note_id'):
        n = conn.execute("SELECT id, title FROM notes WHERE id = ?", (e['note_id'],)).fetchone()
        e['note_title'] = n['title'] if n else None
    else:
        e['note_title'] = None
    if e.get('task_id'):
        t = conn.execute("SELECT id, title, status, priority FROM tasks WHERE id = ?", (e['task_id'],)).fetchone()
        e['task_title'] = t['title'] if t else None
        e['task_status'] = t['status'] if t else None
    else:
        e['task_title'] = None
        e['task_status'] = None
    return e


def _get_range_data(conn, start: str, end: str):
    days = {}

    # Calendar events (may span multiple days)
    event_rows = conn.execute(
        """SELECT e.id, e.title, e.date, e.end_date, e.all_day, e.start_time, e.end_time,
                  e.notes, e.note_id, e.task_id,
                  n.title as note_title,
                  t.title as task_title, t.status as task_status, t.priority as task_priority
           FROM events e
           LEFT JOIN notes n ON n.id = e.note_id
           LEFT JOIN tasks t ON t.id = e.task_id
           WHERE e.date <= ? AND (e.end_date IS NULL OR e.end_date >= ?)
           ORDER BY e.all_day DESC, CASE WHEN e.start_time IS NULL THEN 1 ELSE 0 END, e.start_time ASC""",
        (end, start)
    ).fetchall()

    for row in event_rows:
        e = dict(row)
        e['all_day'] = bool(e['all_day'])
        ev_start = e['date']
        ev_end = e['end_date'] or e['date']
        cur = max(ev_start, start)
        while cur <= min(ev_end, end):
            if cur not in days:
                days[cur] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            days[cur]['events'].append(e)
            d = datetime.strptime(cur, '%Y-%m-%d') + timedelta(days=1)
            cur = d.strftime('%Y-%m-%d')

    # Tasks by due_date
    task_rows = conn.execute(
        """SELECT id, title, priority, status, goal_id, is_recurring, due_date
           FROM tasks
           WHERE due_date >= ? AND due_date <= ?
           ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
        (start, end)
    ).fetchall()

    for row in task_rows:
        t = dict(row)
        t['is_recurring'] = bool(t['is_recurring'])
        d = t['due_date']
        if d not in days:
            days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
        days[d]['tasks'].append(t)

    # Milestones by target_date
    ms_rows = conn.execute(
        """SELECT gm.id, gm.goal_id, gm.title, gm.target_date, gm.completed, gm.completed_at,
                  g.title as goal_title
           FROM goal_milestones gm
           JOIN goals g ON g.id = gm.goal_id
           WHERE gm.target_date >= ? AND gm.target_date <= ?
           ORDER BY gm.target_date ASC""",
        (start, end)
    ).fetchall()

    for row in ms_rows:
        m = dict(row)
        m['completed'] = bool(m['completed'])
        d = m['target_date']
        if d not in days:
            days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
        days[d]['milestones'].append(m)

    # Metrics by target_date (incomplete only)
    met_rows = conn.execute(
        """SELECT gm.id, gm.goal_id, gm.label, gm.target_date, gm.current_value,
                  gm.target_value, gm.unit, gm.start_value,
                  g.title as goal_title
           FROM goal_metrics gm
           JOIN goals g ON g.id = gm.goal_id
           WHERE gm.target_date >= ? AND gm.target_date <= ?
             AND (gm.completed IS NULL OR gm.completed = 0)
           ORDER BY gm.target_date ASC""",
        (start, end)
    ).fetchall()

    for row in met_rows:
        m = dict(row)
        d = m['target_date']
        if d not in days:
            days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
        days[d]['metrics'].append(m)

    return days


@router.get("/month")
def calendar_month(year: Optional[int] = None, month: Optional[int] = None):
    today = _date.today()
    if year is None:
        year = today.year
    if month is None:
        month = today.month

    first_day = _date(year, month, 1)
    last_day = _date(year, month, _cal.monthrange(year, month)[1])

    # Grid padding: Monday-based weeks
    grid_start = first_day - timedelta(days=first_day.weekday())
    last_weekday = last_day.weekday()
    grid_end = last_day + timedelta(days=(6 - last_weekday))

    business.generate_recurring_tasks(until=grid_end)
    conn = database.get_connection()
    days = _get_range_data(conn, grid_start.isoformat(), grid_end.isoformat())
    conn.close()

    return {
        "year": year,
        "month": month,
        "grid_start": grid_start.isoformat(),
        "grid_end": grid_end.isoformat(),
        "days": days,
    }


@router.get("/week")
def calendar_week(date: Optional[str] = None):
    today = _date.today()
    d = datetime.strptime(date, '%Y-%m-%d').date() if date else today
    week_start = d - timedelta(days=d.weekday())
    week_end = week_start + timedelta(days=6)

    business.generate_recurring_tasks(until=week_end)
    conn = database.get_connection()
    days = _get_range_data(conn, week_start.isoformat(), week_end.isoformat())
    conn.close()

    return {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "days": days,
    }


@router.get("/day")
def calendar_day(date: Optional[str] = None):
    date_str = date or _date.today().isoformat()
    conn = database.get_connection()
    days = _get_range_data(conn, date_str, date_str)
    conn.close()
    return days.get(date_str, {'events': [], 'tasks': [], 'milestones': [], 'metrics': []})


# ── Event CRUD ────────────────────────────────────────────────

@router.post("/events", status_code=201)
def create_event(body: EventCreate):
    conn = database.get_connection()
    result = conn.execute(
        """INSERT INTO events (title, date, end_date, all_day, start_time, end_time, notes, note_id, task_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.title, body.date, body.end_date, 1 if body.all_day else 0,
         body.start_time, body.end_time, body.notes, body.note_id, body.task_id)
    ).fetchone()
    conn.commit()
    event = _event_full(conn, result[0])
    conn.close()
    return event


@router.put("/events/{event_id}")
def update_event(event_id: int, body: EventUpdate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")

    fields = {}
    if body.title is not None:      fields['title']      = body.title
    if body.date is not None:       fields['date']       = body.date
    if body.end_date is not None:   fields['end_date']   = body.end_date
    if body.all_day is not None:    fields['all_day']    = 1 if body.all_day else 0
    if body.start_time is not None: fields['start_time'] = body.start_time
    if body.end_time is not None:   fields['end_time']   = body.end_time
    if body.notes is not None:      fields['notes']      = body.notes
    if body.clear_note_id:
        fields['note_id'] = None
    elif body.note_id is not None:
        fields['note_id'] = body.note_id
    if body.clear_task_id:
        fields['task_id'] = None
    elif body.task_id is not None:
        fields['task_id'] = body.task_id

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE events SET {set_clause} WHERE id = ?",
                     list(fields.values()) + [event_id])

    conn.commit()
    event = _event_full(conn, event_id)
    conn.close()
    return event


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
