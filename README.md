# LifeTracker

A self-hosted personal productivity web app. FastAPI + SQLite backend, vanilla JS single-page frontend. Runs locally at `http://localhost:8000`.

---

## Quick Start

```bash
pip install -r requirements.txt
python main.py
```

Or use `start.pyw` (Windows, no console window). `setup_task_scheduler.bat` registers an auto-start on logon.

---

## Architecture

```
Browser (SPA)
  └── static/index.html          ← single HTML shell
       ├── static/js/app.js      ← client router + shared utilities
       └── static/js/*.js        ← one file per module

FastAPI (main.py)
  ├── /static/*                  ← serves static files
  ├── /api/*                     ← 16 routers (~120 endpoints)
  │    └── routers/*.py
  ├── database.py                ← SQLite schema + migrations
  ├── business.py                ← recurring tasks, streaks, on-track logic
  └── data/life_tracker.db       ← SQLite database (auto-created)
```

**Key patterns:**
- No ORM — raw SQL throughout
- Client router: `registerPage(name, fn)` / `loadPage(name)` in `app.js`
- API wrapper: `apiFetch(method, path, body)` — prepends `/api`
- Smart date parser: `t` = today, `t+5` = in 5 days, `w` = next week, `m` = next month, or `mm/dd/yyyy`
- Theme and UI state persisted to `localStorage`

---

## Configuration (`config.py`)

| Setting | Value |
|---------|-------|
| `HOST` | `127.0.0.1` |
| `PORT` | `8000` |
| `DEBUG` | `True` (auto-reload) |
| `DB_PATH` | `data/life_tracker.db` |

---

## Modules

### Dashboard (`/dashboard`)

**File:** `static/js/dashboard.js` | **API:** `GET /api/dashboard`

Home page. Shows:
- Greeting + date
- Stats row: tasks due today, overdue, goals on track, upcoming tasks
- Today's tasks with quick-complete
- Active goals with progress bars and streaks
- Due metrics and milestones
- Habits with weekly completion dots
- Recent notes
- Optional trip filter (scopes stats to a specific trip)

---

### Tasks (`/tasks`)

**Files:** `static/js/tasks.js` | **API:** `/api/tasks`, `/api/recurrences`

Multi-list task manager with a persistent detail pane.

**Lists available:**
- Today (due today)
- Overdue
- Upcoming (next 7 days)
- By Tag
- By Goal
- By Trip

**Per-task fields:** title, notes, priority (high/medium/low), due date, tags, subtasks, linked goal, linked note, recurrence

**Recurrence cadences:** daily, weekly, monthly, custom interval. Tasks generate forward 14 days automatically on each fetch.

**Sort options:** due date, priority, created date, A–Z

**Smart date entry:** type `t`, `t+3`, `w`, `m`, or `mm/dd` in any due-date field.

---

### Goals (`/goals`)

**Files:** `static/js/goals.js` | **API:** `/api/goals`

Goal tracking with three goal types:

| Type | Use case |
|------|----------|
| **General** | Milestone-based goals with a target date |
| **Metric** | Numeric targets (e.g., weight, savings) with a current/target value |
| **Habit** | Recurring habits with weekly minute targets and minimum days per week |

**Per-goal sub-objects:**
- **Metrics** — numeric checkpoints with their own target dates
- **Milestones** — completion checkpoints with dates
- **Habits** — recurring activities; logged to compute streaks
- **Log entries** — time-series data for metrics and habits
- **Linked tasks** — tasks whose completion counts toward the goal

**Progress:** calculated automatically from log entries, completed milestones, and metric values. "On track" evaluated against weekly habit targets and overdue milestones.

**Streaks:** current streak (consecutive days with a log entry ending today) and best streak.

**Areas:** Health, Fitness, Work, Finance, Personal, Learning, Home, Social, Creative

---

### Notes (`/notes`)

**Files:** `static/js/notes.js` | **API:** `/api/notes`

Freeform note-taking with bidirectional links.

- Create/edit/delete notes with title + body
- Pin notes to top
- Tag notes (same tag system as tasks)
- Link a note to a goal (appears in that goal's detail view)
- Link a note to a trip (appears in that trip's Notes tab)
- Filter by tag or search by title/content
- Notes created from within a trip or task are automatically linked back

---

### Calendar (`/calendar`)

**Files:** `static/js/calendar.js` | **API:** `/api/calendar`

Two views:

**Month view** — 7-column grid with item pills per day. Clicking a day opens a side panel with full detail. Items shown: calendar events, tasks (by due date), goal milestones, goal metrics.

**Week view** — Time-blocked grid (7am–9pm) with an all-day row. Timed events are positioned by `start_time`. Click an empty slot to create an event pre-filled with that time.

**Event fields:** title, date, end date, all-day toggle, start/end time, notes, linked note, linked task

**Read-only items:** tasks, milestones, metrics, and trip itinerary entries appear on the calendar but are edited in their own modules.

**Navigation:** month/week toggle, prev/next arrows, Today button.

---

### Games (`/games`)

**Files:** `static/js/games.js` + 11 `games-*.js` files | **API:** `/api/games/scores`

Arcade hub with high-score tracking. Each game is a self-contained canvas module.

| Game | File | Description |
|------|------|-------------|
| Snake | `games-snake.js` | Grow the snake; fixed speed with 3-second countdown |
| Runner | `games-runner.js` | Endless dino-style runner; grayscale + goose character |
| Pong | `games-pong.js` | Classic paddle ball vs CPU; first to 7 wins |
| Space Invaders | `games-spaceinvaders.js` | 5 waves, scaling difficulty, UFO mystery ship, barriers |
| Tetris | `games-tetris.js` | Standard Tetris with ghost piece and next-piece preview |
| 2048 | `games-2048.js` | Slide tiles; keep going after reaching 2048 |
| Flappy Bird | `games-flappybird.js` | Tap/Space to flap through pipes; speed increases |
| Simon | `games-simon.js` | Colour sequence memory; speed increases each round |
| Number Recall | `games-numberrecall.js` | Memorise growing digit strings |
| Circle Dodger | `games-circledodger.js` | Mouse/WASD to dodge homing circles; survival time |
| Wall Jumper | `games-walljumper.js` | Jump between walls to clear scrolling bars |

High scores are stored per-game in `high_scores` table and displayed on each game card.

---

### Trip Planner (`/trips`)

**Files:** `static/js/trips.js`, `trips-packing.js`, `trips-budget.js`, `trips-itinerary.js`, `trips-templates.js`, `trips-notes.js`  
**API:** `/api/trips`, `/api/trips/{id}/packing`, `/api/trips/{id}/budget`, `/api/trips/{id}/itinerary`, `/api/packing-templates`

Self-contained trip workspace. The trips list groups trips into **Upcoming**, **Planning**, and **Past**.

**Core trip fields:** name, destination, start/end dates, status (Planning / In Progress / Completed), color label, attendees list

Each trip gets a dedicated **system tag** automatically — tasks and notes tagged with it link back to the trip.

#### Overview tab
Summary card with structured confirmation fields:
- Flight confirmation, Hotel confirmation, Car rental confirmation
- Address at destination, Emergency contact, Passport/ID notes
- Two user-defined custom fields

Below: quick stats (open tasks, budget remaining, packing progress, next itinerary entries). "Copy all" copies the confirmation card to clipboard.

#### Packing tab
Categories (default: Clothing, Toiletries, Electronics, Documents, Medication, Miscellaneous) with drag-reorderable items.

**Per item:** checkbox, name, quantity, "for" (attendee), optional note.

**Two modes:**
- **Edit mode** — build and refine the list
- **Pack mode** — categories collapse as items are checked; progress bar at top; double-tap to uncheck

**Templates:** reusable packing lists. Apply one or more templates to a new trip (copies items, doesn't link). After a trip, push changes back to the template. Items flagged `always_bring` are always included when that template is applied.

Templates also carry **suggested tasks** with auto-calculated due dates (e.g., "Book flights — 60 days before departure").

#### Tasks tab
Shows only tasks tagged to this trip, grouped into:
- **Do now** — due within 7 days or overdue
- **Before the trip** — due more than 7 days out but before departure
- **After departure** — due during or after the trip

All tasks are real tasks in the main Tasks module and appear in normal task lists.

#### Budget tab
Set a total budget + currency (display only, no conversion).

**Per expense:** amount, category (Flights, Accommodation, Food, Transport, Activities, Shopping, Other), date, description, who paid, phase (pre-trip / in-trip / post-trip), split among attendees.

**Views:**
- Summary bar: total budget → committed (pre-trip) → spent (in-trip) → remaining
- Category breakdown as horizontal bars
- Per-attendee split summary: what each person has been assigned vs. paid vs. net balance (owes / is owed)

#### Itinerary tab
Day-by-day planner across the full trip date range.

**Entry types:** Flight, Transit, Accommodation, Activity, Restaurant, Tour, Free time, Other

**Per entry:** title, type, start/end time, location, confirmation number, notes, attendee scope

Free time blocks display with a dashed border — intentional gaps, not empty space.

After the trip ends, each day gets a **journal text area** — the itinerary becomes a read-only travel log.

Itinerary entries appear on the main calendar during the trip date range (read-only, non-editable from calendar).

#### Notes tab
Notes scoped to this trip. Same as the main Notes module but filtered. Three note types with distinct visual treatment:
- **Research** (blue, magnifying glass) — pre-trip research
- **Confirmation/Info** (amber, document) — pasted confirmation details
- **Journal** (teal, pen) — written during or after the trip

Notes are bidirectional: a note can be linked to a trip from the main Notes module, and unlinked from either side.

---

### Settings (`/settings`)

**Files:** `static/js/settings.js` | **API:** `/api/settings`

Key-value settings stored in the `settings` table:
- Display name (used in greeting)
- Theme (light/dark — persisted to `localStorage` and applied immediately)

---

## Database Schema (26 tables)

### Core

| Table | Purpose |
|-------|---------|
| `settings` | Key-value app config |
| `tags` | Tag catalog; 8 system defaults (Health, Finance, Personal, Work, Learning, Home, Social, Errands); max 15 user tags |

### Tasks

| Table | Purpose |
|-------|---------|
| `tasks` | Task records (title, priority, due_date, status, links to goal/note/recurrence) |
| `task_tags` | M2M: tasks ↔ tags |
| `task_subtasks` | Checklist items within a task |
| `task_recurrences` | Recurrence rule templates (cadence, interval, days_of_week, etc.) |

### Goals

| Table | Purpose |
|-------|---------|
| `goals` | Goal records (type, area, status, progress_pct, is_on_track) |
| `goal_metrics` | Numeric checkpoints per goal |
| `goal_milestones` | Date-based checkpoints per goal |
| `goal_habits` | Recurring activity targets per goal |
| `goal_log_entries` | Time-series log data for goals/habits |
| `goal_task_log` | Tasks completed that count toward a goal |

### Notes & Calendar

| Table | Purpose |
|-------|---------|
| `notes` | Note records (title, content, pinned, links to goal/trip) |
| `note_tags` | M2M: notes ↔ tags |
| `events` | Calendar events (all-day or timed, can span days, links to note/task) |

### Games

| Table | Purpose |
|-------|---------|
| `high_scores` | Per-game high score records |

### Trips

| Table | Purpose |
|-------|---------|
| `trips` | Trip records (dates, status, color, confirmation fields, budget) |
| `trip_attendees` | People on the trip; one flagged `is_me` |
| `packing_categories` | Packing list categories per trip |
| `packing_items` | Items within categories (qty, checked, for_attendee) |
| `packing_templates` | Reusable packing list templates |
| `template_categories` | Categories within a template |
| `template_items` | Items within a template category (`always_bring` flag) |
| `template_suggested_tasks` | Pre-trip task suggestions with `days_before_departure` |
| `budget_expenses` | Trip expenses (phase, category, paid_by) |
| `budget_splits` | Per-attendee expense splits |
| `itinerary_entries` | Day-level activities/flights/hotels (times, location, confirmation #) |
| `itinerary_day_notes` | Day-level journal entries for post-trip log |

---

## API Summary

All endpoints are under `/api/`. Full path = prefix + route.

| Router | Prefix | Key endpoints |
|--------|--------|---------------|
| tasks | `/api/tasks` | CRUD + `/today`, `/upcoming`, `/{id}/complete`, `/{id}/subtasks` |
| goals | `/api/goals` | CRUD + `/items`, `/{id}/log`, `/{id}/milestones`, `/{id}/metrics`, `/{id}/habits` |
| notes | `/api/notes` | CRUD + search/filter by tag, trip, goal |
| tags | `/api/tags` | CRUD (max 15 user tags) |
| calendar | `/api/calendar` | `/month`, `/week`, `/day`, `/events` CRUD |
| recurrences | `/api/recurrences` | CRUD + `/generate` |
| dashboard | `/api/dashboard` | `GET /` (aggregated home data) |
| settings | `/api/settings` | `GET /`, `PATCH /` |
| games | `/api/games` | `/scores` GET + POST |
| trips | `/api/trips` | CRUD + `/overview`, `/{id}/attendees` CRUD |
| packing | `/api/trips/{id}/packing` | Categories + items CRUD, template apply/push |
| budget | `/api/trips/{id}/budget` | Expenses CRUD + summary |
| itinerary | `/api/trips/{id}/itinerary` | Entries CRUD + `/day-notes` |
| packing_templates | `/api/packing-templates` | Templates + categories + items + suggested tasks CRUD |

---

## Frontend Utilities (`app.js`)

Shared helpers available globally:

| Function | Description |
|----------|-------------|
| `apiFetch(method, path, body)` | Fetch wrapper; prepends `/api`; throws on non-2xx |
| `registerPage(name, fn)` | Register a page handler for the client router |
| `loadPage(name)` | Navigate to a page (updates URL + nav highlight) |
| `parseSmartDate(str)` | Parse `t`, `t+N`, `w`, `m`, `y`, or `mm/dd` → ISO date string |
| `escHtml(str)` | HTML-escape for safe innerHTML insertion |
| `formatDate(iso)` | Human-friendly date display |
| `animateProgress(el, pct)` | Animate a `.progress-fill` element to a percentage |

---

## File Tree

```
LifeTracker/
├── main.py                     ← FastAPI app + router registration
├── config.py                   ← Host/port/DB path
├── database.py                 ← Schema + migrations (26 tables)
├── business.py                 ← Recurring tasks, streaks, on-track
├── requirements.txt
├── start.pyw                   ← Silent Windows launcher
├── setup_task_scheduler.bat    ← Windows auto-start registration
├── models/
│   ├── tasks.py
│   ├── goals.py
│   └── trips.py
├── routers/
│   ├── tasks.py
│   ├── goals.py
│   ├── notes.py
│   ├── tags.py
│   ├── calendar.py
│   ├── recurrences.py
│   ├── dashboard.py
│   ├── settings.py
│   ├── games.py
│   ├── trips.py
│   ├── packing.py
│   ├── budget.py
│   ├── itinerary.py
│   └── packing_templates.py
├── static/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js              ← Router + shared utils
│       ├── dashboard.js
│       ├── tasks.js
│       ├── goals.js
│       ├── notes.js
│       ├── calendar.js
│       ├── settings.js
│       ├── games.js            ← Game hub shell
│       ├── games-snake.js
│       ├── games-runner.js
│       ├── games-pong.js
│       ├── games-spaceinvaders.js
│       ├── games-tetris.js
│       ├── games-2048.js
│       ├── games-flappybird.js
│       ├── games-simon.js
│       ├── games-numberrecall.js
│       ├── games-circledodger.js
│       ├── games-walljumper.js
│       ├── trips.js
│       ├── trips-packing.js
│       ├── trips-budget.js
│       ├── trips-itinerary.js
│       ├── trips-templates.js
│       └── trips-notes.js
└── data/
    └── life_tracker.db         ← SQLite database (auto-created)
```
