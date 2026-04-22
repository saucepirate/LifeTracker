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
    in7  = (date.today() + timedelta(days=7)).isoformat()
    in30 = (date.today() + timedelta(days=30)).isoformat()

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
        """SELECT id, title, goal_type, area, progress_pct, is_on_track, target_date, pinned
           FROM goals WHERE status = 'active'
           ORDER BY pinned DESC, is_on_track ASC, progress_pct DESC"""
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
        metric_rows = conn.execute(
            """SELECT id, label, start_value, current_value, target_value, unit, target_date, milestone_id
               FROM goal_metrics WHERE goal_id = ? AND (completed IS NULL OR completed = 0)
               ORDER BY sort_order, id""",
            (g['id'],)
        ).fetchall()
        g['metrics'] = [dict(m) for m in metric_rows]
        milestone_rows = conn.execute(
            """SELECT id, title, target_date, completed FROM goal_milestones
               WHERE goal_id = ? ORDER BY sort_order, id""",
            (g['id'],)
        ).fetchall()
        g['milestones'] = [dict(m) for m in milestone_rows]

    # All upcoming metrics with due dates (not completed)
    due_metric_rows = conn.execute(
        """SELECT gm.id, gm.label, gm.start_value, gm.current_value, gm.target_value, gm.unit,
                  gm.target_date, gm.goal_id, g.title AS goal_title
           FROM goal_metrics gm
           JOIN goals g ON g.id = gm.goal_id
           WHERE gm.target_date IS NOT NULL
             AND (gm.completed IS NULL OR gm.completed = 0)
             AND g.status = 'active'
           ORDER BY gm.target_date ASC""",
    ).fetchall()

    # All upcoming milestones with due dates (not completed)
    due_milestone_rows = conn.execute(
        """SELECT gm.id, gm.title, gm.target_date, gm.goal_id, g.title AS goal_title
           FROM goal_milestones gm
           JOIN goals g ON g.id = gm.goal_id
           WHERE gm.target_date IS NOT NULL
             AND gm.completed = 0
             AND g.status = 'active'
           ORDER BY gm.target_date ASC""",
    ).fetchall()

    # Habits with this week's log entries
    week_ago = (date.today() - timedelta(days=6)).isoformat()
    habit_rows = conn.execute(
        """SELECT gh.id, gh.label, gh.goal_id, gh.weekly_target_minutes, gh.min_days_per_week,
                  g.title AS goal_title
           FROM goal_habits gh
           JOIN goals g ON g.id = gh.goal_id
           WHERE g.status = 'active'
           ORDER BY g.title, gh.sort_order""",
    ).fetchall()
    habits = []
    for h in habit_rows:
        hd = dict(h)
        entries = conn.execute(
            """SELECT logged_at, value FROM goal_log_entries
               WHERE goal_id = ? AND habit_id = ? AND logged_at >= ?
               ORDER BY logged_at DESC""",
            (h['goal_id'], h['id'], week_ago)
        ).fetchall()
        hd['week_entries'] = [dict(e) for e in entries]
        habits.append(hd)

    conn.close()

    return {
        "user_name": user_name,
        "stats": {
            "due_today":      len([t for t in today_tasks if t['due_date'] == today]),
            "overdue":        len([t for t in today_tasks if t['due_date'] and t['due_date'] < today]),
            "active_goals":   len(goals),
            "goals_on_track": len([g for g in goals if g['is_on_track']]),
            "upcoming_7d":    len(upcoming_tasks),
        },
        "today_tasks":       today_tasks,
        "upcoming_tasks":    upcoming_tasks,
        "goals":             goals,
        "due_metrics":       [dict(r) for r in due_metric_rows],
        "due_milestones":    [dict(r) for r in due_milestone_rows],
        "habits":            habits,
        "events":            [dict(r) for r in event_rows],
        "notes":             [dict(r) for r in note_rows],
    }
