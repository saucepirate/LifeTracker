from datetime import date, timedelta
import json
import database


def calc_streaks(goal_id, conn):
    rows = conn.execute(
        "SELECT DISTINCT date(logged_at) as day FROM goal_log_entries WHERE goal_id = ?",
        (goal_id,)
    ).fetchall()
    if not rows:
        return 0, 0
    dates = sorted(row['day'] for row in rows)
    dates_set = set(dates)
    current = 0
    check = date.today()
    while check.isoformat() in dates_set:
        current += 1
        check -= timedelta(days=1)
    best, run = 1, 1
    for i in range(1, len(dates)):
        if (date.fromisoformat(dates[i]) - date.fromisoformat(dates[i - 1])).days == 1:
            run += 1
            best = max(best, run)
        else:
            run = 1
    return current, max(best, current)


def generate_recurring_tasks(until=None):
    conn = database.get_connection()
    today = date.today()
    if until:
        end = date.fromisoformat(str(until)) if not isinstance(until, date) else until
        end = max(end, today + timedelta(days=14))
    else:
        end = today + timedelta(days=14)

    recurrences = conn.execute(
        "SELECT * FROM task_recurrences WHERE active = 1"
    ).fetchall()

    for rec in recurrences:
        rec = dict(rec)
        cadence = rec['cadence']
        tag_ids = json.loads(rec['tag_ids'] or '[]')
        days_of_week = json.loads(rec['days_of_week'] or '[]')

        rec_end = date.fromisoformat(rec['end_date']) if rec.get('end_date') else None
        interval = rec.get('interval_value') or 1
        # Use the earliest task due_date as reference — set from Python local date.today(),
        # avoiding SQLite's UTC datetime('now') vs local-time mismatch in created_at.
        seed_row = conn.execute(
            "SELECT MIN(due_date) as min_date FROM tasks WHERE recurrence_id = ? AND due_date IS NOT NULL",
            (rec['id'],)
        ).fetchone()
        if seed_row and seed_row['min_date']:
            ref = date.fromisoformat(seed_row['min_date'])
        else:
            ref = date.fromisoformat(rec['created_at'][:10])
        ref_monday = ref - timedelta(days=ref.weekday())

        # Delete null-due_date pending tasks (legacy data); they get recreated below with correct dates.
        conn.execute(
            "DELETE FROM tasks WHERE recurrence_id = ? AND due_date IS NULL AND status = 'pending'",
            (rec['id'],)
        )

        # Purge any pending tasks that don't match the current cadence/interval so stale
        # incorrectly-spaced instances don't accumulate.
        pending = conn.execute(
            "SELECT id, due_date FROM tasks WHERE recurrence_id = ? AND status = 'pending' AND due_date IS NOT NULL",
            (rec['id'],)
        ).fetchall()
        for pt in pending:
            pt_date = date.fromisoformat(pt['due_date'])
            if cadence == 'daily':
                keep = (pt_date - ref).days % interval == 0
            elif cadence == 'weekly':
                pt_monday = pt_date - timedelta(days=pt_date.weekday())
                wdiff = (pt_monday - ref_monday).days // 7
                in_week = wdiff % interval == 0
                keep = (pt_date.weekday() in days_of_week if days_of_week else pt_date.weekday() == ref.weekday()) and in_week
            elif cadence == 'monthly':
                mdiff = (pt_date.year - ref.year) * 12 + (pt_date.month - ref.month)
                target_day = rec['day_of_month'] or ref.day
                keep = pt_date.day == target_day and mdiff % interval == 0
            else:
                keep = True
            if not keep:
                conn.execute("DELETE FROM tasks WHERE id = ?", (pt['id'],))

        # Never generate instances before the reference (start) date.
        start = max(today, ref)
        # If start date is beyond the current window, extend so at least 14 days are generated.
        if start > end:
            end = start + timedelta(days=14)

        current = start
        while current <= end:
            if rec_end and current > rec_end:
                break
            should = False

            if cadence == 'daily':
                should = (current - ref).days % interval == 0
            elif cadence == 'weekly':
                cur_monday = current - timedelta(days=current.weekday())
                week_diff = (cur_monday - ref_monday).days // 7
                in_right_week = week_diff % interval == 0
                if days_of_week:
                    should = current.weekday() in days_of_week and in_right_week
                else:
                    should = current.weekday() == ref.weekday() and in_right_week
            elif cadence == 'monthly':
                month_diff = (current.year - ref.year) * 12 + (current.month - ref.month)
                target_day = rec['day_of_month'] or ref.day
                should = current.day == target_day and month_diff % interval == 0
            elif cadence == 'custom':
                if days_of_week:
                    should = current.weekday() in days_of_week

            if should:
                existing = conn.execute(
                    "SELECT id FROM tasks WHERE recurrence_id = ? AND due_date = ?",
                    (rec['id'], current.isoformat())
                ).fetchone()

                if not existing:
                    result = conn.execute(
                        """INSERT INTO tasks
                           (title, notes, priority, goal_id, due_date, is_recurring, recurrence_id)
                           VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING id""",
                        (rec['title'], rec['notes'], rec['priority'], rec['goal_id'],
                         current.isoformat(), rec['id'])
                    ).fetchone()
                    task_id = result[0]

                    for tag_id in tag_ids:
                        conn.execute(
                            "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)",
                            (task_id, tag_id)
                        )

            current += timedelta(days=1)

        conn.execute(
            "UPDATE task_recurrences SET last_generated_date = ? WHERE id = ?",
            (end.isoformat(), rec['id'])
        )

    conn.commit()
    conn.close()


def evaluate_on_track(goal_id, conn):
    goal = conn.execute("SELECT * FROM goals WHERE id = ?", (goal_id,)).fetchone()
    if not goal:
        return
    goal = dict(goal)
    today_str = date.today().isoformat()
    checks = []

    # Habit check: did we meet weekly targets?
    if goal['weekly_target_minutes'] or goal['min_days_per_week']:
        since = (date.today() - timedelta(days=7)).isoformat()
        rows = conn.execute(
            "SELECT logged_at, value FROM goal_log_entries WHERE goal_id = ? AND logged_at >= ?",
            (goal_id, since)
        ).fetchall()
        mins = sum(r['value'] or 0 for r in rows)
        days = len(set(r['logged_at'][:10] for r in rows))
        habit_ok = True
        if goal['weekly_target_minutes']: habit_ok = habit_ok and (mins >= goal['weekly_target_minutes'])
        if goal['min_days_per_week']:     habit_ok = habit_ok and (days >= goal['min_days_per_week'])
        checks.append(habit_ok)

    # Milestone check: no overdue dated milestones
    dated = conn.execute(
        "SELECT COUNT(*) FROM goal_milestones WHERE goal_id = ? AND target_date IS NOT NULL",
        (goal_id,)
    ).fetchone()[0]
    if dated > 0:
        overdue = conn.execute(
            "SELECT COUNT(*) FROM goal_milestones WHERE goal_id = ? AND completed = 0 AND target_date < ?",
            (goal_id, today_str)
        ).fetchone()[0]
        checks.append(overdue == 0)

    is_on_track = 1 if (all(checks) if checks else True) else 0
    conn.execute("UPDATE goals SET is_on_track = ? WHERE id = ?", (is_on_track, goal_id))
