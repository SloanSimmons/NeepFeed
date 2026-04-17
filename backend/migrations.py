"""Schema migrations.

Versions are tracked in user_config.schema_version. Each migration is
idempotent and bumps the version on success. Migrations run from the
current version forward, inside a transaction.

  v1: Initial schema (posts, subscribed_subreddits, snapshots, post_state,
      blocklist, user_config, posts_fts).
  v2: Lists — adds `lists` and `list_recommendations` tables; rebuilds
      `subscribed_subreddits` with a `list_id` FK and (list_id, name)
      composite uniqueness; moves all existing subs into the default
      "My Feed" list (id=1).
"""
from __future__ import annotations

import logging
import sqlite3
import time

log = logging.getLogger("neepfeed.migrations")


def _current_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM user_config WHERE key='schema_version'").fetchone()
    try:
        return int(row["value"]) if row else 1
    except (TypeError, ValueError):
        return 1


def _set_version(conn: sqlite3.Connection, v: int) -> None:
    conn.execute(
        "INSERT INTO user_config(key,value) VALUES('schema_version',?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (str(v),),
    )


# ---------------------------------------------------------------------------
# v2: lists
# ---------------------------------------------------------------------------

def _migrate_v2(conn: sqlite3.Connection) -> None:
    """Uses only execute() (not executescript) so the outer transaction
    from run_migrations stays intact."""
    log.info("Running migration v1 -> v2 (lists)")
    now = int(time.time())

    # 1. Create lists + list_recommendations tables (idempotent)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lists (
            id                INTEGER PRIMARY KEY,
            name              TEXT UNIQUE NOT NULL,
            icon              TEXT DEFAULT '📋',
            position          INTEGER DEFAULT 0,
            created_at        INTEGER,
            settings_overrides TEXT DEFAULT '{}'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS list_recommendations (
            id               INTEGER PRIMARY KEY,
            list_id          INTEGER NOT NULL,
            subreddit_name   TEXT NOT NULL,
            relevance_score  REAL NOT NULL,
            source_subs      TEXT,
            source_method    TEXT,
            refreshed_at     INTEGER,
            dismissed_at     INTEGER,
            FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rec_list_id ON list_recommendations(list_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_rec_score ON list_recommendations(relevance_score DESC)")

    # 2. Seed default "My Feed" list (id=1)
    conn.execute(
        "INSERT OR IGNORE INTO lists(id, name, icon, position, created_at) VALUES (1, 'My Feed', '📋', 0, ?)",
        (now,),
    )

    # 3. Rebuild subscribed_subreddits if needed
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(subscribed_subreddits)").fetchall()}
    if "list_id" in cols:
        log.info("subscribed_subreddits already has list_id — skipping rebuild")
    else:
        conn.execute("""
            CREATE TABLE subscribed_subreddits_new (
                id            INTEGER PRIMARY KEY,
                list_id       INTEGER NOT NULL DEFAULT 1,
                name          TEXT NOT NULL,
                added_at      INTEGER,
                active        BOOLEAN DEFAULT 1,
                weight        REAL DEFAULT 1.0,
                is_new_boost  BOOLEAN DEFAULT 0,
                sort_override TEXT,
                FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
                UNIQUE(list_id, name)
            )
        """)
        conn.execute("""
            INSERT INTO subscribed_subreddits_new (list_id, name, added_at, active, weight, is_new_boost, sort_override)
              SELECT 1, name, added_at, active, weight, is_new_boost, sort_override FROM subscribed_subreddits
        """)
        conn.execute("DROP TABLE subscribed_subreddits")
        conn.execute("ALTER TABLE subscribed_subreddits_new RENAME TO subscribed_subreddits")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_subs_active ON subscribed_subreddits(active)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_subs_name ON subscribed_subreddits(name)")

    # 4. New config keys
    for k, v in (
        ("recommendations_enabled", "false"),
        ("recommendations_refresh_hours", "24"),
        ("recommendations_max_per_list", "15"),
    ):
        conn.execute("INSERT OR IGNORE INTO user_config(key, value) VALUES(?, ?)", (k, v))

    _set_version(conn, 2)
    log.info("Migration v2 complete")


# ---------------------------------------------------------------------------
# Migration dispatch
# ---------------------------------------------------------------------------

_MIGRATIONS = {
    2: _migrate_v2,
    # future: 3: _migrate_v3, ...
}


def run_migrations(conn: sqlite3.Connection) -> int:
    """Apply all pending migrations. Returns the new schema version."""
    current = _current_version(conn)
    target = max(_MIGRATIONS.keys(), default=current)
    if current >= target:
        return current
    log.info("Applying migrations: %d -> %d", current, target)
    for version in sorted(v for v in _MIGRATIONS if v > current):
        fn = _MIGRATIONS[version]
        conn.execute("BEGIN")
        try:
            fn(conn)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            log.exception("Migration v%d failed; rolled back", version)
            raise
    return _current_version(conn)
