from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ItemCreate(BaseModel):
    name: str
    quantity: int = 1
    for_attendee_id: Optional[int] = None
    note: Optional[str] = None
    sort_order: int = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    checked: Optional[int] = None
    for_attendee_id: Optional[int] = None
    note: Optional[str] = None
    sort_order: Optional[int] = None
    clear_attendee: bool = False
    clear_note: bool = False


class ReorderBody(BaseModel):
    ids: list


class ApplyTemplateBody(BaseModel):
    template_id: int
    merge: bool = True


class PushToTemplateBody(BaseModel):
    template_id: int


def _check_trip(conn, trip_id):
    if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Trip not found.")


def _packing_full(conn, trip_id):
    cats = conn.execute(
        "SELECT * FROM packing_categories WHERE trip_id = ? ORDER BY sort_order, id",
        (trip_id,)
    ).fetchall()
    total = checked = 0
    categories = []
    for cat in cats:
        items = conn.execute(
            """SELECT pi.*, ta.name AS for_attendee_name
               FROM packing_items pi
               LEFT JOIN trip_attendees ta ON ta.id = pi.for_attendee_id
               WHERE pi.category_id = ? ORDER BY pi.sort_order, pi.id""",
            (cat['id'],)
        ).fetchall()
        item_list = [dict(i) for i in items]
        cat_total   = len(item_list)
        cat_checked = sum(1 for i in item_list if i['checked'])
        total   += cat_total
        checked += cat_checked
        c = dict(cat)
        c['items']         = item_list
        c['item_count']    = cat_total
        c['checked_count'] = cat_checked
        categories.append(c)
    return {
        "categories": categories,
        "total": total,
        "checked": checked,
        "pct": round(checked / total * 100) if total else 0,
    }


# ── Categories ─────────────────────────────────────────────────

@router.get("")
def get_packing(trip_id: int):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.post("/categories", status_code=201)
def add_category(trip_id: int, body: CategoryCreate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id = ?", (trip_id,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO packing_categories (trip_id, name, sort_order) VALUES (?, ?, ?)",
        (trip_id, body.name, max_order + 1)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.put("/categories/{cat_id}")
def update_category(trip_id: int, cat_id: int, body: CategoryUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM packing_categories WHERE id = ? AND trip_id = ?", (cat_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    name       = body.name       if body.name       is not None else row['name']
    sort_order = body.sort_order if body.sort_order is not None else row['sort_order']
    conn.execute(
        "UPDATE packing_categories SET name = ?, sort_order = ? WHERE id = ?",
        (name, sort_order, cat_id)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(trip_id: int, cat_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_categories WHERE id = ? AND trip_id = ?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    conn.execute("DELETE FROM packing_categories WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()


@router.post("/categories/reorder")
def reorder_categories(trip_id: int, body: ReorderBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    for i, cat_id in enumerate(body.ids):
        conn.execute(
            "UPDATE packing_categories SET sort_order = ? WHERE id = ? AND trip_id = ?",
            (i, cat_id, trip_id)
        )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


# ── Items ──────────────────────────────────────────────────────

@router.post("/categories/{cat_id}/items", status_code=201)
def add_item(trip_id: int, cat_id: int, body: ItemCreate):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_categories WHERE id = ? AND trip_id = ?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM packing_items WHERE category_id = ?", (cat_id,)
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO packing_items (category_id, trip_id, name, quantity, for_attendee_id, note, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (cat_id, trip_id, body.name, body.quantity, body.for_attendee_id, body.note, max_order + 1)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.put("/items/{item_id}")
def update_item(trip_id: int, item_id: int, body: ItemUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM packing_items WHERE id = ? AND trip_id = ?", (item_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    fields = {}
    if body.name       is not None: fields['name']       = body.name
    if body.quantity   is not None: fields['quantity']   = body.quantity
    if body.checked    is not None: fields['checked']    = body.checked
    if body.sort_order is not None: fields['sort_order'] = body.sort_order
    if body.clear_attendee:         fields['for_attendee_id'] = None
    elif body.for_attendee_id is not None: fields['for_attendee_id'] = body.for_attendee_id
    if body.clear_note:             fields['note'] = None
    elif body.note is not None:     fields['note'] = body.note
    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE packing_items SET {set_clause} WHERE id = ?", (*fields.values(), item_id))
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.delete("/items/{item_id}", status_code=204)
def delete_item(trip_id: int, item_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_items WHERE id = ? AND trip_id = ?", (item_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Item not found.")
    conn.execute("DELETE FROM packing_items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()


@router.post("/categories/{cat_id}/reorder-items")
def reorder_items(trip_id: int, cat_id: int, body: ReorderBody):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_categories WHERE id = ? AND trip_id = ?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Category not found.")
    for i, item_id in enumerate(body.ids):
        conn.execute(
            "UPDATE packing_items SET sort_order = ? WHERE id = ? AND category_id = ?",
            (i, item_id, cat_id)
        )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


# ── Template operations ────────────────────────────────────────

@router.post("/apply-template")
def apply_template(trip_id: int, body: ApplyTemplateBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (body.template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")

    if not body.merge:
        conn.execute("DELETE FROM packing_categories WHERE trip_id = ?", (trip_id,))

    tmpl_cats = conn.execute(
        "SELECT * FROM template_categories WHERE template_id = ? ORDER BY sort_order, id",
        (body.template_id,)
    ).fetchall()

    for tcat in tmpl_cats:
        existing = conn.execute(
            "SELECT id FROM packing_categories WHERE trip_id = ? AND name = ?",
            (trip_id, tcat['name'])
        ).fetchone()
        if existing:
            cat_id = existing['id']
        else:
            max_order = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id = ?",
                (trip_id,)
            ).fetchone()[0]
            c = conn.execute(
                "INSERT INTO packing_categories (trip_id, name, sort_order) VALUES (?, ?, ?) RETURNING id",
                (trip_id, tcat['name'], max_order + 1)
            ).fetchone()
            cat_id = c[0]

        tmpl_items = conn.execute(
            "SELECT * FROM template_items WHERE template_category_id = ? ORDER BY sort_order, id",
            (tcat['id'],)
        ).fetchall()
        for ti in tmpl_items:
            max_item = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_items WHERE category_id = ?", (cat_id,)
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO packing_items (category_id, trip_id, name, quantity, sort_order) VALUES (?, ?, ?, ?, ?)",
                (cat_id, trip_id, ti['name'], ti['quantity'], max_item + 1)
            )

    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.post("/push-to-template")
def push_to_template(trip_id: int, body: PushToTemplateBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    if not conn.execute("SELECT id FROM packing_templates WHERE id = ?", (body.template_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Template not found.")

    conn.execute("DELETE FROM template_categories WHERE template_id = ?", (body.template_id,))

    trip_cats = conn.execute(
        "SELECT * FROM packing_categories WHERE trip_id = ? ORDER BY sort_order, id", (trip_id,)
    ).fetchall()
    for i, tcat in enumerate(trip_cats):
        c = conn.execute(
            "INSERT INTO template_categories (template_id, name, sort_order) VALUES (?, ?, ?) RETURNING id",
            (body.template_id, tcat['name'], i)
        ).fetchone()
        new_cat_id = c[0]
        items = conn.execute(
            "SELECT * FROM packing_items WHERE category_id = ? ORDER BY sort_order, id", (tcat['id'],)
        ).fetchall()
        for j, item in enumerate(items):
            conn.execute(
                "INSERT INTO template_items (template_category_id, name, quantity, sort_order) VALUES (?, ?, ?, ?)",
                (new_cat_id, item['name'], item['quantity'], j)
            )

    conn.execute(
        "UPDATE packing_templates SET updated_at = datetime('now') WHERE id = ?", (body.template_id,)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result
