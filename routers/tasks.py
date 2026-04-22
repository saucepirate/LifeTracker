from fastapi import APIRouter, HTTPException
from typing import Optional
import json
from datetime import date, datetime, timedelta
import database
from models.tasks import TaskCreate, TaskUpdate, SubtaskCreate, SubtaskUpdate
import business

router = APIRouter()


def _task_full(conn, task_id):
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        return None
    t = dict(row)
    t['is_recurring'] = bool(t['is_recurring'])

    tags = conn.execute(
        """SELECT tg.id, tg.name, tg.color
           FROM tags tg JOIN task_tags tt ON tt.tag_id = tg.id
           WHERE tt.task_id = ?""",
        (task_id,)
    ).fetchall()
    t['tags'] = [dict(r) for r in tags]

    subtasks = conn.execute(
        "SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order, id",
        (task_id,)
    ).fetchall()
    t['subtasks'] = []
    for s in subtasks:
        sd = dict(s)
        sd['completed'] = bool(sd['completed'])
        t['subtasks'].append(sd)

    # Recurrence info
    if t['recurrence_id']:
        rec = conn.execute(
            "SELECT * FROM task_recurrences WHERE id = ?", (t['recurrence_id'],)
        ).fetchone()
        if rec:
            rd = dict(rec)
            rd['days_of_week'] = json.loads(rd['days_of_week'] or '[]')
            rd['tag_ids'] = json.loads(rd['tag_ids'] or '[]')
            t['recurrence'] = rd
        else:
            t['recurrence'] = None
    else:
        t['recurrence'] = None

    if t.get('note_id'):
        n_row = conn.execute("SELECT id, title FROM notes WHERE id = ?", (t['note_id'],)).fetchone()
        t['linked_note'] = dict(n_row) if n_row else None
    else:
        t['linked_note'] = None

    return t


# Specific paths before parameterized ones
@router.get("/today")
def tasks_today():
    business.generate_recurring_tasks()
    today = date.today().isoformat()
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT * FROM tasks
           WHERE status = 'pending' AND (due_date = ? OR due_date < ?)
           ORDER BY due_date ASC, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END""",
        (today, today)
    ).fetchall()
    items = [_task_full(conn, r['id']) for r in rows]
    conn.close()
    return {"items": items, "total": len(items)}


@router.get("/upcoming")
def tasks_upcoming():
    today = date.today().isoformat()
    end = (date.today() + timedelta(days=7)).isoformat()
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT * FROM tasks
           WHERE status = 'pending' AND due_date > ? AND due_date <= ?
           ORDER BY due_date ASC""",
        (today, end)
    ).fetchall()
    items = [_task_full(conn, r['id']) for r in rows]
    conn.close()
    return {"items": items, "total": len(items)}


@router.get("")
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    tag_id: Optional[int] = None,
    goal_id: Optional[int] = None,
    note_id: Optional[int] = None,
    due_before: Optional[str] = None,
    due_after: Optional[str] = None,
    search: Optional[str] = None,
):
    business.generate_recurring_tasks()
    conn = database.get_connection()

    sql = "SELECT DISTINCT t.* FROM tasks t"
    params = []

    if tag_id:
        sql += " JOIN task_tags tt ON tt.task_id = t.id AND tt.tag_id = ?"
        params.append(tag_id)

    conditions = []
    if status:
        conditions.append("t.status = ?")
        params.append(status)
    if priority:
        conditions.append("t.priority = ?")
        params.append(priority)
    if goal_id:
        conditions.append("t.goal_id = ?")
        params.append(goal_id)
    if note_id:
        conditions.append("t.note_id = ?")
        params.append(note_id)
    if due_before:
        conditions.append("t.due_date <= ?")
        params.append(due_before)
    if due_after:
        conditions.append("t.due_date >= ?")
        params.append(due_after)
    if search:
        conditions.append("t.title LIKE ?")
        params.append(f"%{search}%")

    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += " ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC"

    rows = conn.execute(sql, params).fetchall()
    items = [_task_full(conn, r['id']) for r in rows]
    conn.close()
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_task(body: TaskCreate):
    conn = database.get_connection()

    recurrence_id = None
    if body.make_recurring and body.recurrence_cadence:
        result = conn.execute(
            """INSERT INTO task_recurrences
               (title, notes, priority, goal_id, cadence, interval_value, days_of_week, day_of_month, tag_ids)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            (
                body.title, body.notes, body.priority, body.goal_id,
                body.recurrence_cadence, body.recurrence_interval,
                json.dumps(body.recurrence_days_of_week or []),
                body.recurrence_day_of_month,
                json.dumps(body.tag_ids),
            )
        ).fetchone()
        recurrence_id = result[0]

    result = conn.execute(
        """INSERT INTO tasks (title, notes, priority, goal_id, note_id, due_date, is_recurring, recurrence_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.title, body.notes, body.priority, body.goal_id, body.note_id, body.due_date,
         1 if recurrence_id else 0, recurrence_id)
    ).fetchone()
    task_id = result[0]

    for tag_id in body.tag_ids:
        conn.execute("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)", (task_id, tag_id))

    conn.commit()
    task = _task_full(conn, task_id)
    conn.close()
    return task


@router.get("/{task_id}")
def get_task(task_id: int):
    conn = database.get_connection()
    task = _task_full(conn, task_id)
    conn.close()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


@router.put("/{task_id}")
def update_task(task_id: int, body: TaskUpdate):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found.")

    fields = {}
    if body.title is not None:    fields['title'] = body.title
    if body.notes is not None:    fields['notes'] = body.notes
    if body.status is not None:   fields['status'] = body.status
    if body.priority is not None: fields['priority'] = body.priority
    if body.goal_id is not None:  fields['goal_id'] = body.goal_id
    if body.clear_due_date:
        fields['due_date'] = None
    elif body.due_date is not None:
        fields['due_date'] = body.due_date

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE tasks SET {set_clause} WHERE id = ?",
            list(fields.values()) + [task_id]
        )

    if body.tag_ids is not None:
        conn.execute("DELETE FROM task_tags WHERE task_id = ?", (task_id,))
        for tag_id in body.tag_ids:
            conn.execute("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)", (task_id, tag_id))

    conn.commit()
    task = _task_full(conn, task_id)
    conn.close()
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found.")
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


@router.post("/{task_id}/complete")
def complete_task(task_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found.")

    now = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    conn.execute(
        "UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?",
        (now, task_id)
    )

    if row['goal_id']:
        conn.execute(
            "INSERT INTO goal_task_log (goal_id, task_id, completed_at) VALUES (?, ?, ?)",
            (row['goal_id'], task_id, now)
        )

    conn.commit()
    task = _task_full(conn, task_id)
    conn.close()
    return task


# ── Subtasks ─────────────────────────────────────────────────

@router.get("/{task_id}/subtasks")
def list_subtasks(task_id: int):
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM task_subtasks WHERE task_id = ? ORDER BY sort_order, id",
        (task_id,)
    ).fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    for s in items:
        s['completed'] = bool(s['completed'])
    return {"items": items, "total": len(items)}


@router.post("/{task_id}/subtasks", status_code=201)
def add_subtask(task_id: int, body: SubtaskCreate):
    conn = database.get_connection()
    result = conn.execute(
        "INSERT INTO task_subtasks (task_id, title, sort_order) VALUES (?, ?, ?) RETURNING *",
        (task_id, body.title, body.sort_order)
    ).fetchone()
    conn.commit()
    conn.close()
    s = dict(result)
    s['completed'] = bool(s['completed'])
    return s


@router.put("/{task_id}/subtasks/{sub_id}")
def update_subtask(task_id: int, sub_id: int, body: SubtaskUpdate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM task_subtasks WHERE id = ? AND task_id = ?", (sub_id, task_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Subtask not found.")

    fields = {}
    if body.title is not None:     fields['title'] = body.title
    if body.completed is not None: fields['completed'] = body.completed
    if body.sort_order is not None: fields['sort_order'] = body.sort_order

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE task_subtasks SET {set_clause} WHERE id = ?",
            list(fields.values()) + [sub_id]
        )
        conn.commit()

    row = conn.execute("SELECT * FROM task_subtasks WHERE id = ?", (sub_id,)).fetchone()
    conn.close()
    s = dict(row)
    s['completed'] = bool(s['completed'])
    return s


@router.delete("/{task_id}/subtasks/{sub_id}", status_code=204)
def delete_subtask(task_id: int, sub_id: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM task_subtasks WHERE id = ? AND task_id = ?", (sub_id, task_id))
    conn.commit()
    conn.close()
