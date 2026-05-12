# LifeTracker — CLAUDE.md

Personal productivity SPA: FastAPI backend + SQLite + vanilla JS frontend.

## How to run

```bash
python main.py
# → http://127.0.0.1:8000
```

## Testing

```bash
# Run all tests
python -m pytest tests/ -q

# Run a single test file
python -m pytest tests/test_packing_templates.py -v
```

**Infrastructure:** `pytest` + `httpx` + FastAPI `TestClient`. Each test gets an isolated in-memory SQLite DB via `monkeypatch.setattr("config.DB_PATH", ...)` in `tests/conftest.py`.

**Test files:**
| File | Covers |
|------|--------|
| `tests/test_packing_templates.py` | Packing template CRUD, from-preset bulk create, replace, category/item sub-resources |
| `tests/test_trip_packing.py` | apply-inline-preset (single + per_list mode), gender routing, merge/replace, apply-template |
| `tests/test_project_templates.py` | Project template CRUD with filter fields (source_id, filter_trip_type, filter_destination, filter_length) |

**Key fixtures (conftest.py):**
- `client` — TestClient with temp DB; fresh per test
- `trip` — 7-day trip created via POST /api/trips
- `weekend_trip` — 2-day trip
- `SIMPLE_PRESET_CATEGORIES` — preset data with all four `owner_type` values

**Important:** `create_trip` automatically creates `DEFAULT_PACKING_CATEGORIES` (`Clothing`, `Toiletries`, `Electronics`, `Documents`, `Medication`, `Miscellaneous`). Tests must look up packing categories **by name**, not by index, since these empty defaults are always present.

Windows auto-start: `setup_task_scheduler.bat` registers a logon-triggered Task Scheduler task that silently runs `start.pyw`.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLite3 (raw SQL, no ORM), Pydantic
- **Frontend:** Vanilla HTML/CSS/JS, no build step, no framework
- **Config:** `config.py` — `DB_PATH`, `HOST=127.0.0.1`, `PORT=8000`, `DEBUG=True`
- **Database:** `data/life_tracker.db` (auto-created on first run)

## File structure

```
main.py                  # FastAPI app entry, mounts routers + static files
config.py                # Centralized config
database.py              # SQLite init, schema, migrations (try-except ALTER TABLE)
business.py              # generate_recurring_tasks(), calc_streaks(), evaluate_on_track()
requirements.txt         # fastapi, uvicorn[standard], python-multipart
start.pyw                # Silent Windows launcher
setup_task_scheduler.bat # Register Windows Task Scheduler entry

routers/
  tasks.py               # Task CRUD, subtasks, recurrences
  goals.py               # Goal CRUD, metrics, milestones, habits, log entries
  notes.py               # Note CRUD
  tags.py                # Tag CRUD (max 15, default tags protected)
  calendar.py            # Month/week/day views + event CRUD
  recurrences.py         # Recurrence management
  dashboard.py           # Aggregated dashboard data
  settings.py            # Key-value settings store
  games.py               # High scores
  events.py              # Placeholder (returns empty list)
  media.py               # Placeholder (returns empty list)

models/
  tasks.py               # TaskCreate, TaskUpdate, SubtaskCreate/Update, RecurrenceCreate/Update
  goals.py               # GoalCreate/Update, MilestoneCreate/Update, LogEntryCreate, MetricCreate/Update, HabitCreate/Update

static/
  index.html             # SPA shell
  css/style.css          # All styles
  js/
    app.js               # Router, apiFetch(), shared utilities, sidebar nav
    dashboard.js
    tasks.js
    goals.js
    notes.js
    calendar.js
    settings.js
    games.js + games-*.js  # 12 game implementations
```

## API routes

All routes prefixed `/api/`.

| Router | Prefix | Key endpoints |
|--------|--------|---------------|
| dashboard | `/api/dashboard` | `GET /` |
| tasks | `/api/tasks` | CRUD, `/today`, `/upcoming`, `/{id}/complete`, `/{id}/subtasks` |
| goals | `/api/goals` | CRUD, `/items`, `/{id}/log`, `/{id}/milestones`, `/{id}/metrics`, `/{id}/habits` |
| notes | `/api/notes` | CRUD |
| tags | `/api/tags` | CRUD |
| calendar | `/api/calendar` | `/month`, `/week`, `/day`, `/events` CRUD |
| recurrences | `/api/recurrences` | CRUD, `/generate` |
| settings | `/api/settings` | `GET /`, `PATCH /` |
| games | `/api/games` | `/scores` GET + POST |

**List responses:** `{"items": [...], "total": count}`
**Error responses:** `HTTPException(status_code, detail)`

## Database schema (key tables)

| Table | Purpose | Notable columns |
|-------|---------|-----------------|
| `tasks` | Tasks | `status` (pending/completed), `priority` (high/medium/low), `due_date`, `goal_id`, `recurrence_id` |
| `task_tags` | Task↔Tag M2M | `task_id`, `tag_id` |
| `task_subtasks` | Subtasks | `task_id`, `completed`, `sort_order` |
| `task_recurrences` | Recurrence templates | `cadence` (daily/weekly/monthly/custom), `days_of_week` (JSON), `active` |
| `goals` | Goals | `goal_type` (general/metric/habit), `status` (active/achieved/abandoned), `is_on_track`, `pinned` |
| `goal_metrics` | Numeric targets per goal | `label`, `current_value`, `target_value`, `unit`, `target_date`, `completed` |
| `goal_milestones` | Milestone targets per goal | `title`, `target_date`, `completed`, `sort_order` |
| `goal_habits` | Habit targets per goal | `label`, `weekly_target_minutes`, `min_days_per_week` |
| `goal_log_entries` | Activity logs | `goal_id`, `value`, `habit_id`, `logged_at` |
| `goal_on_track_rules` | On-track evaluation config | `weekly_target_minutes`, `min_days_per_week`, `lookback_days` |
| `goal_task_log` | Tasks completed → goal | `goal_id`, `task_id`, `completed_at` |
| `notes` | Notes | `pinned`, `goal_id` |
| `note_tags` | Note↔Tag M2M | `note_id`, `tag_id` |
| `events` | Calendar events | `date`, `end_date`, `all_day`, `start_time`, `end_time` |
| `tags` | Tags | `name`, `color`, `is_default` |
| `settings` | Key-value config | `key`, `value` |
| `high_scores` | Game scores | `game`, `score` |
| `media` | Media tracking (placeholder) | `media_type`, `status` |

All dates/datetimes stored as ISO strings. JSON arrays (tag_ids, days_of_week) stored as JSON strings in TEXT columns.

## Key code patterns

**DB access:** `database.get_connection()` per request; always `conn.close()` at end; `PRAGMA foreign_keys = ON`.

**Full resource pattern:** Each router has a private `_*_full(conn, id)` helper (e.g., `_task_full`, `_goal_full`) that assembles nested data (tags, subtasks, computed fields) and is called after any write to return a complete representation.

**Conditional updates:** Many update endpoints use `clear_*` boolean params (e.g., `clear_target_date`, `clear_goal_id`) to distinguish "set to null" from "don't change".

**Many-to-many management:** Always DELETE old rows then INSERT new ones; use `INSERT OR IGNORE`.

**Recurrence generation:** `business.generate_recurring_tasks()` runs on every task/calendar fetch. Generates forward 14 days. References earliest task `due_date` (not `created_at`) to avoid UTC/local skew.

**On-track evaluation:** `business.evaluate_on_track()` checks habit minutes, habit min-days, and overdue milestones. Sets `is_on_track` boolean on goal.

**Streaks:** `business.calc_streaks()` walks log entries newest-first; current streak must include today.

**Soft deletes:** Recurrences set `active = 0` rather than hard DELETE.

**Progress recalc:** `_recalc_progress()` in goals router averages metric progress, milestone completion %, and habit weekly targets; clamps to 0-100.

## Frontend patterns

**SPA routing:** `registerPage(name, fn)` + `loadPage(page)` in `app.js`. Each page fn receives `#content` container and renders via `innerHTML`.

**API calls:** `apiFetch(method, path, body)` — throws on non-2xx; returns null on 204.

**Shared utilities in app.js:** `capitalize`, `formatDate`, `formatDateShort`, `todayISO`, `isOverdue`, `isToday`, `greeting`, `tagBadgeHTML`, `tagsHTML`, `priorityDotHTML`, `progressBarHTML`, `streakDotsHTML`.

**Module state:** prefixed `_` (e.g., `_tasks`, `_goals`, `_filter`). Constants: `UPPER_SNAKE_CASE`.

**LocalStorage keys:** `theme` (accent color), `lt_task_lists` (task list configs).

**Asset cache busting:** `?v=99` query param on script/style references in `index.html`.
