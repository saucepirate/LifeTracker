from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict
import database

router = APIRouter()


class SettingsPatch(BaseModel):
    values: Dict[str, str]


@router.get("")
def get_settings():
    conn = database.get_connection()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}


@router.patch("")
def patch_settings(body: SettingsPatch):
    conn = database.get_connection()
    for key, value in body.values.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
    conn.commit()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}
