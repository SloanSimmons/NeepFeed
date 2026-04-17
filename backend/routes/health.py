"""GET /api/health — sanity check + light DB introspection."""
from __future__ import annotations

import time

from flask import Blueprint, jsonify

from db import get_db

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    db = get_db()
    post_count = db.execute("SELECT COUNT(*) AS n FROM posts").fetchone()["n"]
    sub_count = db.execute("SELECT COUNT(*) AS n FROM subscribed_subreddits WHERE active=1").fetchone()["n"]
    return jsonify({
        "status": "ok",
        "time": int(time.time()),
        "posts": post_count,
        "active_subreddits": sub_count,
    })
