"""GET /api/stats — metadata about the DB and collection."""
from __future__ import annotations

import os

from flask import Blueprint, jsonify

from db import get_db, get_config

bp = Blueprint("stats", __name__)


@bp.get("/stats")
def stats():
    db = get_db()
    total_posts = db.execute("SELECT COUNT(*) AS n FROM posts").fetchone()["n"]
    active_subs = db.execute(
        "SELECT COUNT(*) AS n FROM subscribed_subreddits WHERE active=1"
    ).fetchone()["n"]
    total_subs = db.execute("SELECT COUNT(*) AS n FROM subscribed_subreddits").fetchone()["n"]
    total_snapshots = db.execute("SELECT COUNT(*) AS n FROM score_snapshots").fetchone()["n"]
    bookmarks = db.execute(
        "SELECT COUNT(*) AS n FROM post_state WHERE bookmarked_at IS NOT NULL"
    ).fetchone()["n"]
    seen = db.execute(
        "SELECT COUNT(*) AS n FROM post_state WHERE seen_at IS NOT NULL"
    ).fetchone()["n"]

    last_coll = get_config("last_collection_at")
    try:
        last_coll_int = int(last_coll) if last_coll else None
    except ValueError:
        last_coll_int = None

    db_path = os.environ.get("DATABASE_PATH", "./data/neepfeed.db")
    try:
        db_size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2)
    except OSError:
        db_size_mb = None

    return jsonify({
        "last_collection_at": last_coll_int,
        "total_posts": total_posts,
        "active_subreddits": active_subs,
        "total_subreddits": total_subs,
        "total_snapshots": total_snapshots,
        "bookmarks": bookmarks,
        "seen_posts": seen,
        "db_size_mb": db_size_mb,
    })
