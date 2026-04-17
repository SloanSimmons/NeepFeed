"""SQLite connection, schema init, and small helpers.

Single-process app — we use one connection per thread via `g`. Collection runs
in a background thread and opens its own connection (also with WAL).
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

from flask import g

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def _db_path() -> str:
    return os.environ.get("DATABASE_PATH", "./data/neepfeed.db")


def _connect(path: str) -> sqlite3.Connection:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, detect_types=sqlite3.PARSE_DECLTYPES, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def get_db() -> sqlite3.Connection:
    """Per-request Flask connection."""
    if "db" not in g:
        g.db = _connect(_db_path())
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    conn: sqlite3.Connection | None = g.pop("db", None)
    if conn is not None:
        conn.close()


def new_connection() -> sqlite3.Connection:
    """Fresh connection for background jobs (APScheduler) — caller closes."""
    return _connect(_db_path())


def init_schema() -> None:
    """Create tables / indexes / FTS if they don't exist."""
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn = _connect(_db_path())
    try:
        conn.executescript(sql)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Small helpers (used by routes in later milestones)
# ---------------------------------------------------------------------------

def get_config(key: str, default: Any = None) -> str | None:
    row = get_db().execute("SELECT value FROM user_config WHERE key=?", (key,)).fetchone()
    return row["value"] if row else default


def set_config(key: str, value: str) -> None:
    get_db().execute(
        "INSERT INTO user_config(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
