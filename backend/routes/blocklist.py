"""Blocklist CRUD.

GET  /api/blocklist
POST /api/blocklist       body: {"action": "add"|"remove", "type": "keyword"|"author"|"domain"|"subreddit", "value": "..."}
"""
from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("blocklist", __name__)

_VALID_TYPES = {"keyword", "author", "domain", "subreddit"}


@bp.get("/blocklist")
def list_blocklist():
    db = get_db()
    rows = db.execute("SELECT id, type, value, added_at FROM blocklist ORDER BY type, value").fetchall()
    grouped: dict[str, list] = {t: [] for t in _VALID_TYPES}
    for r in rows:
        grouped.setdefault(r["type"], []).append(dict(r))
    return jsonify({"blocklist": grouped, "total": len(rows)})


@bp.post("/blocklist")
def mutate_blocklist():
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").lower()
    btype = (body.get("type") or "").lower()
    value = (body.get("value") or "").strip().lower()

    if btype not in _VALID_TYPES:
        return jsonify({"error": f"type must be one of {sorted(_VALID_TYPES)}"}), 400
    if not value:
        return jsonify({"error": "value required"}), 400
    if action not in ("add", "remove"):
        return jsonify({"error": "action must be add|remove"}), 400

    db = get_db()
    if action == "add":
        db.execute(
            "INSERT OR IGNORE INTO blocklist(type, value, added_at) VALUES(?, ?, ?)",
            (btype, value, int(time.time())),
        )
    else:
        db.execute("DELETE FROM blocklist WHERE type=? AND value=?", (btype, value))

    return jsonify({"success": True, "action": action, "type": btype, "value": value})
