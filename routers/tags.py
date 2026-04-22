from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class TagCreate(BaseModel):
    name: str
    color: str = "teal"


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@router.get("")
def list_tags():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM tags ORDER BY is_default DESC, name ASC").fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("", status_code=201)
def create_tag(body: TagCreate):
    conn = database.get_connection()
    count = conn.execute("SELECT COUNT(*) FROM tags").fetchone()[0]
    if count >= 15:
        conn.close()
        raise HTTPException(status_code=400, detail="Maximum of 15 tags reached.")
    try:
        c = conn.execute(
            "INSERT INTO tags (name, color) VALUES (?, ?) RETURNING *",
            (body.name, body.color),
        )
        row = c.fetchone()
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=str(e))
    conn.close()
    return dict(row)


@router.put("/{tag_id}")
def update_tag(tag_id: int, body: TagUpdate):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Tag not found.")
    name = body.name if body.name is not None else row["name"]
    color = body.color if body.color is not None else row["color"]
    conn.execute("UPDATE tags SET name = ?, color = ? WHERE id = ?", (name, color, tag_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    conn.close()
    return dict(updated)


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Tag not found.")
    if row["is_default"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Cannot delete a default tag.")
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.commit()
    conn.close()
