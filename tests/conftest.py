"""
Shared pytest fixtures for LifeTracker backend tests.

Each test gets a fresh SQLite database in a temp directory via the `client`
fixture. Monkeypatching config.DB_PATH before the TestClient context starts
ensures that database.get_connection() — which reads config.DB_PATH at call
time — uses the temp path, and that the FastAPI lifespan (init_db) initialises
the correct schema.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    """FastAPI TestClient backed by a fresh per-test SQLite database."""
    monkeypatch.setattr("config.DB_PATH", str(tmp_path / "test.db"))
    from main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def trip(client):
    """Create and return a minimal test trip."""
    r = client.post("/api/trips", json={
        "name": "Test Trip",
        "destination": "Somewhere",
        "start_date": "2026-07-01",
        "end_date": "2026-07-07",
        "status": "Planning",
        "color": "blue",
    })
    assert r.status_code == 201
    return r.json()


@pytest.fixture
def weekend_trip(client):
    """A 2-day domestic trip (used for weekend/length routing tests)."""
    r = client.post("/api/trips", json={
        "name": "Weekend Away",
        "start_date": "2026-07-04",
        "end_date": "2026-07-05",
        "status": "Planning",
        "color": "blue",
    })
    assert r.status_code == 201
    return r.json()


# ---------------------------------------------------------------------------
# Preset data helpers (mirror the JS PACKING_PRESETS structure)
# ---------------------------------------------------------------------------

SIMPLE_PRESET_CATEGORIES = [
    {
        "name": "Shelter",
        "items": [
            {"name": "Tent",         "quantity": 1, "owner_type": "shared"},
            {"name": "Sleeping bag", "quantity": 1, "owner_type": "all_travelers"},
            {"name": "Sports bra",   "quantity": 2, "owner_type": "women"},
            {"name": "Grooming kit", "quantity": 1, "owner_type": "men"},
        ],
    },
    {
        "name": "Essentials",
        "items": [
            {"name": "First aid kit",  "quantity": 1, "owner_type": "shared"},
            {"name": "Reusable bottle","quantity": 1, "owner_type": "all_travelers"},
        ],
    },
]
