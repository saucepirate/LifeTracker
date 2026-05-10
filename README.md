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
  ├── /api/*                     ← 18 routers (~150 endpoints)
  │    └── routers/*.py
  ├── database.py                ← SQLite schema + migrations (46 tables)
  ├── business.py                ← recurring tasks, streaks, on-track logic
  └── data/life_tracker.db       ← SQLite database (auto-created)
```

**Key patterns:**
- No ORM — raw SQL throughout
- Client router: `registerPage(name, fn)` / `loadPage(name)` in `app.js`
- API wrapper: `apiFetch(method, path, body)` — prepends `/api`
- Smart date parser: `t` = today, `t+5` = in 5 days, `w` = next week, `m` = next month, `mm/dd` or `m/d` = current year assumed; case-insensitive
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

**Smart date entry:** type `t`, `t+3`, `w`, `m`, `mm/dd`, or `m/d` in any due-date field; year defaults to current if omitted.

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

**Week view** — Time-blocked grid (7am–9pm) with an all-day row. Timed events are positioned by `start_time`. Click an empty slot to create an event pre-filled with that time. Events display inline edit (✎) and delete (✕) buttons. Short slots (≤32px height) show title only with no time row.

**Event fields:** title, date, end date, all-day toggle, start/end time, notes, linked note, linked task

**Read-only items:** tasks, milestones, metrics, and trip itinerary entries appear on the calendar but are edited in their own modules.

**Navigation:** month/week toggle, prev/next arrows, Today button.

---

### Finance (`/finance`)

**Files:** `static/js/finance.js` | **API:** `/api/finance`

Personal finance dashboard with seven tabs.

#### Overview tab
- Net worth summary (assets − liabilities)
- Spending breakdown for the current month by category (bar chart)
- Categorized spending totals with color-coded category badges
- Recent transactions list

#### Transactions tab
- Full transaction history with search and filter by account, category, date range
- Manual transaction entry
- Inline category assignment and notes editing
- Mark as transfer to exclude from spending totals
- Bulk reclassify: re-run auto-classification rules on all uncategorized transactions

#### Import tab (Reconcile)
- Upload CSV files exported from Fidelity, Chase, or generic bank format
- Auto-detects format; parses date, description, amount, memo, MCC
- Deduplicates against existing transactions (same account + date + amount + name)
- Auto-classifies via merchant/MCC rules on import
- Reconciliation queue: review unclassified transactions one at a time, assign category, optionally create a merchant or MCC rule for future imports

#### Income tab
- Define recurring income sources with amount and frequency (monthly, biweekly, weekly, annual, one-time)
- Active/inactive toggle; date ranges for seasonal income
- 12-month income history chart derived from actual transaction data when available

#### Wealth tab
- **Holdings** — track investments: stock, ETF, crypto, real estate, private equity, bonds, cash. Value = manual entry, or shares × current price, or cost basis fallback. Optional account linkage.
- **Liabilities** — track debts: loan, credit card, mortgage, student loan, line of credit. Tracks principal, current balance, interest rate, payment schedule, lender.
- **Financial Goals** — savings/debt-payoff/investment/retirement/emergency goals with target amount, current amount, and optional target date. Progress bar auto-calculated.
- Net worth breakdown: liquid assets, investments, other assets, total liabilities

#### Manage tab
- **Accounts** — bank/brokerage accounts used to bucket transactions. Types: checking, credit, savings, brokerage, cash, other.
- **Categories** — spending categories with color + icon. Flags: `is_income`, `is_savings`, `is_excluded` (excluded from spend totals). Drag-reorderable.
- **Rules** — auto-classification rules. Type `merchant` (substring match on transaction name) or `mcc` (exact MCC code match). Priority-ordered; higher priority wins. User rules default to priority 10; system defaults to 0.
- **Import History** — log of past CSV imports with counts of inserted/classified/skipped rows. Deletable.

#### Investments tab

**Files:** `static/js/investments.js` | **API:** `/api/investments`

Portfolio tracker built around Fidelity CSV exports. Five sub-views:

**Overview**
- KPI cards: Portfolio Value, Total Gain/Loss, Total Return, Net Invested
- Contributions vs Gains stacked bar
- Per-account breakdown cards (all-accounts view)
- Top performers / underperformers
- Benchmark comparison panel (money-weighted return vs S&P 500 equivalent)
- Performance chart: cumulative invested step line (cyan), estimated value trend (dashed green, shares × current price), snapshot dots (solid green)

**Holdings**
- Sortable table of all positions: symbol, description, account, shares, avg cost, price, cost basis, value, G/L $, G/L %, portfolio %
- Group-by-account toggle; concentration bar under each % column

**Activity**
- Full buy/sell/dividend history; filter by symbol, account, action type
- Group-by-symbol DCA view: avg cost, # buys, total invested, G/L % per symbol

**Analysis**
- Donut chart of portfolio allocation (top holdings + Others bucket)
- Money-weighted benchmark comparison table
- DCA performance table (symbols with ≥2 buys)
- Auto-generated insights: concentration warnings, heavy losers, benchmark beat/miss, ETF/stock mix

**Notes**
- Per-symbol investment notes with types: Thesis, Action, Watchlist, General
- Grouped by symbol; inline edit and delete

**Import modal** — three import types:
- `Portfolio_Positions_*.csv` — Fidelity positions export (snapshot import; all snapshots retained for history chart)
- `Accounts_History*.csv` — Fidelity account history (buy/sell/dividend orders; UNIQUE constraint deduplicates on re-import)
- SP500 CSV (`observation_date, SP500`) — S&P 500 historical data for benchmark comparison

**Cost basis calculation** — hybrid approach: cash-flow math (buys − sells − dividends) for symbols with order history; Fidelity `cost_basis_total` fallback for others. Money market funds (SPAXX, NAV ≈ $1.00) are always excluded from order-based math to prevent deposit/withdrawal noise from inflating "invested" totals.

**Account filter** — persistent pill bar (All Accounts + per-account) scopes Overview and Analysis to a single account.

---

#### Planning tab
Multi-decade financial projection with stacked area chart.

**Inputs:**
- Projected monthly income (derived from 12-month transaction trend via log-linear regression; falls back to income sources)
- Monthly spend, target retirement age, years forward
- Annual return %, inflation %, invested %
- Advanced: annual raise %, salary cap, % of raise saved

**Preset modes:** Conservative / Balanced / Optimistic — affects glide path (stock/bond allocation by age), expected return, and FIRE multiple (30×, 28.57×, 25×).

**Projection model:**
- Month-by-month loop tracking `investNW`, `cashNW`, and illiquid `otherNW` separately
- Inflation applied to spending annually
- Annual salary raises with optional cap and configurable savings fraction of raise
- Post-retirement: income stops, pure spend drawdown begins
- Monthly rebalancing: liquid NW above `min_cash_balance` floor is always snapped to target `invested %`
- One-time and **recurring expenditures** (e.g., mortgage) deducted in the month they apply; recurring expenditures modeled in the curve but not shown as chart markers

**Chart:** stacked area — cyan = cumulative contributions, green = cumulative investment gains, white line = total NW. Vertical markers: purple = FIRE year, amber = $1M year, green dashed = crossover year (when monthly returns first exceed monthly income), red dashed = one-time expenditures.

**KPI cards:** Crossover Year, FIRE Progress, Retire Year, Savings Rate — each with an actionable sub-line.

**Expenditures:** planned large expenses that reduce NW in the projection. Supports one-time and recurring (monthly, quarterly, semi-annual, or custom interval) with optional end date.

---

### Projects (`/projects`)

**Files:** `static/js/projects.js` | **API:** `/api/projects`

Multi-milestone project tracker. Projects appear as cards on the list view and open a tabbed detail view.

**Project fields:** title, description, color (8 options), status (active/paused/completed/cancelled), start date, deadline, linked goal, ongoing flag, owners/collaborators list (name + role)

**Health indicator** — auto-computed badge shown on the project header:
- **Overdue** — final deadline in the past
- **Blocked** — any task has `blocked` status
- **At risk** — overdue milestone, or <50% done with ≤14 days to deadline
- **On track** — otherwise; tooltip shows next milestone or days remaining

#### Overview tab
- Milestone sections: each milestone has a check node (click to toggle complete), mini progress bar, task tally, date badge (future/soon/overdue/done)
- Tasks within each milestone: checkbox (mark done/undo), type icon, priority dot, chips for due date/assignee/cost
- **Quick-add**: press Enter in the inline input at the bottom of any section to create a task instantly
- **Owner filter** — pill bar appears when project has owners/collaborators; filters task lists by person or "Unassigned"
- Completed tasks collapsed by default; show/hide with a pill button
- Sidebar: final deadline card, next action card, upcoming dated items

#### Timeline tab
Monthly-grouped list of all dated milestones, tasks, and the final deadline. Milestones highlighted with a left cyan border. Past items marked overdue in red; completed items struck through.

#### Budget tab
- KPI cards: Estimated / Actual / Remaining
- Progress bar (budget spend %)
- Per-milestone cost breakdown table with per-task estimated and actual costs
- "+ Add actual" button on tasks that have an estimate but no recorded actual cost

#### Notes tab
- Full rich-text note editor (Quill) embedded in the project detail view — same formatting as the main Notes module
- Bullet points, ordered lists, headings, bold/italic/underline, hyperlinks (Ctrl+K), blockquotes
- Auto-saves 1.2 s after last keystroke
- Click any note card to open it in the editor; "← Notes" returns to the list
- Notes are bidirectional: also accessible from the main Notes module filtered by project

**Per-task fields:** title, type (todo/research/purchase/event), priority, status, due date, assigned to (dropdown from project people), milestone, estimated cost, actual cost, notes

**Modals:** Add/edit project, add milestone, add task (full form), edit task (full form with status change)

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

Short time blocks (< 30 min) display in a compact single-line format. Free time blocks display with a dashed border — intentional gaps, not empty space.

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

## Database Schema (46 tables)

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

### Projects

| Table | Purpose |
|-------|---------|
| `projects` | Project records (title, description, color, status, start_date, deadline, goal_id, is_ongoing) |
| `project_owners` | Owners/collaborators per project (name, role) |
| `project_milestones` | Milestones with due_date, status, is_deliverable, sort_order, completed_at |
| `project_tasks` | Tasks within a project (milestone_id, status, priority, task_type, due_date, assigned_to, estimated_cost, actual_cost, notes) |

### Notes & Calendar

| Table | Purpose |
|-------|---------|
| `notes` | Note records (title, content, pinned, links to goal/trip/project) |
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

### Finance

| Table | Purpose |
|-------|---------|
| `finance_accounts` | Bank/brokerage accounts (type, institution, active flag) |
| `finance_categories` | Spending categories (color, icon, is_income, is_savings, is_excluded, sort_order) |
| `finance_category_rules` | Auto-classification rules (merchant substring or MCC code, priority) |
| `finance_transactions` | Transaction records (date, name, amount, memo, MCC, category, is_transfer, import_id) |
| `finance_income_sources` | Recurring income entries (amount, frequency, date range) |
| `finance_holdings` | Investment/asset holdings (symbol, shares, price, cost_basis, or direct value) |
| `finance_liabilities` | Debts (kind, principal, balance, interest_rate, payment schedule, lender) |
| `finance_goals` | Financial goals (kind, target_amount, current_amount, target_date) |
| `finance_plan_expenditures` | Planned large expenses for projection modeling (one-time or recurring) |
| `finance_imports` | CSV import log (filename, account, inserted/classified/skipped counts) |

### Investments

| Table | Purpose |
|-------|---------|
| `inv_imports` | Import log for positions, orders, and SP500 uploads (type, filename, row count) |
| `inv_positions` | Holdings snapshot per import (symbol, quantity, price, value, gain, cost basis) |
| `inv_orders` | Buy/sell/dividend order history; UNIQUE on (date, account, symbol, quantity, amount) |
| `inv_sp500` | S&P 500 daily closing values; primary key on `observation_date` (upsert on re-import) |
| `inv_notes` | Per-symbol investment notes (type: thesis/action/watchlist/general) |

---

## API Summary

All endpoints are under `/api/`. Full path = prefix + route.

| Router | Prefix | Key endpoints |
|--------|--------|---------------|
| tasks | `/api/tasks` | CRUD + `/today`, `/upcoming`, `/{id}/complete`, `/{id}/subtasks` |
| goals | `/api/goals` | CRUD + `/items`, `/{id}/log`, `/{id}/milestones`, `/{id}/metrics`, `/{id}/habits` |
| projects | `/api/projects` | Projects CRUD + `/{id}/milestones` CRUD + `/{id}/tasks` CRUD |
| notes | `/api/notes` | CRUD + search/filter by tag, trip, goal, project |
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
| finance | `/api/finance` | Accounts, categories, rules, transactions, import, income, holdings, liabilities, goals, planning CRUD + `/import`, `/reconcile`, `/planning/assumptions`, `/planning/expenditures` |
| investments | `/api/investments` | `/import/positions`, `/import/orders`, `/import/sp500`, `/imports` GET+DELETE, `/positions`, `/orders`, `/sp500`, `/accounts`, `/portfolio-history`, `/notes` CRUD |

---

## Frontend Utilities (`app.js`)

Shared helpers available globally:

| Function | Description |
|----------|-------------|
| `apiFetch(method, path, body)` | Fetch wrapper; prepends `/api`; throws on non-2xx |
| `registerPage(name, fn)` | Register a page handler for the client router |
| `loadPage(name)` | Navigate to a page (updates URL + nav highlight) |
| `parseSmartDate(str)` | Parse `t`, `t+N`, `w`, `m`, `y`, `mm/dd`, `m/d` → ISO date string; year defaults to current; case-insensitive |
| `escHtml(str)` | HTML-escape for safe innerHTML insertion |
| `formatDate(iso)` | Human-friendly date display |
| `animateProgress(el, pct)` | Animate a `.progress-fill` element to a percentage |

---

## File Tree

```
LifeTracker/
├── main.py                     ← FastAPI app + router registration
├── config.py                   ← Host/port/DB path
├── database.py                 ← Schema + migrations (37 tables)
├── business.py                 ← Recurring tasks, streaks, on-track
├── requirements.txt
├── start.pyw                   ← Silent Windows launcher
├── setup_task_scheduler.bat    ← Windows auto-start registration
├── models/
│   ├── tasks.py
│   ├── goals.py
│   ├── projects.py
│   ├── trips.py
│   ├── finance.py
│   └── investments.py
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
│   ├── projects.py
│   ├── trips.py
│   ├── packing.py
│   ├── budget.py
│   ├── itinerary.py
│   ├── packing_templates.py
│   ├── finance.py
│   └── investments.py
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
│       ├── projects.js
│       ├── finance.js
│       ├── investments.js
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
