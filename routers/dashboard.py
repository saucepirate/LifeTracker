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

    name_row  = conn.execute("SELECT value FROM settings WHERE key = 'user_name'").fetchone()
    name_val  = name_row['value'] if name_row else ''
    user_name = name_val.strip() if name_val else 'there'

    today_rows = conn.execute(
        """SELECT t.id, t.title, t.priority, t.due_date, t.status, t.is_recurring,
                  (SELECT COUNT(*) FROM task_subtasks ts WHERE ts.task_id = t.id) AS subtask_count,
                  (SELECT COUNT(*) FROM task_subtasks ts WHERE ts.task_id = t.id AND ts.completed = 1) AS subtask_done
           FROM tasks t
           WHERE t.status = 'pending' AND (t.due_date = ? OR t.due_date < ?)
           ORDER BY t.due_date ASC,
                    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
        [today, today]
    ).fetchall()

    upcoming_rows = conn.execute(
        """SELECT t.id, t.title, t.priority, t.due_date, t.is_recurring
           FROM tasks t
           WHERE t.status = 'pending' AND t.due_date > ? AND t.due_date <= ?
           ORDER BY t.due_date ASC""",
        [today, in7]
    ).fetchall()

    # Refresh on-track before reading goals
    for gid_row in conn.execute("SELECT id FROM goals WHERE status = 'active'").fetchall():
        business.evaluate_on_track(gid_row['id'], conn)
    conn.commit()

    goal_rows = conn.execute(
        """SELECT id, title, goal_type, area, progress_pct, is_on_track, target_date, pinned
           FROM goals WHERE status = 'active'
           ORDER BY pinned DESC, is_on_track ASC, progress_pct DESC"""
    ).fetchall()

    note_rows = conn.execute(
        """SELECT id, title, SUBSTR(content, 1, 200) AS content_preview, pinned, updated_at
           FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT 5"""
    ).fetchall()

    # Weekly activity: completed tasks + habit logs per day for last 7 days
    week_start = (date.today() - timedelta(days=6)).isoformat()
    task_act = conn.execute(
        "SELECT date(completed_at) AS day, COUNT(*) AS cnt FROM tasks WHERE status='completed' AND date(completed_at) >= ? GROUP BY day",
        [week_start]
    ).fetchall()
    habit_act = conn.execute(
        "SELECT date(logged_at) AS day, COUNT(*) AS cnt FROM goal_log_entries WHERE date(logged_at) >= ? GROUP BY day",
        [week_start]
    ).fetchall()
    activity_map = {}
    for r in task_act:
        activity_map[r['day']] = activity_map.get(r['day'], 0) + r['cnt']
    for r in habit_act:
        activity_map[r['day']] = activity_map.get(r['day'], 0) + r['cnt']
    weekly_activity = []
    for i in range(6, -1, -1):
        ds = (date.today() - timedelta(days=i)).isoformat()
        weekly_activity.append({"date": ds, "count": activity_map.get(ds, 0)})

    # Pinned milestones for KPI row
    pinned_ms_rows = conn.execute(
        """SELECT gm.id, gm.title, gm.target_date, gm.goal_id, g.title AS goal_title, g.area
           FROM goal_milestones gm JOIN goals g ON g.id = gm.goal_id
           WHERE gm.is_pinned = 1 AND gm.completed = 0 AND g.status = 'active'
           ORDER BY gm.target_date ASC""",
    ).fetchall()
    pinned_milestones = []
    for r in pinned_ms_rows:
        m = dict(r)
        try:
            metric_row = conn.execute(
                "SELECT id, label, current_value, target_value, start_value, unit FROM goal_metrics WHERE milestone_id = ? AND completed = 0 LIMIT 1",
                (m['id'],)
            ).fetchone()
            if metric_row:
                m['linked_metric'] = dict(metric_row)
        except Exception:
            pass
        pinned_milestones.append(m)

    # Pinned metrics for KPI row
    try:
        pinned_met_rows = conn.execute(
            """SELECT gmet.id, gmet.label, gmet.current_value, gmet.target_value, gmet.start_value,
                      gmet.unit, gmet.target_date, gmet.goal_id, g.title AS goal_title, g.area
               FROM goal_metrics gmet JOIN goals g ON g.id = gmet.goal_id
               WHERE gmet.is_pinned = 1 AND gmet.completed = 0 AND g.status = 'active'
               ORDER BY gmet.goal_id, gmet.sort_order"""
        ).fetchall()
        pinned_metrics = [dict(r) for r in pinned_met_rows]
    except Exception:
        pinned_metrics = []

    today_tasks = [dict(r) for r in today_rows]
    for t in today_tasks:
        t['is_recurring'] = bool(t['is_recurring'])

    upcoming_tasks = [dict(r) for r in upcoming_rows]
    for t in upcoming_tasks:
        t['is_recurring'] = bool(t.get('is_recurring', 0))

    goals = [dict(r) for r in goal_rows]
    for g in goals:
        g['is_on_track'] = bool(g['is_on_track'])
        g['milestones']  = [dict(m) for m in conn.execute(
            "SELECT id, title, target_date, completed FROM goal_milestones WHERE goal_id = ? ORDER BY sort_order, id",
            (g['id'],)
        ).fetchall()]

    due_milestone_rows = conn.execute(
        """SELECT gm.id, gm.title, gm.target_date, gm.goal_id, g.title AS goal_title
           FROM goal_milestones gm JOIN goals g ON g.id = gm.goal_id
           WHERE gm.target_date IS NOT NULL AND gm.completed = 0 AND g.status = 'active'
           ORDER BY gm.target_date ASC""",
    ).fetchall()

    week_ago   = (date.today() - timedelta(days=6)).isoformat()
    habit_rows = conn.execute(
        """SELECT gh.id, gh.label, gh.goal_id, gh.weekly_target_minutes, gh.min_days_per_week,
                  g.title AS goal_title, g.area AS area
           FROM goal_habits gh JOIN goals g ON g.id = gh.goal_id
           WHERE g.status = 'active' ORDER BY g.title, gh.sort_order""",
    ).fetchall()
    habits = []
    for h in habit_rows:
        hd      = dict(h)
        entries = conn.execute(
            "SELECT logged_at, value FROM goal_log_entries WHERE goal_id = ? AND habit_id = ? AND logged_at >= ? ORDER BY logged_at DESC",
            (h['goal_id'], h['id'], week_ago)
        ).fetchall()
        hd['week_entries']  = [dict(e) for e in entries]
        hd['logged_today']  = any(e['logged_at'].startswith(today) for e in hd['week_entries'])
        habits.append(hd)

    # Upcoming trips: highlighted trip first, then by date (within 30 days)
    try:
        # If a trip is highlighted, include it regardless of date
        highlighted_row = conn.execute(
            "SELECT id, name, destination, start_date, end_date, status, color, tag_id, budget, is_highlighted FROM trips WHERE is_highlighted = 1 LIMIT 1"
        ).fetchone()
        date_rows = conn.execute(
            """SELECT id, name, destination, start_date, end_date, status, color, tag_id, budget, is_highlighted
               FROM trips WHERE start_date >= ? AND start_date <= ? AND status != 'completed'
                 AND (is_highlighted = 0 OR is_highlighted IS NULL)
               ORDER BY start_date ASC LIMIT 3""",
            [today, in30]
        ).fetchall()
        trip_rows = []
        if highlighted_row:
            trip_rows.append(highlighted_row)
        trip_rows.extend(date_rows[:3 - len(trip_rows)])
        upcoming_trips = []
        for row in trip_rows:
            t = dict(row)
            t['days_until']     = (date.fromisoformat(t['start_date']) - date.fromisoformat(today)).days
            t['packing_total']  = conn.execute("SELECT COUNT(*) FROM packing_items WHERE trip_id = ?", (t['id'],)).fetchone()[0]
            t['packing_checked']= conn.execute("SELECT COUNT(*) FROM packing_items WHERE trip_id = ? AND checked = 1", (t['id'],)).fetchone()[0]
            t['budget_spent']   = conn.execute("SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ?", (t['id'],)).fetchone()[0]
            if t.get('tag_id'):
                t['open_task_count'] = conn.execute(
                    "SELECT COUNT(*) FROM tasks t2 JOIN task_tags tt ON tt.task_id = t2.id WHERE tt.tag_id = ? AND t2.status = 'pending'",
                    (t['tag_id'],)
                ).fetchone()[0]
                t['total_task_count'] = conn.execute(
                    "SELECT COUNT(*) FROM tasks t2 JOIN task_tags tt ON tt.task_id = t2.id WHERE tt.tag_id = ?",
                    (t['tag_id'],)
                ).fetchone()[0]
            else:
                t['open_task_count']  = 0
                t['total_task_count'] = 0
            # Next action: first upcoming itinerary entry, else first pending task
            next_entry = conn.execute(
                "SELECT title, entry_date FROM itinerary_entries WHERE trip_id = ? AND entry_date >= ? ORDER BY entry_date ASC, start_time ASC LIMIT 1",
                (t['id'], today)
            ).fetchone()
            if next_entry:
                t['next_action'] = next_entry['title']
                t['next_action_date'] = next_entry['entry_date']
            elif t.get('tag_id'):
                next_task = conn.execute(
                    "SELECT t2.title FROM tasks t2 JOIN task_tags tt ON tt.task_id = t2.id WHERE tt.tag_id = ? AND t2.status = 'pending' ORDER BY CASE t2.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END LIMIT 1",
                    (t['tag_id'],)
                ).fetchone()
                t['next_action']      = next_task['title'] if next_task else None
                t['next_action_date'] = None
            else:
                t['next_action'] = None
                t['next_action_date'] = None
            t['is_highlighted'] = bool(t.get('is_highlighted', 0))
            upcoming_trips.append(t)
    except Exception:
        upcoming_trips = []

    try:
        from routers.calendar import _expand_recurring
        event_rows = conn.execute(
            """SELECT e.id, e.title, e.date, e.end_date, e.all_day, e.start_time, e.end_time,
                      e.recurrence_cadence, e.recurrence_interval, e.recurrence_days_of_week, e.recurrence_until,
                      e.tag_id, tg.name AS tag_name, tg.color AS tag_color
               FROM events e
               LEFT JOIN tags tg ON tg.id = e.tag_id
               WHERE (
                 (e.recurrence_cadence IS NULL AND e.date <= ? AND (e.end_date IS NULL OR e.end_date >= ?))
                 OR
                 (e.recurrence_cadence IS NOT NULL AND e.date <= ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ?))
               )
               ORDER BY e.date ASC, e.start_time ASC""",
            [in7, today, in7, today]
        ).fetchall()
        rec_ids = [dict(r)['id'] for r in event_rows if dict(r).get('recurrence_cadence')]
        exc_map = {}
        if rec_ids:
            ph = ','.join('?' * len(rec_ids))
            for ex in conn.execute(
                f"SELECT event_id, exception_date FROM event_exceptions WHERE event_id IN ({ph})",
                rec_ids
            ).fetchall():
                exc_map.setdefault(ex['event_id'], set()).add(ex['exception_date'])
        agenda_events = []
        for row in event_rows:
            e = dict(row)
            e['all_day'] = bool(e['all_day'])
            if e.get('recurrence_cadence'):
                for occ in _expand_recurring(e, today, in7, exceptions=exc_map.get(e['id'])):
                    if today <= occ['date'] <= in7:
                        agenda_events.append(occ)
            else:
                if today <= e['date'] <= in7:
                    agenda_events.append(e)

        # Also include timed day-plan items (not linked to a calendar event)
        plan_rows = conn.execute(
            """SELECT dpi.id, dpi.title, dpi.plan_date AS date, dpi.start_time, dpi.end_time,
                      tg.name AS tag_name, tg.color AS tag_color
               FROM day_plan_items dpi
               LEFT JOIN tags tg ON tg.id = dpi.tag_id
               WHERE dpi.plan_date >= ? AND dpi.plan_date <= ?
                 AND dpi.start_time IS NOT NULL
                 AND dpi.status != 'skipped'
                 AND dpi.cal_event_id IS NULL""",
            (today, in7)
        ).fetchall()
        for p in plan_rows:
            p = dict(p)
            agenda_events.append({
                'id': -(p['id']), 'title': p['title'],
                'date': p['date'], 'all_day': False,
                'start_time': p['start_time'], 'end_time': p['end_time'],
                'tag_name': p.get('tag_name'), 'tag_color': p.get('tag_color'),
            })
        agenda_events.sort(key=lambda e: (e['date'], e.get('start_time') or 'zz'))
    except Exception:
        agenda_events = []

    # Active projects widget (INT-011–016)
    try:
        proj_rows = conn.execute(
            """SELECT p.id, p.title, p.color, p.status, p.deadline, p.goal_id, p.trip_id
               FROM projects p WHERE p.status = 'active'
               ORDER BY p.deadline IS NULL, p.deadline ASC""",
        ).fetchall()
        active_projects = []
        for r in proj_rows:
            proj = dict(r)
            counts = conn.execute(
                """SELECT COUNT(CASE WHEN status NOT IN ('cancelled','skipped') THEN 1 END) as total,
                          SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done
                   FROM project_tasks WHERE project_id = ?""", (r['id'],)
            ).fetchone()
            proj['task_total'] = counts['total'] or 0
            proj['task_done']  = counts['done'] or 0
            proj['progress']   = round(proj['task_done'] / proj['task_total'] * 100) if proj['task_total'] else 0
            proj['overdue_tasks'] = conn.execute(
                "SELECT COUNT(*) FROM project_tasks WHERE project_id=? AND status IN ('todo','in_progress') AND due_date < ? AND due_date IS NOT NULL",
                (r['id'], today)
            ).fetchone()[0]
            next_ms = conn.execute(
                "SELECT title, due_date FROM project_milestones WHERE project_id=? AND status!='completed' ORDER BY due_date ASC NULLS LAST LIMIT 1",
                (r['id'],)
            ).fetchone()
            proj['next_milestone'] = dict(next_ms) if next_ms else None
            next_task = conn.execute(
                "SELECT title FROM project_tasks WHERE project_id=? AND status IN ('todo','in_progress') ORDER BY due_date ASC NULLS LAST, sort_order ASC LIMIT 1",
                (r['id'],)
            ).fetchone()
            proj['next_action'] = next_task['title'] if next_task else None
            upcoming_ms = conn.execute(
                """SELECT id, title, due_date FROM project_milestones
                   WHERE project_id=? AND status!='completed'
                   ORDER BY CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END,
                            due_date ASC
                   LIMIT 3""",
                (r['id'],)
            ).fetchall()
            proj['upcoming_milestones'] = [dict(m) for m in upcoming_ms]
            try:
                upcoming_pt = conn.execute(
                    """SELECT id, title, status, due_date, priority
                       FROM project_tasks
                       WHERE project_id=? AND status NOT IN ('done','cancelled','skipped')
                       ORDER BY CASE WHEN due_date IS NOT NULL THEN 0 ELSE 1 END,
                                due_date ASC,
                                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                                sort_order ASC
                       LIMIT 3""",
                    (r['id'],)
                ).fetchall()
                proj['project_upcoming_tasks'] = [dict(t) for t in upcoming_pt]
            except Exception:
                proj['project_upcoming_tasks'] = []
            try:
                linked_tasks = []
                trip_id = proj.get('trip_id')
                if trip_id:
                    tag_row = conn.execute(
                        "SELECT tag_id FROM trips WHERE id=?", (trip_id,)
                    ).fetchone()
                    if tag_row and tag_row['tag_id']:
                        tag_tasks = conn.execute(
                            """SELECT t.id, t.title, t.due_date, t.priority
                               FROM tasks t JOIN task_tags tt ON tt.task_id = t.id
                               WHERE tt.tag_id=? AND t.status='pending'
                               ORDER BY CASE WHEN t.due_date IS NOT NULL THEN 0 ELSE 1 END,
                                        t.due_date ASC,
                                        CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
                               LIMIT 3""",
                            (tag_row['tag_id'],)
                        ).fetchall()
                        linked_tasks = [dict(t) for t in tag_tasks]
                proj['linked_tasks'] = linked_tasks
            except Exception:
                proj['linked_tasks'] = []
            active_projects.append(proj)
    except Exception:
        active_projects = []

    due_today_pending = len([t for t in today_tasks if t['due_date'] == today])
    completed_today   = conn.execute(
        "SELECT COUNT(*) FROM tasks WHERE due_date = ? AND status = 'completed' AND date(completed_at) = ?",
        [today, today]
    ).fetchone()[0]

    # Activity chart: per-day completion % for last 7 days
    chart_days = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        chart_days.append({"iso": d.isoformat(), "label": d.strftime('%a')})

    task_series_data = []
    for cd in chart_days:
        iso = cd['iso']
        due = conn.execute("SELECT COUNT(*) FROM tasks WHERE due_date = ?", (iso,)).fetchone()[0]
        comp = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE due_date = ? AND status = 'completed'", (iso,)
        ).fetchone()[0]
        task_series_data.append(round((comp / due) * 100) if due > 0 else 0)

    habit_log_days = {}
    for h in habit_rows:
        rows = conn.execute(
            "SELECT date(logged_at) AS d FROM goal_log_entries WHERE habit_id = ? AND date(logged_at) >= ?",
            (h['id'], week_ago)
        ).fetchall()
        habit_log_days[h['id']] = set(r['d'] for r in rows)

    # Group habits by goal_id; carry area so frontend can match KPI card colors
    goals_with_habits = {}
    for h in habit_rows:
        gid = h['goal_id']
        if gid not in goals_with_habits:
            goals_with_habits[gid] = {'title': h['goal_title'], 'area': h['area'], 'habits': []}
        goals_with_habits[gid]['habits'].append(h)

    habit_series = []
    for gid, info in goals_with_habits.items():
        sd = []
        for cd in chart_days:
            iso = cd['iso']
            logged = sum(1 for h in info['habits'] if iso in habit_log_days[h['id']])
            sd.append(round((logged / len(info['habits'])) * 100) if info['habits'] else 0)
        habit_series.append({'name': info['title'], 'area': info['area'], 'goal_id': gid, 'data': sd})

    activity_chart = {
        'days': chart_days,
        'series': [{'name': 'Tasks', 'area': None, 'data': task_series_data}] + habit_series,
    }

    conn.close()

    return {
        "user_name":      user_name,
        "stats": {
            "due_today":       due_today_pending,
            "due_today_total": due_today_pending + completed_today,
            "overdue":         len([t for t in today_tasks if t['due_date'] and t['due_date'] < today]),
            "active_goals":    len(goals),
            "goals_on_track":  len([g for g in goals if g['is_on_track']]),
            "upcoming_7d":     len(upcoming_tasks),
        },
        "today_tasks":    today_tasks,
        "upcoming_tasks": upcoming_tasks,
        "goals":          goals,
        "due_milestones": [dict(r) for r in due_milestone_rows],
        "habits":         habits,
        "notes":          [dict(r) for r in note_rows],
        "upcoming_trips":    upcoming_trips,
        "agenda_events":     agenda_events,
        "weekly_activity":   weekly_activity,
        "pinned_milestones": pinned_milestones,
        "pinned_metrics":    pinned_metrics,
        "activity_chart":    activity_chart,
        "active_projects":   active_projects,
    }
