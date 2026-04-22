from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import database

router = APIRouter()


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: Optional[str] = None
    tag_ids: Optional[List[int]] = []


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    pinned: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    goal_id: Optional[int] = None
    clear_goal: Optional[bool] = False


def _note_full(note_id, conn):
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        return None
    n = dict(row)
    tag_rows = conn.execute(
        """SELECT t.* FROM tags t
           JOIN note_tags nt ON nt.tag_id = t.id
           WHERE nt.note_id = ? ORDER BY t.name""",
        (note_id,)
    ).fetchall()
    n["tags"] = [dict(t) for t in tag_rows]
    task_rows = conn.execute(
        """SELECT id, title, status, priority, due_date, completed_at
           FROM tasks WHERE note_id = ?
           ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at""",
        (note_id,)
    ).fetchall()
    n["tasks"] = [dict(t) for t in task_rows]
    if n.get("goal_id"):
        g_row = conn.execute("SELECT id, title FROM goals WHERE id = ?", (n["goal_id"],)).fetchone()
        n["linked_goal"] = dict(g_row) if g_row else None
    else:
        n["linked_goal"] = None
    return n


@router.get("")
def list_notes(q: Optional[str] = None, tag_id: Optional[int] = None):
    conn = database.get_connection()
    conditions, params = [], []
    if q:
        conditions.append("(title LIKE ? OR content LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if tag_id:
        conditions.append("n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)")
        params.append(tag_id)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = conn.execute(
        f"SELECT n.* FROM notes n {where} ORDER BY n.pinned DESC, n.updated_at DESC",
        params
    ).fetchall()
    notes = []
    for row in rows:
        n = dict(row)
        tag_rows = conn.execute(
            "SELECT t.* FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ?",
            (n["id"],)
        ).fetchall()
        n["tags"] = [dict(t) for t in tag_rows]
        notes.append(n)
    conn.close()
    return {"items": notes, "total": len(notes)}


@router.post("", status_code=201)
def create_note(body: NoteCreate):
    conn = database.get_connection()
    row = conn.execute(
        "INSERT INTO notes (title, content) VALUES (?, ?) RETURNING *",
        (body.title, body.content)
    ).fetchone()
    note_id = row["id"]
    for tid in (body.tag_ids or []):
        conn.execute("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)", (note_id, tid))
    conn.commit()
    n = _note_full(note_id, conn)
    conn.close()
    return n


@router.get("/{note_id}")
def get_note(note_id: int):
    conn = database.get_connection()
    n = _note_full(note_id, conn)
    conn.close()
    if not n:
        raise HTTPException(status_code=404, detail="Note not found.")
    return n


@router.put("/{note_id}")
def update_note(note_id: int, body: NoteUpdate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Note not found.")
    fields, params = ["updated_at = datetime('now')"], []
    if body.title is not None:
        fields.append("title = ?"); params.append(body.title)
    if body.content is not None:
        fields.append("content = ?"); params.append(body.content)
    if body.pinned is not None:
        fields.append("pinned = ?"); params.append(body.pinned)
    if body.clear_goal:
        fields.append("goal_id = NULL")
    elif body.goal_id is not None:
        fields.append("goal_id = ?"); params.append(body.goal_id)
    conn.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", params + [note_id])
    if body.tag_ids is not None:
        conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
        for tid in body.tag_ids:
            conn.execute("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)", (note_id, tid))
    conn.commit()
    n = _note_full(note_id, conn)
    conn.close()
    return n


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Note not found.")
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()
