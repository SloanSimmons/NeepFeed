"""Manual collection trigger + a tiny bootstrap helper for testing.

The full subreddit/settings/feed API comes in M3. This module just exposes:
    POST /api/collect/trigger   -> runs a collection synchronously
    POST /api/_dev/seed-sub     -> add a subreddit (dev convenience, will be replaced in M3)
"""
from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

from collection import trigger_now
from db import get_db

bp = Blueprint("collect", __name__)


@bp.post("/collect/trigger")
def collect_trigger():
    stats = trigger_now()
    return jsonify(stats)


@bp.post("/_dev/seed-sub")
def seed_sub():
    """Dev-only: add a subreddit subscription. Will be superseded by M3's subreddit routes."""
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip().lstrip("r/").lstrip("R/").lower()
    if not name:
        return jsonify({"error": "name required"}), 400
    db = get_db()
    now = int(time.time())
    db.execute(
        "INSERT INTO subscribed_subreddits(name, added_at, active, weight) VALUES(?,?,?,?) "
        "ON CONFLICT(name) DO UPDATE SET active=1",
        (name, now, 1, 1.0),
    )
    return jsonify({"ok": True, "name": name})
