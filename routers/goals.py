from fastapi import APIRouter, HTTPException
from datetime import date, datetime, timedelta
import database
import business
from models.goals import GoalCreate, GoalUpdate, MilestoneCreate, MilestoneUpdate, LogEntryCreate, MetricCreate, MetricUpdate, HabitCreate, HabitUpdate
from business import calc_streaks

router = APIRouter()


def _recalc_progress(goal_id, conn):
    goal = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if not goal:
        return
    goal = dict(goal)
    sources = []

    # Numeric progress — prefer goal_metrics if any exist, else fall back to goal-level fields
    metrics = conn.execute(
        "SELECT start_value, current_value, target_value FROM goal_metrics WHERE goal_id = ?",
        (goal_id,)
    ).fetchall()
    if metrics:
        for m in metrics:
            sv = m['start_value'] or 0
            tv = m['target_value']
            cv = m['current_value'] if m['current_value'] is not None else sv
            if tv is not None and tv != sv:
                sources.append(max(0.0, min(100.0, ((cv - sv) / (tv - sv)) * 100)))
    else:
        sv = goal['start_value'] or 0
        tv = goal['target_value']
        cv = goal['current_value'] if goal['current_value'] is not None else sv
        if tv is not None and tv != sv:
            sources.append(max(0.0, min(100.0, ((cv - sv) / (tv - sv)) * 100)))

    # Milestone progress
    total = conn.execute(
        "SELECT COUNT(*) FROM goal_milestones WHERE goal_id = ?", (goal_id,)
    ).fetchone()[0]
    if total > 0:
        done = conn.execute(
            "SELECT COUNT(*) FROM goal_milestones WHERE goal_id = ? AND completed = 1", (goal_id,)
        ).fetchone()[0]
        sources.append(done / total * 100)

    # Habit progress — prefer goal_habits if any exist, else fall back to goal-level fields
    habit_rows = conn.execute(
        "SELECT id, weekly_target_minutes, min_days_per_week FROM goal_habits WHERE goal_id = ?",
        (goal_id,)
    ).fetchall()
    if habit_rows:
        for h in habit_rows:
            wt = h['weekly_target_minutes'] or 0
            md_target = h['min_days_per_week'] or 0
            if wt > 0 or md_target > 0:
                since = (date.today() - timedelta(days=7)).isoformat()
                h_entries = conn.execute(
                    "SELECT value, logged_at FROM goal_log_entries WHERE goal_id = ? AND habit_id = ? AND logged_at >= ?",
                    (goal_id, h['id'], since)
                ).fetchall()
                if wt > 0:
                    total_min = sum(r['value'] or 0 for r in h_entries)
                    sources.append(min(100.0, total_min / wt * 100))
                if md_target > 0:
                    days_done = len(set(r['logged_at'][:10] for r in h_entries))
                    sources.append(min(100.0, days_done / md_target * 100))
    else:
        wt = goal['weekly_target_minutes'] or 0
        if wt > 0:
            since = (date.today() - timedelta(days=7)).isoformat()
            rows = conn.execute(
                "SELECT value FROM goal_log_entries WHERE goal_id = ? AND logged_at >= ?",
                (goal_id, since)
            ).fetchall()
            total_minutes = sum(r['value'] or 0 for r in rows)
            sources.append(min(100.0, (total_minutes / wt * 100)))

    progress_pct = sum(sources) / len(sources) if sources else 0.0
    conn.execute("UPDATE goals SET progress_pct = ? WHERE id = ?", (progress_pct, goal_id))
    business.evaluate_on_track(goal_id, conn)


def _goal_full(conn, goal_id):
    row = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if not row:
        return None
    g = dict(row)
    g['is_on_track'] = bool(g['is_on_track'])

    metrics = conn.execute(
        "SELECT * FROM goal_metrics WHERE goal_id = ? ORDER BY sort_order, id",
        (goal_id,)
    ).fetchall()
    g['metrics'] = [dict(m) for m in metrics]

    habits_rows = conn.execute(
        "SELECT * FROM goal_habits WHERE goal_id = ? ORDER BY sort_order, id",
        (goal_id,)
    ).fetchall()
    habit_list = []
    for h in habits_rows:
        hd = dict(h)
        h_entries = conn.execute(
            "SELECT * FROM goal_log_entries WHERE goal_id = ? AND habit_id = ? ORDER BY logged_at DESC LIMIT 20",
            (goal_id, h['id'])
        ).fetchall()
        hd['log_entries'] = [dict(e) for e in h_entries]
        habit_list.append(hd)
    g['habits'] = habit_list

    milestones = conn.execute(
        "SELECT * FROM goal_milestones WHERE goal_id = ? ORDER BY sort_order, id",
        (goal_id,)
    ).fetchall()
    g['milestones'] = []
    for m in milestones:
        md = dict(m)
        md['completed'] = bool(md['completed'])
        g['milestones'].append(md)

    log_entries = conn.execute(
        "SELECT * FROM goal_log_entries WHERE goal_id = ? AND habit_id IS NULL ORDER BY logged_at DESC LIMIT 20",
        (goal_id,)
    ).fetchall()
    g['log_entries'] = [dict(e) for e in log_entries]

    recent_tasks = conn.execute(
        """SELECT t.id, t.title, t.completed_at FROM goal_task_log gtl
           JOIN tasks t ON t.id = gtl.task_id
           WHERE gtl.goal_id = ?
           ORDER BY gtl.completed_at DESC LIMIT 30""",
        (goal_id,)
    ).fetchall()
    g['recent_tasks'] = [dict(r) for r in recent_tasks]

    pending_tasks = conn.execute(
        """SELECT id, title, due_date, priority FROM tasks
           WHERE goal_id = ? AND status = 'pending'
           ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC LIMIT 3""",
        (goal_id,)
    ).fetchall()
    g['pending_tasks'] = [dict(r) for r in pending_tasks]

    g['current_streak'], g['best_streak'] = calc_streaks(goal_id, conn)

    notes = conn.execute(
        "SELECT id, title, updated_at FROM notes WHERE goal_id = ? ORDER BY updated_at DESC",
        (goal_id,)
    ).fetchall()
    g['notes'] = [dict(r) for r in notes]

    return g


@router.get("")
def list_goals(status: str = None, area: str = None):
    conn = database.get_connection()
    sql = "SELECT * FROM goals"
    params = []
    conditions = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if area:
        conditions.append("area = ?")
        params.append(area)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    items = [_goal_full(conn, r['id']) for r in rows]
    conn.close()
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_goal(body: GoalCreate):
    conn = database.get_connection()
    result = conn.execute(
        """INSERT INTO goals
           (title, description, area, goal_type, target_date,
            start_value, target_value, current_value, unit,
            weekly_target_minutes, min_days_per_week)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.title, body.description, body.area, body.goal_type, body.target_date,
         body.start_value, body.target_value,
         body.current_value if body.current_value is not None else body.start_value,
         body.unit, body.weekly_target_minutes, body.min_days_per_week)
    ).fetchone()
    goal_id = result[0]
    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.get("/{goal_id}")
def get_goal(goal_id: int):
    conn = database.get_connection()
    goal = _goal_full(conn, goal_id)
    conn.close()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return goal


@router.put("/{goal_id}")
def update_goal(goal_id: int, body: GoalUpdate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")

    fields = {}
    if body.title is not None:                  fields['title'] = body.title
    if body.description is not None:            fields['description'] = body.description
    if body.area is not None:                   fields['area'] = body.area
    if body.status is not None:                 fields['status'] = body.status
    if body.clear_target_date:
        fields['target_date'] = None
    elif body.target_date is not None:
        fields['target_date'] = body.target_date
    if body.start_value is not None:            fields['start_value'] = body.start_value
    if body.target_value is not None:           fields['target_value'] = body.target_value
    if body.current_value is not None:          fields['current_value'] = body.current_value
    if body.unit is not None:                   fields['unit'] = body.unit
    if body.weekly_target_minutes is not None:  fields['weekly_target_minutes'] = body.weekly_target_minutes
    if body.min_days_per_week is not None:      fields['min_days_per_week'] = body.min_days_per_week
    if body.pinned is not None:                 fields['pinned'] = body.pinned

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE goals SET {set_clause} WHERE id = ?",
            list(fields.values()) + [goal_id]
        )

    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")
    conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    conn.commit()
    conn.close()


# ── Log entries ──────────────────────────────────────────────

@router.post("/{goal_id}/log", status_code=201)
def add_log_entry(goal_id: int, body: LogEntryCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")
    logged_at = body.logged_at or datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    conn.execute(
        "INSERT INTO goal_log_entries (goal_id, logged_at, value, note, habit_id) VALUES (?, ?, ?, ?, ?)",
        (goal_id, logged_at, body.value, body.note, body.habit_id)
    )
    goal_row = conn.execute("SELECT target_value FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if goal_row and goal_row['target_value'] is not None and body.value is not None:
        conn.execute("UPDATE goals SET current_value = ? WHERE id = ?", (body.value, goal_id))
    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.delete("/{goal_id}/log/{entry_id}", status_code=204)
def delete_log_entry(goal_id: int, entry_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM goal_log_entries WHERE id = ? AND goal_id = ?", (entry_id, goal_id))
    _recalc_progress(goal_id, conn)
    conn.commit()
    conn.close()


# ── Milestones ───────────────────────────────────────────────

@router.post("/{goal_id}/milestones", status_code=201)
def add_milestone(goal_id: int, body: MilestoneCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")
    conn.execute(
        "INSERT INTO goal_milestones (goal_id, title, target_date, sort_order, metric_id) VALUES (?, ?, ?, ?, ?)",
        (goal_id, body.title, body.target_date, body.sort_order, body.metric_id)
    )
    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.put("/{goal_id}/milestones/{ms_id}")
def update_milestone(goal_id: int, ms_id: int, body: MilestoneUpdate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM goal_milestones WHERE id = ? AND goal_id = ?", (ms_id, goal_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Milestone not found.")

    fields = {}
    if body.title is not None:       fields['title'] = body.title
    if body.clear_target_date:
        fields['target_date'] = None
    elif body.target_date is not None:
        fields['target_date'] = body.target_date
    if body.sort_order is not None:  fields['sort_order'] = body.sort_order
    if body.completed is not None:
        fields['completed'] = body.completed
        fields['completed_at'] = (
            datetime.now().strftime('%Y-%m-%dT%H:%M:%S') if body.completed else None
        )
    if body.clear_metric_id:
        fields['metric_id'] = None
    elif body.metric_id is not None:
        fields['metric_id'] = body.metric_id

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE goal_milestones SET {set_clause} WHERE id = ?",
            list(fields.values()) + [ms_id]
        )

    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.delete("/{goal_id}/milestones/{ms_id}", status_code=204)
def delete_milestone(goal_id: int, ms_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM goal_milestones WHERE id = ? AND goal_id = ?", (ms_id, goal_id))
    _recalc_progress(goal_id, conn)
    conn.commit()
    conn.close()


# ── Metrics ──────────────────────────────────────────────────

@router.post("/{goal_id}/metrics", status_code=201)
def add_metric(goal_id: int, body: MetricCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")
    conn.execute(
        """INSERT INTO goal_metrics (goal_id, label, start_value, current_value, target_value, unit, sort_order, milestone_id, target_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (goal_id, body.label, body.start_value,
         body.current_value if body.current_value is not None else body.start_value,
         body.target_value, body.unit, body.sort_order, body.milestone_id, body.target_date)
    )
    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.put("/{goal_id}/metrics/{metric_id}")
def update_metric(goal_id: int, metric_id: int, body: MetricUpdate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM goal_metrics WHERE id = ? AND goal_id = ?", (metric_id, goal_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Metric not found.")

    fields = {}
    if body.label is not None:         fields['label'] = body.label
    if body.start_value is not None:   fields['start_value'] = body.start_value
    if body.current_value is not None: fields['current_value'] = body.current_value
    if body.target_value is not None:  fields['target_value'] = body.target_value
    if body.unit is not None:          fields['unit'] = body.unit
    if body.sort_order is not None:    fields['sort_order'] = body.sort_order
    if body.completed is not None:
        fields['completed'] = body.completed
        if body.completed:
            existing = conn.execute(
                "SELECT completed_at FROM goal_metrics WHERE id = ?", (metric_id,)
            ).fetchone()
            if not existing or not existing['completed_at']:
                fields['completed_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        else:
            fields['completed_at'] = None
    if body.clear_milestone_id:
        fields['milestone_id'] = None
    elif body.milestone_id is not None:
        fields['milestone_id'] = body.milestone_id
    if body.clear_target_date:
        fields['target_date'] = None
    elif body.target_date is not None:
        fields['target_date'] = body.target_date

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE goal_metrics SET {set_clause} WHERE id = ?",
            list(fields.values()) + [metric_id]
        )

    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.delete("/{goal_id}/metrics/{metric_id}", status_code=204)
def delete_metric(goal_id: int, metric_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM goal_metrics WHERE id = ? AND goal_id = ?", (metric_id, goal_id))
    _recalc_progress(goal_id, conn)
    conn.commit()
    conn.close()


# ── Habits ───────────────────────────────────────────────────

@router.post("/{goal_id}/habits", status_code=201)
def add_habit(goal_id: int, body: HabitCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found.")
    conn.execute(
        "INSERT INTO goal_habits (goal_id, label, weekly_target_minutes, min_days_per_week, sort_order) VALUES (?, ?, ?, ?, ?)",
        (goal_id, body.label, body.weekly_target_minutes, body.min_days_per_week, body.sort_order)
    )
    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.put("/{goal_id}/habits/{habit_id}")
def update_habit(goal_id: int, habit_id: int, body: HabitUpdate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM goal_habits WHERE id = ? AND goal_id = ?", (habit_id, goal_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Habit not found.")

    fields = {}
    if body.label is not None:                   fields['label'] = body.label
    if body.weekly_target_minutes is not None:   fields['weekly_target_minutes'] = body.weekly_target_minutes
    if body.min_days_per_week is not None:        fields['min_days_per_week'] = body.min_days_per_week
    if body.sort_order is not None:              fields['sort_order'] = body.sort_order

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE goal_habits SET {set_clause} WHERE id = ?",
            list(fields.values()) + [habit_id]
        )

    _recalc_progress(goal_id, conn)
    conn.commit()
    goal = _goal_full(conn, goal_id)
    conn.close()
    return goal


@router.delete("/{goal_id}/habits/{habit_id}", status_code=204)
def delete_habit(goal_id: int, habit_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM goal_habits WHERE id = ? AND goal_id = ?", (habit_id, goal_id))
    _recalc_progress(goal_id, conn)
    conn.commit()
    conn.close()
