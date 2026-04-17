"""List CRUD + per-list subreddit management + recommendation placeholders.

The recommendation engine itself (L3) is not implemented yet — the GET
endpoint returns any rows already stored in list_recommendations (empty
until L3 lands), and the refresh endpoint responds 501 with a friendly
message so the frontend can wire the UI now and light up automatically
once L3 is built.
"""
from __future__ import annotations

import json
import re
import time

from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("lists", __name__)

DEFAULT_LIST_ID = 1
_VALID_SUB_RE = re.compile(r"^[a-z0-9][a-z0-9_]{1,20}$")


def _normalize_name(raw: str) -> str | None:
    if not raw:
        return None
    s = raw.strip().lower()
    m = re.match(r"^(?:https?://(?:www\.|old\.)?reddit\.com)?/?r/([a-z0-9_]+)/?$", s) or re.match(r"^([a-z0-9_]+)$", s)
    if not m:
        return None
    n = m.group(1)
    return n if _VALID_SUB_RE.match(n) else None


# ---------------------------------------------------------------------------
# List CRUD
# ---------------------------------------------------------------------------

def _list_row_to_dict(row, db=None) -> dict:
    d = {
        "id": row["id"],
        "name": row["name"],
        "icon": row["icon"] or "📋",
        "position": row["position"] or 0,
        "created_at": row["created_at"],
        "settings_overrides": _parse_overrides(row["settings_overrides"]),
    }
    if db is not None:
        counts = db.execute(
            "SELECT COUNT(*) AS total, SUM(active) AS active FROM subscribed_subreddits WHERE list_id=?",
            (row["id"],),
        ).fetchone()
        d["subreddit_count"] = counts["total"] or 0
        d["active_count"] = counts["active"] or 0
        rec = db.execute(
            "SELECT COUNT(*) AS n, MAX(refreshed_at) AS last FROM list_recommendations WHERE list_id=?",
            (row["id"],),
        ).fetchone()
        d["recommendation_count"] = rec["n"] or 0
        d["has_recommendations"] = (rec["n"] or 0) > 0
        d["recommendations_refreshed_at"] = rec["last"]
    return d


def _parse_overrides(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


@bp.get("/lists")
def list_lists():
    db = get_db()
    rows = db.execute("SELECT * FROM lists ORDER BY position, id").fetchall()
    items = [_list_row_to_dict(r, db) for r in rows]
    return jsonify({"lists": items, "total": len(items)})


@bp.post("/lists")
def create_list():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    if len(name) > 40:
        return jsonify({"error": "name too long (max 40)"}), 400
    icon = (body.get("icon") or "📋")[:8]

    db = get_db()
    # Auto-assign next position
    max_pos = db.execute("SELECT COALESCE(MAX(position), -1) AS m FROM lists").fetchone()["m"]
    try:
        cur = db.execute(
            "INSERT INTO lists(name, icon, position, created_at) VALUES(?,?,?,?)",
            (name, icon, max_pos + 1, int(time.time())),
        )
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"error": "a list with that name already exists"}), 409
        raise
    row = db.execute("SELECT * FROM lists WHERE id=?", (cur.lastrowid,)).fetchone()
    return jsonify({"success": True, "list": _list_row_to_dict(row, db)})


@bp.patch("/lists/<int:list_id>")
def update_list(list_id: int):
    body = request.get_json(silent=True) or {}
    updates: list[tuple[str, object]] = []
    if "name" in body:
        name = (body["name"] or "").strip()
        if not name or len(name) > 40:
            return jsonify({"error": "invalid name"}), 400
        updates.append(("name", name))
    if "icon" in body:
        updates.append(("icon", (body["icon"] or "📋")[:8]))
    if "position" in body:
        try:
            updates.append(("position", int(body["position"])))
        except (TypeError, ValueError):
            return jsonify({"error": "position must be an integer"}), 400
    if "settings_overrides" in body:
        v = body["settings_overrides"]
        if v is None:
            updates.append(("settings_overrides", "{}"))
        elif isinstance(v, dict):
            updates.append(("settings_overrides", json.dumps(v)))
        else:
            return jsonify({"error": "settings_overrides must be an object"}), 400

    if not updates:
        return jsonify({"error": "no updatable fields provided"}), 400

    db = get_db()
    setters = ", ".join(f"{c}=?" for c, _ in updates)
    params = [v for _, v in updates] + [list_id]
    try:
        cur = db.execute(f"UPDATE lists SET {setters} WHERE id=?", params)
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"error": "a list with that name already exists"}), 409
        raise
    if cur.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    row = db.execute("SELECT * FROM lists WHERE id=?", (list_id,)).fetchone()
    return jsonify({"success": True, "list": _list_row_to_dict(row, db)})


@bp.delete("/lists/<int:list_id>")
def delete_list(list_id: int):
    if list_id == DEFAULT_LIST_ID:
        return jsonify({"error": "cannot delete the default 'My Feed' list"}), 400
    db = get_db()
    # FK has ON DELETE CASCADE on subscribed_subreddits + list_recommendations
    cur = db.execute("DELETE FROM lists WHERE id=?", (list_id,))
    if cur.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"success": True, "deleted_id": list_id})


# ---------------------------------------------------------------------------
# Per-list subreddit management
# ---------------------------------------------------------------------------

@bp.get("/lists/<int:list_id>/subreddits")
def list_subs_in_list(list_id: int):
    db = get_db()
    rows = db.execute(
        """
        SELECT s.*,
            (SELECT COUNT(*) FROM posts p WHERE p.subreddit = s.name) AS post_count
        FROM subscribed_subreddits s
        WHERE s.list_id = ?
        ORDER BY s.name
        """,
        (list_id,),
    ).fetchall()
    items = [
        {
            "name": r["name"],
            "added_at": r["added_at"],
            "active": bool(r["active"]),
            "weight": float(r["weight"] or 1.0),
            "is_new_boost": bool(r["is_new_boost"]),
            "sort_override": r["sort_override"],
            "post_count": r["post_count"] or 0,
        }
        for r in rows
    ]
    active = sum(1 for i in items if i["active"])
    return jsonify({"list_id": list_id, "subreddits": items, "total": len(items), "active_count": active})


@bp.post("/lists/<int:list_id>/subreddits")
def mutate_sub_in_list(list_id: int):
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").lower()
    name = _normalize_name(body.get("name", ""))
    if not name:
        return jsonify({"error": "invalid subreddit name"}), 400
    if action not in ("add", "remove", "toggle"):
        return jsonify({"error": "action must be add|remove|toggle"}), 400

    db = get_db()
    # Validate list exists
    if not db.execute("SELECT 1 FROM lists WHERE id=?", (list_id,)).fetchone():
        return jsonify({"error": "list not found"}), 404

    now = int(time.time())
    if action == "add":
        db.execute(
            "INSERT INTO subscribed_subreddits(list_id, name, added_at, active, weight) "
            "VALUES(?, ?, ?, 1, 1.0) ON CONFLICT(list_id, name) DO UPDATE SET active=1",
            (list_id, name, now),
        )
    elif action == "remove":
        db.execute("DELETE FROM subscribed_subreddits WHERE list_id=? AND name=?", (list_id, name))
        return jsonify({"success": True, "removed": name, "list_id": list_id})
    elif action == "toggle":
        db.execute(
            "UPDATE subscribed_subreddits SET active = 1 - active WHERE list_id=? AND name=?",
            (list_id, name),
        )

    row = db.execute(
        "SELECT * FROM subscribed_subreddits WHERE list_id=? AND name=?", (list_id, name)
    ).fetchone()
    return jsonify({"success": True, "list_id": list_id, "subreddit": dict(row) if row else None})


@bp.post("/lists/<int:list_id>/subreddits/bulk")
def bulk_add_subs(list_id: int):
    body = request.get_json(silent=True) or {}
    names = body.get("names") or []
    if not isinstance(names, list):
        return jsonify({"error": "names must be an array of strings"}), 400

    db = get_db()
    if not db.execute("SELECT 1 FROM lists WHERE id=?", (list_id,)).fetchone():
        return jsonify({"error": "list not found"}), 404

    now = int(time.time())
    added, skipped = [], []
    for raw in names:
        n = _normalize_name(str(raw))
        if not n:
            continue
        cur = db.execute(
            "INSERT INTO subscribed_subreddits(list_id, name, added_at, active, weight) "
            "VALUES(?, ?, ?, 1, 1.0) ON CONFLICT(list_id, name) DO NOTHING",
            (list_id, n, now),
        )
        (added if cur.rowcount > 0 else skipped).append(n)

    return jsonify({
        "success": True,
        "list_id": list_id,
        "added": added,
        "skipped": skipped,
        "added_count": len(added),
        "skipped_count": len(skipped),
    })


@bp.patch("/lists/<int:list_id>/subreddits/<name>/weight")
def set_weight_in_list(list_id: int, name: str):
    name_n = _normalize_name(name)
    if not name_n:
        return jsonify({"error": "invalid name"}), 400
    body = request.get_json(silent=True) or {}
    try:
        weight = float(body.get("weight"))
    except (TypeError, ValueError):
        return jsonify({"error": "weight must be a number"}), 400
    weight = max(0.1, min(5.0, weight))

    db = get_db()
    cur = db.execute(
        "UPDATE subscribed_subreddits SET weight=? WHERE list_id=? AND name=?",
        (weight, list_id, name_n),
    )
    if cur.rowcount == 0:
        return jsonify({"error": "not found in list"}), 404
    row = db.execute(
        "SELECT * FROM subscribed_subreddits WHERE list_id=? AND name=?", (list_id, name_n)
    ).fetchone()
    return jsonify({"success": True, "subreddit": dict(row)})


# ---------------------------------------------------------------------------
# Recommendations (L3 placeholder)
# ---------------------------------------------------------------------------

@bp.get("/lists/<int:list_id>/recommendations")
def list_recommendations(list_id: int):
    db = get_db()
    if not db.execute("SELECT 1 FROM lists WHERE id=?", (list_id,)).fetchone():
        return jsonify({"error": "list not found"}), 404

    rows = db.execute(
        "SELECT subreddit_name, relevance_score, source_subs, source_method, refreshed_at "
        "FROM list_recommendations WHERE list_id=? AND dismissed_at IS NULL "
        "ORDER BY relevance_score DESC",
        (list_id,),
    ).fetchall()

    # Filter out subs already subscribed anywhere
    subscribed = {
        r["name"] for r in db.execute(
            "SELECT DISTINCT name FROM subscribed_subreddits"
        ).fetchall()
    }
    recs = []
    for r in rows:
        if r["subreddit_name"] in subscribed:
            continue
        try:
            source_subs = json.loads(r["source_subs"]) if r["source_subs"] else []
        except (TypeError, json.JSONDecodeError):
            source_subs = []
        recs.append({
            "subreddit_name": r["subreddit_name"],
            "relevance_score": r["relevance_score"],
            "source_subs": source_subs,
            "source_method": r["source_method"],
            "refreshed_at": r["refreshed_at"],
            "already_subscribed": False,
        })

    last = db.execute(
        "SELECT MAX(refreshed_at) AS last FROM list_recommendations WHERE list_id=?",
        (list_id,),
    ).fetchone()

    return jsonify({
        "list_id": list_id,
        "recommendations": recs,
        "total": len(recs),
        "refreshed_at": last["last"] if last else None,
        "engine_status": "not_implemented",  # cleared once L3 ships
    })


@bp.post("/lists/<int:list_id>/recommendations/refresh")
def refresh_recommendations(list_id: int):
    # L3 not yet implemented; responding 501 with a clear reason lets the
    # frontend disable the button gracefully and light up once L3 arrives.
    return jsonify({
        "started": False,
        "reason": "recommendation engine not implemented yet",
        "engine_status": "not_implemented",
    }), 501
