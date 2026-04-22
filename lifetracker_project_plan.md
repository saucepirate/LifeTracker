# LifeTracker — Full Project Build Plan

## Project overview

Build a locally hosted personal life tracker web application called **LifeTracker**. It runs on `localhost:8000`, starts automatically on Windows login via Task Scheduler, and is accessed through a browser. The stack is Python (FastAPI) + SQLite + plain HTML/CSS/JavaScript (no frontend framework). The backend must expose clean JSON REST API endpoints — no server-side HTML rendering of data — so that a future mobile app or Raspberry Pi migration can consume the same API without any backend changes.

---

## Tech stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn
- **Database:** SQLite via the `sqlite3` standard library (no ORM — use raw SQL)
- **Frontend:** Plain HTML, CSS, vanilla JavaScript (no React, no Vue, no build step)
- **Dependencies:** FastAPI, uvicorn, python-multipart
- **Config:** `config.py` for all environment-specific settings (db path, host, port)
- **Auto-start:** Windows Task Scheduler task that runs `python main.py` on login, silently, no terminal window

---

## Project structure

```
life-tracker/
├── main.py                        # FastAPI app entry, mounts routers, serves static files
├── config.py                      # DB path, host, port, debug flag
├── database.py                    # SQLite connection, schema creation, seed data
├── requirements.txt
├── start.pyw                      # Silent launcher for Windows Task Scheduler (no console window)
├── setup_task_scheduler.bat       # One-click Windows Task Scheduler registration script
│
├── routers/
│   ├── tasks.py
│   ├── goals.py
│   ├── events.py
│   ├── notes.py
│   ├── media.py
│   ├── tags.py
│   └── calendar.py
│
├── models/
│   ├── tasks.py                   # Pydantic request/response models
│   ├── goals.py
│   ├── events.py
│   ├── notes.py
│   └── media.py
│
├── static/
│   ├── css/
│   │   └── style.css              # All app styles
│   ├── js/
│   │   ├── app.js                 # Routing, sidebar nav, shared utilities
│   │   ├── dashboard.js
│   │   ├── tasks.js
│   │   ├── goals.js
│   │   ├── events.js
│   │   ├── notes.js
│   │   ├── media.js
│   │   └── calendar.js
│   └── index.html                 # Single-page shell — sidebar + main content area
│
└── data/
    └── life_tracker.db            # SQLite database file (auto-created on first run)
```

---

## config.py

```python
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, "data", "life_tracker.db")
HOST = "127.0.0.1"
PORT = 8000
DEBUG = False
```

---

## Auto-start setup

### start.pyw
A `.pyw` file runs Python without a console window on Windows.

```python
import subprocess
import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
subprocess.Popen(
    [sys.executable, os.path.join(script_dir, "main.py")],
    cwd=script_dir,
    creationflags=0x08000000  # CREATE_NO_WINDOW
)
```

### setup_task_scheduler.bat
Running this bat file registers the Task Scheduler entry. It should auto-detect the Python path and the project directory.

```bat
@echo off
set SCRIPT_DIR=%~dp0
set PYTHON_PATH=%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe
schtasks /create /tn "LifeTracker" /tr "\"%PYTHON_PATH%\" \"%SCRIPT_DIR%start.pyw\"" /sc onlogon /rl limited /f
echo LifeTracker scheduled to start on login.
pause
```

---

## Database schema

All tables are created in `database.py` via `CREATE TABLE IF NOT EXISTS`. The database file and `/data` directory are auto-created on first run. Seed default tags on first run only (check if tags table is empty).

### tags
```sql
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT 'teal',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
Default tags to seed (is_default=1): Health, Finance, Personal, Work, Learning, Home, Social, Errands

Color values correspond to the UI palette: `teal`, `amber`, `purple`, `blue`, `green`, `coral`, `pink`, `gray`, `red`

### tasks
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | abandoned
    priority TEXT NOT NULL DEFAULT 'medium', -- high | medium | low
    due_date TEXT,                            -- ISO date string YYYY-MM-DD
    completed_at TEXT,
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurrence_id INTEGER REFERENCES task_recurrences(id),
    goal_id INTEGER REFERENCES goals(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### task_tags
```sql
CREATE TABLE IF NOT EXISTS task_tags (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);
```

### task_subtasks
```sql
CREATE TABLE IF NOT EXISTS task_subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);
```

### task_recurrences
```sql
CREATE TABLE IF NOT EXISTS task_recurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    goal_id INTEGER REFERENCES goals(id),
    cadence TEXT NOT NULL,           -- daily | weekly | monthly | custom
    interval_value INTEGER DEFAULT 1,
    days_of_week TEXT,               -- JSON array e.g. '[1,3,5]' for Mon/Wed/Fri
    day_of_month INTEGER,            -- for monthly cadence
    tag_ids TEXT,                    -- JSON array of tag IDs
    active INTEGER NOT NULL DEFAULT 1,
    last_generated_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### goals
```sql
CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    area TEXT,                        -- free text area label
    goal_type TEXT NOT NULL,          -- habit | numeric | milestone
    status TEXT NOT NULL DEFAULT 'active', -- active | completed | paused | abandoned
    target_date TEXT,
    -- numeric goal fields
    start_value REAL,
    target_value REAL,
    current_value REAL,
    unit TEXT,
    -- habit goal fields
    weekly_target_minutes INTEGER,
    min_days_per_week INTEGER,
    progress_pct REAL DEFAULT 0,      -- manually set for habit goals
    -- on-track status (computed and cached)
    is_on_track INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### goal_milestones
```sql
CREATE TABLE IF NOT EXISTS goal_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);
```

### goal_log_entries
```sql
CREATE TABLE IF NOT EXISTS goal_log_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    logged_at TEXT NOT NULL DEFAULT (datetime('now')),
    value REAL,                       -- minutes, rating points, distance, etc.
    note TEXT
);
```

### goal_on_track_rules
```sql
CREATE TABLE IF NOT EXISTS goal_on_track_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
    -- habit fields
    weekly_target_minutes INTEGER,
    min_days_per_week INTEGER,
    lookback_days INTEGER DEFAULT 7,
    -- milestone fields
    milestones_required_by_date TEXT  -- JSON: [{"milestone_id": 1, "by_date": "2026-05-01"}]
);
```

### goal_task_log
```sql
CREATE TABLE IF NOT EXISTS goal_task_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_at TEXT NOT NULL,
    note TEXT
);
```

### events
```sql
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,               -- ISO date YYYY-MM-DD
    end_date TEXT,                    -- for multi-day events
    all_day INTEGER NOT NULL DEFAULT 1,
    start_time TEXT,                  -- HH:MM for non-all-day events
    end_time TEXT,
    notes TEXT,
    tag_ids TEXT,                     -- JSON array of tag IDs
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### notes
```sql
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### note_tags
```sql
CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);
```

### media
```sql
CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,         -- tv | movie | book | other
    status TEXT NOT NULL DEFAULT 'want', -- want | in_progress | completed
    rating INTEGER,                   -- 1-5, nullable
    notes TEXT,
    author_or_creator TEXT,
    genre TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## API endpoints

All endpoints return JSON. All list endpoints support query params for filtering/sorting. Use proper HTTP status codes. Use Pydantic models for request validation.

### Tasks — `/api/tasks`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List tasks. Params: `status`, `priority`, `tag_id`, `goal_id`, `due_before`, `due_after`, `search` |
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks/{id}` | Get task with subtasks and tags |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |
| POST | `/api/tasks/{id}/complete` | Mark complete, set completed_at, write to goal_task_log if goal_id set |
| GET | `/api/tasks/today` | Tasks due today + overdue pending tasks |
| GET | `/api/tasks/upcoming` | Tasks due in next 7 days |

### Task subtasks — `/api/tasks/{id}/subtasks`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/{id}/subtasks` | List subtasks |
| POST | `/api/tasks/{id}/subtasks` | Add subtask |
| PUT | `/api/tasks/{task_id}/subtasks/{sub_id}` | Update subtask |
| DELETE | `/api/tasks/{task_id}/subtasks/{sub_id}` | Delete subtask |

### Recurrences — `/api/recurrences`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/recurrences` | List all active recurrence rules |
| POST | `/api/recurrences` | Create recurrence rule |
| PUT | `/api/recurrences/{id}` | Update rule |
| DELETE | `/api/recurrences/{id}` | Delete rule + orphan its task instances |
| POST | `/api/recurrences/generate` | Trigger generation of upcoming instances (called on page load) |

### Goals — `/api/goals`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List goals. Params: `status`, `goal_type`, `area` |
| POST | `/api/goals` | Create goal |
| GET | `/api/goals/{id}` | Get goal with milestones, log entries, on-track rule |
| PUT | `/api/goals/{id}` | Update goal |
| DELETE | `/api/goals/{id}` | Delete goal |
| POST | `/api/goals/{id}/log` | Add log entry |
| GET | `/api/goals/{id}/log` | Get log entries |
| POST | `/api/goals/evaluate` | Re-evaluate on-track status for all active goals (called on page load) |

### Goal milestones — `/api/goals/{id}/milestones`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals/{id}/milestones` | List milestones |
| POST | `/api/goals/{id}/milestones` | Add milestone |
| PUT | `/api/goals/{goal_id}/milestones/{m_id}` | Update milestone |
| DELETE | `/api/goals/{goal_id}/milestones/{m_id}` | Delete milestone |
| POST | `/api/goals/{goal_id}/milestones/{m_id}/complete` | Mark complete |

### Events — `/api/events`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List events. Params: `from_date`, `to_date`, `tag_id` |
| POST | `/api/events` | Create event |
| GET | `/api/events/{id}` | Get event |
| PUT | `/api/events/{id}` | Update event |
| DELETE | `/api/events/{id}` | Delete event |

### Notes — `/api/notes`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notes` | List notes. Params: `tag_id`, `search`, `pinned` |
| POST | `/api/notes` | Create note |
| GET | `/api/notes/{id}` | Get note |
| PUT | `/api/notes/{id}` | Update note, auto-update `updated_at` |
| DELETE | `/api/notes/{id}` | Delete note |

### Media — `/api/media`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/media` | List media. Params: `media_type`, `status`, `search` |
| POST | `/api/media` | Create media item |
| GET | `/api/media/{id}` | Get media item |
| PUT | `/api/media/{id}` | Update media item |
| DELETE | `/api/media/{id}` | Delete media item |

### Tags — `/api/tags`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create custom tag. Enforce max 15 total tags. |
| PUT | `/api/tags/{id}` | Update tag name/color |
| DELETE | `/api/tags/{id}` | Delete tag (only non-default tags) |

### Calendar — `/api/calendar`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calendar/month` | Params: `year`, `month`. Returns unified list of all items (tasks, events, goal deadlines, milestones) for the month. Each item has: `date`, `type` (task/event/goal/milestone), `title`, `id`, `color`, `tags`, `status`, `is_recurring` |
| GET | `/api/calendar/day` | Param: `date`. Returns all items for a single day, same shape. |

### Dashboard — `/api/dashboard`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Returns: tasks due today count, overdue count, tasks completed this week, active goals count, goal streaks, upcoming events (next 5), today's tasks list, active goals summary list |

---

## Business logic

### Recurring task generation
Implemented as a function `generate_recurring_tasks()` called:
- On every page load (via a call from `GET /api/dashboard` and `GET /api/tasks`)
- Via `POST /api/recurrences/generate`

Logic:
1. Fetch all active recurrence rules
2. For each rule, generate task instances for the next 7 days that don't already exist
3. Check uniqueness by `recurrence_id + due_date` to avoid duplicates
4. Copy title, notes, priority, goal_id, and tag_ids from the recurrence rule to each generated task instance

### On-track evaluation
Implemented as a function `evaluate_on_track(goal_id)` called on page load via `POST /api/goals/evaluate`. Updates `goals.is_on_track`.

Logic by goal type:

**Habit goals:**
- Fetch log entries from the last `lookback_days` (default 7) days
- Sum total minutes and count distinct days logged
- `is_on_track = (total_minutes >= weekly_target_minutes) AND (distinct_days >= min_days_per_week)`

**Numeric goals:**
- Calculate required pace: `(target_value - current_value) / days_remaining`
- Calculate actual pace: average value gain per day from last 14 days of log entries
- `is_on_track = actual_pace >= required_pace * 0.8` (20% tolerance buffer)

**Milestone goals:**
- Check if any milestones have `target_date < today` and `completed = 0`
- `is_on_track = no overdue incomplete milestones`

### Progress calculation
Auto-calculated and returned in API responses (not stored):

- **Numeric goals:** `progress_pct = (current_value - start_value) / (target_value - start_value) * 100`
- **Milestone goals:** `progress_pct = completed_milestones / total_milestones * 100`
- **Habit goals:** Use `goals.progress_pct` (manually set field)

### Streak calculation
Calculated on the fly when returning goal data. A streak is the count of consecutive days (going backwards from today) that have at least one log entry. Return `current_streak` and `best_streak` (longest ever consecutive run).

### Tag enforcement
On `POST /api/tags`, count total tags before inserting. If count is already 15, return HTTP 400 with message "Maximum of 15 tags reached."

---

## Frontend architecture

`index.html` is a single-page app shell containing:
- The persistent sidebar (always visible)
- A `<main id="content">` area that gets replaced by JS when navigating

Navigation works by calling `loadPage('dashboard')`, `loadPage('tasks')`, etc. Each page function in its corresponding JS file fetches data from the API and renders HTML into `#content`.

No page reloads. No routing library. Simple `history.pushState` for URL updates.

### Sidebar structure
Left sidebar, always visible, 200px wide. Sections:
- **Overview:** Dashboard
- **Modules:** Tasks, Goals, Notes, Watchlist, Events, Calendar
- **Bottom:** Settings

Active state applied via JS on navigation. Each nav item has a color-coded icon (SVG inline) matching the module's accent color.

### Color system (CSS variables + palette)
Define these in `:root` in `style.css`:

Module accent colors:
- Dashboard: `#534AB7` (purple)
- Tasks: `#1D9E75` (teal)
- Goals: `#BA7517` (amber)
- Notes: `#D4537E` (pink)
- Watchlist: `#378ADD` (blue)
- Events / Calendar: `#185FA5` (dark blue)

Tag badge colors (light bg + dark text from same ramp):
- teal: bg `#E1F5EE`, text `#085041`
- amber: bg `#FAEEDA`, text `#633806`
- purple: bg `#EEEDFE`, text `#3C3489`
- blue: bg `#E6F1FB`, text `#0C447C`
- green: bg `#EAF3DE`, text `#27500A`
- coral: bg `#FAECE7`, text `#712B13`
- pink: bg `#FBEAF0`, text `#72243E`
- gray: bg `#F1EFE8`, text `#444441`
- red: bg `#FCEBEB`, text `#791F1F`

Priority dot colors:
- high: `#E24B4A`
- medium: `#EF9F27`
- low: `#5DCAA5`

### Typography
Font stack: `system-ui, -apple-system, "Segoe UI", sans-serif`
- Page titles: 18px, weight 500
- Card titles: 13-14px, weight 500
- Body / list items: 13-14px, weight 400
- Meta / labels: 11-12px, weight 400, muted color
- Never use font-weight 600 or 700

### Layout tokens
- Border: `0.5px solid rgba(0,0,0,0.12)` (light mode), `0.5px solid rgba(255,255,255,0.12)` (dark mode)
- Card border-radius: `12px`
- Element border-radius: `8px`
- Pill border-radius: `999px`
- Card padding: `14px 16px`
- Page padding: `20px`

---

## Module-by-module UI spec

### Dashboard (`dashboard.js`)

Loaded on app open. Calls `GET /api/dashboard` once.

Layout:
1. Greeting header: "Good morning/afternoon/evening, [name]" + today's date + "Quick add" button
2. Stats row (4 metric cards): Due today, Overdue (red if > 0), Completed this week, Active goals
3. Two-column grid:
   - Left: "Today's tasks" card — list of today's tasks with checkboxes, tags, recurrence icon
   - Right: "Goal progress" card — list of active goals with progress bars and streak dots
4. "Upcoming events" card — full width, 3-column grid of next 5 events

Behavior:
- Checking a task on the dashboard calls `POST /api/tasks/{id}/complete` and updates the UI inline without a full reload
- Goal progress bars animate in on load (CSS transition)
- Streak dots: 7 dots showing last 7 days, filled = logged that day, empty = no log

Quick add button opens an inline modal with: title input, due date, priority selector, tag selector. Submits to `POST /api/tasks`.

### Tasks (`tasks.js`)

Calls `GET /api/tasks` with appropriate filters on load. Also triggers recurring task generation.

Layout:
1. Page header with "+ New task" button
2. Stats row: Due today, Overdue, This week (completed / total), Recurring active count
3. Filter pills: All | Today | Upcoming | Recurring | Completed
4. Sort dropdown: Due date | Priority | Created | Alphabetical
5. Task list grouped by sections: Overdue → Today → Upcoming → No date → Completed (collapsed by default)

Task row elements (left to right):
- Priority dot (colored)
- Circular checkbox (click to complete)
- Task title (strikethrough if done)
- Tag badges
- Recurrence icon (teal circular arrow SVG) + cadence label if recurring
- Due date label (red + bold if overdue)

Clicking a task row opens the task detail panel (slides in from the right, or renders below on narrow screens).

Task detail panel:
- Editable title (click to edit inline)
- Recurrence card: shows cadence or "One-time", with edit button
- Detail grid: Priority, Area/tags, Due date, Linked goal
- Subtasks list with checkboxes (square, not round), add subtask inline
- Notes textarea (auto-saves on blur)
- Delete button (with confirmation)

New task modal fields: title (required), due date, priority, tags (multi-select, max 15 available), linked goal (dropdown of active goals), notes, make recurring toggle (reveals: cadence, interval, days of week)

### Goals (`goals.js`)

Layout:
1. Page header with "+ New goal" button
2. Filter pills: All | Active | On track | Behind | Completed
3. Goal cards list

Goal card elements:
- Title
- Type badge (Habit / Numeric / Milestone) + Area badge + On-track/Behind badge
- Target date (top right)
- Progress bar with percentage
- Streak dots (7 days) + context label (e.g. "6 day streak · 30 min avg" or "current: 1,248")
- Sub-info: milestone count or target gap

Clicking a goal card opens the goal detail page (full page replace, not a panel).

Goal detail page:
1. Back button + "+ Log progress" button
2. Title + badges + target date
3. Stats row: Overall progress %, Current streak, This week (value vs target), Milestones (X/Y)
4. Two-column:
   - Left: "On-track definition" card — shows type-specific fields, edit button
   - Right: "Progress" card — large progress bar, last updated label
5. "Milestones & sub-steps" full-width card — ordered checklist with target dates, add milestone button, completed milestones shown with strikethrough + completed date
6. "Recent progress log" full-width card — log entries (date, value, note), "View all" link, "+ Log entry" inline form

Log progress modal:
- Date (defaults to today)
- Value (numeric input with unit label from goal, e.g. "minutes", "rating points")
- Note (optional)

New goal modal / form fields:
- Title (required)
- Description
- Area (free text)
- Goal type selector: Habit | Numeric | Milestone
- Target date
- **If Numeric:** Start value, Target value, Current value, Unit label
- **If Habit:** Weekly target (minutes), Min days per week
- **If Milestone:** (no extra fields — milestones added after creation)
- On-track rule fields (shown after type selection, pre-populated with sensible defaults)

### Calendar (`calendar.js`)

Calls `GET /api/calendar/month?year=YYYY&month=MM` on load and on month navigation.

Layout:
1. Header: Month + year title, Today button, Prev/Next arrows, Month/Week/Day toggle
2. Filter bar (two tiers):
   - Tier 1 — content type toggles: Tasks | Goal deadlines | Milestones | Events (each a pill with color dot, toggleable)
   - Tier 2 — tag filters: one pill per tag (fetched from `/api/tags`), toggleable
3. Day-of-week header row
4. Calendar grid (5-6 rows × 7 columns)
5. Day detail panel (below calendar) — shows all items for selected/today date

Calendar cell contents:
- Day number (circle highlight for today, blue fill)
- Up to 3 event/task pills per cell, then "+N more" link
- Color coding: teal pill = task, blue pill = event, amber pill = goal deadline, purple pill = milestone
- Overdue tasks: red pill
- Completed tasks: gray pill with strikethrough
- Recurring tasks: slightly muted opacity

Day detail panel:
- Header: full date + "+ Add to this day" button
- List of all items for that date, each with: colored left bar (3px), title, meta line (type + tags), type badge on right
- Clicking an item navigates to its detail view in the relevant module

Filtering behavior: filter state stored in JS variables. When a filter pill is toggled, re-filter the already-fetched data client-side (no new API call needed within the same month).

Month navigation calls a new `GET /api/calendar/month` request and re-renders the grid.

### Events (`events.js`)

Layout:
1. Page header with "+ New event" button
2. Filter: Upcoming (default) | Past | All
3. Events list grouped by month, sorted by date ascending

Event row: date block (day number + month abbreviation) | colored dot | event name | time or "All day" | tag badges

Clicking an event opens event detail (inline panel or modal):
- Editable title, date, end date (optional), all day toggle, start/end time, notes, tags

New event modal fields: title, date, end date (optional), all day toggle, start time / end time (shown if not all day), notes, tags

### Notes (`notes.js`)

Layout:
1. Page header with "+ New note" button
2. Search input
3. Filter by tag pills
4. Notes grid (2 columns) — cards showing title, preview of first 100 chars, tags, updated date, pin icon

Clicking a note opens full note editor:
- Editable title
- Full content textarea (large, auto-grow)
- Tag selector
- Pin/unpin toggle
- Delete button
- Auto-saves on blur (calls `PUT /api/notes/{id}`)

### Watchlist / Media (`media.js`)

Layout:
1. Page header with "+ Add item" button
2. Filter tabs: All | TV | Movies | Books | Other
3. Status filter pills: Want to watch | In progress | Completed
4. Media grid (cards)

Media card: title, type badge, status badge, rating stars (if completed), creator/author, genre

Clicking opens media detail:
- All fields editable inline
- Rating: 5-star click selector
- Status change button: "Start" → moves to in_progress, sets started_at. "Mark complete" → sets status=completed, completed_at
- Notes textarea

### Settings (inline, no separate page)

Accessible via gear icon at bottom of sidebar. Opens as a panel or modal.

Sections:
- **Your name** — used in the dashboard greeting. Store in a `settings` table (key-value): `key='user_name'`, `value='Eddie'`
- **Tags** — list of all tags with color swatches, edit name, delete (non-defaults only), add new tag (enforces 15 max)
- **Data** — "Export database" button (copies `life_tracker.db` to Downloads), "About" text showing app version

Add a `settings` table to the schema:
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```
Seed with: `INSERT OR IGNORE INTO settings (key, value) VALUES ('user_name', 'there')`

Add endpoints:
- `GET /api/settings` → returns all settings as a JSON object
- `PUT /api/settings/{key}` → update a setting value

---

## Build order

Build in this exact sequence. Each phase should be fully working before moving to the next.

### Phase 1 — Foundation
1. Create project folder structure
2. Write `config.py`
3. Write `database.py` — all CREATE TABLE statements, seed function, connection helper
4. Write `main.py` — FastAPI app, mount routers (stubs), serve `static/index.html` for all non-API routes
5. Write `requirements.txt`
6. Write `start.pyw` and `setup_task_scheduler.bat`
7. Create `static/index.html` shell — sidebar, `<main id="content">`, link to CSS and JS files
8. Write `static/css/style.css` — full design system (layout, sidebar, cards, badges, buttons, forms, progress bars, streak dots)
9. Write `static/js/app.js` — navigation router, sidebar active state, shared utilities (API fetch wrapper, date formatting, badge rendering)
10. Verify app starts, serves the shell, DB is created with correct schema

### Phase 2 — Tasks module
1. Write `routers/tasks.py` and `models/tasks.py` — all endpoints
2. Implement `generate_recurring_tasks()` logic
3. Write `static/js/tasks.js` — full tasks list UI, task detail panel, new task modal
4. Test: create tasks, create recurring tasks, complete tasks, filter/sort

### Phase 3 — Goals module
1. Write `routers/goals.py` and `models/goals.py` — all endpoints
2. Implement `evaluate_on_track()` logic for all three goal types
3. Implement streak calculation
4. Write `static/js/goals.js` — goal list, goal detail page, log entry modal, milestone management
5. Test: create all three goal types, log progress, verify on-track evaluation

### Phase 4 — Dashboard
1. Write `routers/dashboard.py` and `GET /api/dashboard` endpoint
2. Write `static/js/dashboard.js` — full dashboard render
3. Test: dashboard reflects real data from tasks and goals

### Phase 5 — Calendar
1. Write `routers/calendar.py` — month and day endpoints that JOIN across all tables
2. Write `static/js/calendar.js` — grid render, filter bar, day detail panel, navigation
3. Test: items from tasks, goals, events all appear correctly, filters work

### Phase 6 — Events, Notes, Watchlist
1. `routers/events.py` + `events.js`
2. `routers/notes.py` + `notes.js`
3. `routers/media.py` + `media.js`

### Phase 7 — Settings + polish
1. Settings table, `GET/PUT /api/settings` endpoints
2. Settings panel UI (tags management, user name)
3. Quick add button on dashboard
4. Keyboard shortcut: `N` or `Ctrl+N` to open quick add from anywhere
5. Empty states for all modules (friendly message + CTA when no data)
6. Error states (API failure messages)
7. Loading states (skeleton or spinner while fetching)
8. Test full flow end-to-end

---

## Key implementation notes

- **CORS:** Add `CORSMiddleware` in `main.py` allowing `localhost` origins, for future mobile app compatibility
- **Date handling:** All dates stored as ISO strings (`YYYY-MM-DD`). All datetimes as `YYYY-MM-DDTHH:MM:SS`. Never store Unix timestamps. Always use `datetime('now')` in SQLite defaults.
- **JSON fields:** SQLite stores `tag_ids`, `days_of_week` as JSON strings. Use `json.loads()` / `json.dumps()` in Python when reading/writing. Always return them as proper arrays in API responses.
- **Cascade deletes:** Foreign key cascade is defined in schema but must be enabled per-connection in SQLite: run `PRAGMA foreign_keys = ON` at the start of every connection.
- **API responses:** Always return a consistent shape. Lists return `{"items": [...], "total": N}`. Single items return the object directly. Errors return `{"detail": "message"}`.
- **No ORM:** Use raw `sqlite3` with parameterized queries (`?` placeholders). Never use f-strings to build SQL — SQL injection risk.
- **Frontend fetch wrapper:** Write a single `apiFetch(method, path, body)` utility in `app.js` that prepends `/api`, sets JSON headers, handles errors, and returns parsed JSON. All modules use this function — no raw `fetch()` calls scattered throughout.
- **No external CDN dependencies in production:** All JS is vanilla. No jQuery, no lodash, no moment.js.
- **Progress bar animations:** Use CSS `transition: width 0.4s ease` on the fill element. Set width via JS after a short `setTimeout(0)` to trigger the transition.
- **Streak dots:** Render 7 dots. For each of the last 7 days (today = rightmost), check if a log entry exists for that goal on that date. Filled dot if yes, empty if no.
- **Tag max enforcement:** Enforced server-side in `POST /api/tags`. Also disable the "Add tag" button client-side when tag count reaches 15.
- **Recurring task deduplication:** Before inserting a new task instance, check `SELECT id FROM tasks WHERE recurrence_id = ? AND due_date = ?`. Skip if exists.
- **On-track evaluation:** Called server-side on page load. The frontend just reads `is_on_track` from the goal object — it does not calculate this itself.

---

## Sample API response shapes

### Task (full)
```json
{
  "id": 1,
  "title": "Call insurance — billing dispute",
  "notes": "Dispute is for EOB dated Mar 14...",
  "status": "pending",
  "priority": "high",
  "due_date": "2026-04-17",
  "completed_at": null,
  "is_recurring": false,
  "recurrence_id": null,
  "goal_id": null,
  "tags": [{"id": 2, "name": "Finance", "color": "red"}],
  "subtasks": [
    {"id": 1, "title": "Find policy number", "completed": true, "sort_order": 0},
    {"id": 2, "title": "Call member services", "completed": false, "sort_order": 1}
  ],
  "created_at": "2026-04-10T09:00:00"
}
```

### Goal (full)
```json
{
  "id": 1,
  "title": "Guitar — reach intermediate level",
  "description": null,
  "area": "Music",
  "goal_type": "habit",
  "status": "active",
  "target_date": "2026-12-31",
  "weekly_target_minutes": 210,
  "min_days_per_week": 5,
  "progress_pct": 62.0,
  "is_on_track": true,
  "current_streak": 6,
  "best_streak": 14,
  "this_week_minutes": 200,
  "milestones_total": 8,
  "milestones_completed": 3,
  "tags": [],
  "created_at": "2026-01-01T00:00:00"
}
```

### Calendar month item
```json
{
  "date": "2026-04-21",
  "type": "event",
  "title": "Guitar lesson",
  "id": 3,
  "color": "blue",
  "tags": [],
  "status": null,
  "is_recurring": false,
  "time": "18:30"
}
```

---

## What this app is NOT

- Not multi-user. No authentication, no sessions. It's a personal local app.
- Not real-time. No websockets. Simple request/response.
- Not a calendar replacement. Events are supplementary context alongside tasks and goals.
- Not a habit tracker app. Habits are one goal type among three, not the core primitive.

---

## Definition of done

The app is considered complete when:
- All 7 modules render correctly with real data
- Tasks can be created, completed, and recur automatically
- Goals show accurate on-track status and streaks
- Calendar shows items from all modules and filters work
- The app survives a browser refresh (data persists in SQLite)
- Windows Task Scheduler setup script works and the app opens automatically on login
- No hardcoded paths or values — everything goes through `config.py`
