from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import database

router = APIRouter()


class EntryCreate(BaseModel):
    entry_date: str
    entry_type: str = 'Activity'
    title: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    confirmation_number: Optional[str] = None
    notes: Optional[str] = None


class EntryUpdate(BaseModel):
    entry_date: Optional[str] = None
    entry_type: Optional[str] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    confirmation_number: Optional[str] = None
    notes: Optional[str] = None
    clear_start_time: bool = False
    clear_end_time: bool = False
    clear_location: bool = False
    clear_confirmation: bool = False
    clear_notes: bool = False


class DayNoteUpdate(BaseModel):
    notes: str = ""


def _check_trip(conn, trip_id):
    if not conn.execute("SELECT id FROM trips WHERE id = ?", (trip_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Trip not found.")


def _itin_full(conn, trip_id):
    entries = conn.execute(
        """SELECT * FROM itinerary_entries WHERE trip_id = ?
           ORDER BY entry_date, start_time NULLS LAST, sort_order, id""",
        (trip_id,)
    ).fetchall()
    exp_list = [dict(e) for e in entries]

    by_date = {}
    for e in exp_list:
        d = e['entry_date']
        if d not in by_date:
            by_date[d] = []
        by_date[d].append(e)

    note_rows = conn.execute(
        "SELECT entry_date, notes FROM itinerary_day_notes WHERE trip_id = ?",
        (trip_id,)
    ).fetchall()
    day_notes = {r['entry_date']: r['notes'] for r in note_rows}

    return {
        "entries":   exp_list,
        "by_date":   by_date,
        "dates":     sorted(by_date.keys()),
        "day_notes": day_notes,
    }


@router.get("")
def get_itinerary(trip_id: int):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    result = _itin_full(conn, trip_id)
    conn.close()
    return result


@router.post("/entries", status_code=201)
def add_entry(trip_id: int, body: EntryCreate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    max_order = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM itinerary_entries WHERE trip_id = ? AND entry_date = ?",
        (trip_id, body.entry_date)
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO itinerary_entries
               (trip_id, entry_date, entry_type, title, start_time, end_time,
                location, confirmation_number, notes, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (trip_id, body.entry_date, body.entry_type, body.title,
         body.start_time, body.end_time, body.location,
         body.confirmation_number, body.notes, max_order + 1)
    )
    conn.commit()
    result = _itin_full(conn, trip_id)
    conn.close()
    return result


@router.put("/entries/{entry_id}")
def update_entry(trip_id: int, entry_id: int, body: EntryUpdate):
    conn = database.get_connection()
    row = conn.execute(
        "SELECT * FROM itinerary_entries WHERE id = ? AND trip_id = ?", (entry_id, trip_id)
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Entry not found.")

    fields = {}
    if body.entry_date is not None: fields['entry_date'] = body.entry_date
    if body.entry_type is not None: fields['entry_type'] = body.entry_type
    if body.title      is not None: fields['title']      = body.title

    if body.clear_start_time:             fields['start_time'] = None
    elif body.start_time is not None:     fields['start_time'] = body.start_time
    if body.clear_end_time:               fields['end_time'] = None
    elif body.end_time is not None:       fields['end_time'] = body.end_time
    if body.clear_location:               fields['location'] = None
    elif body.location is not None:       fields['location'] = body.location
    if body.clear_confirmation:           fields['confirmation_number'] = None
    elif body.confirmation_number is not None: fields['confirmation_number'] = body.confirmation_number
    if body.clear_notes:                  fields['notes'] = None
    elif body.notes is not None:          fields['notes'] = body.notes

    if fields:
        set_clause = ', '.join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE itinerary_entries SET {set_clause} WHERE id = ?",
            (*fields.values(), entry_id)
        )
    conn.commit()
    result = _itin_full(conn, trip_id)
    conn.close()
    return result


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(trip_id: int, entry_id: int):
    conn = database.get_connection()
    if not conn.execute(
        "SELECT id FROM itinerary_entries WHERE id = ? AND trip_id = ?", (entry_id, trip_id)
    ).fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Entry not found.")
    conn.execute("DELETE FROM itinerary_entries WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()


@router.put("/day-note/{entry_date}")
def upsert_day_note(trip_id: int, entry_date: str, body: DayNoteUpdate):
    conn = database.get_connection()
    _check_trip(conn, trip_id)
    conn.execute(
        """INSERT INTO itinerary_day_notes (trip_id, entry_date, notes)
           VALUES (?, ?, ?)
           ON CONFLICT(trip_id, entry_date) DO UPDATE SET notes = excluded.notes""",
        (trip_id, entry_date, body.notes)
    )
    conn.commit()
    conn.close()
    return {"ok": True}
