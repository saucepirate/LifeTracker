from fastapi import APIRouter
from datetime import date, timedelta
import database
import business

router = APIRouter()


@router.get("")
def get_dashboard():
    business.generate_recurring_tasks()
    conn = database.get_connection()
    today = date.today().isoformat()
    in7 = (date.today() + timedelta(days=7)).isoformat()

    name_row = conn.execute(
        "SELECT value FROM settings WHERE key = 'user_name'"
    ).fetchone()
    user_name = name_row['value'] if name_row else 'there'

    today_rows = conn.execute(
        """SELECT t.id, t.title, t.priority, t.due_date, t.status, t.is_recurring
           FROM tasks t
           WHERE t.status = 'pending' AND (t.due_date = ? OR t.due_date < ?)
           ORDER BY t.due_date ASC,
                    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
        (today, today)
    ).fetchall()

    upcoming_rows = conn.execute(
        """SELECT t.id, t.title, t.priority, t.due_date
           FROM tasks t
           WHERE t.status = 'pending' AND t.due_date > ? AND t.due_date <= ?
           ORDER BY t.due_date ASC""",
        (today, in7)
    ).fetchall()

    goal_rows = conn.execute(
        """SELECT id, title, goal_type, area, progress_pct, is_on_track, target_date
           FROM goals WHERE status = 'active'
           ORDER BY is_on_track ASC, progress_pct DESC"""
    ).fetchall()

    event_rows = conn.execute(
        """SELECT id, title, date, start_time, all_day
           FROM events WHERE date >= ? AND date <= ?
           ORDER BY date ASC, start_time ASC""",
        (today, in7)
    ).fetchall()

    note_rows = conn.execute(
        "SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC LIMIT 4"
    ).fetchall()

    today_tasks = [dict(r) for r in today_rows]
    for t in today_tasks:
        t['is_recurring'] = bool(t['is_recurring'])

    upcoming_tasks = [dict(r) for r in upcoming_rows]
    goals = [dict(r) for r in goal_rows]
    for g in goals:
        g['is_on_track'] = bool(g['is_on_track'])
        g['current_streak'], g['best_streak'] = business.calc_streaks(g['id'], conn)

    conn.close()

    return {
        "user_name": user_name,
        "stats": {
            "due_today":     len([t for t in today_tasks if t['due_date'] == today]),
            "overdue":       len([t for t in today_tasks if t['due_date'] and t['due_date'] < today]),
            "active_goals":  len(goals),
            "goals_on_track": len([g for g in goals if g['is_on_track']]),
            "upcoming_7d":   len(upcoming_tasks),
        },
        "today_tasks":    today_tasks,
        "upcoming_tasks": upcoming_tasks,
        "goals":          goals,
        "events":         [dict(r) for r in event_rows],
        "notes":          [dict(r) for r in note_rows],
    }
