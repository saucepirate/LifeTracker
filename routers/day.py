from fastapi import APIRouter, HTTPException, Query
from datetime import date, datetime, timedelta
import database
from models.day import DayItemCreate, DayItemUpdate, DayNoteUpdate, DayItemMove
from routers.calendar import _expand_recurring

router = APIRouter()


@router.get("")
def get_day(date_str: str = Query(None, alias="date")):
    today = date.today().isoformat()
    plan_date = date_str or today

    conn = database.get_connection()

    # Plan items for this date, ordered by sort_order then time
    plan_items = [dict(r) for r in conn.execute(
        """SELECT dpi.*, g.title AS goal_title,
                  proj.title AS project_title,
                  proj.color AS project_color
           FROM day_plan_items dpi
           LEFT JOIN goals g ON g.id = dpi.goal_id
           LEFT JOIN project_tasks pt  ON pt.id  = CASE WHEN dpi.source_type = 'project_task'      THEN dpi.source_id END
           LEFT JOIN project_milestones pm ON pm.id = CASE WHEN dpi.source_type = 'project_milestone' THEN dpi.source_id END
           LEFT JOIN projects proj ON proj.id = COALESCE(pt.project_id, pm.project_id)
           WHERE dpi.plan_date = ?
           ORDER BY dpi.sort_order, CASE WHEN dpi.start_time IS NULL THEN 1 ELSE 0 END, dpi.start_time, dpi.id""",
        (plan_date,)
    ).fetchall()]

    # Calendar events spanning this date, including recurring events
    event_masters = [dict(r) for r in conn.execute(
        """SELECT e.id, e.tag_id, e.title, e.date, e.end_date, e.all_day, e.start_time, e.end_time, e.notes,
                  e.recurrence_cadence, e.recurrence_interval,
                  e.recurrence_days_of_week, e.recurrence_until,
                  t.name AS tag_name, t.color AS tag_color
           FROM events e
           LEFT JOIN tags t ON t.id = e.tag_id
           WHERE (e.recurrence_cadence IS NULL
                  AND e.date <= ? AND (e.end_date IS NULL OR e.end_date >= ?))
              OR (e.recurrence_cadence IS NOT NULL
                  AND e.date <= ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ?))""",
        (plan_date, plan_date, plan_date, plan_date)
    ).fetchall()]
    # IDs of events already linked to a plan item on this date (avoid duplicates)
    linked_event_ids = {r['cal_event_id'] for r in plan_items if r.get('cal_event_id')}

    # Load exceptions for recurring events
    rec_ids = [m['id'] for m in event_masters if m.get('recurrence_cadence')]
    exc_map = {}
    if rec_ids:
        ph = ','.join('?' * len(rec_ids))
        for ex in conn.execute(f"SELECT event_id, exception_date FROM event_exceptions WHERE event_id IN ({ph})", rec_ids).fetchall():
            exc_map.setdefault(ex['event_id'], set()).add(ex['exception_date'])

    cal_events = []
    for master in event_masters:
        if master['id'] in linked_event_ids:
            continue
        for occ in _expand_recurring(master, plan_date, plan_date, exceptions=exc_map.get(master['id'])):
            occ['all_day'] = bool(occ.get('all_day'))
            if occ['date'] == plan_date or (
                occ.get('end_date') and occ['date'] <= plan_date <= occ['end_date']
            ):
                cal_events.append(occ)
    cal_events.sort(key=lambda e: (
        0 if e['all_day'] else 1,
        e.get('start_time') or 'zz'
    ))

    # Track which task/habit source_ids are already in the plan
    plan_task_ids = {r['task_id'] for r in plan_items if r['task_id']}
    plan_habit_source_ids = {r['source_id'] for r in plan_items
                             if r['source_type'] == 'habit' and r['source_id']}

    # Suggestions: pending tasks due today or overdue (dedup recurring tasks)
    task_rows = conn.execute(
        """SELECT id, title, priority, due_date, recurrence_id
           FROM tasks
           WHERE status = 'pending' AND due_date IS NOT NULL AND due_date <= ?
           ORDER BY due_date, priority DESC""",
        (plan_date,)
    ).fetchall()
    seen_sug_rec = set()
    suggestion_tasks = []
    for t in task_rows:
        td = dict(t)
        rid = td.pop('recurrence_id', None)
        if td['id'] not in plan_task_ids:
            if rid:
                if rid in seen_sug_rec:
                    continue
                seen_sug_rec.add(rid)
            td['is_overdue'] = td['due_date'] < plan_date
            suggestion_tasks.append(td)

    # Suggestions: active habits not yet planned or logged today
    habit_rows = conn.execute(
        """SELECT gh.id AS habit_id, gh.goal_id, gh.label,
                  gh.weekly_target_minutes, gh.min_days_per_week,
                  g.title AS goal_title
           FROM goal_habits gh
           JOIN goals g ON g.id = gh.goal_id
           WHERE g.status = 'active'
           ORDER BY g.title, gh.sort_order""",
        ()
    ).fetchall()
    suggestion_habits = []
    for h in habit_rows:
        hd = dict(h)
        if hd['habit_id'] in plan_habit_source_ids:
            continue
        logged = conn.execute(
            "SELECT id FROM goal_log_entries WHERE goal_id = ? AND habit_id = ? AND logged_at LIKE ?",
            (hd['goal_id'], hd['habit_id'], f"{plan_date}%")
        ).fetchone()
        hd['logged_today'] = bool(logged)
        suggestion_habits.append(hd)

    # All pending tasks for sidebar search (dedup recurring tasks), with association info
    all_tasks_raw = conn.execute(
        """SELECT t.id, t.title, t.priority, t.due_date, t.recurrence_id,
                  g.title  AS goal_title,
                  n.title  AS note_title
           FROM tasks t
           LEFT JOIN goals g ON g.id = t.goal_id
           LEFT JOIN notes n ON n.id = t.note_id
           WHERE t.status = 'pending'
           ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, t.priority DESC""",
        ()
    ).fetchall()

    # Trip associations via system tags
    trip_tag_rows = conn.execute(
        """SELECT tt.task_id, tr.id AS trip_id, tr.name AS trip_name
           FROM task_tags tt
           JOIN tags tg ON tg.id = tt.tag_id AND tg.is_system = 1
           JOIN trips tr ON tr.tag_id = tg.id"""
    ).fetchall()
    trip_by_task = {r['task_id']: {'trip_id': r['trip_id'], 'trip_name': r['trip_name']} for r in trip_tag_rows}

    seen_all_rec = set()
    all_tasks = []
    for r in all_tasks_raw:
        row = dict(r)
        rid = row.pop('recurrence_id', None)
        if rid:
            if rid in seen_all_rec:
                continue
            seen_all_rec.add(rid)
        trip_info = trip_by_task.get(row['id'])
        row['trip_name'] = trip_info['trip_name'] if trip_info else None
        row['trip_id']   = trip_info['trip_id']   if trip_info else None
        all_tasks.append(row)

    # Tags for UI chips + plan item coloring; sorted by usage frequency desc
    tag_rows = conn.execute(
        "SELECT id, name, color FROM tags WHERE is_system = 0 OR is_system IS NULL ORDER BY is_default DESC, name ASC"
    ).fetchall()
    tags = [dict(r) for r in tag_rows]
    tag_counts = {r['tag_id']: r['cnt'] for r in conn.execute(
        "SELECT tag_id, COUNT(*) AS cnt FROM day_plan_items WHERE tag_id IS NOT NULL GROUP BY tag_id"
    ).fetchall()}
    tags.sort(key=lambda t: tag_counts.get(t['id'], 0), reverse=True)
    tags_by_id = {r['id']: r for r in tags}
    for item in plan_items:
        tid = item.get('tag_id')
        item['tag_name']  = tags_by_id[tid]['name']  if tid and tid in tags_by_id else None
        item['tag_color'] = tags_by_id[tid]['color'] if tid and tid in tags_by_id else None

    # Daily note
    note_row = conn.execute(
        "SELECT morning_plan, evening_reflection FROM day_notes WHERE plan_date = ?",
        (plan_date,)
    ).fetchone()
    note = dict(note_row) if note_row else {'morning_plan': '', 'evening_reflection': ''}

    # Stats
    active_items = [i for i in plan_items if i['status'] != 'skipped']
    planned_count  = sum(1 for i in active_items if i['status'] == 'planned')
    completed_count = sum(1 for i in active_items if i['status'] == 'done')
    scheduled_minutes = sum(
        i['duration_minutes'] or 0
        for i in plan_items
        if i['start_time'] and i['status'] == 'planned'
    )

    # Trips sidebar: active/planning trips with their pending tasks
    trips_sidebar = []
    try:
        trips_raw = conn.execute(
            """SELECT tr.id, tr.name, tr.color, tr.start_date, tr.end_date, tr.tag_id
               FROM trips tr
               WHERE tr.tag_id IS NOT NULL
               ORDER BY tr.start_date"""
        ).fetchall()
        for tr in trips_raw:
            tr_dict = dict(tr)
            tr_tasks = conn.execute(
                """SELECT t.id, t.title, t.priority, t.due_date
                   FROM tasks t
                   JOIN task_tags tt ON tt.task_id = t.id
                   WHERE tt.tag_id = ? AND t.status = 'pending'
                   ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, t.priority DESC""",
                (tr_dict['tag_id'],)
            ).fetchall()
            tr_dict['tasks'] = [dict(t) for t in tr_tasks]
            if tr_dict['tasks']:
                trips_sidebar.append(tr_dict)
    except Exception:
        pass

    # Projects sidebar: active projects with tasks/milestones due in next 14 days
    projects_sidebar = []
    try:
        today_str  = date.today().isoformat()
        cutoff_14  = (date.today() + timedelta(days=14)).isoformat()
        cutoff_7   = (date.today() + timedelta(days=7)).isoformat()

        # Already-planned project task / milestone IDs for this date
        planned_pt_ids = {
            r['source_id'] for r in plan_items
            if r.get('source_type') == 'project_task' and r.get('source_id')
        }
        planned_pm_ids = {
            r['source_id'] for r in plan_items
            if r.get('source_type') == 'project_milestone' and r.get('source_id')
        }

        proj_rows = conn.execute(
            "SELECT id, title, color, deadline FROM projects WHERE status='active' ORDER BY deadline NULLS LAST, id"
        ).fetchall()

        for pr in proj_rows:
            p = dict(pr)

            tasks = [
                dict(r) for r in conn.execute(
                    """SELECT id, title, priority, due_date
                       FROM project_tasks
                       WHERE project_id = ? AND status NOT IN ('done','cancelled','skipped')
                         AND due_date IS NOT NULL AND due_date <= ?
                       ORDER BY due_date,
                                CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
                    (p['id'], cutoff_14)
                ).fetchall()
                if r['id'] not in planned_pt_ids
            ]

            milestones = [
                dict(r) for r in conn.execute(
                    """SELECT id, title, due_date, status
                       FROM project_milestones
                       WHERE project_id = ? AND status != 'completed'
                         AND due_date IS NOT NULL AND due_date <= ?
                       ORDER BY due_date""",
                    (p['id'], cutoff_14)
                ).fetchall()
                if r['id'] not in planned_pm_ids
            ]

            if not tasks and not milestones:
                continue

            overdue_hp = any(
                t.get('due_date') and t['due_date'] < today_str and t.get('priority') == 'high'
                for t in tasks
            )
            is_at_risk = bool(
                (p.get('deadline') and p['deadline'] <= cutoff_7) or
                any(m['due_date'] < today_str for m in milestones if m.get('due_date')) or
                overdue_hp
            )

            p['tasks']      = tasks
            p['milestones'] = milestones
            p['is_at_risk'] = is_at_risk
            projects_sidebar.append(p)

        def _proj_sort_key(p):
            all_dates = [i['due_date'] for i in p['tasks'] + p['milestones'] if i.get('due_date')]
            return (0 if p['is_at_risk'] else 1, min(all_dates) if all_dates else '9999-99-99')

        projects_sidebar.sort(key=_proj_sort_key)
    except Exception:
        pass

    # Finance sidebar: auto-generated insights (unclassified transactions, liabilities)
    finance_tag_row = conn.execute(
        "SELECT id FROM tags WHERE name = 'Finance' LIMIT 1"
    ).fetchone()
    finance_tag_id = finance_tag_row['id'] if finance_tag_row else None

    finance_suggestions = []

    from datetime import datetime as _dt

    def _norm_date(raw):
        if not raw: return None
        try:
            return _dt.strptime(raw, '%m/%d/%Y').date().isoformat() if '/' in raw else raw
        except Exception:
            return None

    # Investment actions (from inv_actions table) — always first
    try:
        action_rows = conn.execute(
            "SELECT id, symbol, action_type, title, notes, due_date FROM inv_actions WHERE status = 'open' ORDER BY symbol, id"
        ).fetchall()
        for ar in action_rows:
            ar = dict(ar)
            due_iso = _norm_date(ar.get('due_date'))
            detail_parts = []
            if ar['action_type']:
                detail_parts.append(ar['action_type'].replace('_', ' ').title())
            if ar['due_date']:
                detail_parts.append(f"Due {ar['due_date']}")
            if ar['notes']:
                detail_parts.append(ar['notes'][:60])
            if not detail_parts:
                detail_parts.append(ar['symbol'])
            finance_suggestions.append({
                'id': f'inv_action_{ar["id"]}', 'type': 'warning', 'category': 'action',
                'title': ar['title'],
                'detail': ' · '.join(detail_parts),
                'inv_action_id': ar['id'],
                'due_date': due_iso,
            })
    except Exception:
        pass

    # Unclassified transactions
    try:
        unclassified = conn.execute(
            "SELECT COUNT(*) FROM finance_transactions WHERE category_id IS NULL AND is_transfer = 0"
        ).fetchone()[0]
        if unclassified > 0:
            noun = 'transaction' if unclassified == 1 else 'transactions'
            finance_suggestions.append({
                'id': 'reconcile', 'type': 'warning', 'category': 'finance',
                'title': f'Reconcile {unclassified} unclassified {noun}',
                'detail': f'{unclassified} {noun} need categorization',
                'due_date': None,
            })
    except Exception:
        pass

    # Liabilities
    try:
        liabilities = conn.execute(
            "SELECT id, name, payment_amount, next_payment_date FROM finance_liabilities"
        ).fetchall()
        for lib in liabilities:
            lib = dict(lib)
            npd = _norm_date(lib.get('next_payment_date'))
            if npd:
                days_away = (date.fromisoformat(npd) - date.today()).days
                if days_away < 0:    when = f'overdue by {-days_away} days'
                elif days_away == 0: when = 'today'
                elif days_away == 1: when = 'tomorrow'
                else:                when = f'in {days_away} days'
                due_str = f'Due {when}'
                stype = 'warning' if days_away <= 30 else 'info'
            else:
                due_str = 'No payment date set'
                stype = 'info'
            amt = f"${lib['payment_amount']:,.0f}" if lib['payment_amount'] else ''
            finance_suggestions.append({
                'id': f'liability_{lib["id"]}', 'type': stype, 'category': 'finance',
                'title': f'Review {lib["name"]} payment',
                'detail': ' · '.join(filter(None, [due_str, amt])),
                'due_date': npd,
            })
    except Exception:
        pass

    # Investment position warnings (skip symbols already covered by action notes)
    try:
        latest_pos = conn.execute(
            "SELECT MAX(id) FROM inv_imports WHERE import_type='positions'"
        ).fetchone()[0]
        if latest_pos:
            rows = conn.execute(
                """SELECT symbol, current_value, total_gain_dollar, cost_basis_total
                   FROM inv_positions WHERE import_id=?""",
                (latest_pos,)
            ).fetchall()
            # Aggregate by symbol across accounts
            by_sym = {}
            total_val = 0.0
            for r in rows:
                r = dict(r)
                sym = r['symbol']
                val  = r['current_value']  or 0
                gain = r['total_gain_dollar'] or 0
                cost = r['cost_basis_total']  or 0
                total_val += val
                if sym not in by_sym:
                    by_sym[sym] = {'val': 0, 'gain': 0, 'cost': 0}
                by_sym[sym]['val']  += val
                by_sym[sym]['gain'] += gain
                by_sym[sym]['cost'] += cost

            # Symbols with open inv_actions already appear under Investment Actions
            open_action_syms = {r['symbol'] for r in conn.execute(
                "SELECT symbol FROM inv_actions WHERE status='open'"
            ).fetchall()}
            for sym, d in by_sym.items():
                if sym in open_action_syms:
                    continue
                cost = d['cost']
                gain_pct = (d['gain'] / cost * 100) if cost > 0 else None

                if gain_pct is not None and gain_pct < -30:
                    finance_suggestions.append({
                        'id': f'inv_warn_{sym}', 'type': 'warning', 'category': 'insight',
                        'title': f'{sym} down {abs(gain_pct):.0f}% — review position',
                        'detail': f'Loss: ${abs(d["gain"]):,.0f}',
                    })
                elif gain_pct is not None and gain_pct < -10:
                    finance_suggestions.append({
                        'id': f'inv_caution_{sym}', 'type': 'info', 'category': 'insight',
                        'title': f'{sym} down {abs(gain_pct):.0f}% — monitor',
                        'detail': f'Loss: ${abs(d["gain"]):,.0f}',
                    })

                if total_val > 0 and d['val'] / total_val > 0.25:
                    finance_suggestions.append({
                        'id': f'inv_conc_{sym}', 'type': 'warning', 'category': 'insight',
                        'title': f'{sym} is {d["val"]/total_val*100:.0f}% of portfolio',
                        'detail': f'Concentrated position — consider rebalancing',
                    })
    except Exception:
        pass

    conn.close()

    return {
        "date": plan_date,
        "plan_items": plan_items,
        "calendar_events": cal_events,
        "all_tasks": all_tasks,
        "suggestions": {
            "tasks": suggestion_tasks,
            "habits": suggestion_habits,
        },
        "tags": tags,
        "trips_sidebar": trips_sidebar,
        "projects_sidebar": projects_sidebar,
        "finance_sidebar": {"tag_id": finance_tag_id, "suggestions": finance_suggestions},
        "note": note,
        "stats": {
            "planned": planned_count,
            "completed": completed_count,
            "total": len(active_items),
            "scheduled_minutes": scheduled_minutes,
        },
    }


@router.post("/items", status_code=201)
def create_item(body: DayItemCreate):
    conn = database.get_connection()
    now = datetime.now().isoformat()
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), 0) FROM day_plan_items WHERE plan_date = ? AND section = ?",
        (body.plan_date, body.section)
    ).fetchone()[0]
    sort_order = max_order + 1

    item_id = conn.execute(
        """INSERT INTO day_plan_items
           (plan_date, title, source_type, source_id, section, start_time, end_time,
            duration_minutes, sort_order, priority, notes, goal_id, task_id, habit_id,
            tag_id, cal_event_id, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
        (body.plan_date, body.title, body.source_type, body.source_id, body.section,
         body.start_time, body.end_time, body.duration_minutes, sort_order,
         body.priority, body.notes, body.goal_id, body.task_id, body.habit_id,
         body.tag_id, body.cal_event_id, now, now)
    ).fetchone()[0]

    # Rule 7: project task/milestone scheduled into a time block → create a linked calendar event
    if body.source_type in ('project_task', 'project_milestone') and body.start_time:
        try:
            ev_id = conn.execute(
                "INSERT INTO events (title, date, start_time, end_time, all_day) VALUES (?,?,?,?,0) RETURNING id",
                (body.title, body.plan_date, body.start_time, body.end_time)
            ).fetchone()[0]
            conn.execute("UPDATE day_plan_items SET cal_event_id = ? WHERE id = ?", (ev_id, item_id))
        except Exception:
            pass

    conn.commit()
    result = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(result)


@router.patch("/items/{item_id}")
def update_item(item_id: int, body: DayItemUpdate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM day_plan_items WHERE id = ?", (item_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")

    fields = {}
    if body.title is not None:            fields['title'] = body.title
    if body.section is not None:          fields['section'] = body.section
    if body.clear_start_time:             fields['start_time'] = None
    elif body.start_time is not None:     fields['start_time'] = body.start_time
    if body.clear_end_time:               fields['end_time'] = None
    elif body.end_time is not None:       fields['end_time'] = body.end_time
    if body.duration_minutes is not None: fields['duration_minutes'] = body.duration_minutes
    if body.sort_order is not None:       fields['sort_order'] = body.sort_order
    if body.status is not None:           fields['status'] = body.status
    if body.priority is not None:         fields['priority'] = body.priority
    if body.clear_notes:                  fields['notes'] = None
    elif body.notes is not None:          fields['notes'] = body.notes
    if body.clear_tag_id:                 fields['tag_id'] = None
    elif body.tag_id is not None:         fields['tag_id'] = body.tag_id
    if body.cal_event_id is not None:     fields['cal_event_id'] = body.cal_event_id
    fields['updated_at'] = datetime.now().isoformat()

    if len(fields) > 1:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE day_plan_items SET {set_clause} WHERE id = ?",
            list(fields.values()) + [item_id]
        )

    conn.commit()
    row = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT cal_event_id FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    if row and row['cal_event_id']:
        conn.execute("DELETE FROM events WHERE id = ?", (row['cal_event_id'],))
    conn.execute("DELETE FROM day_plan_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


@router.post("/items/{item_id}/complete")
def complete_item(item_id: int):
    conn = database.get_connection()
    item = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    item = dict(item)
    now = datetime.now().isoformat()

    conn.execute(
        "UPDATE day_plan_items SET status = 'done', updated_at = ? WHERE id = ?",
        (now, item_id)
    )

    if item['source_type'] in ('task', 'finance_action') and item['task_id']:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (item['task_id'],)).fetchone()
        if task and dict(task)['status'] == 'pending':
            conn.execute(
                "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?",
                (now, item['task_id'])
            )
            if dict(task)['goal_id']:
                conn.execute(
                    "INSERT INTO goal_task_log (goal_id, task_id, completed_at) VALUES (?,?,?)",
                    (dict(task)['goal_id'], item['task_id'], now)
                )

    if item['source_type'] == 'finance_action' and item['source_id']:
        try:
            conn.execute(
                "UPDATE inv_actions SET status = 'completed' WHERE id = ? AND status = 'open'",
                (item['source_id'],)
            )
        except Exception:
            pass

    elif item['source_type'] == 'project_task' and item['source_id']:
        try:
            conn.execute(
                "UPDATE project_tasks SET status = 'done' WHERE id = ? AND status NOT IN ('done','cancelled')",
                (item['source_id'],)
            )
            proj_row = conn.execute(
                "SELECT project_id FROM project_tasks WHERE id = ?", (item['source_id'],)
            ).fetchone()
            if proj_row:
                from routers.goals import _recalc_goal_for_project
                _recalc_goal_for_project(proj_row['project_id'], conn)
        except Exception:
            pass

    elif item['source_type'] == 'project_milestone' and item['source_id']:
        try:
            conn.execute(
                "UPDATE project_milestones SET status = 'completed' WHERE id = ?",
                (item['source_id'],)
            )
            ms_row = conn.execute(
                "SELECT project_id FROM project_milestones WHERE id = ?", (item['source_id'],)
            ).fetchone()
            if ms_row:
                from routers.goals import _recalc_goal_for_project
                _recalc_goal_for_project(ms_row['project_id'], conn)
        except Exception:
            pass

    elif item['source_type'] == 'habit' and item['goal_id'] and item['habit_id']:
        duration = item['duration_minutes'] or 30
        conn.execute(
            "INSERT INTO goal_log_entries (goal_id, logged_at, value, note, habit_id) VALUES (?,?,?,?,?)",
            (item['goal_id'], now, duration, 'Logged from Day Planner', item['habit_id'])
        )

    conn.commit()
    row = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/items/{item_id}/uncomplete")
def uncomplete_item(item_id: int):
    conn = database.get_connection()
    item = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    item = dict(item)
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE day_plan_items SET status = 'planned', updated_at = ? WHERE id = ?",
        (now, item_id)
    )
    # Restore underlying task to pending
    if item['source_type'] in ('task', 'finance_action') and item['task_id']:
        conn.execute(
            "UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ? AND status = 'completed'",
            (item['task_id'],)
        )

    # Restore inv_action to open
    if item['source_type'] == 'finance_action' and item['source_id']:
        try:
            conn.execute(
                "UPDATE inv_actions SET status = 'open' WHERE id = ? AND status = 'completed'",
                (item['source_id'],)
            )
        except Exception:
            pass

    elif item['source_type'] == 'project_task' and item['source_id']:
        try:
            conn.execute(
                "UPDATE project_tasks SET status = 'todo' WHERE id = ? AND status = 'done'",
                (item['source_id'],)
            )
        except Exception:
            pass

    elif item['source_type'] == 'project_milestone' and item['source_id']:
        try:
            conn.execute(
                "UPDATE project_milestones SET status = 'pending' WHERE id = ? AND status = 'completed'",
                (item['source_id'],)
            )
        except Exception:
            pass

    conn.commit()
    row = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/items/{item_id}/skip")
def skip_item(item_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM day_plan_items WHERE id = ?", (item_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE day_plan_items SET status = 'skipped', updated_at = ? WHERE id = ?",
        (now, item_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/items/{item_id}/move")
def move_item(item_id: int, body: DayItemMove):
    conn = database.get_connection()
    item = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    if not item:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    item = dict(item)
    now = datetime.now().isoformat()
    conn.execute(
        "UPDATE day_plan_items SET plan_date = ?, status = 'planned', updated_at = ? WHERE id = ?",
        (body.target_date, now, item_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM day_plan_items WHERE id = ?", (item_id,)).fetchone()
    conn.close()
    return dict(row)


@router.patch("/note")
def upsert_note(body: DayNoteUpdate):
    conn = database.get_connection()
    now = datetime.now().isoformat()
    existing = conn.execute(
        "SELECT id FROM day_notes WHERE plan_date = ?", (body.plan_date,)
    ).fetchone()

    if existing:
        fields = {}
        if body.morning_plan is not None:       fields['morning_plan'] = body.morning_plan
        if body.evening_reflection is not None: fields['evening_reflection'] = body.evening_reflection
        fields['updated_at'] = now
        if len(fields) > 1:
            set_clause = ', '.join(f"{k} = ?" for k in fields)
            conn.execute(
                f"UPDATE day_notes SET {set_clause} WHERE plan_date = ?",
                list(fields.values()) + [body.plan_date]
            )
    else:
        conn.execute(
            "INSERT INTO day_notes (plan_date, morning_plan, evening_reflection, updated_at) VALUES (?,?,?,?)",
            (body.plan_date, body.morning_plan or '', body.evening_reflection or '', now)
        )

    conn.commit()
    row = conn.execute("SELECT * FROM day_notes WHERE plan_date = ?", (body.plan_date,)).fetchone()
    conn.close()
    return dict(row)
