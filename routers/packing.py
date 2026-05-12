from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class PackingListCreate(BaseModel):
    name: str
    list_type: str = 'personal'
    for_attendee_id: Optional[int] = None


class PackingListUpdate(BaseModel):
    name: Optional[str] = None
    list_type: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str
    sort_order: int = 0
    list_id: Optional[int] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class ItemCreate(BaseModel):
    name: str
    quantity: int = 1
    for_attendee_id: Optional[int] = None
    owner_type: str = 'all_travelers'
    note: Optional[str] = None
    sort_order: int = 0


class ItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    checked: Optional[int] = None
    for_attendee_id: Optional[int] = None
    owner_type: Optional[str] = None
    note: Optional[str] = None
    sort_order: Optional[int] = None
    clear_attendee: bool = False
    clear_note: bool = False


class ReorderBody(BaseModel):
    ids: list


class ApplyTemplateBody(BaseModel):
    template_id: int
    merge: bool = True
    list_id: Optional[int] = None


class PushToTemplateBody(BaseModel):
    template_id: int


class ApplyInlinePresetBody(BaseModel):
    categories: list
    merge: bool = True
    mode: str = 'single'        # 'single' | 'per_list'
    list_id: Optional[int] = None
    traveler_names: Optional[list] = None   # if set, overrides attendee-derived names
    traveler_genders: Optional[list] = None  # parallel: 'men' | 'women' | 'any'


def _check_trip(conn, trip_id):
    if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Trip not found.")


def _ensure_default_list(conn, trip_id):
    """Return the id of the first list for this trip, creating a default one if needed."""
    row = conn.execute(
        "SELECT id FROM packing_lists WHERE trip_id=? ORDER BY sort_order, id LIMIT 1",
        (trip_id,)
    ).fetchone()
    if row:
        return row['id']
    cur = conn.execute(
        "INSERT INTO packing_lists (trip_id, name, list_type, sort_order) VALUES (?, 'Packing List', 'personal', 0)",
        (trip_id,)
    )
    return cur.lastrowid


def _packing_full(conn, trip_id):
    # Auto-migrate orphan categories (list_id IS NULL) to a default list
    orphan_count = conn.execute(
        "SELECT COUNT(*) FROM packing_categories WHERE trip_id=? AND list_id IS NULL",
        (trip_id,)
    ).fetchone()[0]
    if orphan_count:
        default_id = _ensure_default_list(conn, trip_id)
        conn.execute(
            "UPDATE packing_categories SET list_id=? WHERE trip_id=? AND list_id IS NULL",
            (default_id, trip_id)
        )
        conn.commit()

    lists_rows = conn.execute(
        "SELECT * FROM packing_lists WHERE trip_id=? ORDER BY sort_order, id",
        (trip_id,)
    ).fetchall()

    grand_total = grand_checked = 0
    result_lists = []

    for lst in lists_rows:
        cats = conn.execute(
            "SELECT * FROM packing_categories WHERE trip_id=? AND list_id=? ORDER BY sort_order, id",
            (trip_id, lst['id'])
        ).fetchall()
        cat_list = []
        list_total = list_checked = 0
        for cat in cats:
            items = conn.execute(
                """SELECT pi.*, ta.name AS for_attendee_name
                   FROM packing_items pi
                   LEFT JOIN trip_attendees ta ON ta.id = pi.for_attendee_id
                   WHERE pi.category_id=? ORDER BY pi.sort_order, pi.id""",
                (cat['id'],)
            ).fetchall()
            item_list = [dict(i) for i in items]
            ic = len(item_list)
            cc = sum(1 for i in item_list if i['checked'])
            list_total += ic
            list_checked += cc
            c = dict(cat)
            c['items'] = item_list
            c['item_count'] = ic
            c['checked_count'] = cc
            cat_list.append(c)
        grand_total += list_total
        grand_checked += list_checked
        result_lists.append({
            **dict(lst),
            'categories': cat_list,
            'item_count': list_total,
            'checked_count': list_checked,
        })

    return {
        'lists': result_lists,
        'total': grand_total,
        'checked': grand_checked,
        'pct': round(grand_checked / grand_total * 100) if grand_total else 0,
    }


# ── GET ─────────────────────────────────────────────────────────

@router.get("")
def get_packing(trip_id: int):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


# ── Packing Lists ───────────────────────────────────────────────

@router.post("/lists", status_code=201)
def create_packing_list(trip_id: int, body: PackingListCreate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM packing_lists WHERE trip_id=?", (trip_id,)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO packing_lists (trip_id, name, list_type, for_attendee_id, sort_order) VALUES (?,?,?,?,?)",
        (trip_id, body.name, body.list_type, body.for_attendee_id, max_order + 1)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.patch("/lists/{list_id}")
def update_packing_list(trip_id: int, list_id: int, body: PackingListUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM packing_lists WHERE id=? AND trip_id=?", (list_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Packing list not found.")
    name      = body.name      if body.name      is not None else row['name']
    list_type = body.list_type if body.list_type is not None else row['list_type']
    conn.execute(
        "UPDATE packing_lists SET name=?, list_type=? WHERE id=?",
        (name, list_type, list_id)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.delete("/lists/{list_id}", status_code=204)
def delete_packing_list(trip_id: int, list_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_lists WHERE id=? AND trip_id=?", (list_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Packing list not found.")
    conn.execute("DELETE FROM packing_lists WHERE id=?", (list_id,))
    conn.commit()
    conn.close()


@router.post("/lists/reorder")
def reorder_lists(trip_id: int, body: ReorderBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    for i, lid in enumerate(body.ids):
        conn.execute(
            "UPDATE packing_lists SET sort_order=? WHERE id=? AND trip_id=?", (i, lid, trip_id)
        )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


# ── Categories ─────────────────────────────────────────────────

@router.post("/categories", status_code=201)
def add_category(trip_id: int, body: CategoryCreate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    list_id = body.list_id if body.list_id is not None else _ensure_default_list(conn, trip_id)
    if not conn.execute(
        "SELECT id FROM packing_lists WHERE id=? AND trip_id=?", (list_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Packing list not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id=? AND list_id=?",
        (trip_id, list_id)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO packing_categories (trip_id, list_id, name, sort_order) VALUES (?,?,?,?)",
        (trip_id, list_id, body.name, max_order + 1)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.put("/categories/{cat_id}")
def update_category(trip_id: int, cat_id: int, body: CategoryUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM packing_categories WHERE id=? AND trip_id=?", (cat_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Category not found.")
    name       = body.name       if body.name       is not None else row['name']
    sort_order = body.sort_order if body.sort_order is not None else row['sort_order']
    conn.execute(
        "UPDATE packing_categories SET name=?, sort_order=? WHERE id=?",
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
        "SELECT id FROM packing_categories WHERE id=? AND trip_id=?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Category not found.")
    conn.execute("DELETE FROM packing_categories WHERE id=?", (cat_id,))
    conn.commit()
    conn.close()


@router.post("/categories/reorder")
def reorder_categories(trip_id: int, body: ReorderBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    for i, cat_id in enumerate(body.ids):
        conn.execute(
            "UPDATE packing_categories SET sort_order=? WHERE id=? AND trip_id=?",
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
        "SELECT id FROM packing_categories WHERE id=? AND trip_id=?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Category not found.")
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM packing_items WHERE category_id=?", (cat_id,)
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO packing_items
           (category_id, trip_id, name, quantity, for_attendee_id, owner_type, note, sort_order)
           VALUES (?,?,?,?,?,?,?,?)""",
        (cat_id, trip_id, body.name, body.quantity, body.for_attendee_id,
         body.owner_type, body.note, max_order + 1)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.put("/items/{item_id}")
def update_item(trip_id: int, item_id: int, body: ItemUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM packing_items WHERE id=? AND trip_id=?", (item_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Item not found.")
    fields = {}
    if body.name       is not None: fields['name']       = body.name
    if body.quantity   is not None: fields['quantity']   = body.quantity
    if body.checked    is not None: fields['checked']    = body.checked
    if body.sort_order is not None: fields['sort_order'] = body.sort_order
    if body.owner_type is not None: fields['owner_type'] = body.owner_type
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
        "SELECT id FROM packing_items WHERE id=? AND trip_id=?", (item_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Item not found.")
    conn.execute("DELETE FROM packing_items WHERE id=?", (item_id,))
    conn.commit()
    conn.close()


@router.post("/categories/{cat_id}/reorder-items")
def reorder_items(trip_id: int, cat_id: int, body: ReorderBody):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM packing_categories WHERE id=? AND trip_id=?", (cat_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Category not found.")
    for i, item_id in enumerate(body.ids):
        conn.execute(
            "UPDATE packing_items SET sort_order=? WHERE id=? AND category_id=?",
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
    if not conn.execute("SELECT id FROM packing_templates WHERE id=?", (body.template_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Template not found.")

    target_list_id = body.list_id if body.list_id is not None else _ensure_default_list(conn, trip_id)
    if not conn.execute(
        "SELECT id FROM packing_lists WHERE id=? AND trip_id=?", (target_list_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(404, "Packing list not found.")

    if not body.merge:
        conn.execute(
            "DELETE FROM packing_categories WHERE trip_id=? AND list_id=?",
            (trip_id, target_list_id)
        )

    tmpl_cats = conn.execute(
        "SELECT * FROM template_categories WHERE template_id=? ORDER BY sort_order, id",
        (body.template_id,)
    ).fetchall()

    for tcat in tmpl_cats:
        existing = conn.execute(
            "SELECT id FROM packing_categories WHERE trip_id=? AND list_id=? AND name=?",
            (trip_id, target_list_id, tcat['name'])
        ).fetchone()
        if existing:
            cat_id = existing['id']
        else:
            max_order = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id=? AND list_id=?",
                (trip_id, target_list_id)
            ).fetchone()[0]
            c = conn.execute(
                "INSERT INTO packing_categories (trip_id, list_id, name, sort_order) VALUES (?,?,?,?) RETURNING id",
                (trip_id, target_list_id, tcat['name'], max_order + 1)
            ).fetchone()
            cat_id = c[0]

        for ti in conn.execute(
            "SELECT * FROM template_items WHERE template_category_id=? ORDER BY sort_order, id",
            (tcat['id'],)
        ).fetchall():
            max_item = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_items WHERE category_id=?", (cat_id,)
            ).fetchone()[0]
            otype = ti['owner_type'] if 'owner_type' in ti.keys() else 'all_travelers'
            conn.execute(
                "INSERT INTO packing_items (category_id, trip_id, name, quantity, owner_type, sort_order) VALUES (?,?,?,?,?,?)",
                (cat_id, trip_id, ti['name'], ti['quantity'], otype, max_item + 1)
            )

    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.post("/apply-inline-preset")
def apply_inline_preset(trip_id: int, body: ApplyInlinePresetBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)

    if body.mode == 'per_list':
        if not body.merge:
            conn.execute("DELETE FROM packing_lists WHERE trip_id=?", (trip_id,))
            conn.commit()

        shared_id = conn.execute(
            "INSERT INTO packing_lists (trip_id, name, list_type, sort_order) VALUES (?, 'Shared', 'shared', 0) RETURNING id",
            (trip_id,)
        ).fetchone()[0]

        # Build personal list ids — [(list_id, gender)] where gender is 'men'|'women'|'any'
        if body.traveler_names:
            names   = [str(n) for n in body.traveler_names]
            raw_g   = [str(g) for g in (body.traveler_genders or [])]
            raw_g  += ['any'] * (len(names) - len(raw_g))
            personal_list_ids = []
            for i, (n, g) in enumerate(zip(names, raw_g)):
                lid = conn.execute(
                    "INSERT INTO packing_lists (trip_id, name, list_type, sort_order) VALUES (?,?,?,?) RETURNING id",
                    (trip_id, n, 'personal', i + 1)
                ).fetchone()[0]
                personal_list_ids.append((lid, g))
        else:
            attendees = conn.execute(
                "SELECT id, name FROM trip_attendees WHERE trip_id=? ORDER BY sort_order, id",
                (trip_id,)
            ).fetchall()
            if attendees:
                personal_list_ids = []
                for i, att in enumerate(attendees):
                    lid = conn.execute(
                        "INSERT INTO packing_lists (trip_id, name, list_type, for_attendee_id, sort_order) VALUES (?,?,?,?,?) RETURNING id",
                        (trip_id, att['name'], 'personal', att['id'], i + 1)
                    ).fetchone()[0]
                    personal_list_ids.append((lid, 'any'))
            else:
                lid = conn.execute(
                    "INSERT INTO packing_lists (trip_id, name, list_type, sort_order) VALUES (?, 'Personal', 'personal', 1) RETURNING id",
                    (trip_id,)
                ).fetchone()[0]
                personal_list_ids = [(lid, 'any')]

        for cat_data in body.categories:
            cat_name = (cat_data.get('name') or '').strip()
            if not cat_name:
                continue
            items = cat_data.get('items') or []
            shared_items  = [it for it in items if (it.get('owner_type') or 'all_travelers') == 'shared']
            general_items = [it for it in items if (it.get('owner_type') or 'all_travelers') == 'all_travelers']
            men_items     = [it for it in items if (it.get('owner_type') or 'all_travelers') == 'men']
            women_items   = [it for it in items if (it.get('owner_type') or 'all_travelers') == 'women']

            if shared_items:
                max_order = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id=? AND list_id=?",
                    (trip_id, shared_id)
                ).fetchone()[0]
                cat_id = conn.execute(
                    "INSERT INTO packing_categories (trip_id, list_id, name, sort_order) VALUES (?,?,?,?) RETURNING id",
                    (trip_id, shared_id, cat_name, max_order + 1)
                ).fetchone()[0]
                for j, it in enumerate(shared_items):
                    name = (it.get('name') or '').strip()
                    if name:
                        conn.execute(
                            "INSERT INTO packing_items (category_id, trip_id, name, quantity, owner_type, sort_order) VALUES (?,?,?,?,?,?)",
                            (cat_id, trip_id, name, int(it.get('quantity', 1)), 'shared', j)
                        )

            for plid, gender in personal_list_ids:
                # Route items to this list based on gender
                if gender == 'men':
                    list_items = general_items + men_items
                elif gender == 'women':
                    list_items = general_items + women_items
                else:
                    list_items = general_items + men_items + women_items

                if not list_items:
                    continue

                max_order = conn.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id=? AND list_id=?",
                    (trip_id, plid)
                ).fetchone()[0]
                cat_id = conn.execute(
                    "INSERT INTO packing_categories (trip_id, list_id, name, sort_order) VALUES (?,?,?,?) RETURNING id",
                    (trip_id, plid, cat_name, max_order + 1)
                ).fetchone()[0]
                for j, it in enumerate(list_items):
                    name = (it.get('name') or '').strip()
                    if name:
                        otype = it.get('owner_type') or 'all_travelers'
                        conn.execute(
                            "INSERT INTO packing_items (category_id, trip_id, name, quantity, owner_type, sort_order) VALUES (?,?,?,?,?,?)",
                            (cat_id, trip_id, name, int(it.get('quantity', 1)), otype, j)
                        )

        conn.commit()
        result = _packing_full(conn, trip_id)
        conn.close()
        return result

    # Single-list mode
    target_list_id = body.list_id if body.list_id is not None else _ensure_default_list(conn, trip_id)

    if not body.merge:
        conn.execute(
            "DELETE FROM packing_categories WHERE trip_id=? AND list_id=?",
            (trip_id, target_list_id)
        )

    for cat_data in body.categories:
        cat_name = (cat_data.get('name') or '').strip()
        if not cat_name:
            continue
        existing = conn.execute(
            "SELECT id FROM packing_categories WHERE trip_id=? AND list_id=? AND name=?",
            (trip_id, target_list_id, cat_name)
        ).fetchone()
        if existing:
            cat_id = existing['id']
        else:
            max_order = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_categories WHERE trip_id=? AND list_id=?",
                (trip_id, target_list_id)
            ).fetchone()[0]
            cat_id = conn.execute(
                "INSERT INTO packing_categories (trip_id, list_id, name, sort_order) VALUES (?,?,?,?) RETURNING id",
                (trip_id, target_list_id, cat_name, max_order + 1)
            ).fetchone()[0]

        for it in (cat_data.get('items') or []):
            name = (it.get('name') or '').strip()
            if not name:
                continue
            otype = it.get('owner_type') or 'all_travelers'
            max_item = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM packing_items WHERE category_id=?", (cat_id,)
            ).fetchone()[0]
            conn.execute(
                "INSERT INTO packing_items (category_id, trip_id, name, quantity, owner_type, sort_order) VALUES (?,?,?,?,?,?)",
                (cat_id, trip_id, name, int(it.get('quantity', 1)), otype, max_item + 1)
            )

    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result


@router.post("/push-to-template")
def push_to_template(trip_id: int, body: PushToTemplateBody):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    if not conn.execute("SELECT id FROM packing_templates WHERE id=?", (body.template_id,)).fetchone():
        conn.close()
        raise HTTPException(404, "Template not found.")

    conn.execute("DELETE FROM template_categories WHERE template_id=?", (body.template_id,))

    all_cats = conn.execute(
        """SELECT pc.* FROM packing_categories pc
           JOIN packing_lists pl ON pl.id = pc.list_id
           WHERE pc.trip_id=?
           ORDER BY pl.sort_order, pl.id, pc.sort_order, pc.id""",
        (trip_id,)
    ).fetchall()

    for i, tcat in enumerate(all_cats):
        c = conn.execute(
            "INSERT INTO template_categories (template_id, name, sort_order) VALUES (?,?,?) RETURNING id",
            (body.template_id, tcat['name'], i)
        ).fetchone()
        new_cat_id = c[0]
        for j, item in enumerate(conn.execute(
            "SELECT * FROM packing_items WHERE category_id=? ORDER BY sort_order, id", (tcat['id'],)
        ).fetchall()):
            otype = item['owner_type'] if 'owner_type' in item.keys() else 'all_travelers'
            conn.execute(
                "INSERT INTO template_items (template_category_id, name, quantity, owner_type, sort_order) VALUES (?,?,?,?,?)",
                (new_cat_id, item['name'], item['quantity'], otype, j)
            )

    conn.execute(
        "UPDATE packing_templates SET updated_at=datetime('now') WHERE id=?", (body.template_id,)
    )
    conn.commit()
    result = _packing_full(conn, trip_id)
    conn.close()
    return result
