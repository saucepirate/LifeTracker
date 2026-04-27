from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class ExpenseCreate(BaseModel):
    amount: float
    category: str = 'Other'
    description: Optional[str] = None
    expense_date: Optional[str] = None
    paid_by: str = 'shared'
    phase: str = 'in_trip'


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    expense_date: Optional[str] = None
    paid_by: Optional[str] = None
    phase: Optional[str] = None
    clear_description: bool = False
    clear_date: bool = False


def _check_trip(conn, trip_id):
    if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Trip not found.")


def _budget_full(conn, trip_id):
    trip = conn.execute(
        "SELECT budget_total, budget_currency FROM trips WHERE id = ?", (trip_id,)
    ).fetchone()

    expenses = conn.execute(
        """SELECT * FROM budget_expenses WHERE trip_id = ?
           ORDER BY expense_date DESC NULLS LAST, created_at DESC""",
        (trip_id,)
    ).fetchall()
    exp_list = [dict(e) for e in expenses]

    committed = sum(e['amount'] for e in exp_list if e['phase'] == 'pre_trip')
    spent     = sum(e['amount'] for e in exp_list if e['phase'] == 'in_trip')
    post      = sum(e['amount'] for e in exp_list if e['phase'] == 'post_trip')
    total_out = sum(e['amount'] for e in exp_list)

    by_cat = {}
    for e in exp_list:
        by_cat[e['category']] = round(by_cat.get(e['category'], 0) + e['amount'], 2)

    budget_total = trip['budget_total']
    remaining    = round(budget_total - total_out, 2) if budget_total is not None else None

    return {
        "budget_total":    budget_total,
        "budget_currency": trip['budget_currency'] or 'USD',
        "committed":  round(committed, 2),
        "spent":      round(spent, 2),
        "post_trip":  round(post, 2),
        "total_out":  round(total_out, 2),
        "remaining":  remaining,
        "by_category": by_cat,
        "expenses":   exp_list,
    }


@router.get("")
def get_budget(trip_id: int):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    result = _budget_full(conn, trip_id)
    conn.close()
    return result


@router.post("/expenses", status_code=201)
def add_expense(trip_id: int, body: ExpenseCreate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    conn.execute(
        """INSERT INTO budget_expenses
               (trip_id, amount, category, description, expense_date, paid_by, phase)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (trip_id, body.amount, body.category, body.description,
         body.expense_date, body.paid_by, body.phase)
    )
    conn.commit()
    result = _budget_full(conn, trip_id)
    conn.close()
    return result


@router.put("/expenses/{exp_id}")
def update_expense(trip_id: int, exp_id: int, body: ExpenseUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM budget_expenses WHERE id = ? AND trip_id = ?", (exp_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found.")

    fields = {}
    if body.amount   is not None: fields['amount']   = body.amount
    if body.category is not None: fields['category'] = body.category
    if body.paid_by  is not None: fields['paid_by']  = body.paid_by
    if body.phase    is not None: fields['phase']    = body.phase
    if body.clear_description:    fields['description']  = None
    elif body.description is not None: fields['description'] = body.description
    if body.clear_date:           fields['expense_date'] = None
    elif body.expense_date is not None: fields['expense_date'] = body.expense_date

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE budget_expenses SET {set_clause} WHERE id = ?",
            (*fields.values(), exp_id)
        )
    conn.commit()
    result = _budget_full(conn, trip_id)
    conn.close()
    return result


@router.delete("/expenses/{exp_id}", status_code=204)
def delete_expense(trip_id: int, exp_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM budget_expenses WHERE id = ? AND trip_id = ?", (exp_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found.")
    conn.execute("DELETE FROM budget_expenses WHERE id = ?", (exp_id,))
    conn.commit()
    conn.close()
