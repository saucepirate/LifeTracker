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
    conn.commit()
    conn.close()


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
