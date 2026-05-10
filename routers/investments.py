from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import Optional
from datetime import datetime
import csv
import io
import json
import re
import database
from models.investments import InvNoteCreate, InvNoteUpdate, InvActionCreate, InvActionUpdate

router = APIRouter()


# ── CSV parsing helpers ────────────────────────────────────────────────────────

def _parse_num(v):
    """Strip +$,% and return float, or None for missing/dash values."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ('--', '', 'N/A'):
        return None
    try:
        return float(re.sub(r'[+$,%\s]', '', s))
    except ValueError:
        return None


def _parse_date_mdy(s):
    """Convert MM/DD/YYYY → YYYY-MM-DD, or return as-is if already ISO."""
    if not s:
        return None
    s = s.strip()
    try:
        return datetime.strptime(s, '%m/%d/%Y').strftime('%Y-%m-%d')
    except ValueError:
        return s


def _classify_action(raw):
    a = (raw or '').upper()
    if 'YOU BOUGHT' in a:
        return 'buy'
    if 'YOU SOLD' in a:
        return 'sell'
    if 'DIVIDEND' in a or 'REINVESTMENT' in a:
        return 'dividend'
    if 'EXCHANGE' in a:
        return 'exchange'
    if 'DEPOSIT' in a or 'TRANSFER' in a:
        return 'transfer'
    return 'other'


def _decode_csv(raw_bytes):
    for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode('latin-1', errors='replace')


def _parse_positions_csv(raw_bytes):
    text = _decode_csv(raw_bytes)
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        acct = row.get('Account Number', '').strip()
        # Stop at footer rows (blank account or starts with quote/disclaimer)
        if not acct or acct.startswith('"') or acct.startswith('The '):
            break
        symbol = row.get('Symbol', '').strip()
        # Skip money-market / sweep rows and rows with missing prices
        if not symbol or '**' in symbol:
            continue
        cv_raw = row.get('Current Value', '').strip()
        if cv_raw in ('--', ''):
            continue
        rows.append({
            'account_number':  acct,
            'account_name':    row.get('Account Name', '').strip(),
            'symbol':          symbol,
            'description':     row.get('Description', '').strip(),
            'quantity':        _parse_num(row.get('Quantity')),
            'last_price':      _parse_num(row.get('Last Price')),
            'current_value':   _parse_num(cv_raw),
            'today_gain_dollar': _parse_num(row.get("Today's Gain/Loss Dollar")),
            'today_gain_pct':    _parse_num(row.get("Today's Gain/Loss Percent")),
            'total_gain_dollar': _parse_num(row.get('Total Gain/Loss Dollar')),
            'total_gain_pct':    _parse_num(row.get('Total Gain/Loss Percent')),
            'pct_of_account':    _parse_num(row.get('Percent Of Account')),
            'cost_basis_total':  _parse_num(row.get('Cost Basis Total')),
            'avg_cost_basis':    _parse_num(row.get('Average Cost Basis')),
            'security_type':     row.get('Type', '').strip(),
        })
    return rows


def _parse_orders_csv(raw_bytes):
    text = _decode_csv(raw_bytes)
    lines = text.splitlines()

    # Find header row containing "Run Date"
    header_idx = None
    for i, line in enumerate(lines):
        if 'Run Date' in line:
            header_idx = i
            break
    if header_idx is None:
        raise ValueError('Could not find header row in order history CSV')

    data_text = '\n'.join(lines[header_idx:])
    reader = csv.DictReader(io.StringIO(data_text))
    rows = []
    for row in reader:
        run_date_raw = (row.get('Run Date') or '').strip().strip('"')
        if not run_date_raw or run_date_raw.startswith('"'):
            break

        action_raw = (row.get('Action') or '').strip()
        action_type = _classify_action(action_raw)
        # Skip fund exchanges and other non-trading rows
        if action_type in ('exchange', 'other', 'transfer'):
            continue

        symbol = (row.get('Symbol') or '').strip()
        if not symbol:
            continue

        rows.append({
            'run_date':       _parse_date_mdy(run_date_raw),
            'account_name':   (row.get('Account') or '').strip().strip('"'),
            'account_number': (row.get('Account Number') or '').strip(),
            'action_type':    action_type,
            'action_raw':     action_raw,
            'symbol':         symbol,
            'description':    (row.get('Description') or '').strip(),
            'security_type':  (row.get('Type') or '').strip(),
            'price':          _parse_num(row.get('Price ($)')),
            'quantity':       _parse_num(row.get('Quantity')),
            'amount':         _parse_num(row.get('Amount ($)')),
            'settlement_date': _parse_date_mdy(row.get('Settlement Date') or ''),
        })
    return rows


def _parse_sp500_csv(raw_bytes):
    text = _decode_csv(raw_bytes)
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        date = row.get('observation_date', '').strip()
        val  = row.get('SP500', '').strip()
        if not date or not val:
            continue
        try:
            rows.append({'observation_date': date, 'value': float(val)})
        except ValueError:
            continue
    return rows


# ── Import endpoints ───────────────────────────────────────────────────────────

@router.post('/import/positions', status_code=201)
async def import_positions(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        rows = _parse_positions_csv(raw)
    except Exception as e:
        raise HTTPException(400, f'Failed to parse CSV: {e}')

    if not rows:
        raise HTTPException(400, 'No valid position rows found in file')

    conn = database.get_connection()
    imp = conn.execute(
        "INSERT INTO inv_imports (import_type, filename, row_count) VALUES ('positions', ?, ?) RETURNING id",
        (file.filename, len(rows))
    ).fetchone()
    import_id = imp['id']

    for r in rows:
        conn.execute(
            """INSERT INTO inv_positions
               (import_id, account_number, account_name, symbol, description,
                quantity, last_price, current_value, today_gain_dollar, today_gain_pct,
                total_gain_dollar, total_gain_pct, pct_of_account,
                cost_basis_total, avg_cost_basis, security_type)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (import_id, r['account_number'], r['account_name'], r['symbol'], r['description'],
             r['quantity'], r['last_price'], r['current_value'],
             r['today_gain_dollar'], r['today_gain_pct'],
             r['total_gain_dollar'], r['total_gain_pct'], r['pct_of_account'],
             r['cost_basis_total'], r['avg_cost_basis'], r['security_type'])
        )
    conn.commit()
    conn.close()
    return {'import_id': import_id, 'inserted': len(rows)}


@router.post('/import/orders', status_code=201)
async def import_orders(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        rows = _parse_orders_csv(raw)
    except Exception as e:
        raise HTTPException(400, f'Failed to parse CSV: {e}')

    if not rows:
        raise HTTPException(400, 'No valid order rows found in file')

    conn = database.get_connection()
    imp = conn.execute(
        "INSERT INTO inv_imports (import_type, filename, row_count) VALUES ('orders', ?, ?) RETURNING id",
        (file.filename, len(rows))
    ).fetchone()
    import_id = imp['id']

    inserted = 0
    skipped  = 0
    for r in rows:
        try:
            conn.execute(
                """INSERT INTO inv_orders
                   (import_id, run_date, account_name, account_number, action_type, action_raw,
                    symbol, description, security_type, price, quantity, amount, settlement_date)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (import_id, r['run_date'], r['account_name'], r['account_number'],
                 r['action_type'], r['action_raw'], r['symbol'], r['description'],
                 r['security_type'], r['price'], r['quantity'], r['amount'], r['settlement_date'])
            )
            inserted += 1
        except Exception:
            skipped += 1

    conn.execute("UPDATE inv_imports SET row_count = ? WHERE id = ?", (inserted, import_id))
    conn.commit()
    conn.close()
    return {'import_id': import_id, 'inserted': inserted, 'skipped_dupes': skipped}


@router.post('/import/sp500', status_code=201)
async def import_sp500(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        rows = _parse_sp500_csv(raw)
    except Exception as e:
        raise HTTPException(400, f'Failed to parse CSV: {e}')

    if not rows:
        raise HTTPException(400, 'No valid SP500 rows found in file')

    conn = database.get_connection()
    imp = conn.execute(
        "INSERT INTO inv_imports (import_type, filename, row_count) VALUES ('sp500', ?, ?) RETURNING id",
        (file.filename, len(rows))
    ).fetchone()
    import_id = imp['id']

    for r in rows:
        conn.execute(
            "INSERT OR REPLACE INTO inv_sp500 (observation_date, value) VALUES (?, ?)",
            (r['observation_date'], r['value'])
        )
    conn.commit()
    conn.close()
    return {'import_id': import_id, 'inserted': len(rows)}


# ── Import management ──────────────────────────────────────────────────────────

@router.get('/imports')
def list_imports():
    conn = database.get_connection()
    rows = conn.execute(
        "SELECT * FROM inv_imports ORDER BY imported_at DESC"
    ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


@router.delete('/imports/{iid}', status_code=204)
def delete_import(iid: int):
    conn = database.get_connection()
    # Positions cascade via FK; orders set import_id to NULL (keep historical orders)
    conn.execute("DELETE FROM inv_imports WHERE id = ?", (iid,))
    conn.commit()
    conn.close()


# ── Data retrieval ─────────────────────────────────────────────────────────────

@router.get('/positions')
def get_positions(import_id: Optional[int] = None):
    conn = database.get_connection()
    if import_id:
        imp = conn.execute(
            "SELECT * FROM inv_imports WHERE id = ? AND import_type = 'positions'", (import_id,)
        ).fetchone()
    else:
        imp = conn.execute(
            "SELECT * FROM inv_imports WHERE import_type = 'positions' ORDER BY imported_at DESC LIMIT 1"
        ).fetchone()

    if not imp:
        conn.close()
        return {'items': [], 'import_meta': None}

    rows = conn.execute(
        "SELECT * FROM inv_positions WHERE import_id = ? ORDER BY current_value DESC NULLS LAST",
        (imp['id'],)
    ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows], 'import_meta': dict(imp)}


@router.get('/orders')
def get_orders(
    symbol: Optional[str] = None,
    account: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    action_type: Optional[str] = None,
):
    conn = database.get_connection()
    clauses, params = [], []
    if symbol:
        clauses.append("symbol = ?"); params.append(symbol.upper())
    if account:
        clauses.append("account_number = ?"); params.append(account)
    if date_from:
        clauses.append("run_date >= ?"); params.append(date_from)
    if date_to:
        clauses.append("run_date <= ?"); params.append(date_to)
    if action_type:
        clauses.append("action_type = ?"); params.append(action_type)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = conn.execute(
        f"SELECT * FROM inv_orders {where} ORDER BY run_date DESC, id DESC",
        params
    ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


@router.get('/sp500')
def get_sp500(date_from: Optional[str] = None):
    conn = database.get_connection()
    if date_from:
        rows = conn.execute(
            "SELECT * FROM inv_sp500 WHERE observation_date >= ? ORDER BY observation_date ASC",
            (date_from,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM inv_sp500 ORDER BY observation_date ASC"
        ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


# ── Accounts / portfolio history ──────────────────────────────────────────────

@router.get('/accounts')
def get_accounts():
    conn = database.get_connection()
    rows = conn.execute("""
        SELECT DISTINCT account_number, account_name
        FROM inv_positions
        WHERE account_number IS NOT NULL AND account_number != ''
        ORDER BY account_name
    """).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


@router.get('/portfolio-history')
def get_portfolio_history():
    """One row per (import snapshot × account) so the frontend can group or filter."""
    conn = database.get_connection()
    rows = conn.execute("""
        SELECT i.id          AS import_id,
               i.imported_at,
               p.account_number,
               p.account_name,
               SUM(p.current_value)                                          AS total_value,
               SUM(COALESCE(p.cost_basis_total, 0))                          AS total_cost
        FROM inv_imports  i
        JOIN inv_positions p ON p.import_id = i.id
        WHERE i.import_type = 'positions'
        GROUP BY i.id, i.imported_at, p.account_number, p.account_name
        ORDER BY i.imported_at ASC, p.account_name ASC
    """).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


# ── Notes ──────────────────────────────────────────────────────────────────────

@router.get('/notes')
def list_notes(symbol: Optional[str] = None):
    conn = database.get_connection()
    if symbol:
        rows = conn.execute(
            "SELECT * FROM inv_notes WHERE symbol = ? ORDER BY created_at DESC",
            (symbol.upper(),)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM inv_notes ORDER BY symbol ASC, created_at DESC"
        ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


@router.post('/notes', status_code=201)
def create_note(body: InvNoteCreate):
    conn = database.get_connection()
    row = conn.execute(
        "INSERT INTO inv_notes (symbol, note_type, content) VALUES (?,?,?) RETURNING *",
        (body.symbol.upper(), body.note_type, body.content)
    ).fetchone()
    conn.commit()
    conn.close()
    return dict(row)


@router.patch('/notes/{nid}')
def update_note(nid: int, body: InvNoteUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if fields:
        fields['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE inv_notes SET {clause} WHERE id = ?", list(fields.values()) + [nid])
        conn.commit()
    row = conn.execute("SELECT * FROM inv_notes WHERE id = ?", (nid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, 'Note not found')
    return dict(row)


@router.delete('/notes/{nid}', status_code=204)
def delete_note(nid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM inv_notes WHERE id = ?", (nid,))
    conn.commit()
    conn.close()


# ── Actions ────────────────────────────────────────────────────────────────────

@router.get('/actions')
def list_actions(status: Optional[str] = None, symbol: Optional[str] = None):
    conn = database.get_connection()
    clauses, params = [], []
    if status:
        clauses.append("status = ?"); params.append(status)
    if symbol:
        clauses.append("symbol = ?"); params.append(symbol.upper())
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = conn.execute(
        f"SELECT * FROM inv_actions {where} ORDER BY created_at DESC", params
    ).fetchall()
    conn.close()
    return {'items': [dict(r) for r in rows]}


@router.post('/actions', status_code=201)
def create_action(body: InvActionCreate):
    conn = database.get_connection()
    row = conn.execute(
        """INSERT INTO inv_actions (symbol, account_number, action_type, title, notes, due_date)
           VALUES (?,?,?,?,?,?) RETURNING *""",
        (body.symbol.upper() if body.symbol else None, body.account_number,
         body.action_type, body.title, body.notes, body.due_date)
    ).fetchone()
    conn.commit()
    conn.close()
    return dict(row)


@router.patch('/actions/{aid}')
def update_action(aid: int, body: InvActionUpdate):
    conn = database.get_connection()
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if 'symbol' in fields and fields['symbol']:
        fields['symbol'] = fields['symbol'].upper()
    if fields:
        fields['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE inv_actions SET {clause} WHERE id = ?", list(fields.values()) + [aid])
        conn.commit()
    row = conn.execute("SELECT * FROM inv_actions WHERE id = ?", (aid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, 'Action not found')
    return dict(row)


@router.delete('/actions/{aid}', status_code=204)
def delete_action(aid: int):
    conn = database.get_connection()
    conn.execute("DELETE FROM inv_actions WHERE id = ?", (aid,))
    conn.commit()
    conn.close()
