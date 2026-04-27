from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None


class TCategoryCreate(BaseModel):
    name: str
    sort_order: int = 0


class TCategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class TItemCreate(BaseModel):
    name: str
    quantity: int = 1
    always_bring: int = 0
    sort_order: int = 0


class TItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    always_bring: Optional[int] = None
    sort_order: Optional[int] = None


class TSuggestedTaskCreate(BaseModel):
    title: str
    priority: str = 'medium'
    days_before_departure: Optional[int] = None
    notes: Optional[str] = None
    sort_order: int = 0


class TSuggestedTaskUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    days_before_departure: Optional[int] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None
    clear_days: bool = False
    clear_notes: bool = False


class TReorderBody(BaseModel):
    ids: list


def _template_full(conn, template_id):
    row = conn.execute("SELECT * FROM packing_templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        return None
    t = dict(row)
    cats = conn.execute(
        "SELECT * FROM template_categories WHERE template_id = ? ORDER BY sort_order, id",
        (template_id,)
    ).fetchall()
    t['categories'] = []
    for cat in cats:
        c = dict(cat)
        items = conn.execute(
            "SELECT * FROM template_items WHERE template_category_id = ? ORDER BY sort_order, id",
            (cat['id'],)
        ).fetchall()
        c['items'] = [dict(i) for i in items]
        t['categories'].append(c)
    tasks = conn.execute(
        "SELECT * FROM template_suggested_tasks WHERE template_id = ? ORDER BY sort_order, id",
        (template_id,)
    ).fetchall()
    t['suggested_tasks'] = [dict(st) for st in tasks]
    return t


# ── Templates ──────────────────────────────────────────────────

@router.get("")
def list_templates():
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM packing_templates ORDER BY name"
    ).fetchall()
    items = []
    for row in rows:
        t = dict(row)
        cat_count = conn.execute(
            "SELECT COUNT(*) FROM template_categories WHERE template_id = ?", (row['id'],)
        ).fetchone()[0]
        item_count = conn.execute(
            """SELECT COUNT(*) FROM template_items ti
               JOIN template_categories tc ON tc.id = ti.template_category_id
               WHERE tc.template_id = ?""", (row['id'],)
        ).fetchone()[0]
        t['category_count'] = cat_count
        t['item_count'] = item_count
        items.append(t)
    conn.close()
    return {"items": items, "total": len(items)}


@router.post("", status_code=201)
def create_template(body: TemplateCreate):
    conn = database.get_connection()
    result = conn.execute(
        "INSERT INTO packing_templates (name) VALUES (?) RETURNING id",
        (body.name,)
    ).fetchone()
    template_id = result[0]
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.get("/{template_id}")
def get_template(template_id: int):
    conn = database.get_connection()
    t = _template_full(conn, template_id)
    conn.close()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found.")
    return t


@router.put("/{template_id}")
def update_template(template_id: int, body: TemplateUpdate):
    conn = database.get_connection()
    row = conn.execute("SELECT * FROM packing_templates WHERE id = ?", (template_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")
    name = body.name if body.name is not None else row['name']
    conn.execute(
        "UPDATE packing_templates SET name = ?, updated_at = datetime('now') WHERE id = ?",
        (name, template_id)
    )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: int):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")
    conn.execute("DELETE FROM packing_templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()


# ── Template Categories ────────────────────────────────────────

@router.post("/{template_id}/categories", status_code=201)
def add_template_category(template_id: int, body: TCategoryCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM template_categories WHERE template_id = ?",
        (template_id,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO template_categories (template_id, name, sort_order) VALUES (?, ?, ?)",
        (template_id, body.name, max_order + 1)
    )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.put("/{template_id}/categories/{cat_id}")
def update_template_category(template_id: int, cat_id: int, body: TCategoryUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM template_categories WHERE id = ? AND template_id = ?", (cat_id, template_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    name       = body.name       if body.name       is not None else row['name']
    sort_order = body.sort_order if body.sort_order is not None else row['sort_order']
    conn.execute(
        "UPDATE template_categories SET name = ?, sort_order = ? WHERE id = ?",
        (name, sort_order, cat_id)
    )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.delete("/{template_id}/categories/{cat_id}", status_code=204)
def delete_template_category(template_id: int, cat_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM template_categories WHERE id = ? AND template_id = ?", (cat_id, template_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    conn.execute("DELETE FROM template_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()


@router.post("/{template_id}/categories/reorder")
def reorder_template_categories(template_id: int, body: TReorderBody):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")
    for i, cat_id in enumerate(body.ids):
        conn.execute(
            "UPDATE template_categories SET sort_order = ? WHERE id = ? AND template_id = ?",
            (i, cat_id, template_id)
        )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


# ── Template Items ─────────────────────────────────────────────

@router.post("/{template_id}/categories/{cat_id}/items", status_code=201)
def add_template_item(template_id: int, cat_id: int, body: TItemCreate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM template_categories WHERE id = ? AND template_id = ?", (cat_id, template_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM template_items WHERE template_category_id = ?",
        (cat_id,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO template_items (template_category_id, name, quantity, always_bring, sort_order) VALUES (?, ?, ?, ?, ?)",
        (cat_id, body.name, body.quantity, body.always_bring, max_order + 1)
    )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.put("/{template_id}/categories/{cat_id}/items/{item_id}")
def update_template_item(template_id: int, cat_id: int, item_id: int, body: TItemUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM template_items WHERE id = ? AND template_category_id = ?", (item_id, cat_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    fields = {}
    if body.name        is not None: fields['name']        = body.name
    if body.quantity    is not None: fields['quantity']    = body.quantity
    if body.always_bring is not None: fields['always_bring'] = body.always_bring
    if body.sort_order  is not None: fields['sort_order']  = body.sort_order
    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE template_items SET {set_clause} WHERE id = ?", (*fields.values(), item_id))
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.delete("/{template_id}/categories/{cat_id}/items/{item_id}", status_code=204)
def delete_template_item(template_id: int, cat_id: int, item_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM template_items WHERE id = ? AND template_category_id = ?", (item_id, cat_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    conn.execute("DELETE FROM template_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


# ── Suggested Tasks ────────────────────────────────────────────

@router.post("/{template_id}/suggested-tasks", status_code=201)
def add_suggested_task(template_id: int, body: TSuggestedTaskCreate):
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM template_suggested_tasks WHERE template_id = ?",
        (template_id,)
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO template_suggested_tasks (template_id, title, priority, days_before_departure, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (template_id, body.title, body.priority, body.days_before_departure, body.notes, max_order + 1)
    )
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.put("/{template_id}/suggested-tasks/{task_id}")
def update_suggested_task(template_id: int, task_id: int, body: TSuggestedTaskUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM template_suggested_tasks WHERE id = ? AND template_id = ?", (task_id, template_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Suggested task not found.")
    fields = {}
    if body.title    is not None: fields['title']    = body.title
    if body.priority is not None: fields['priority'] = body.priority
    if body.sort_order is not None: fields['sort_order'] = body.sort_order
    if body.clear_days:           fields['days_before_departure'] = None
    elif body.days_before_departure is not None: fields['days_before_departure'] = body.days_before_departure
    if body.clear_notes:          fields['notes'] = None
    elif body.notes is not None:  fields['notes'] = body.notes
    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE template_suggested_tasks SET {set_clause} WHERE id = ?", (*fields.values(), task_id))
    conn.commit()
    t = _template_full(conn, template_id)
    conn.close()
    return t


@router.delete("/{template_id}/suggested-tasks/{task_id}", status_code=204)
def delete_suggested_task(template_id: int, task_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM template_suggested_tasks WHERE id = ? AND template_id = ?", (task_id, template_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Suggested task not found.")
    conn.execute("DELETE FROM template_suggested_tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()
