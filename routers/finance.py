from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Optional
from datetime import date as _date, datetime, timedelta
import csv
import io
import json
import re
import database
from models.finance import (
    AccountCreate, AccountUpdate, CategoryCreate, CategoryUpdate,
    TransactionCreate, TransactionUpdate,
    CategoryRuleCreate, CategoryRuleUpdate,
    IncomeCreate, IncomeUpdate,
    HoldingCreate, HoldingUpdate,
    LiabilityCreate, LiabilityUpdate,
    FinGoalCreate, FinGoalUpdate,
    ImportClassifyAssign,
    ExpenditureCreate, ExpenditureUpdate, PlanningAssumptions,
)


def _holding_value(h):
    """Effective market value: prefer manual value, then shares*price, then cost_basis."""
    if h.get('value') is not None:
        return h['value']
    if h.get('shares') is not None and h.get('current_price') is not None:
        return h['shares'] * h['current_price']
    if h.get('cost_basis') is not None:
        return h['cost_basis']
    return 0

router = APIRouter()


# ── Classifier ────────────────────────────────────────────────────────────────
def classify_transaction(conn, name: str, mcc: Optional[str]) -> Optional[int]:
    """Return category_id for a transaction by applying rules in priority order."""
    name_upper = (name or '').upper()
    rules = conn.execute(
        "SELECT category_id, rule_type, pattern FROM finance_category_rules "
        "ORDER BY priority DESC, is_default ASC, id ASC"
    ).fetchall()
    for r in rules:
        if r['rule_type'] == 'merchant':
            if r['pattern'] and r['pattern'].upper() in name_upper:
                return r['category_id']
        elif r['rule_type'] == 'mcc':
            if mcc and mcc == r['pattern']:
                return r['category_id']
    return None


def _extract_mcc(memo: str) -> str:
    if not memo:
        return ''
    parts = [p.strip() for p in memo.split(';')]
    if len(parts) >= 2:
        p = parts[1].strip()
        if p.isdigit():
            return p
    return ''


# Fidelity brokerage CSV helpers
_FIDELITY_SKIP_PREFIXES = (
    'YOU BOUGHT', 'REINVESTMENT', 'MERGER', 'TRANSFERRED FROM',
)
_FIDELITY_ACTION_PREFIXES = (
    'DEBIT CARD PURCHASE ', 'DIRECT DEBIT ', 'DIRECT DEPOSIT ',
    'DIVIDEND RECEIVED ', 'FEE CHARGED ', 'FOREIGN TAX PAID ',
    'DISTRIBUTION ', 'ADJUST FEE CHARGED ',
)

def _clean_fidelity_name(action: str) -> str:
    """Extract merchant/description from a Fidelity action text."""
    # Strip trailing " (Cash)" or " (Type)" suffix
    name = re.sub(r'\s*\([^)]+\)\s*$', '', action).strip()
    # Strip trailing transaction reference codes (e.g. TX0403..., NY0630..., WI0927...)
    name = re.sub(r'\s+[A-Z]{2}\d{6,}[A-Z0-9]*$', '', name).strip()
    # Strip known action-type prefixes to surface the merchant name
    name_upper = name.upper()
    for prefix in _FIDELITY_ACTION_PREFIXES:
        if name_upper.startswith(prefix):
            name = name[len(prefix):].strip()
            break
    return name or action


# ── Accounts ──────────────────────────────────────────────────────────────────
@router.get("/accounts")
def list_accounts():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM finance_accounts ORDER BY is_active DESC, name").fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/accounts", status_code=201)
def create_account(body: AccountCreate):
    conn = database.get_connection()
    c = conn.execute(
        "INSERT INTO finance_accounts (name, type, institution, notes, is_active) VALUES (?, ?, ?, ?, ?) RETURNING *",
        (body.name, body.type, body.institution, body.notes, body.is_active)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/accounts/{aid}")
def update_account(aid: int, body: AccountUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_accounts SET {clause} WHERE id = ?", list(fields.values()) + [aid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_accounts WHERE id = ?", (aid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Account not found")
    return dict(row)


@router.delete("/accounts/{aid}", status_code=204)
def delete_account(aid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_accounts WHERE id = ?", (aid,))
    conn.commit(); conn.close()


# ── Categories ────────────────────────────────────────────────────────────────
@router.get("/categories")
def list_categories():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM finance_categories ORDER BY sort_order, name").fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/categories", status_code=201)
def create_category(body: CategoryCreate):
    conn = database.get_connection()
    so = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM finance_categories").fetchone()[0]
    try:
        c = conn.execute(
            "INSERT INTO finance_categories (name, color, icon, is_income, is_savings, is_excluded, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
            (body.name, body.color, body.icon, body.is_income, body.is_savings, body.is_excluded, so)
        )
        row = c.fetchone()
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(400, f"Could not create category (name must be unique): {e}")
    conn.close()
    return dict(row)


@router.put("/categories/{cid}")
def update_category(cid: int, body: CategoryUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_categories SET {clause} WHERE id = ?", list(fields.values()) + [cid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_categories WHERE id = ?", (cid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Category not found")
    return dict(row)


@router.delete("/categories/{cid}", status_code=204)
def delete_category(cid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_categories WHERE id = ?", (cid,))
    conn.commit(); conn.close()


# ── Category Rules ────────────────────────────────────────────────────────────
@router.get("/rules")
def list_rules():
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT r.*, c.name AS category_name, c.color AS category_color
           FROM finance_category_rules r
           JOIN finance_categories c ON c.id = r.category_id
           ORDER BY r.priority DESC, r.is_default ASC, r.id"""
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/rules", status_code=201)
def create_rule(body: CategoryRuleCreate):
    conn = database.get_connection()
    c = conn.execute(
        "INSERT INTO finance_category_rules (category_id, rule_type, pattern, priority, is_default) VALUES (?, ?, ?, ?, 0) RETURNING *",
        (body.category_id, body.rule_type, body.pattern.strip(), body.priority)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/rules/{rid}")
def update_rule(rid: int, body: CategoryRuleUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_category_rules SET {clause} WHERE id = ?", list(fields.values()) + [rid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_category_rules WHERE id = ?", (rid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Rule not found")
    return dict(row)


@router.delete("/rules/{rid}", status_code=204)
def delete_rule(rid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_category_rules WHERE id = ?", (rid,))
    conn.commit(); conn.close()


# ── Transactions ──────────────────────────────────────────────────────────────
def _txn_full(conn, tid):
    row = conn.execute(
        """SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                  c.is_income AS category_is_income, c.is_savings AS category_is_savings,
                  IFNULL(c.is_excluded, 0) AS category_is_excluded,
                  a.name AS account_name
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           LEFT JOIN finance_accounts a ON a.id = t.account_id
           WHERE t.id = ?""",
        (tid,)
    ).fetchone()
    return dict(row) if row else None


@router.get("/transactions")
def list_transactions(
    start: Optional[str] = None,
    end: Optional[str] = None,
    category_ids: Optional[str] = None,  # comma-separated category IDs for multi-select filter
    account_id: Optional[int] = None,
    only_unclassified: bool = False,
    limit: int = 5000,
):
    conn = database.get_connection()
    sql = """SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
                    c.is_income AS category_is_income, c.is_savings AS category_is_savings,
                    IFNULL(c.is_excluded, 0) AS category_is_excluded,
                    a.name AS account_name
             FROM finance_transactions t
             LEFT JOIN finance_categories c ON c.id = t.category_id
             LEFT JOIN finance_accounts a ON a.id = t.account_id"""
    conds, params = [], []
    if start: conds.append("t.date >= ?"); params.append(start)
    if end:   conds.append("t.date <= ?"); params.append(end)
    if category_ids:
        ids = [i.strip() for i in category_ids.split(',') if i.strip().isdigit()]
        if ids:
            conds.append(f"t.category_id IN ({','.join('?' * len(ids))})")
            params.extend(int(i) for i in ids)
    if account_id  is not None: conds.append("t.account_id = ?");  params.append(account_id)
    if only_unclassified:       conds.append("t.category_id IS NULL")
    where_params = list(params)  # save before appending limit
    if conds: sql += " WHERE " + " AND ".join(conds)
    sql += " ORDER BY t.date DESC, t.id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()

    # Compute accurate totals server-side (no LIMIT) so the summary is always correct
    totals_sql = """SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN t.amount > 0 AND IFNULL(c.is_excluded,0)=0 THEN t.amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.amount < 0 AND IFNULL(c.is_excluded,0)=0 THEN t.amount ELSE 0 END), 0) AS spend,
        COALESCE(SUM(CASE WHEN IFNULL(c.is_excluded,0)=1 THEN 1 ELSE 0 END), 0) AS excluded_count
        FROM finance_transactions t
        LEFT JOIN finance_categories c ON c.id = t.category_id"""
    if conds: totals_sql += " WHERE " + " AND ".join(conds)
    totals = conn.execute(totals_sql, where_params).fetchone()
    conn.close()
    return {
        "items": [dict(r) for r in rows],
        "total": totals["total_count"],
        "loaded": len(rows),
        "income": round(totals["income"], 2),
        "spend": round(abs(totals["spend"]), 2),
        "excluded_count": totals["excluded_count"],
    }


@router.post("/transactions", status_code=201)
def create_transaction(body: TransactionCreate):
    conn = database.get_connection()
    cat_id = body.category_id
    if cat_id is None:
        cat_id = classify_transaction(conn, body.name, body.mcc)
    c = conn.execute(
        """INSERT INTO finance_transactions (account_id, date, name, memo, amount, mcc, category_id, notes, user_classified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
        (body.account_id, body.date, body.name, body.memo, body.amount, body.mcc, cat_id, body.notes, 1 if body.category_id else 0)
    )
    tid = c.fetchone()[0]
    conn.commit()
    out = _txn_full(conn, tid)
    conn.close()
    return out


@router.put("/transactions/{tid}")
def update_transaction(tid: int, body: TransactionUpdate):
    conn = database.get_connection()
    fields = {}
    if body.clear_category:
        fields['category_id'] = None
        fields['user_classified'] = 0
    elif body.category_id is not None:
        fields['category_id'] = body.category_id
        fields['user_classified'] = 1
    for k in ('notes', 'name', 'amount', 'date', 'is_transfer', 'user_classified'):
        v = getattr(body, k)
        if v is not None and k not in fields:
            fields[k] = v
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_transactions SET {clause} WHERE id = ?", list(fields.values()) + [tid])
    conn.commit()
    out = _txn_full(conn, tid)
    conn.close()
    if not out: raise HTTPException(404, "Transaction not found")
    return out


@router.delete("/transactions/{tid}", status_code=204)
def delete_transaction(tid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_transactions WHERE id = ?", (tid,))
    conn.commit(); conn.close()


@router.post("/transactions/reclassify-all")
def reclassify_all():
    """Re-run classifier across ALL transactions that haven't been user-classified."""
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT id, name, mcc FROM finance_transactions WHERE user_classified = 0"
    ).fetchall()
    updated = 0
    for r in rows:
        cid = classify_transaction(conn, r['name'], r['mcc'])
        if cid:
            conn.execute("UPDATE finance_transactions SET category_id = ? WHERE id = ?", (cid, r['id']))
            updated += 1
    conn.commit(); conn.close()
    return {"updated": updated, "scanned": len(rows)}


# ── Reconciliation ────────────────────────────────────────────────────────────
@router.get("/reconcile")
def reconcile_unclassified():
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT t.*, a.name AS account_name
           FROM finance_transactions t
           LEFT JOIN finance_accounts a ON a.id = t.account_id
           WHERE t.category_id IS NULL
           ORDER BY t.date DESC, t.id DESC"""
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/reconcile/assign")
def reconcile_assign(body: ImportClassifyAssign):
    conn = database.get_connection()
    conn.execute(
        "UPDATE finance_transactions SET category_id = ?, user_classified = 1 WHERE id = ?",
        (body.category_id, body.transaction_id)
    )
    new_rule = None
    if body.create_rule and body.rule_type and body.rule_pattern:
        c = conn.execute(
            "INSERT INTO finance_category_rules (category_id, rule_type, pattern, priority, is_default) VALUES (?, ?, ?, ?, 0) RETURNING *",
            (body.category_id, body.rule_type, body.rule_pattern.strip(), 10)
        )
        new_rule = dict(c.fetchone())
        if body.overwrite_classified:
            # Reclassify ALL transactions matching this pattern (including already-classified).
            # Do NOT set user_classified=1 here — only the explicitly clicked transaction gets
            # that flag. Bulk-matched transactions should remain auto-classifiable by rules.
            if body.rule_type == 'merchant':
                conn.execute(
                    "UPDATE finance_transactions SET category_id = ? "
                    "WHERE UPPER(name) LIKE ?",
                    (body.category_id, f"%{body.rule_pattern.upper()}%")
                )
            elif body.rule_type == 'mcc':
                conn.execute(
                    "UPDATE finance_transactions SET category_id = ? "
                    "WHERE mcc = ?",
                    (body.category_id, body.rule_pattern.strip())
                )
        else:
            # Only apply to unclassified transactions
            if body.rule_type == 'merchant':
                conn.execute(
                    "UPDATE finance_transactions SET category_id = ? "
                    "WHERE category_id IS NULL AND UPPER(name) LIKE ?",
                    (body.category_id, f"%{body.rule_pattern.upper()}%")
                )
            elif body.rule_type == 'mcc':
                conn.execute(
                    "UPDATE finance_transactions SET category_id = ? "
                    "WHERE category_id IS NULL AND mcc = ?",
                    (body.category_id, body.rule_pattern.strip())
                )
    conn.commit()
    out = _txn_full(conn, body.transaction_id)
    conn.close()
    return {"transaction": out, "new_rule": new_rule}


# ── CSV Import ────────────────────────────────────────────────────────────────
@router.post("/import")
async def import_csv(account_id: Optional[int] = None, file: UploadFile = File(...)):
    """Import a CSV file. Auto-classifies via rules. Returns import summary."""
    raw = await file.read()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('latin-1')

    # Strip leading blank lines (Fidelity has 2 empty rows before the header)
    # and trailing disclaimer/footer text
    lines = text.splitlines()
    start = 0
    for i, ln in enumerate(lines):
        if ln.strip():
            start = i
            break
    _FOOTER_MARKERS = ('the data and information', 'brokerage services are provided',
                       'fidelity insurance', 'informational purposes only',
                       'date downloaded', 'exported and is subject')
    end = len(lines)
    for i in range(len(lines) - 1, start, -1):
        stripped = lines[i].strip().strip('"').lower()
        if stripped and not any(stripped.startswith(m) for m in _FOOTER_MARKERS):
            end = i + 1
            break
    clean_text = '\n'.join(lines[start:end])

    reader = csv.DictReader(io.StringIO(clean_text))

    # Normalise header keys
    if not reader.fieldnames:
        raise HTTPException(400, "CSV has no header row")
    header_map = {h.lower().strip(): h for h in reader.fieldnames}
    def col(*names):
        for n in names:
            if n.lower() in header_map: return header_map[n.lower()]
        return None

    # Detect Fidelity brokerage format (Run Date + Action + Amount ($) columns)
    is_fidelity = 'run date' in header_map and 'action' in header_map

    if is_fidelity:
        date_col   = col('run date')
        name_col   = col('action')
        amount_col = col('amount ($)')
        memo_col   = col('description')
        type_col   = None
    else:
        date_col   = col('date', 'transaction date', 'posted date')
        name_col   = col('name', 'description', 'merchant', 'payee')
        memo_col   = col('memo', 'description', 'note')
        amount_col = col('amount', 'debit', 'credit')
        type_col   = col('transaction', 'type')

    if not (date_col and name_col and amount_col):
        raise HTTPException(400, "CSV must have Date, Name (or Description), and Amount columns")

    conn = database.get_connection()
    inserted, classified, skipped_dup, unclassified = 0, 0, 0, 0
    sample = []

    # Record the import session up front so we can link transactions to it
    fname = getattr(file, 'filename', None) or 'upload.csv'
    imp = conn.execute(
        """INSERT INTO finance_imports (filename, account_id) VALUES (?, ?) RETURNING id""",
        (fname, account_id)
    ).fetchone()
    import_id = imp[0]

    for row in reader:
        date_v = (row.get(date_col) or '').strip()
        name_v = (row.get(name_col) or '').strip()
        memo_v = (row.get(memo_col) or '').strip() if memo_col else ''
        amt_s  = (row.get(amount_col) or '').replace(',', '').strip()
        if not date_v or not name_v or not amt_s:
            continue

        # Fidelity: skip investment rows and clean up name/memo
        if is_fidelity:
            action_upper = name_v.upper()
            if any(action_upper.startswith(p) for p in _FIDELITY_SKIP_PREFIXES):
                continue
            # Description column says "No Description" for cash transactions
            if memo_v.lower() in ('no description', ''):
                memo_v = ''
            name_v = _clean_fidelity_name(name_v)

        try:
            amount = float(amt_s)
        except ValueError:
            continue
        if amount == 0:
            continue
        # If a Type column says DEBIT/CREDIT and the amount is positive but type is debit, flip it
        if type_col:
            tt = (row.get(type_col) or '').strip().upper()
            if tt == 'DEBIT' and amount > 0:
                amount = -amount
            elif tt == 'CREDIT' and amount < 0:
                amount = abs(amount)

        # Normalise date to YYYY-MM-DD if possible
        date_iso = _normalise_date(date_v)
        if not date_iso:
            continue

        mcc = _extract_mcc(memo_v)
        # Dedup: same account+date+name+amount+memo
        existing = conn.execute(
            """SELECT id FROM finance_transactions
               WHERE date = ? AND name = ? AND amount = ?
                 AND IFNULL(memo,'') = ? AND IFNULL(account_id, -1) = IFNULL(?, -1)""",
            (date_iso, name_v, amount, memo_v or '', account_id)
        ).fetchone()
        if existing:
            skipped_dup += 1
            continue

        cat_id = classify_transaction(conn, name_v, mcc)
        if cat_id is None:
            unclassified += 1
        else:
            classified += 1
        c = conn.execute(
            """INSERT INTO finance_transactions (account_id, date, name, memo, amount, mcc, category_id, raw_row, import_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            (account_id, date_iso, name_v, memo_v, amount, mcc, cat_id, json.dumps(row), import_id)
        )
        new_id = c.fetchone()[0]
        inserted += 1
        if len(sample) < 5:
            sample.append(_txn_full(conn, new_id))

    # Update the import session counts
    conn.execute(
        """UPDATE finance_imports
           SET inserted_count=?, classified_count=?, unclassified_count=?, skipped_count=?
           WHERE id = ?""",
        (inserted, classified, unclassified, skipped_dup, import_id)
    )
    # If nothing inserted, prune the empty import row
    if inserted == 0:
        conn.execute("DELETE FROM finance_imports WHERE id = ?", (import_id,))
    conn.commit(); conn.close()
    return {
        "import_id": import_id if inserted > 0 else None,
        "inserted": inserted,
        "classified": classified,
        "unclassified": unclassified,
        "skipped_duplicates": skipped_dup,
        "sample": sample,
    }


def _normalise_date(s: str) -> Optional[str]:
    s = s.strip().strip('"')
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ── Income sources ────────────────────────────────────────────────────────────
@router.get("/income/history")
def income_history(start: Optional[str] = None, end: Optional[str] = None):
    conn = database.get_connection()
    base_conds = [
        "(t.amount > 0 OR IFNULL(c.is_income, 0) = 1)",
        "IFNULL(c.is_excluded, 0) = 0",
        "IFNULL(t.is_transfer, 0) = 0",
    ]
    params: list = []
    if start: base_conds.append("t.date >= ?"); params.append(start)
    if end:   base_conds.append("t.date <= ?"); params.append(end)
    where = " AND ".join(base_conds)

    total_row = conn.execute(
        f"""SELECT COALESCE(SUM(t.amount), 0) AS total, COUNT(t.id) AS txn_count
            FROM finance_transactions t
            LEFT JOIN finance_categories c ON c.id = t.category_id
            WHERE {where}""",
        params
    ).fetchone()
    total = total_row['total'] or 0
    txn_count = total_row['txn_count'] or 0

    cat_rows = conn.execute(
        f"""SELECT c.id AS category_id,
                   COALESCE(c.name, 'Uncategorized') AS name,
                   c.color, c.icon,
                   COALESCE(SUM(t.amount), 0) AS total,
                   COUNT(t.id) AS txn_count
            FROM finance_transactions t
            LEFT JOIN finance_categories c ON c.id = t.category_id
            WHERE {where}
            GROUP BY c.id
            ORDER BY SUM(t.amount) DESC""",
        params
    ).fetchall()
    by_category = []
    for r in cat_rows:
        d = dict(r)
        d['total'] = round(d['total'], 2)
        d['pct'] = round(d['total'] / total * 100, 1) if total else 0
        by_category.append(d)

    month_rows = conn.execute(
        f"""SELECT substr(t.date, 1, 7) AS bucket,
                   COALESCE(SUM(t.amount), 0) AS total,
                   COUNT(t.id) AS txn_count
            FROM finance_transactions t
            LEFT JOIN finance_categories c ON c.id = t.category_id
            WHERE {where}
            GROUP BY bucket
            ORDER BY bucket DESC""",
        params
    ).fetchall()
    by_month = [dict(r) for r in month_rows]
    for r in by_month:
        r['total'] = round(r['total'], 2)

    months_count = len(by_month) or 1
    monthly_avg = total / months_count

    conn.close()
    return {
        "total": round(total, 2),
        "txn_count": txn_count,
        "monthly_avg": round(monthly_avg, 2),
        "months_count": months_count,
        "by_category": by_category,
        "by_month": by_month,
    }


@router.get("/income")
def list_income():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM finance_income_sources ORDER BY is_active DESC, name").fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/income", status_code=201)
def create_income(body: IncomeCreate):
    conn = database.get_connection()
    c = conn.execute(
        """INSERT INTO finance_income_sources (name, amount, frequency, start_date, end_date, is_active, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (body.name, body.amount, body.frequency, body.start_date, body.end_date, body.is_active, body.notes)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/income/{iid}")
def update_income(iid: int, body: IncomeUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_income_sources SET {clause} WHERE id = ?", list(fields.values()) + [iid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_income_sources WHERE id = ?", (iid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Income source not found")
    return dict(row)


@router.delete("/income/{iid}", status_code=204)
def delete_income(iid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_income_sources WHERE id = ?", (iid,))
    conn.commit(); conn.close()


# ── Holdings ──────────────────────────────────────────────────────────────────
@router.get("/holdings")
def list_holdings():
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT h.*, a.name AS account_name
           FROM finance_holdings h
           LEFT JOIN finance_accounts a ON a.id = h.account_id
           ORDER BY h.type, h.name"""
    ).fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    for h in items:
        h['market_value'] = _holding_value(h)
    return {"items": items, "total": len(items)}


@router.post("/holdings", status_code=201)
def create_holding(body: HoldingCreate):
    conn = database.get_connection()
    c = conn.execute(
        """INSERT INTO finance_holdings (account_id, symbol, name, type, value, shares, cost_basis, current_price, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (body.account_id, body.symbol, body.name, body.type, body.value, body.shares, body.cost_basis, body.current_price, body.notes)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/holdings/{hid}")
def update_holding(hid: int, body: HoldingUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        fields['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_holdings SET {clause} WHERE id = ?", list(fields.values()) + [hid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_holdings WHERE id = ?", (hid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Holding not found")
    return dict(row)


@router.delete("/holdings/{hid}", status_code=204)
def delete_holding(hid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_holdings WHERE id = ?", (hid,))
    conn.commit(); conn.close()


# ── Liabilities ──────────────────────────────────────────────────────────────
@router.get("/liabilities")
def list_liabilities():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM finance_liabilities ORDER BY current_balance DESC").fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    # Compute monthly interest for context
    for l in items:
        if l.get('interest_rate') and l.get('current_balance'):
            l['monthly_interest_est'] = round(l['current_balance'] * (l['interest_rate'] / 100) / 12, 2)
        else:
            l['monthly_interest_est'] = None
    return {"items": items, "total": len(items)}


@router.post("/liabilities", status_code=201)
def create_liability(body: LiabilityCreate):
    conn = database.get_connection()
    c = conn.execute(
        """INSERT INTO finance_liabilities (name, kind, principal, current_balance, interest_rate,
                                            payment_amount, payment_frequency, next_payment_date, lender, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (body.name, body.kind, body.principal, body.current_balance, body.interest_rate,
         body.payment_amount, body.payment_frequency, body.next_payment_date, body.lender, body.notes)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/liabilities/{lid}")
def update_liability(lid: int, body: LiabilityUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        fields['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_liabilities SET {clause} WHERE id = ?", list(fields.values()) + [lid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_liabilities WHERE id = ?", (lid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Liability not found")
    return dict(row)


@router.delete("/liabilities/{lid}", status_code=204)
def delete_liability(lid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_liabilities WHERE id = ?", (lid,))
    conn.commit(); conn.close()


# ── Imports (history & rollback) ─────────────────────────────────────────────
@router.get("/imports")
def list_imports():
    conn = database.get_connection()
    rows = conn.execute(
        """SELECT i.*, a.name AS account_name,
                  (SELECT COUNT(*) FROM finance_transactions t WHERE t.import_id = i.id) AS still_present
           FROM finance_imports i
           LEFT JOIN finance_accounts a ON a.id = i.account_id
           ORDER BY i.imported_at DESC"""
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.delete("/imports/{iid}", status_code=204)
def delete_import(iid: int):
    """Removes an import along with its transactions."""
    conn = database.get_connection()
    if not conn.execute("SELECT id FROM finance_imports WHERE id = ?", (iid,)).fetchone():
        conn.close(); raise HTTPException(404, "Import not found")
    conn.execute("DELETE FROM finance_transactions WHERE import_id = ?", (iid,))
    conn.execute("DELETE FROM finance_imports WHERE id = ?", (iid,))
    conn.commit(); conn.close()


# ── Financial Goals ───────────────────────────────────────────────────────────
@router.get("/goals")
def list_fingoals():
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM finance_goals ORDER BY target_date ASC, id").fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/goals", status_code=201)
def create_fingoal(body: FinGoalCreate):
    conn = database.get_connection()
    c = conn.execute(
        """INSERT INTO finance_goals (name, kind, target_amount, current_amount, target_date, notes)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *""",
        (body.name, body.kind, body.target_amount, body.current_amount, body.target_date, body.notes)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/goals/{gid}")
def update_fingoal(gid: int, body: FinGoalUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE finance_goals SET {clause} WHERE id = ?", list(fields.values()) + [gid])
    conn.commit()
    row = conn.execute("SELECT * FROM finance_goals WHERE id = ?", (gid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Goal not found")
    return dict(row)


@router.delete("/goals/{gid}", status_code=204)
def delete_fingoal(gid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_goals WHERE id = ?", (gid,))
    conn.commit(); conn.close()


# ── Planning ─────────────────────────────────────────────────────────────────
def _income_trend(conn, today):
    """6-month moving average anchored to the last month that has transactions.
    Returns (by_month newest-first, slope, annual_rate_pct, projected_current)."""
    twelve_ago = (today.replace(day=1) - timedelta(days=365)).replace(day=1)
    rows = conn.execute(
        """SELECT substr(t.date, 1, 7) AS bucket,
                  COALESCE(SUM(t.amount), 0) AS total
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           WHERE t.date >= ?
             AND (t.amount > 0 OR IFNULL(c.is_income, 0) = 1)
             AND IFNULL(c.is_excluded, 0) = 0
             AND IFNULL(t.is_transfer, 0) = 0
           GROUP BY bucket ORDER BY bucket ASC""",
        (twelve_ago.isoformat(),)
    ).fetchall()

    by_month = [{'bucket': r['bucket'], 'total': round(float(r['total']), 2)} for r in rows]
    if not by_month:
        return [], 0.0, 0.0, 0.0

    # Anchor to the most recent bucket with data, not today
    last_year, last_month = map(int, by_month[-1]['bucket'].split('-'))
    pivot_month = last_month - 6
    pivot_year  = last_year
    if pivot_month <= 0:
        pivot_month += 12
        pivot_year  -= 1
    pivot_str = f"{pivot_year:04d}-{pivot_month:02d}"

    recent = [m for m in by_month if m['bucket'] > pivot_str]
    prior  = [m for m in by_month if m['bucket'] <= pivot_str]

    recent_avg = sum(m['total'] for m in recent) / len(recent) if recent else 0.0
    prior_avg  = sum(m['total'] for m in prior)  / len(prior)  if prior  else 0.0

    # Annualise growth: compare the two 6-month halves
    if prior_avg > 0 and recent_avg > 0:
        half_year_rate = recent_avg / prior_avg - 1
        annual_rate = round(((1 + half_year_rate) ** 2 - 1) * 100, 2)
    else:
        annual_rate = 0.0

    return by_month[::-1], 0.0, annual_rate, round(recent_avg, 2)


@router.get("/planning")
def get_planning():
    conn = database.get_connection()
    today = _date.today()

    # Net worth + actual allocation breakdown
    holding_rows = conn.execute("SELECT * FROM finance_holdings").fetchall()
    wealth = {'cash': 0.0, 'investments': 0.0, 'private': 0.0}
    INVEST_TYPES = {'stock', 'etf', 'bond', 'crypto'}
    STOCK_TYPES  = {'stock', 'etf', 'crypto'}
    actual_stock_val = 0.0
    actual_bond_val  = 0.0
    for h in holding_rows:
        hd = dict(h)
        v = _holding_value(hd)
        if hd['type'] == 'cash':           wealth['cash']        += v
        elif hd['type'] in INVEST_TYPES:   wealth['investments'] += v
        else:                              wealth['private']     += v
        if   hd['type'] in STOCK_TYPES:    actual_stock_val      += v
        elif hd['type'] == 'bond':         actual_bond_val       += v
    assets = sum(wealth.values())
    liabilities_total = conn.execute(
        "SELECT COALESCE(SUM(current_balance), 0) FROM finance_liabilities"
    ).fetchone()[0]
    net_worth = assets - liabilities_total
    liquid = wealth['cash'] + wealth['investments']
    actual_stocks_pct = round(actual_stock_val / liquid * 100, 1) if liquid > 0 else None
    actual_bonds_pct  = round(actual_bond_val  / liquid * 100, 1) if liquid > 0 else None
    actual_cash_pct   = round(wealth['cash']   / liquid * 100, 1) if liquid > 0 else None
    # investment_frac computed after settings are read (needs min_cash_balance)

    # Monthly income: exponential trend from last 12 months, fall back to income sources
    by_month, trend_slope, trend_annual_rate, trend_projected = _income_trend(conn, today)
    if trend_projected > 0:
        monthly_income = trend_projected
        income_source  = 'trend'
    else:
        incomes = conn.execute(
            "SELECT * FROM finance_income_sources WHERE is_active = 1"
        ).fetchall()
        monthly_income = 0.0
        for inc in incomes:
            a, f = inc['amount'] or 0, inc['frequency'] or 'monthly'
            if   f == 'monthly':   monthly_income += a
            elif f == 'biweekly':  monthly_income += a * 26 / 12
            elif f == 'weekly':    monthly_income += a * 52 / 12
            elif f == 'annual':    monthly_income += a / 12
        income_source = 'sources'
        trend_slope = 0.0; trend_annual_rate = 0.0; by_month = []

    # 90-day avg monthly spend (÷ 3 months)
    start_90 = (today - timedelta(days=89)).isoformat()
    spend_90 = conn.execute(
        """SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           WHERE t.date >= ? AND t.amount < 0
             AND IFNULL(c.is_income,   0) = 0
             AND IFNULL(c.is_savings,  0) = 0
             AND IFNULL(c.is_excluded, 0) = 0
             AND IFNULL(t.is_transfer, 0) = 0""",
        (start_90,)
    ).fetchone()[0] or 0
    monthly_spend = round(spend_90 / 3, 2)

    # Monthly debt payments
    debt_row = conn.execute(
        "SELECT COALESCE(SUM(payment_amount), 0) FROM finance_liabilities WHERE payment_amount IS NOT NULL"
    ).fetchone()
    monthly_debt_payments = round(float(debt_row[0] or 0), 2)

    # Settings helper
    def _setting(key, default):
        r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        try:
            return float(r['value']) if r and r['value'] else default
        except Exception:
            return default

    def _setting_str(key, default=None):
        r = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return r['value'] if r and r['value'] else default

    return_rate    = _setting('plan_return_rate',    7.0)
    inflation_rate = _setting('plan_inflation_rate', 2.5)
    birth_date     = _setting_str('birthday')
    try:
        target_retire_age = int(_setting('target_retirement_age', 62))
    except Exception:
        target_retire_age = 62
    plan_mode      = _setting_str('fin_plan_mode', 'balanced')
    if plan_mode not in ('conservative', 'balanced', 'optimistic'):
        plan_mode = 'balanced'

    exps = conn.execute(
        "SELECT * FROM finance_plan_expenditures ORDER BY expected_date ASC, id"
    ).fetchall()

    annual_raise_rate = _setting('annual_raise_rate', 3.0)
    salary_cap        = _setting('salary_cap', 0.0)
    savings_of_raise  = _setting('savings_of_raise', 50.0)
    years_forward     = int(_setting('years_forward', 30))
    min_cash_balance  = _setting('min_cash_balance', 0.0)

    # Compute investment_frac after reading min_cash_balance
    effective_cash   = max(0.0, wealth['cash'] - min_cash_balance)
    effective_liquid = wealth['investments'] + effective_cash
    investment_frac  = wealth['investments'] / effective_liquid if effective_liquid > 0 else 0.0

    conn.close()
    return {
        "net_worth":                 round(net_worth, 2),
        "cash_balance":              round(wealth['cash'], 2),
        "investments_balance":       round(wealth['investments'], 2),
        "monthly_income":            round(monthly_income, 2),
        "income_source":             income_source,
        "income_by_month":           by_month,
        "income_trend_slope":        trend_slope,
        "income_trend_annual_rate":  trend_annual_rate,
        "monthly_spend":             round(monthly_spend, 2),
        "monthly_debt_payments":     monthly_debt_payments,
        "return_rate":               return_rate,
        "inflation_rate":            inflation_rate,
        "investment_frac":           round(investment_frac * 100, 1),
        "min_cash_balance":          round(min_cash_balance, 2),
        "birth_date":                birth_date,
        "target_retire_age":         target_retire_age,
        "plan_mode":                 plan_mode,
        "annual_raise_rate":         annual_raise_rate,
        "salary_cap":                salary_cap,
        "savings_of_raise":          savings_of_raise,
        "years_forward":             years_forward,
        "actual_stocks_pct":         actual_stocks_pct,
        "actual_bonds_pct":          actual_bonds_pct,
        "actual_cash_pct":           actual_cash_pct,
        "expenditures":              [dict(e) for e in exps],
    }


@router.patch("/planning/assumptions")
def patch_planning_assumptions(body: PlanningAssumptions):
    conn = database.get_connection()
    updates = {
        'plan_return_rate':      str(body.return_rate)        if body.return_rate        is not None else None,
        'plan_inflation_rate':   str(body.inflation_rate)     if body.inflation_rate     is not None else None,
        'target_retirement_age': str(body.target_retire_age)  if body.target_retire_age  is not None else None,
        'fin_plan_mode':         body.plan_mode               if body.plan_mode          is not None else None,
        'annual_raise_rate':     str(body.annual_raise_rate)  if body.annual_raise_rate  is not None else None,
        'salary_cap':            str(body.salary_cap)         if body.salary_cap         is not None else None,
        'savings_of_raise':      str(body.savings_of_raise)   if body.savings_of_raise   is not None else None,
        'investment_frac':       str(body.investment_frac)    if body.investment_frac    is not None else None,
        'years_forward':         str(body.years_forward)      if body.years_forward      is not None else None,
        'min_cash_balance':      str(body.min_cash_balance)   if body.min_cash_balance   is not None else None,
    }
    for key, val in updates.items():
        if val is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, val)
            )
    conn.commit(); conn.close()
    return {"ok": True}


@router.get("/planning/expenditures")
def list_plan_expenditures():
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM finance_plan_expenditures ORDER BY expected_date ASC, id"
    ).fetchall()
    conn.close()
    return {"items": [dict(r) for r in rows], "total": len(rows)}


@router.post("/planning/expenditures", status_code=201)
def create_plan_expenditure(body: ExpenditureCreate):
    conn = database.get_connection()
    c = conn.execute(
        """INSERT INTO finance_plan_expenditures
               (name, amount, expected_date, notes, is_recurring, recurrence_months, recurrence_end_date)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *""",
        (body.name, body.amount, body.expected_date, body.notes,
         body.is_recurring, body.recurrence_months, body.recurrence_end_date)
    )
    row = c.fetchone()
    conn.commit(); conn.close()
    return dict(row)


@router.put("/planning/expenditures/{eid}")
def update_plan_expenditure(eid: int, body: ExpenditureUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE finance_plan_expenditures SET {clause} WHERE id = ?",
            list(fields.values()) + [eid]
        )
    conn.commit()
    row = conn.execute("SELECT * FROM finance_plan_expenditures WHERE id = ?", (eid,)).fetchone()
    conn.close()
    if not row: raise HTTPException(404, "Expenditure not found")
    return dict(row)


@router.delete("/planning/expenditures/{eid}", status_code=204)
def delete_plan_expenditure(eid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM finance_plan_expenditures WHERE id = ?", (eid,))
    conn.commit(); conn.close()


# ── Dashboard summary ─────────────────────────────────────────────────────────
@router.get("/dashboard")
def finance_dashboard(start: Optional[str] = None, end: Optional[str] = None):
    conn = database.get_connection()
    today = _date.today()
    today_iso = today.isoformat()
    # Default range: last 3 months
    if not end:
        end = today_iso
    if not start:
        start = (today - timedelta(days=89)).isoformat()
    def _parse_date(s, fallback):
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m-%d-%Y', '%Y/%m/%d'):
            try:
                return datetime.strptime(s, fmt).date()
            except (ValueError, TypeError):
                pass
        return fallback

    range_start = _parse_date(start, today - timedelta(days=89)).isoformat()
    range_end   = _parse_date(end,   today).isoformat()
    # Previous-period comparison: same length window immediately before
    rs = _parse_date(range_start, today - timedelta(days=89))
    re_ = _parse_date(range_end, today)
    span_days = (re_ - rs).days + 1
    prev_end = (rs - timedelta(days=1))
    prev_start = (prev_end - timedelta(days=span_days - 1))
    prev_start_iso = prev_start.isoformat()
    prev_end_iso = prev_end.isoformat()

    # Spending this month: sum of amount where amount<0 and category is_income=0 is_savings=0
    def _sum_spend(s, e):
        r = conn.execute(
            """SELECT COALESCE(SUM(t.amount), 0) FROM finance_transactions t
               LEFT JOIN finance_categories c ON c.id = t.category_id
               WHERE t.date BETWEEN ? AND ? AND t.amount < 0
                 AND IFNULL(c.is_income, 0) = 0
                 AND IFNULL(c.is_savings, 0) = 0
                 AND IFNULL(c.is_excluded, 0) = 0
                 AND IFNULL(t.is_transfer, 0) = 0""",
            (s, e)
        ).fetchone()
        return abs(r[0]) if r and r[0] else 0

    def _sum_income(s, e):
        r = conn.execute(
            """SELECT COALESCE(SUM(t.amount), 0) FROM finance_transactions t
               LEFT JOIN finance_categories c ON c.id = t.category_id
               WHERE t.date BETWEEN ? AND ? AND
                 (t.amount > 0 OR IFNULL(c.is_income, 0) = 1)
                 AND IFNULL(c.is_excluded, 0) = 0
                 AND IFNULL(t.is_transfer, 0) = 0""",
            (s, e)
        ).fetchone()
        return r[0] if r and r[0] else 0

    def _sum_savings(s, e):
        r = conn.execute(
            """SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM finance_transactions t
               JOIN finance_categories c ON c.id = t.category_id
               WHERE t.date BETWEEN ? AND ? AND IFNULL(c.is_savings, 0) = 1
                 AND IFNULL(c.is_excluded, 0) = 0""",
            (s, e)
        ).fetchone()
        return r[0] if r and r[0] else 0

    spend_range = _sum_spend(range_start, range_end)
    spend_prev  = _sum_spend(prev_start_iso, prev_end_iso)
    income_actual = _sum_income(range_start, range_end)
    savings_range = _sum_savings(range_start, range_end)

    # Include projected income from active income sources for the range, so users
    # who configure a Salary source (and don't import their checking account) still
    # see their income reflected in the dashboard.
    def _income_from_sources(s_iso, e_iso):
        rs = datetime.strptime(s_iso, '%Y-%m-%d').date()
        re_local = datetime.strptime(e_iso, '%Y-%m-%d').date()
        if rs > re_local:
            return 0.0
        rows = conn.execute(
            "SELECT amount, frequency, start_date, end_date FROM finance_income_sources WHERE is_active = 1"
        ).fetchall()
        total = 0.0
        for r in rows:
            amt = r['amount'] or 0
            freq = r['frequency'] or 'monthly'
            try:
                src_s = datetime.strptime(r['start_date'], '%Y-%m-%d').date() if r['start_date'] else rs
                src_e = datetime.strptime(r['end_date'], '%Y-%m-%d').date() if r['end_date'] else re_local
            except Exception:
                src_s, src_e = rs, re_local
            eff_s = max(rs, src_s)
            eff_e = min(re_local, src_e)
            if eff_s > eff_e:
                continue
            days = (eff_e - eff_s).days + 1
            if   freq == 'monthly':  total += amt * (days / 30.4375)
            elif freq == 'biweekly': total += amt * (days / 14)
            elif freq == 'weekly':   total += amt * (days / 7)
            elif freq == 'annual':   total += amt * (days / 365.25)
            # one-time: skip (use a transaction instead)
        return total

    income_projected = _income_from_sources(range_start, range_end)
    income_projected_prev = _income_from_sources(prev_start_iso, prev_end_iso)
    income_range = income_actual + income_projected

    # By-category breakdown for current range
    cat_rows = conn.execute(
        """SELECT c.id, c.name, c.color, c.icon, c.is_income, c.is_savings, c.is_excluded,
                  COALESCE(SUM(t.amount), 0) AS total,
                  COUNT(t.id) AS txn_count
           FROM finance_categories c
           LEFT JOIN finance_transactions t
             ON t.category_id = c.id AND t.date BETWEEN ? AND ?
                AND IFNULL(t.is_transfer, 0) = 0
           GROUP BY c.id
           HAVING total != 0
           ORDER BY ABS(total) DESC""",
        (range_start, range_end)
    ).fetchall()
    by_category = [dict(r) for r in cat_rows]

    # Top merchants for current range (spend only)
    merch_rows = conn.execute(
        """SELECT t.name, SUM(ABS(t.amount)) AS total, COUNT(*) AS cnt
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           WHERE t.date BETWEEN ? AND ? AND t.amount < 0
             AND IFNULL(c.is_income, 0) = 0
             AND IFNULL(c.is_savings, 0) = 0
             AND IFNULL(c.is_excluded, 0) = 0
             AND IFNULL(t.is_transfer, 0) = 0
           GROUP BY t.name
           ORDER BY total DESC
           LIMIT 10""",
        (range_start, range_end)
    ).fetchall()
    top_merchants = [dict(r) for r in merch_rows]

    # Wealth split: cash / investments / private; minus liabilities
    holding_rows = conn.execute("SELECT * FROM finance_holdings").fetchall()
    wealth = {'cash': 0.0, 'investments': 0.0, 'private': 0.0}
    INVEST_TYPES = {'stock', 'etf', 'bond', 'crypto'}
    PRIVATE_TYPES = {'real_estate', 'private'}
    for h in holding_rows:
        hd = dict(h)
        v = _holding_value(hd)
        if hd['type'] == 'cash':              wealth['cash']        += v
        elif hd['type'] in INVEST_TYPES:      wealth['investments'] += v
        elif hd['type'] in PRIVATE_TYPES:     wealth['private']     += v
        else:                                  wealth['private']     += v  # 'other'
    assets = sum(wealth.values())
    liabilities_total = conn.execute(
        "SELECT COALESCE(SUM(current_balance), 0) FROM finance_liabilities"
    ).fetchone()[0]
    net_worth = assets - liabilities_total

    # Active income sources monthly equivalent
    incomes = conn.execute("SELECT * FROM finance_income_sources WHERE is_active = 1").fetchall()
    monthly_income_planned = 0
    for inc in incomes:
        a = inc['amount'] or 0
        f = inc['frequency'] or 'monthly'
        if   f == 'monthly':   monthly_income_planned += a
        elif f == 'biweekly':  monthly_income_planned += a * 26 / 12
        elif f == 'weekly':    monthly_income_planned += a * 52 / 12
        elif f == 'annual':    monthly_income_planned += a / 12
        # one-time: skip

    # Unclassified count (global, not range-bound)
    uncl = conn.execute("SELECT COUNT(*) FROM finance_transactions WHERE category_id IS NULL").fetchone()[0]

    # Spending trend over the range. For ranges > 60 days, group by month; otherwise by day.
    if span_days > 60:
        trend_rows = conn.execute(
            """SELECT substr(t.date, 1, 7) AS bucket, SUM(ABS(t.amount)) AS total
               FROM finance_transactions t
               LEFT JOIN finance_categories c ON c.id = t.category_id
               WHERE t.date BETWEEN ? AND ? AND t.amount < 0
                 AND IFNULL(c.is_income, 0) = 0
                 AND IFNULL(c.is_savings, 0) = 0
                 AND IFNULL(c.is_excluded, 0) = 0
                 AND IFNULL(t.is_transfer, 0) = 0
               GROUP BY bucket ORDER BY bucket""",
            (range_start, range_end)
        ).fetchall()
        trend = [{"bucket": r['bucket'], "total": r['total']} for r in trend_rows]
        trend_grain = 'month'
    else:
        trend_rows = conn.execute(
            """SELECT t.date, SUM(ABS(t.amount)) AS total
               FROM finance_transactions t
               LEFT JOIN finance_categories c ON c.id = t.category_id
               WHERE t.date BETWEEN ? AND ? AND t.amount < 0
                 AND IFNULL(c.is_excluded, 0) = 0
                 AND IFNULL(t.is_transfer, 0) = 0
               GROUP BY t.date ORDER BY t.date""",
            (range_start, range_end)
        ).fetchall()
        trend = [{"date": r['date'], "total": r['total']} for r in trend_rows]
        trend_grain = 'day'

    # User's birthday from settings → derived age
    birth = conn.execute("SELECT value FROM settings WHERE key = 'birthday'").fetchone()
    retire_age = conn.execute("SELECT value FROM settings WHERE key = 'target_retirement_age'").fetchone()
    age, years_to_retire = None, None
    if birth and birth['value']:
        try:
            bd = datetime.strptime(birth['value'], '%Y-%m-%d').date()
            age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
            if retire_age and retire_age['value']:
                ra = int(retire_age['value'])
                years_to_retire = max(0, ra - age)
        except Exception:
            pass

    fin_goals = conn.execute("SELECT * FROM finance_goals ORDER BY target_date ASC").fetchall()

    # Monthly income vs spending — last 12 months always (independent of range filter)
    twelve_start = (today.replace(day=1) - timedelta(days=365)).replace(day=1)
    monthly_rows = conn.execute(
        """SELECT substr(t.date, 1, 7) AS bucket,
                  SUM(CASE WHEN t.amount < 0 AND IFNULL(c.is_income,0)=0 AND IFNULL(c.is_savings,0)=0
                                AND IFNULL(c.is_excluded,0)=0 AND IFNULL(t.is_transfer,0)=0
                            THEN ABS(t.amount) ELSE 0 END) AS spend,
                  SUM(CASE WHEN (t.amount > 0 OR IFNULL(c.is_income,0)=1)
                                AND IFNULL(c.is_excluded,0)=0 AND IFNULL(t.is_transfer,0)=0
                            THEN t.amount ELSE 0 END) AS income
           FROM finance_transactions t
           LEFT JOIN finance_categories c ON c.id = t.category_id
           WHERE t.date >= ?
           GROUP BY bucket ORDER BY bucket""",
        (twelve_start.isoformat(),)
    ).fetchall()
    monthly_map = {r['bucket']: {"spend": r['spend'] or 0, "income": r['income'] or 0} for r in monthly_rows}

    # Inject projected income from sources for each of the last 12 months
    for i in range(12):
        d = today.replace(day=1) - timedelta(days=i*30)
        # Walk back month-by-month using calendar-correct boundaries
        year = today.year if today.month - i > 0 else today.year - ((i - today.month) // 12 + 1)
        month = ((today.month - i - 1) % 12) + 1
        bucket = f"{year:04d}-{month:02d}"
        # Compute month start/end strings
        m_start = f"{bucket}-01"
        if month == 12:
            next_month = f"{year+1:04d}-01-01"
        else:
            next_month = f"{year:04d}-{month+1:02d}-01"
        m_end = (datetime.strptime(next_month, '%Y-%m-%d').date() - timedelta(days=1)).isoformat()
        proj = _income_from_sources(m_start, m_end)
        if bucket not in monthly_map:
            monthly_map[bucket] = {"spend": 0, "income": 0}
        monthly_map[bucket]["income"] += proj

    monthly = sorted(
        [{"bucket": b, "spend": v["spend"], "income": v["income"]} for b, v in monthly_map.items()],
        key=lambda r: r["bucket"]
    )

    # Per-category spending trend — top 3 categories, same grain as overall trend
    grain_sql = "substr(t.date, 1, 7)" if span_days > 60 else "t.date"
    cat_trend_rows = conn.execute(
        f"""SELECT c.id, c.name, c.color,
                   {grain_sql} AS bucket,
                   SUM(ABS(t.amount)) AS total
            FROM finance_transactions t
            JOIN finance_categories c ON c.id = t.category_id
            WHERE t.date BETWEEN ? AND ? AND t.amount < 0
              AND IFNULL(c.is_income,   0) = 0
              AND IFNULL(c.is_savings,  0) = 0
              AND IFNULL(c.is_excluded, 0) = 0
              AND IFNULL(t.is_transfer, 0) = 0
            GROUP BY c.id, bucket
            ORDER BY c.id, bucket""",
        (range_start, range_end)
    ).fetchall()
    cat_spend_map: dict = {}
    for r in cat_trend_rows:
        cid = r['id']
        if cid not in cat_spend_map:
            cat_spend_map[cid] = {
                'id': cid, 'name': r['name'], 'color': r['color'],
                'total': 0.0, 'buckets': []
            }
        cat_spend_map[cid]['total'] += r['total']
        cat_spend_map[cid]['buckets'].append({'bucket': r['bucket'], 'total': round(r['total'], 2)})
    category_trends = sorted(cat_spend_map.values(), key=lambda x: x['total'], reverse=True)[:3]
    for ct in category_trends:
        ct['total'] = round(ct['total'], 2)

    conn.close()
    return {
        "range_start": range_start,
        "range_end":   range_end,
        "span_days":   span_days,
        "prev_start":  prev_start_iso,
        "prev_end":    prev_end_iso,
        "spend":            round(spend_range, 2),
        "spend_prev":       round(spend_prev, 2),
        "income":           round(income_range, 2),
        "income_actual":    round(income_actual, 2),
        "income_projected": round(income_projected, 2),
        "savings":          round(savings_range, 2),
        "net":              round(income_range - spend_range, 2),
        "monthly_income_planned": round(monthly_income_planned, 2),
        "by_category":   by_category,
        "top_merchants": top_merchants,
        "net_worth":     round(net_worth, 2),
        "wealth_breakdown": {
            "cash":         round(wealth['cash'], 2),
            "investments":  round(wealth['investments'], 2),
            "private":      round(wealth['private'], 2),
            "assets":       round(assets, 2),
            "liabilities":  round(liabilities_total, 2),
        },
        "monthly_flows":  monthly,
        "unclassified_count": uncl,
        "trend":         trend,
        "trend_grain":   trend_grain,
        "category_trends": category_trends,
        "age":           age,
        "years_to_retire": years_to_retire,
        "finance_goals": [dict(g) for g in fin_goals],
    }
