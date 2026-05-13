import sqlite3
import os
import json
import config


def get_connection():
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    conn = get_connection()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT 'teal',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_recurrences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            priority TEXT NOT NULL DEFAULT 'medium',
            goal_id INTEGER REFERENCES goals(id),
            cadence TEXT NOT NULL,
            interval_value INTEGER DEFAULT 1,
            days_of_week TEXT,
            day_of_month INTEGER,
            tag_ids TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            last_generated_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            area TEXT,
            goal_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            target_date TEXT,
            start_value REAL,
            target_value REAL,
            current_value REAL,
            unit TEXT,
            weekly_target_minutes INTEGER,
            min_days_per_week INTEGER,
            progress_pct REAL DEFAULT 0,
            is_on_track INTEGER DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            priority TEXT NOT NULL DEFAULT 'medium',
            due_date TEXT,
            completed_at TEXT,
            is_recurring INTEGER NOT NULL DEFAULT 0,
            recurrence_id INTEGER REFERENCES task_recurrences(id),
            goal_id INTEGER REFERENCES goals(id),
            trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_tags (
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS task_subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS goal_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            target_date TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS goal_log_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            logged_at TEXT NOT NULL DEFAULT (datetime('now')),
            value REAL,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS goal_on_track_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL UNIQUE REFERENCES goals(id) ON DELETE CASCADE,
            weekly_target_minutes INTEGER,
            min_days_per_week INTEGER,
            lookback_days INTEGER DEFAULT 7,
            milestones_required_by_date TEXT
        );

        CREATE TABLE IF NOT EXISTS goal_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            label TEXT NOT NULL DEFAULT 'Target',
            start_value REAL DEFAULT 0,
            current_value REAL,
            target_value REAL,
            unit TEXT,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS goal_habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            label TEXT NOT NULL DEFAULT 'Habit',
            weekly_target_minutes INTEGER,
            min_days_per_week INTEGER,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS goal_task_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            completed_at TEXT NOT NULL,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            end_date TEXT,
            all_day INTEGER NOT NULL DEFAULT 1,
            start_time TEXT,
            end_time TEXT,
            notes TEXT,
            tag_ids TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            pinned INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS high_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            achieved_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            media_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'want',
            rating INTEGER,
            notes TEXT,
            author_or_creator TEXT,
            genre TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            destination TEXT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Planning',
            color TEXT NOT NULL DEFAULT 'blue',
            tag_id INTEGER REFERENCES tags(id),
            flight_confirmation TEXT,
            hotel_confirmation TEXT,
            car_rental TEXT,
            address TEXT,
            emergency_contact TEXT,
            passport_notes TEXT,
            custom_field_1_label TEXT,
            custom_field_1_value TEXT,
            custom_field_2_label TEXT,
            custom_field_2_value TEXT,
            budget_total REAL,
            budget_currency TEXT NOT NULL DEFAULT 'USD',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trip_attendees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            is_me INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS packing_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            list_type TEXT NOT NULL DEFAULT 'personal',
            for_attendee_id INTEGER REFERENCES trip_attendees(id) ON DELETE SET NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS packing_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS packing_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES packing_categories(id) ON DELETE CASCADE,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            checked INTEGER NOT NULL DEFAULT 0,
            for_attendee_id INTEGER REFERENCES trip_attendees(id) ON DELETE SET NULL,
            note TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS packing_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS template_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL REFERENCES packing_templates(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS template_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_category_id INTEGER NOT NULL REFERENCES template_categories(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            always_bring INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS template_suggested_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL REFERENCES packing_templates(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            priority TEXT NOT NULL DEFAULT 'medium',
            days_before_departure INTEGER,
            notes TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS budget_expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            category TEXT NOT NULL DEFAULT 'Other',
            description TEXT,
            expense_date TEXT,
            paid_by TEXT NOT NULL DEFAULT 'shared',
            phase TEXT NOT NULL DEFAULT 'in_trip',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS budget_splits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            expense_id INTEGER NOT NULL REFERENCES budget_expenses(id) ON DELETE CASCADE,
            attendee_id INTEGER NOT NULL REFERENCES trip_attendees(id) ON DELETE CASCADE,
            amount REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS itinerary_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
            entry_date TEXT NOT NULL,
            entry_type TEXT NOT NULL DEFAULT 'Activity',
            title TEXT NOT NULL,
            start_time TEXT,
            end_time TEXT,
            location TEXT,
            confirmation_number TEXT,
            notes TEXT,
            attendee_scope TEXT NOT NULL DEFAULT 'all',
            sort_order INTEGER NOT NULL DEFAULT 0,
            journal_note TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    _seed(c)
    # Migration: add habit_id to goal_log_entries
    try:
        conn.execute("ALTER TABLE goal_log_entries ADD COLUMN habit_id INTEGER")
    except Exception:
        pass
    # Migration: add note_id to tasks
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN note_id INTEGER REFERENCES notes(id)")
    except Exception:
        pass
    # Migration: add goal_id to notes
    try:
        conn.execute("ALTER TABLE notes ADD COLUMN goal_id INTEGER REFERENCES goals(id)")
    except Exception:
        pass
    # Migration: add pinned to goals
    try:
        conn.execute("ALTER TABLE goals ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: add completed to goal_metrics
    try:
        conn.execute("ALTER TABLE goal_metrics ADD COLUMN completed INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: add completed_at to goal_metrics
    try:
        conn.execute("ALTER TABLE goal_metrics ADD COLUMN completed_at TEXT")
    except Exception:
        pass
    # Migration: add metric_id to goal_milestones (deprecated, kept for compat)
    try:
        conn.execute("ALTER TABLE goal_milestones ADD COLUMN metric_id INTEGER REFERENCES goal_metrics(id)")
    except Exception:
        pass
    # Migration: add milestone_id to goal_metrics (replaces metric_id on milestones)
    try:
        conn.execute("ALTER TABLE goal_metrics ADD COLUMN milestone_id INTEGER REFERENCES goal_milestones(id)")
    except Exception:
        pass
    # Migration: add target_date to goal_metrics
    try:
        conn.execute("ALTER TABLE goal_metrics ADD COLUMN target_date TEXT")
    except Exception:
        pass
    # Migration: add note_id to events
    try:
        conn.execute("ALTER TABLE events ADD COLUMN note_id INTEGER REFERENCES notes(id)")
    except Exception:
        pass
    # Migration: add task_id to events
    try:
        conn.execute("ALTER TABLE events ADD COLUMN task_id INTEGER REFERENCES tasks(id)")
    except Exception:
        pass
    # Migration: add end_date to task_recurrences
    try:
        conn.execute("ALTER TABLE task_recurrences ADD COLUMN end_date TEXT")
    except Exception:
        pass
    # Migration: add is_system to tags
    try:
        conn.execute("ALTER TABLE tags ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: add trip_id to notes
    try:
        conn.execute("ALTER TABLE notes ADD COLUMN trip_id INTEGER REFERENCES trips(id)")
    except Exception:
        pass
    # Migration: add itinerary_day_notes table
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS itinerary_day_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                entry_date TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                UNIQUE(trip_id, entry_date)
            )
        """)
    except Exception:
        pass
    # Migration: add is_pinned to goal_milestones
    try:
        conn.execute("ALTER TABLE goal_milestones ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: add is_highlighted to trips
    try:
        conn.execute("ALTER TABLE trips ADD COLUMN is_highlighted INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: add is_pinned to goal_metrics
    try:
        conn.execute("ALTER TABLE goal_metrics ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass
    # Migration: recurrence support on events
    for ddl in [
        "ALTER TABLE events ADD COLUMN recurrence_cadence TEXT",
        "ALTER TABLE events ADD COLUMN recurrence_interval INTEGER DEFAULT 1",
        "ALTER TABLE events ADD COLUMN recurrence_days_of_week TEXT",
        "ALTER TABLE events ADD COLUMN recurrence_until TEXT",
        "ALTER TABLE events ADD COLUMN tag_id INTEGER REFERENCES tags(id)",
    ]:
        try:
            conn.execute(ddl)
        except Exception:
            pass
    # Migration: tag_id on day plan items
    try:
        conn.execute("ALTER TABLE day_plan_items ADD COLUMN tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: link day plan items to calendar events
    try:
        conn.execute("ALTER TABLE day_plan_items ADD COLUMN cal_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: recurring event exceptions (single-instance deletions)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS event_exceptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                exception_date TEXT NOT NULL,
                UNIQUE(event_id, exception_date)
            )""")
    except Exception:
        pass
    # Migration: actual_cost on project_tasks
    try:
        conn.execute("ALTER TABLE project_tasks ADD COLUMN actual_cost REAL")
    except Exception:
        pass
    # Migration: project_id on notes
    try:
        conn.execute("ALTER TABLE notes ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: project_id on trips
    try:
        conn.execute("ALTER TABLE trips ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: trip_id on projects
    try:
        conn.execute("ALTER TABLE projects ADD COLUMN trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: trip_id on tasks
    try:
        conn.execute("ALTER TABLE tasks ADD COLUMN trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL")
    except Exception:
        pass
    # Migration: list_id on packing_categories
    try:
        conn.execute("ALTER TABLE packing_categories ADD COLUMN list_id INTEGER REFERENCES packing_lists(id) ON DELETE CASCADE")
    except Exception:
        pass
    # Migration: owner_type on packing_items
    try:
        conn.execute("ALTER TABLE packing_items ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'all_travelers'")
    except Exception:
        pass
    # Migration: owner_type on template_items
    try:
        conn.execute("ALTER TABLE template_items ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'all_travelers'")
    except Exception:
        pass
    # Migration: icon and filter fields on packing_templates
    try:
        conn.execute("ALTER TABLE packing_templates ADD COLUMN icon TEXT NOT NULL DEFAULT '📋'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE packing_templates ADD COLUMN filter_trip_type TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE packing_templates ADD COLUMN filter_destination TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE packing_templates ADD COLUMN filter_length TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass
    # Migration: source lineage and filter metadata on templates
    try:
        conn.execute("ALTER TABLE packing_templates ADD COLUMN source_id TEXT")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE project_templates ADD COLUMN source_id TEXT")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE project_templates ADD COLUMN filter_trip_type TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE project_templates ADD COLUMN filter_destination TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE project_templates ADD COLUMN filter_length TEXT NOT NULL DEFAULT 'any'")
    except Exception:
        pass

    # Finance tables
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS finance_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'credit',
            institution TEXT,
            notes TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT 'blue',
            icon TEXT,
            is_income INTEGER NOT NULL DEFAULT 0,
            is_savings INTEGER NOT NULL DEFAULT 0,
            is_default INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS finance_category_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL REFERENCES finance_categories(id) ON DELETE CASCADE,
            rule_type TEXT NOT NULL,
            pattern TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            is_default INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS finance_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER REFERENCES finance_accounts(id) ON DELETE SET NULL,
            date TEXT NOT NULL,
            name TEXT NOT NULL,
            memo TEXT,
            amount REAL NOT NULL,
            mcc TEXT,
            category_id INTEGER REFERENCES finance_categories(id) ON DELETE SET NULL,
            user_classified INTEGER NOT NULL DEFAULT 0,
            is_transfer INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            raw_row TEXT,
            imported_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_income_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            frequency TEXT NOT NULL DEFAULT 'monthly',
            start_date TEXT,
            end_date TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_holdings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER REFERENCES finance_accounts(id) ON DELETE SET NULL,
            symbol TEXT,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'stock',
            shares REAL,
            cost_basis REAL,
            current_price REAL,
            notes TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'savings',
            target_amount REAL NOT NULL,
            current_amount REAL NOT NULL DEFAULT 0,
            target_date TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_plan_expenditures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            amount REAL NOT NULL,
            expected_date TEXT,
            notes TEXT,
            is_recurring INTEGER NOT NULL DEFAULT 0,
            recurrence_months INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_liabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'loan',
            principal REAL,
            current_balance REAL NOT NULL DEFAULT 0,
            interest_rate REAL,
            payment_amount REAL,
            payment_frequency TEXT,
            next_payment_date TEXT,
            lender TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS finance_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            account_id INTEGER REFERENCES finance_accounts(id) ON DELETE SET NULL,
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            inserted_count INTEGER NOT NULL DEFAULT 0,
            classified_count INTEGER NOT NULL DEFAULT 0,
            unclassified_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_fintx_date ON finance_transactions(date);
        CREATE INDEX IF NOT EXISTS idx_fintx_cat  ON finance_transactions(category_id);
        CREATE INDEX IF NOT EXISTS idx_finrules_pattern ON finance_category_rules(rule_type, pattern);

        CREATE TABLE IF NOT EXISTS inv_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type TEXT NOT NULL,
            filename TEXT,
            imported_at TEXT NOT NULL DEFAULT (datetime('now')),
            row_count INTEGER NOT NULL DEFAULT 0,
            summary TEXT
        );

        CREATE TABLE IF NOT EXISTS inv_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id INTEGER NOT NULL REFERENCES inv_imports(id) ON DELETE CASCADE,
            account_number TEXT,
            account_name TEXT,
            symbol TEXT NOT NULL,
            description TEXT,
            quantity REAL,
            last_price REAL,
            current_value REAL,
            today_gain_dollar REAL,
            today_gain_pct REAL,
            total_gain_dollar REAL,
            total_gain_pct REAL,
            pct_of_account REAL,
            cost_basis_total REAL,
            avg_cost_basis REAL,
            security_type TEXT
        );

        CREATE TABLE IF NOT EXISTS inv_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id INTEGER REFERENCES inv_imports(id) ON DELETE SET NULL,
            run_date TEXT NOT NULL,
            account_name TEXT,
            account_number TEXT,
            action_type TEXT NOT NULL,
            action_raw TEXT,
            symbol TEXT,
            description TEXT,
            security_type TEXT,
            price REAL,
            quantity REAL,
            amount REAL,
            settlement_date TEXT,
            UNIQUE(run_date, account_number, symbol, quantity, amount)
        );

        CREATE TABLE IF NOT EXISTS inv_sp500 (
            observation_date TEXT PRIMARY KEY,
            value REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS inv_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            note_type TEXT NOT NULL DEFAULT 'general',
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS inv_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT,
            account_number TEXT,
            action_type TEXT NOT NULL DEFAULT 'review',
            title TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            due_date TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    # Migrations for added columns (safe on fresh + existing DBs)
    for ddl in [
        "ALTER TABLE finance_holdings ADD COLUMN value REAL",
        "ALTER TABLE finance_transactions ADD COLUMN import_id INTEGER REFERENCES finance_imports(id) ON DELETE SET NULL",
        "ALTER TABLE finance_categories ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE finance_plan_expenditures ADD COLUMN recurrence_end_date TEXT",
    ]:
        try:
            conn.execute(ddl)
        except Exception:
            pass

    # One-time backfill: link pre-existing transactions to a synthetic "legacy" import
    # so the user can roll them back through the Import History UI. Only runs once.
    try:
        flag = conn.execute("SELECT value FROM settings WHERE key = 'finance_legacy_backfilled'").fetchone()
        if not flag:
            null_count = conn.execute(
                "SELECT COUNT(*) FROM finance_transactions WHERE import_id IS NULL"
            ).fetchone()[0]
            if null_count > 0:
                cur = conn.execute(
                    """INSERT INTO finance_imports (filename, inserted_count, classified_count,
                                                    unclassified_count, skipped_count, summary)
                       VALUES (?, ?, 0, 0, 0, ?) RETURNING id""",
                    (
                        'legacy-import (pre-tracking).csv',
                        null_count,
                        'Synthesized so you can roll back transactions imported before import history existed.'
                    )
                )
                legacy_id = cur.fetchone()[0]
                conn.execute(
                    "UPDATE finance_transactions SET import_id = ? WHERE import_id IS NULL",
                    (legacy_id,)
                )
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('finance_legacy_backfilled', '1')"
            )
    except Exception:
        pass
    _seed_finance(conn)

    # One-time: mark Credit Card Payment as excluded from totals by default
    try:
        flag = conn.execute("SELECT value FROM settings WHERE key='fin_cc_payment_excluded'").fetchone()
        if not flag:
            conn.execute("UPDATE finance_categories SET is_excluded=1 WHERE name='Credit Card Payment'")
            conn.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('fin_cc_payment_excluded','1')")
    except Exception:
        pass

    # Day Planner tables
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS day_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_date TEXT NOT NULL,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'manual',
            source_id INTEGER,
            section TEXT NOT NULL DEFAULT 'later',
            start_time TEXT,
            end_time TEXT,
            duration_minutes INTEGER,
            sort_order INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'planned',
            priority TEXT NOT NULL DEFAULT 'medium',
            notes TEXT,
            goal_id INTEGER,
            task_id INTEGER,
            habit_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS day_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_date TEXT NOT NULL UNIQUE,
            morning_plan TEXT NOT NULL DEFAULT '',
            evening_reflection TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_day_items_date ON day_plan_items(plan_date);

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            color TEXT NOT NULL DEFAULT 'cyan',
            status TEXT NOT NULL DEFAULT 'active',
            start_date TEXT,
            deadline TEXT,
            goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
            trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
            is_ongoing INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS project_owners (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner'
        );

        CREATE TABLE IF NOT EXISTS project_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            due_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            is_deliverable INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS project_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            milestone_id INTEGER REFERENCES project_milestones(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            task_type TEXT NOT NULL DEFAULT 'todo',
            due_date TEXT,
            assigned_to TEXT,
            estimated_cost REAL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS project_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT '📋',
            description TEXT,
            color TEXT NOT NULL DEFAULT 'cyan',
            is_ongoing INTEGER NOT NULL DEFAULT 0,
            milestones TEXT NOT NULL DEFAULT '[]',
            tasks TEXT NOT NULL DEFAULT '[]',
            note_title TEXT,
            note_content TEXT,
            source_id TEXT,
            filter_trip_type TEXT NOT NULL DEFAULT 'any',
            filter_destination TEXT NOT NULL DEFAULT 'any',
            filter_length TEXT NOT NULL DEFAULT 'any',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    conn.commit()
    conn.close()


# Default categories — focused set for spending insights.
# (name, color, icon, is_income, is_savings) — order is sort_order; Other always last.
DEFAULT_FIN_CATEGORIES = [
    ('Groceries',           'green',  '🛒', 0, 0),
    ('Dining out',          'amber',  '🍽',  0, 0),
    ('Transportation',      'red',    '🚗', 0, 0),
    ('Travel',              'teal',   '✈',  0, 0),
    ('Shopping',            'pink',   '🛍', 0, 0),
    ('Housing',             'blue',   '🏠', 0, 0),
    ('Bills & Utilities',   'gray',   '💡', 0, 0),
    ('Subscriptions',       'purple', '📺', 0, 0),
    ('Health & Personal',   'green',  '⚕',  0, 0),
    ('Entertainment',       'purple', '🎬', 0, 0),
    ('Salary',              'green',  '💰', 1, 0),
    ('Other Income',        'green',  '💼', 1, 0),
    ('Savings',             'teal',   '🏦', 0, 1),
    ('Credit Card Payment', 'gray',   '💳', 0, 0),
    ('Other',               'gray',   '•',  0, 0),  # always last (sort_order 999)
]

# One-time consolidation map: old default name → new default name.
# Lets us migrate existing user data into the new shorter list.
CATEGORY_CONSOLIDATION = {
    'Restaurants':         'Dining out',
    'Fast Food & Coffee':  'Dining out',
    'Bars':                'Dining out',
    'Food Delivery':       'Dining out',
    'Fuel':                'Transportation',
    'Rideshare':           'Transportation',
    'Auto':                'Transportation',
    'Business Travel':     'Travel',
    'Travel & Lodging':    'Travel',
    'Online Shopping':     'Shopping',
    'Retail':              'Shopping',
    'Gifts':               'Shopping',
    'Personal Care':       'Health & Personal',
    'Health':              'Health & Personal',
    'Medication':          'Health & Personal',
    'Streaming':           'Subscriptions',
    'Software':            'Subscriptions',
    'Music':               'Entertainment',
    'Hobby':               'Entertainment',
    'Utilities':           'Bills & Utilities',
    'Insurance':           'Bills & Utilities',
    'Rent & Housing':      'Housing',
    'Side Income':         'Other Income',
    'Refund':              'Other Income',
    'Savings Transfer':    'Savings',
    'Investment':          'Savings',
}

DEFAULT_FIN_RULES_MCC = [
    ('5411', 'Groceries'), ('5422', 'Groceries'), ('5499', 'Groceries'),
    ('5812', 'Dining out'), ('5814', 'Dining out'), ('5813', 'Dining out'),
    ('5541', 'Transportation'), ('5542', 'Transportation'),
    ('4121', 'Transportation'), ('4131', 'Transportation'), ('4111', 'Transportation'),
    ('5511', 'Transportation'), ('5521', 'Transportation'),
    ('7531', 'Transportation'), ('7549', 'Transportation'),
    ('7011', 'Travel'), ('3501', 'Travel'), ('3502', 'Travel'),
    ('3503', 'Travel'), ('3690', 'Travel'), ('4511', 'Travel'),
    ('7512', 'Travel'), ('7513', 'Travel'),
    ('5942', 'Shopping'),
    ('5310', 'Shopping'), ('5311', 'Shopping'), ('5331', 'Shopping'),
    ('5651', 'Shopping'), ('5712', 'Shopping'), ('5722', 'Shopping'),
    ('7230', 'Health & Personal'), ('7297', 'Health & Personal'), ('7298', 'Health & Personal'),
    ('8011', 'Health & Personal'), ('8021', 'Health & Personal'), ('8042', 'Health & Personal'),
    ('5912', 'Health & Personal'), ('5122', 'Health & Personal'),
    ('4899', 'Subscriptions'),
    ('5734', 'Subscriptions'), ('5735', 'Subscriptions'), ('7372', 'Subscriptions'),
    ('5733', 'Entertainment'),
    ('7832', 'Entertainment'), ('7841', 'Entertainment'),
    ('6513', 'Housing'),
    ('4814', 'Bills & Utilities'), ('4815', 'Bills & Utilities'), ('4900', 'Bills & Utilities'),
    ('6300', 'Bills & Utilities'), ('6381', 'Bills & Utilities'),
    ('7299', 'Other'),
]

DEFAULT_FIN_RULES_MERCHANT = [
    ('DOORDASH',     'Dining out'),
    ('UBER EATS',    'Dining out'),
    ('GRUBHUB',      'Dining out'),
    ('STARBUCKS',    'Dining out'),
    ('AMAZON',       'Shopping'),
    ('AMZN',         'Shopping'),
    ('WALMART',      'Shopping'),
    ('TARGET',       'Shopping'),
    ('COSTCO',       'Groceries'),
    ('TRADER JOE',   'Groceries'),
    ('WHOLE FOODS',  'Groceries'),
    ('NETFLIX',      'Subscriptions'),
    ('SPOTIFY',      'Subscriptions'),
    ('PARAMOUNT',    'Subscriptions'),
    ('HULU',         'Subscriptions'),
    ('DISNEY+',      'Subscriptions'),
    ('UBER',         'Transportation'),
    ('LYFT',         'Transportation'),
    ('MARRIOTT',     'Travel'),
    ('HILTON',       'Travel'),
    ('AIRBNB',       'Travel'),
    ('CVS',          'Health & Personal'),
    ('WALGREENS',    'Health & Personal'),
    ('RITE AID',     'Health & Personal'),
    ('PAYMENT THANK YOU', 'Credit Card Payment'),
    ('ONLINE PAYMENT',    'Credit Card Payment'),
    ('PYMT THANK YOU',    'Credit Card Payment'),
    ('AUTOPAY',           'Credit Card Payment'),
    ('GEICO',        'Bills & Utilities'),
    ('PROGRESSIVE',  'Bills & Utilities'),
    ('STATE FARM',   'Bills & Utilities'),
    ('ALLSTATE',     'Bills & Utilities'),
    ('GITHUB',       'Subscriptions'),
    ('ADOBE',        'Subscriptions'),
    ('DROPBOX',      'Subscriptions'),
    ('GOOGLE',       'Subscriptions'),
    ('MICROSOFT',    'Subscriptions'),
    ('OPENAI',       'Subscriptions'),
    ('ANTHROPIC',    'Subscriptions'),
    ('JETBRAINS',    'Subscriptions'),
    ('1PASSWORD',    'Subscriptions'),
]


def _seed_finance(conn):
    """Idempotent: adds any missing default categories and default rules."""
    existing_names = {r['name'] for r in conn.execute("SELECT name FROM finance_categories").fetchall()}
    next_so = conn.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM finance_categories").fetchone()[0]
    for i, (name, color, icon, is_income, is_savings) in enumerate(DEFAULT_FIN_CATEGORIES):
        if name in existing_names:
            continue
        so = 999 if name == 'Other' else (next_so + i)
        is_excluded = 1 if name == 'Credit Card Payment' else 0
        conn.execute(
            "INSERT INTO finance_categories (name, color, icon, is_income, is_savings, is_excluded, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            (name, color, icon, is_income, is_savings, is_excluded, so)
        )

    # Build name → id map
    cat_map = {r['name']: r['id'] for r in conn.execute("SELECT id, name FROM finance_categories").fetchall()}
    existing_rules = {(r['rule_type'], r['pattern']) for r in conn.execute(
        "SELECT rule_type, pattern FROM finance_category_rules WHERE is_default = 1"
    ).fetchall()}

    for mcc, cat_name in DEFAULT_FIN_RULES_MCC:
        cid = cat_map.get(cat_name)
        if cid and ('mcc', mcc) not in existing_rules:
            conn.execute(
                "INSERT INTO finance_category_rules (category_id, rule_type, pattern, priority, is_default) VALUES (?, 'mcc', ?, 0, 1)",
                (cid, mcc)
            )
    for pat, cat_name in DEFAULT_FIN_RULES_MERCHANT:
        cid = cat_map.get(cat_name)
        if cid and ('merchant', pat) not in existing_rules:
            conn.execute(
                "INSERT INTO finance_category_rules (category_id, rule_type, pattern, priority, is_default) VALUES (?, 'merchant', ?, 5, 1)",
                (cid, pat)
            )

    # Run the v2 consolidation if not already done
    _migrate_finance_categories_v2(conn)


def _migrate_finance_categories_v2(conn):
    """One-time consolidation: re-points old default-category data to the new
    reduced category list, deletes orphaned old defaults, and resets sort_orders
    so they match DEFAULT_FIN_CATEGORIES (Other = 999)."""
    flag = conn.execute("SELECT value FROM settings WHERE key = 'finance_cats_v2_done'").fetchone()
    if flag:
        return

    name_to_id = {r['name']: r['id'] for r in conn.execute("SELECT id, name FROM finance_categories").fetchall()}

    # Re-point transactions and rules from old → new
    for old_name, new_name in CATEGORY_CONSOLIDATION.items():
        old_id = name_to_id.get(old_name)
        new_id = name_to_id.get(new_name)
        if old_id and new_id:
            conn.execute(
                "UPDATE finance_transactions SET category_id = ? WHERE category_id = ?", (new_id, old_id)
            )
            conn.execute(
                "UPDATE finance_category_rules SET category_id = ? WHERE category_id = ?", (new_id, old_id)
            )

    # Drop old default categories that are now unreferenced
    for old_name in CATEGORY_CONSOLIDATION.keys():
        old_id = name_to_id.get(old_name)
        if not old_id:
            continue
        is_def = conn.execute("SELECT is_default FROM finance_categories WHERE id = ?", (old_id,)).fetchone()
        if not is_def or not is_def['is_default']:
            continue  # user customised — leave alone
        tcnt = conn.execute("SELECT COUNT(*) FROM finance_transactions WHERE category_id = ?", (old_id,)).fetchone()[0]
        rcnt = conn.execute("SELECT COUNT(*) FROM finance_category_rules WHERE category_id = ?", (old_id,)).fetchone()[0]
        if tcnt == 0 and rcnt == 0:
            conn.execute("DELETE FROM finance_categories WHERE id = ?", (old_id,))

    # Reset sort orders for the new defaults; Other always last
    for i, (name, _c, _ic, _inc, _sav) in enumerate(DEFAULT_FIN_CATEGORIES):
        so = 999 if name == 'Other' else i
        conn.execute("UPDATE finance_categories SET sort_order = ? WHERE name = ?", (so, name))

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('finance_cats_v2_done', '1')"
    )


def _seed(c):
    c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('user_name', 'there')")

    tag_count = c.execute("SELECT COUNT(*) FROM tags").fetchone()[0]
    if tag_count == 0:
        default_tags = [
            ("Health", "teal"),
            ("Finance", "amber"),
            ("Personal", "purple"),
            ("Work", "blue"),
            ("Learning", "green"),
            ("Home", "coral"),
            ("Social", "pink"),
            ("Errands", "gray"),
        ]
        c.executemany(
            "INSERT INTO tags (name, color, is_default) VALUES (?, ?, 1)",
            default_tags,
        )
