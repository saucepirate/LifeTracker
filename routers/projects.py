from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import date as _date

import database
from models.projects import (
    ProjectCreate, ProjectUpdate,
    MilestoneCreate, MilestoneUpdate,
    TaskCreate, TaskUpdate,
    ProjectTemplateCreate, ProjectTemplateUpdate,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fire_goal_recalc(project_id, conn):
    """Recalc linked goal progress/on-track when project tasks or milestones change."""
    from routers.goals import _recalc_goal_for_project
    _recalc_goal_for_project(project_id, conn)

def _project_full(conn, project_id: int):
    row = conn.execute(
        """SELECT p.id, p.title, p.description, p.color, p.status,
                  p.start_date, p.deadline, p.goal_id, p.trip_id, p.is_ongoing,
                  p.created_at, p.updated_at,
                  g.title as goal_title
           FROM projects p
           LEFT JOIN goals g ON g.id = p.goal_id
           WHERE p.id = ?""",
        (project_id,)
    ).fetchone()
    if not row:
        return None
    p = dict(row)
    p['is_ongoing'] = bool(p['is_ongoing'])

    # Attach lightweight trip summary when linked
    if p.get('trip_id'):
        trip_row = conn.execute(
            "SELECT name, budget_total, budget_currency FROM trips WHERE id = ?", (p['trip_id'],)
        ).fetchone()
        if trip_row:
            p['trip_name'] = trip_row['name']
            total_out = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) FROM budget_expenses WHERE trip_id = ?", (p['trip_id'],)
            ).fetchone()[0]
            p['trip_budget_total']    = trip_row['budget_total']
            p['trip_budget_currency'] = trip_row['budget_currency'] or 'USD'
            p['trip_budget_total_out'] = round(float(total_out), 2)

    p['owners'] = [dict(r) for r in conn.execute(
        "SELECT id, name, role FROM project_owners WHERE project_id = ? ORDER BY id",
        (project_id,)
    ).fetchall()]

    p['milestones'] = [dict(r) for r in conn.execute(
        """SELECT id, title, description, due_date, status, is_deliverable, sort_order, completed_at
           FROM project_milestones WHERE project_id = ? ORDER BY sort_order, due_date, id""",
        (project_id,)
    ).fetchall()]
    for m in p['milestones']:
        m['is_deliverable'] = bool(m['is_deliverable'])

    p['tasks'] = [dict(r) for r in conn.execute(
        """SELECT id, milestone_id, title, notes, status, priority, task_type,
                  due_date, assigned_to, estimated_cost, actual_cost, sort_order, completed_at
           FROM project_tasks WHERE project_id = ? ORDER BY sort_order, id""",
        (project_id,)
    ).fetchall()]

    # Summary stats — exclude cancelled/skipped from denominator
    # Deliverable tasks (milestone with is_deliverable=1) count 2× in progress
    deliverable_ms_ids = {m['id'] for m in p['milestones'] if m['is_deliverable']}
    eligible = [t for t in p['tasks'] if t['status'] not in ('cancelled', 'skipped')]
    total = len(eligible)
    done  = sum(1 for t in eligible if t['status'] == 'done')
    p['task_total'] = total
    p['task_done']  = done
    eligible_weight = sum(2 if t.get('milestone_id') in deliverable_ms_ids else 1 for t in eligible)
    done_weight     = sum(2 if t.get('milestone_id') in deliverable_ms_ids else 1
                         for t in eligible if t['status'] == 'done')
    p['progress']       = round(done_weight / eligible_weight * 100) if eligible_weight else 0
    p['has_deliverables'] = bool(deliverable_ms_ids)

    ms_total = len(p['milestones'])
    ms_done  = sum(1 for m in p['milestones'] if m['status'] == 'completed')
    p['milestone_total'] = ms_total
    p['milestone_done']  = ms_done

    return p


def _project_summary(conn, row):
    p = dict(row)
    p['is_ongoing'] = bool(p['is_ongoing'])
    pid = p['id']
    p['owners'] = [dict(r) for r in conn.execute(
        "SELECT id, name, role FROM project_owners WHERE project_id = ? ORDER BY id", (pid,)
    ).fetchall()]
    counts = conn.execute(
        """SELECT COUNT(CASE WHEN pt.status NOT IN ('cancelled','skipped') THEN 1 END) as total,
                  SUM(CASE WHEN pt.status='done' THEN 1 ELSE 0 END) as done,
                  SUM(CASE WHEN pt.status NOT IN ('cancelled','skipped')
                           THEN CASE WHEN pm.is_deliverable=1 THEN 2 ELSE 1 END
                           ELSE 0 END) as eligible_weight,
                  SUM(CASE WHEN pt.status='done'
                           THEN CASE WHEN pm.is_deliverable=1 THEN 2 ELSE 1 END
                           ELSE 0 END) as done_weight
           FROM project_tasks pt
           LEFT JOIN project_milestones pm ON pm.id = pt.milestone_id
           WHERE pt.project_id = ?""", (pid,)
    ).fetchone()
    p['task_total'] = counts['total'] or 0
    p['task_done']  = counts['done']  or 0
    ew = counts['eligible_weight'] or 0
    dw = counts['done_weight'] or 0
    p['progress']   = round(dw / ew * 100) if ew else 0
    has_deliv = conn.execute(
        "SELECT 1 FROM project_milestones WHERE project_id=? AND is_deliverable=1 LIMIT 1", (pid,)
    ).fetchone()
    p['has_deliverables'] = bool(has_deliv)
    ms = conn.execute(
        """SELECT COUNT(*) as total,
                  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done
           FROM project_milestones WHERE project_id = ?""", (pid,)
    ).fetchone()
    p['milestone_total'] = ms['total'] or 0
    p['milestone_done']  = ms['done']  or 0
    return p


# ── Cross-module: all dated project tasks ─────────────────────────────────────

@router.get("/tasks")
def list_dated_project_tasks(all_statuses: bool = False):
    """Flat list of dated project tasks for Tasks module and Dashboard."""
    conn = database.get_connection()
    try:
        rows = conn.execute(
            """SELECT pt.id, pt.project_id, pt.title, pt.notes,
                      pt.status, pt.priority, pt.due_date, pt.assigned_to,
                      pt.sort_order, pt.completed_at,
                      p.title as project_title, p.color as project_color,
                      pm.title as milestone_title
               FROM project_tasks pt
               JOIN projects p ON p.id = pt.project_id
               LEFT JOIN project_milestones pm ON pm.id = pt.milestone_id
               WHERE p.status = 'active'
                 AND pt.due_date IS NOT NULL
                 AND pt.status NOT IN ('cancelled','skipped')
               ORDER BY pt.due_date ASC, pt.sort_order ASC""",
        ).fetchall()
        items = []
        for r in rows:
            t = dict(r)
            proj_status = t['status']
            t['_source']         = 'project'
            t['_project_id']     = t.pop('project_id')
            t['_project_title']  = t.pop('project_title')
            t['_project_color']  = t.pop('project_color')
            t['_milestone_title'] = t.pop('milestone_title')
            t['_proj_status']    = proj_status
            t['status']          = 'completed' if proj_status == 'done' else 'pending'
            t['is_recurring']    = False
            t['tags']            = []
            t['subtasks']        = []
            t['recurrence']      = None
            t['linked_note']     = None
            items.append(t)
        return {"items": items, "total": len(items)}
    finally:
        conn.close()


# ── Projects ──────────────────────────────────────────────────────────────────

@router.get("/")
def list_projects(status: Optional[str] = None):
    conn = database.get_connection()
    try:
        q = """SELECT p.id, p.title, p.description, p.color, p.status,
                      p.start_date, p.deadline, p.goal_id, p.is_ongoing,
                      p.created_at, p.updated_at,
                      g.title as goal_title
               FROM projects p
               LEFT JOIN goals g ON g.id = p.goal_id"""
        params = []
        if status:
            q += " WHERE p.status = ?"
            params.append(status)
        q += " ORDER BY p.deadline IS NULL, p.deadline ASC, p.created_at DESC"
        rows = conn.execute(q, params).fetchall()
        items = [_project_summary(conn, r) for r in rows]
        return {"items": items, "total": len(items)}
    finally:
        conn.close()


@router.post("/", status_code=201)
def create_project(body: ProjectCreate):
    conn = database.get_connection()
    try:
        now = _date.today().isoformat()
        cur = conn.execute(
            """INSERT INTO projects (title, description, color, status, start_date, deadline, goal_id, trip_id, is_ongoing, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (body.title, body.description, body.color, body.status,
             body.start_date, body.deadline, body.goal_id, body.trip_id,
             1 if body.is_ongoing else 0, now)
        )
        pid = cur.lastrowid
        for o in body.owners:
            conn.execute("INSERT INTO project_owners (project_id, name, role) VALUES (?, ?, ?)",
                         (pid, o.name, o.role))
        conn.commit()
        return _project_full(conn, pid)
    finally:
        conn.close()


# ── Custom project templates ──────────────────────────────────────────────────

@router.get("/templates")
def list_project_templates():
    conn = database.get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM project_templates ORDER BY created_at ASC"
        ).fetchall()
        return {"items": [dict(r) for r in rows], "total": len(rows)}
    finally:
        conn.close()


@router.post("/templates", status_code=201)
def create_project_template(body: ProjectTemplateCreate):
    conn = database.get_connection()
    try:
        now = _date.today().isoformat()
        cur = conn.execute(
            """INSERT INTO project_templates
               (name, icon, description, color, is_ongoing, milestones, tasks, note_title, note_content,
                source_id, filter_trip_type, filter_destination, filter_length, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (body.name, body.icon, body.description, body.color,
             1 if body.is_ongoing else 0, body.milestones, body.tasks,
             body.note_title, body.note_content,
             body.source_id, body.filter_trip_type, body.filter_destination, body.filter_length, now)
        )
        tid = cur.lastrowid
        conn.commit()
        return dict(conn.execute("SELECT * FROM project_templates WHERE id=?", (tid,)).fetchone())
    finally:
        conn.close()


@router.get("/templates/{template_id}")
def get_project_template(template_id: int):
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT * FROM project_templates WHERE id=?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Template not found")
        return dict(row)
    finally:
        conn.close()


@router.patch("/templates/{template_id}")
def update_project_template(template_id: int, body: ProjectTemplateUpdate):
    conn = database.get_connection()
    try:
        if not conn.execute("SELECT id FROM project_templates WHERE id=?", (template_id,)).fetchone():
            raise HTTPException(404, "Template not found")
        sets, vals = [], []
        if body.name is not None:              sets.append("name=?");              vals.append(body.name)
        if body.icon is not None:              sets.append("icon=?");              vals.append(body.icon)
        if body.description is not None:       sets.append("description=?");       vals.append(body.description)
        if body.color is not None:             sets.append("color=?");             vals.append(body.color)
        if body.is_ongoing is not None:        sets.append("is_ongoing=?");        vals.append(1 if body.is_ongoing else 0)
        if body.milestones is not None:        sets.append("milestones=?");        vals.append(body.milestones)
        if body.tasks is not None:             sets.append("tasks=?");             vals.append(body.tasks)
        if body.note_title is not None:        sets.append("note_title=?");        vals.append(body.note_title)
        if body.note_content is not None:      sets.append("note_content=?");      vals.append(body.note_content)
        if body.source_id is not None:         sets.append("source_id=?");         vals.append(body.source_id)
        if body.filter_trip_type is not None:  sets.append("filter_trip_type=?");  vals.append(body.filter_trip_type)
        if body.filter_destination is not None:sets.append("filter_destination=?");vals.append(body.filter_destination)
        if body.filter_length is not None:     sets.append("filter_length=?");     vals.append(body.filter_length)
        if sets:
            sets.append("updated_at=?")
            vals.append(_date.today().isoformat())
            vals.append(template_id)
            conn.execute(f"UPDATE project_templates SET {','.join(sets)} WHERE id=?", vals)
            conn.commit()
        return dict(conn.execute("SELECT * FROM project_templates WHERE id=?", (template_id,)).fetchone())
    finally:
        conn.close()


@router.delete("/templates/{template_id}", status_code=204)
def delete_project_template(template_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM project_templates WHERE id=?", (template_id,))
        conn.commit()
    finally:
        conn.close()


# ── Project CRUD ──────────────────────────────────────────────────────────────

@router.get("/{project_id}")
def get_project(project_id: int):
    conn = database.get_connection()
    try:
        p = _project_full(conn, project_id)
        if not p:
            raise HTTPException(404, "Project not found")
        return p
    finally:
        conn.close()


@router.patch("/{project_id}")
def update_project(project_id: int, body: ProjectUpdate):
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")

        sets, vals = [], []
        if body.title is not None:        sets.append("title=?");       vals.append(body.title)
        if body.description is not None:  sets.append("description=?"); vals.append(body.description)
        if body.color is not None:        sets.append("color=?");       vals.append(body.color)
        if body.status is not None:       sets.append("status=?");      vals.append(body.status)
        if body.is_ongoing is not None:   sets.append("is_ongoing=?");  vals.append(1 if body.is_ongoing else 0)
        if body.start_date is not None:   sets.append("start_date=?");  vals.append(body.start_date)
        if body.clear_start_date:         sets.append("start_date=?");  vals.append(None)
        if body.deadline is not None:     sets.append("deadline=?");    vals.append(body.deadline)
        if body.clear_deadline:           sets.append("deadline=?");    vals.append(None)
        if body.goal_id is not None:      sets.append("goal_id=?");     vals.append(body.goal_id)
        if body.clear_goal_id:            sets.append("goal_id=?");     vals.append(None)
        if body.trip_id is not None:      sets.append("trip_id=?");     vals.append(body.trip_id)
        if body.clear_trip_id:            sets.append("trip_id=?");     vals.append(None)

        if sets:
            sets.append("updated_at=?")
            vals.append(_date.today().isoformat())
            vals.append(project_id)
            conn.execute(f"UPDATE projects SET {','.join(sets)} WHERE id=?", vals)

        if body.owners is not None:
            conn.execute("DELETE FROM project_owners WHERE project_id=?", (project_id,))
            for o in body.owners:
                conn.execute("INSERT INTO project_owners (project_id, name, role) VALUES (?,?,?)",
                             (project_id, o.name, o.role))

        conn.commit()
        return _project_full(conn, project_id)
    finally:
        conn.close()


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
        conn.commit()
    finally:
        conn.close()


# ── Milestones ────────────────────────────────────────────────────────────────

@router.post("/{project_id}/milestones", status_code=201)
def add_milestone(project_id: int, body: MilestoneCreate):
    conn = database.get_connection()
    try:
        if not conn.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "Project not found")
        conn.execute(
            """INSERT INTO project_milestones (project_id, title, description, due_date, is_deliverable, sort_order)
               VALUES (?,?,?,?,?,?)""",
            (project_id, body.title, body.description, body.due_date,
             1 if body.is_deliverable else 0, body.sort_order)
        )
        conn.commit()
        return _project_full(conn, project_id)
    finally:
        conn.close()


@router.patch("/{project_id}/milestones/{milestone_id}")
def update_milestone(project_id: int, milestone_id: int, body: MilestoneUpdate):
    conn = database.get_connection()
    try:
        if not conn.execute("SELECT id FROM project_milestones WHERE id=? AND project_id=?",
                            (milestone_id, project_id)).fetchone():
            raise HTTPException(404, "Milestone not found")

        sets, vals = [], []
        if body.title is not None:          sets.append("title=?");          vals.append(body.title)
        if body.description is not None:    sets.append("description=?");    vals.append(body.description)
        if body.due_date is not None:       sets.append("due_date=?");       vals.append(body.due_date)
        if body.clear_due_date:             sets.append("due_date=?");       vals.append(None)
        if body.is_deliverable is not None: sets.append("is_deliverable=?"); vals.append(1 if body.is_deliverable else 0)
        if body.sort_order is not None:     sets.append("sort_order=?");     vals.append(body.sort_order)
        if body.status is not None:
            sets.append("status=?")
            vals.append(body.status)
            if body.status == 'completed':
                sets.append("completed_at=?")
                vals.append(_date.today().isoformat())
            else:
                sets.append("completed_at=?")
                vals.append(None)

        if sets:
            vals.append(milestone_id)
            conn.execute(f"UPDATE project_milestones SET {','.join(sets)} WHERE id=?", vals)
            if body.status == 'completed':
                conn.execute(
                    """UPDATE project_tasks SET status='done', completed_at=?
                       WHERE milestone_id=? AND status NOT IN ('done','cancelled','skipped')""",
                    (_date.today().isoformat(), milestone_id)
                )
            conn.commit()
            if body.status is not None:
                try:
                    _fire_goal_recalc(project_id, conn)
                    conn.commit()
                except Exception:
                    pass
        return _project_full(conn, project_id)
    finally:
        conn.close()


@router.delete("/{project_id}/milestones/{milestone_id}", status_code=204)
def delete_milestone(project_id: int, milestone_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM project_milestones WHERE id=? AND project_id=?",
                     (milestone_id, project_id))
        conn.commit()
    finally:
        conn.close()


# ── Tasks ─────────────────────────────────────────────────────────────────────

@router.post("/{project_id}/tasks", status_code=201)
def add_task(project_id: int, body: TaskCreate):
    conn = database.get_connection()
    try:
        if not conn.execute("SELECT id FROM projects WHERE id=?", (project_id,)).fetchone():
            raise HTTPException(404, "Project not found")
        conn.execute(
            """INSERT INTO project_tasks
               (project_id, milestone_id, title, notes, status, priority, task_type,
                due_date, assigned_to, estimated_cost, actual_cost, sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (project_id, body.milestone_id, body.title, body.notes,
             body.status, body.priority, body.task_type,
             body.due_date, body.assigned_to, body.estimated_cost, body.actual_cost, body.sort_order)
        )
        conn.commit()
        return _project_full(conn, project_id)
    finally:
        conn.close()


@router.patch("/{project_id}/tasks/{task_id}")
def update_task(project_id: int, task_id: int, body: TaskUpdate):
    conn = database.get_connection()
    try:
        if not conn.execute("SELECT id FROM project_tasks WHERE id=? AND project_id=?",
                            (task_id, project_id)).fetchone():
            raise HTTPException(404, "Task not found")

        sets, vals = [], []
        if body.title is not None:          sets.append("title=?");          vals.append(body.title)
        if body.notes is not None:          sets.append("notes=?");          vals.append(body.notes)
        if body.priority is not None:       sets.append("priority=?");       vals.append(body.priority)
        if body.task_type is not None:      sets.append("task_type=?");      vals.append(body.task_type)
        if body.due_date is not None:       sets.append("due_date=?");       vals.append(body.due_date)
        if body.clear_due_date:             sets.append("due_date=?");       vals.append(None)
        if body.assigned_to is not None:    sets.append("assigned_to=?");    vals.append(body.assigned_to)
        if body.clear_assigned_to:         sets.append("assigned_to=?");    vals.append(None)
        if body.estimated_cost is not None: sets.append("estimated_cost=?"); vals.append(body.estimated_cost)
        if body.clear_estimated_cost:      sets.append("estimated_cost=?"); vals.append(None)
        if body.actual_cost is not None:   sets.append("actual_cost=?");    vals.append(body.actual_cost)
        if body.clear_actual_cost:         sets.append("actual_cost=?");    vals.append(None)
        if body.sort_order is not None:     sets.append("sort_order=?");     vals.append(body.sort_order)
        if body.milestone_id is not None:   sets.append("milestone_id=?");   vals.append(body.milestone_id)
        if body.clear_milestone_id:        sets.append("milestone_id=?");   vals.append(None)
        if body.status is not None:
            sets.append("status=?")
            vals.append(body.status)
            if body.status == 'done':
                sets.append("completed_at=?")
                vals.append(_date.today().isoformat())
            elif body.status != 'done':
                sets.append("completed_at=?")
                vals.append(None)

        if sets:
            vals.append(task_id)
            conn.execute(f"UPDATE project_tasks SET {','.join(sets)} WHERE id=?", vals)
            conn.commit()
            if body.status is not None:
                try:
                    _fire_goal_recalc(project_id, conn)
                    conn.commit()
                except Exception:
                    pass
        return _project_full(conn, project_id)
    finally:
        conn.close()


@router.delete("/{project_id}/tasks/{task_id}", status_code=204)
def delete_task(project_id: int, task_id: int):
    conn = database.get_connection()
    try:
        conn.execute("DELETE FROM project_tasks WHERE id=? AND project_id=?", (task_id, project_id))
        conn.commit()
    finally:
        conn.close()

