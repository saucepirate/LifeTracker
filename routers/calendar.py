from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import date as _date, datetime, timedelta
from calendar import monthrange
import calendar as _cal
import json
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
    tag_id: Optional[int] = None
    recurrence_cadence: Optional[str] = None        # 'daily' | 'weekly' | 'monthly' | None
    recurrence_interval: Optional[int] = 1
    recurrence_days_of_week: Optional[List[int]] = None  # 0=Mon … 6=Sun (weekly only)
    recurrence_until: Optional[str] = None


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
    tag_id: Optional[int] = None
    clear_note_id: bool = False
    clear_task_id: bool = False
    clear_tag_id: bool = False
    recurrence_cadence: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_days_of_week: Optional[List[int]] = None
    recurrence_until: Optional[str] = None
    clear_recurrence: bool = False


def _event_full(conn, event_id):
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not row:
        return None
    e = dict(row)
    e['all_day'] = bool(e['all_day'])
    e['recurrence_days_of_week'] = json.loads(e['recurrence_days_of_week']) if e.get('recurrence_days_of_week') else None
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
    if e.get('tag_id'):
        tg = conn.execute("SELECT id, name, color FROM tags WHERE id = ?", (e['tag_id'],)).fetchone()
        e['tag_name']  = tg['name']  if tg else None
        e['tag_color'] = tg['color'] if tg else None
    else:
        e['tag_name']  = None
        e['tag_color'] = None
    return e


def _add_months(d, n):
    month = d.month - 1 + n
    year  = d.year + month // 12
    month = month % 12 + 1
    day   = min(d.day, monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


def _expand_recurring(master, range_start, range_end, exceptions=None):
    """Generate concrete occurrences (as dicts with mutated date/end_date) within
    [range_start, range_end]. range_start/range_end are ISO strings."""
    exc = exceptions or set()
    cadence  = master.get('recurrence_cadence')
    if not cadence:
        return [master]

    interval = master.get('recurrence_interval') or 1
    base     = datetime.strptime(master['date'], '%Y-%m-%d').date()
    rs       = datetime.strptime(range_start, '%Y-%m-%d').date()
    re_      = datetime.strptime(range_end,   '%Y-%m-%d').date()
    until    = datetime.strptime(master['recurrence_until'], '%Y-%m-%d').date() if master.get('recurrence_until') else None
    end      = min(re_, until) if until else re_

    occurrences = []
    span_days = 0
    if master.get('end_date'):
        try:
            o_end = datetime.strptime(master['end_date'], '%Y-%m-%d').date()
            span_days = (o_end - base).days
        except Exception:
            pass

    def emit(d):
        if d.isoformat() in exc:
            return
        e = dict(master)
        e['date'] = d.isoformat()
        if span_days > 0:
            e['end_date'] = (d + timedelta(days=span_days)).isoformat()
        e['_is_recurrence'] = True
        e['_master_id'] = master['id']
        e['_master_date'] = master['date']
        occurrences.append(e)

    if cadence == 'daily':
        # First occurrence on or after rs aligned to base + k*interval
        if base >= rs:
            cur = base
        else:
            steps = (rs - base).days
            cur = base + timedelta(days=((steps + interval - 1) // interval) * interval)
        while cur <= end:
            emit(cur)
            cur = cur + timedelta(days=interval)

    elif cadence == 'weekly':
        try:
            dow = set(json.loads(master.get('recurrence_days_of_week') or '[]'))
        except Exception:
            dow = set()
        if not dow:
            dow = {base.weekday()}
        cur = max(base, rs)
        while cur <= end:
            weeks_since_base = (cur - base).days // 7
            if cur >= base and weeks_since_base % interval == 0 and cur.weekday() in dow:
                emit(cur)
            cur = cur + timedelta(days=1)

    elif cadence == 'monthly':
        cur = base
        # Skip ahead until we're in/past range
        while cur < rs:
            cur = _add_months(cur, interval)
        while cur <= end:
            emit(cur)
            cur = _add_months(cur, interval)

    elif cadence == 'yearly':
        cur = base
        while cur < rs:
            cur = _add_months(cur, 12 * interval)
        while cur <= end:
            emit(cur)
            cur = _add_months(cur, 12 * interval)

    return occurrences


def _get_range_data(conn, start: str, end: str):
    days = {}

    # Calendar events (may span multiple days, may recur)
    event_rows = conn.execute(
        """SELECT e.id, e.title, e.date, e.end_date, e.all_day, e.start_time, e.end_time,
                  e.notes, e.note_id, e.task_id, e.tag_id,
                  e.recurrence_cadence, e.recurrence_interval, e.recurrence_days_of_week, e.recurrence_until,
                  n.title as note_title,
                  t.title as task_title, t.status as task_status, t.priority as task_priority,
                  tg.name  as tag_name,
                  tg.color as tag_color
           FROM events e
           LEFT JOIN notes n ON n.id = e.note_id
           LEFT JOIN tasks t ON t.id = e.task_id
           LEFT JOIN tags  tg ON tg.id = e.tag_id
           WHERE (
             (e.recurrence_cadence IS NULL AND e.date <= ? AND (e.end_date IS NULL OR e.end_date >= ?))
             OR
             (e.recurrence_cadence IS NOT NULL AND e.date <= ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ?))
           )
           ORDER BY e.all_day DESC, CASE WHEN e.start_time IS NULL THEN 1 ELSE 0 END, e.start_time ASC""",
        (end, start, end, start)
    ).fetchall()

    def _place_event(e_dict):
        # Parse dow JSON for the frontend
        dow_raw = e_dict.get('recurrence_days_of_week')
        if isinstance(dow_raw, str):
            try:
                e_dict['recurrence_days_of_week'] = json.loads(dow_raw)
            except Exception:
                e_dict['recurrence_days_of_week'] = None
        ev_start = e_dict['date']
        ev_end   = e_dict.get('end_date') or e_dict['date']
        cur = max(ev_start, start)
        while cur <= min(ev_end, end):
            if cur not in days:
                days[cur] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            days[cur]['events'].append(e_dict)
            d = datetime.strptime(cur, '%Y-%m-%d') + timedelta(days=1)
            cur = d.strftime('%Y-%m-%d')

    # Load exceptions for recurring events in this range
    rec_ids = [dict(r)['id'] for r in event_rows if dict(r).get('recurrence_cadence')]
    exc_map = {}
    if rec_ids:
        ph = ','.join('?' * len(rec_ids))
        for ex in conn.execute(f"SELECT event_id, exception_date FROM event_exceptions WHERE event_id IN ({ph})", rec_ids).fetchall():
            exc_map.setdefault(ex['event_id'], set()).add(ex['exception_date'])

    for row in event_rows:
        e = dict(row)
        e['all_day'] = bool(e['all_day'])
        if e.get('recurrence_cadence'):
            e['is_recurring'] = True
            for occ in _expand_recurring(e, start, end, exceptions=exc_map.get(e['id'])):
                _place_event(occ)
        else:
            e['is_recurring'] = False
            _place_event(e)

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

    # Timed itinerary entries (read-only blocks during trip date range)
    _trip_colors = {
        'blue': '#4A90D9', 'teal': '#2BAE8E', 'amber': '#E8A624',
        'purple': '#8B5CF6', 'coral': '#E8614A', 'green': '#4CAF50',
        'pink': '#E879A4', 'gray': '#8A8A8A',
    }
    itin_rows = conn.execute(
        """SELECT ie.id, ie.trip_id, ie.entry_date, ie.entry_type, ie.title,
                  ie.start_time, ie.end_time, ie.location,
                  t.name as trip_name, t.color as trip_color_name
           FROM itinerary_entries ie
           JOIN trips t ON t.id = ie.trip_id
           WHERE ie.start_time IS NOT NULL
             AND ie.entry_date >= ? AND ie.entry_date <= ?
           ORDER BY ie.start_time ASC""",
        (start, end)
    ).fetchall()

    for row in itin_rows:
        r = dict(row)
        r['trip_color'] = _trip_colors.get(r.pop('trip_color_name', ''), '#4A90D9')
        d = r['entry_date']
        if d not in days:
            days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': [], 'itinerary': []}
        if 'itinerary' not in days[d]:
            days[d]['itinerary'] = []
        days[d]['itinerary'].append(r)

    # Project deadlines and milestones
    try:
        proj_rows = conn.execute(
            """SELECT id, title, color, deadline FROM projects
               WHERE deadline >= ? AND deadline <= ? AND status != 'cancelled'""",
            (start, end)
        ).fetchall()
        for row in proj_rows:
            r = dict(row)
            d = r['deadline']
            if d not in days:
                days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            if 'project_items' not in days[d]:
                days[d]['project_items'] = []
            days[d]['project_items'].append({
                'item_type': 'deadline',
                'project_id': r['id'],
                'title': r['title'],
                'color': r['color'],
                'date': d,
            })

        pm_rows = conn.execute(
            """SELECT pm.id, pm.project_id, pm.title, pm.due_date, pm.status,
                      pm.is_deliverable, p.title as project_title, p.color
               FROM project_milestones pm
               JOIN projects p ON p.id = pm.project_id
               WHERE pm.due_date >= ? AND pm.due_date <= ?
                 AND p.status != 'cancelled'""",
            (start, end)
        ).fetchall()
        for row in pm_rows:
            r = dict(row)
            r['is_deliverable'] = bool(r['is_deliverable'])
            d = r['due_date']
            if d not in days:
                days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            if 'project_items' not in days[d]:
                days[d]['project_items'] = []
            days[d]['project_items'].append({
                'item_type': 'milestone',
                'id': r['id'],
                'project_id': r['project_id'],
                'title': r['title'],
                'project_title': r['project_title'],
                'color': r['color'],
                'status': r['status'],
                'is_deliverable': r['is_deliverable'],
                'date': d,
            })

        # Project tasks with due dates (INT-006/007)
        pt_rows = conn.execute(
            """SELECT pt.id, pt.project_id, pt.title, pt.due_date, pt.status,
                      pt.priority, pt.assigned_to,
                      p.title as project_title, p.color,
                      pm2.title as milestone_title
               FROM project_tasks pt
               JOIN projects p ON p.id = pt.project_id
               LEFT JOIN project_milestones pm2 ON pm2.id = pt.milestone_id
               WHERE pt.due_date >= ? AND pt.due_date <= ?
                 AND p.status != 'cancelled'
                 AND pt.status NOT IN ('cancelled','skipped')
               ORDER BY pt.due_date ASC""",
            (start, end)
        ).fetchall()
        for row in pt_rows:
            r = dict(row)
            d = r['due_date']
            if d not in days:
                days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            if 'project_items' not in days[d]:
                days[d]['project_items'] = []
            days[d]['project_items'].append({
                'item_type': 'task',
                'id': r['id'],
                'project_id': r['project_id'],
                'title': r['title'],
                'project_title': r['project_title'],
                'color': r['color'],
                'status': r['status'],
                'priority': r.get('priority'),
                'milestone_title': r.get('milestone_title'),
                'date': d,
            })
    except Exception:
        pass

    # Timed day plan items — shown in calendar as events
    # Only items without cal_event_id (legacy linked items already appear via the events table)
    try:
        plan_rows = conn.execute(
            """SELECT dpi.id, dpi.title, dpi.plan_date AS date, dpi.start_time, dpi.end_time,
                      dpi.status,
                      tg.name AS tag_name, tg.color AS tag_color
               FROM day_plan_items dpi
               LEFT JOIN tags tg ON tg.id = dpi.tag_id
               WHERE dpi.plan_date >= ? AND dpi.plan_date <= ?
                 AND dpi.start_time IS NOT NULL
                 AND dpi.status != 'skipped'
                 AND dpi.cal_event_id IS NULL""",
            (start, end)
        ).fetchall()
        for row in plan_rows:
            p = dict(row)
            d = p['date']
            if d not in days:
                days[d] = {'events': [], 'tasks': [], 'milestones': [], 'metrics': []}
            days[d]['events'].append({
                'id': -(p['id']),
                '_plan_item_id': p['id'],
                '_source': 'plan',
                'title': p['title'],
                'date': d,
                'all_day': False,
                'start_time': p['start_time'],
                'end_time': p['end_time'],
                'tag_name': p.get('tag_name'),
                'tag_color': p.get('tag_color'),
                'is_done': p['status'] == 'done',
                'is_recurring': False,
            })
    except Exception:
        pass

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
    dow_json = json.dumps(body.recurrence_days_of_week) if body.recurrence_days_of_week else None
    result = conn.execute(
        """INSERT INTO events (title, date, end_date, all_day, start_time, end_time, notes, note_id, task_id, tag_id,
                               recurrence_cadence, recurrence_interval, recurrence_days_of_week, recurrence_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.title, body.date, body.end_date, 1 if body.all_day else 0,
         body.start_time, body.end_time, body.notes, body.note_id, body.task_id, body.tag_id,
         body.recurrence_cadence, body.recurrence_interval or 1, dow_json, body.recurrence_until)
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
    if body.clear_tag_id:
        fields['tag_id'] = None
    elif body.tag_id is not None:
        fields['tag_id'] = body.tag_id

    if body.clear_recurrence:
        fields['recurrence_cadence']        = None
        fields['recurrence_interval']       = 1
        fields['recurrence_days_of_week']   = None
        fields['recurrence_until']          = None
    else:
        if body.recurrence_cadence is not None:
            fields['recurrence_cadence'] = body.recurrence_cadence
        if body.recurrence_interval is not None:
            fields['recurrence_interval'] = body.recurrence_interval
        if body.recurrence_days_of_week is not None:
            fields['recurrence_days_of_week'] = json.dumps(body.recurrence_days_of_week)
        if body.recurrence_until is not None:
            fields['recurrence_until'] = body.recurrence_until

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE events SET {set_clause} WHERE id = ?",
                     list(fields.values()) + [event_id])

    conn.commit()
    event = _event_full(conn, event_id)
    conn.close()
    return event


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int,
                 scope: str = Query('all'),
                 occurrence_date: str = Query(None)):
    conn = database.get_connection()
    event = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not event:
        conn.close()
        raise HTTPException(status_code=404, detail="Event not found.")
    event = dict(event)

    if scope == 'this' and occurrence_date:
        # Exclude just this date from the recurrence
        conn.execute(
            "INSERT OR IGNORE INTO event_exceptions (event_id, exception_date) VALUES (?,?)",
            (event_id, occurrence_date)
        )
    elif scope == 'future' and occurrence_date:
        from datetime import date as _d, timedelta as _td
        occ = _d.fromisoformat(occurrence_date)
        master_start = _d.fromisoformat(event['date'])
        if occ <= master_start:
            # No past occurrences to preserve — delete the whole series
            conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        else:
            # Truncate recurrence to end the day before this occurrence
            prev = (occ - _td(days=1)).isoformat()
            conn.execute("UPDATE events SET recurrence_until = ? WHERE id = ?", (prev, event_id))
    else:
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))

    conn.commit()
    conn.close()
