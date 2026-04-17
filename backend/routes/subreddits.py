"""Subreddit CRUD + bulk import.

GET    /api/subreddits              -> list
POST   /api/subreddits               -> action: add | remove | toggle
PATCH  /api/subreddits/<name>/weight -> set per-sub weight
POST   /api/subreddits/import        -> bulk-import from various formats
PATCH  /api/subreddits/<name>        -> update misc fields (sort_override, active)
"""
from __future__ import annotations

import json
import re
import time

from flask import Blueprint, jsonify, request

from db import get_db

bp = Blueprint("subreddits", __name__)


_VALID_SUB_RE = re.compile(r"^[a-z0-9][a-z0-9_]{1,20}$")


def _normalize_name(raw: str) -> str | None:
    if not raw:
        return None
    s = raw.strip().lower()
    # Accept "r/foo", "/r/foo", "R/foo", "https://reddit.com/r/foo/..."
    m = re.match(r"^(?:https?://(?:www\.|old\.)?reddit\.com)?/?r/([a-z0-9_]+)/?$", s) or re.match(r"^([a-z0-9_]+)$", s)
    if not m:
        return None
    name = m.group(1)
    return name if _VALID_SUB_RE.match(name) else None


def _sub_row_to_dict(row, post_count: int | None = None) -> dict:
    d = {
        "name": row["name"],
        "added_at": row["added_at"],
        "active": bool(row["active"]),
        "weight": float(row["weight"] or 1.0),
        "is_new_boost": bool(row["is_new_boost"]),
        "sort_override": row["sort_override"],
    }
    if post_count is not None:
        d["post_count"] = post_count
    return d


@bp.get("/subreddits")
def list_subs():
    db = get_db()
    rows = db.execute(
        "SELECT s.*, (SELECT COUNT(*) FROM posts p WHERE p.subreddit=s.name) AS post_count "
        "FROM subscribed_subreddits s ORDER BY s.name"
    ).fetchall()
    items = [_sub_row_to_dict(r, r["post_count"]) for r in rows]
    active = sum(1 for i in items if i["active"])
    return jsonify({"subreddits": items, "total": len(items), "active_count": active})


@bp.post("/subreddits")
def mutate_sub():
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").lower()
    name = _normalize_name(body.get("name", ""))
    if not name:
        return jsonify({"error": "invalid subreddit name"}), 400
    if action not in ("add", "remove", "toggle"):
        return jsonify({"error": "action must be add|remove|toggle"}), 400

    db = get_db()
    now = int(time.time())

    if action == "add":
        db.execute(
            "INSERT INTO subscribed_subreddits(name, added_at, active, weight) "
            "VALUES(?,?,1,1.0) "
            "ON CONFLICT(name) DO UPDATE SET active=1",
            (name, now),
        )
    elif action == "remove":
        db.execute("DELETE FROM subscribed_subreddits WHERE name=?", (name,))
        return jsonify({"success": True, "removed": name})
    elif action == "toggle":
        db.execute("UPDATE subscribed_subreddits SET active = 1 - active WHERE name=?", (name,))

    row = db.execute("SELECT * FROM subscribed_subreddits WHERE name=?", (name,)).fetchone()
    return jsonify({"success": True, "subreddit": _sub_row_to_dict(row) if row else None})


@bp.patch("/subreddits/<name>/weight")
def set_weight(name: str):
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
    cur = db.execute("UPDATE subscribed_subreddits SET weight=? WHERE name=?", (weight, name_n))
    if cur.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    row = db.execute("SELECT * FROM subscribed_subreddits WHERE name=?", (name_n,)).fetchone()
    return jsonify({"success": True, "subreddit": _sub_row_to_dict(row)})


@bp.patch("/subreddits/<name>")
def update_sub(name: str):
    name_n = _normalize_name(name)
    if not name_n:
        return jsonify({"error": "invalid name"}), 400
    body = request.get_json(silent=True) or {}

    updates: list[tuple[str, object]] = []
    if "active" in body:
        updates.append(("active", 1 if body["active"] else 0))
    if "sort_override" in body:
        v = body["sort_override"]
        if v is not None and v not in ("calculated", "score", "recency", "velocity"):
            return jsonify({"error": "invalid sort_override"}), 400
        updates.append(("sort_override", v))
    if "weight" in body:
        try:
            updates.append(("weight", max(0.1, min(5.0, float(body["weight"])))))
        except (TypeError, ValueError):
            return jsonify({"error": "weight must be a number"}), 400

    if not updates:
        return jsonify({"error": "no updatable fields provided"}), 400

    db = get_db()
    setters = ", ".join(f"{col}=?" for col, _ in updates)
    params = [v for _, v in updates] + [name_n]
    cur = db.execute(f"UPDATE subscribed_subreddits SET {setters} WHERE name=?", params)
    if cur.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    row = db.execute("SELECT * FROM subscribed_subreddits WHERE name=?", (name_n,)).fetchone()
    return jsonify({"success": True, "subreddit": _sub_row_to_dict(row)})


# ---------------------------------------------------------------------------
# Bulk import
# ---------------------------------------------------------------------------

def _parse_import_payload(raw: str | bytes | dict) -> list[str]:
    """Accepts any of:
        - Plain text: one sub per line, comma-separated, or space-separated
        - Multi-reddit URL path: 'a+b+c'
        - Reddit subscription CSV export (comma-separated with headers in first row)
        - Apollo backup JSON  (array of objects with 'subredditName' or 'name')
        - Sync for Reddit JSON (array of objects with 'name' or 'display_name')
        - Reddit API 'subreddits/mine' JSON (hash with 'data.children[].data.display_name')

    Returns a deduplicated, normalized list of sub names.
    """
    names: list[str] = []

    def _add_many(strs):
        for s in strs:
            n = _normalize_name(s)
            if n:
                names.append(n)

    # Bytes -> str
    if isinstance(raw, (bytes, bytearray)):
        try:
            raw = raw.decode("utf-8", errors="ignore")
        except Exception:
            raw = ""

    if isinstance(raw, str):
        text = raw.strip()
        # Try JSON first
        try:
            parsed = json.loads(text)
            return _parse_import_payload(parsed)
        except (json.JSONDecodeError, ValueError):
            pass
        # CSV / plain text: split on commas, plusses, whitespace, newlines
        tokens = re.split(r"[\s,;+]+", text)
        _add_many(tokens)
    elif isinstance(raw, list):
        # List of strings or objects
        for item in raw:
            if isinstance(item, str):
                _add_many([item])
            elif isinstance(item, dict):
                for k in ("subredditName", "name", "display_name", "display_name_prefixed", "url"):
                    v = item.get(k)
                    if isinstance(v, str):
                        _add_many([v])
                        break
    elif isinstance(raw, dict):
        # Reddit API: {'data': {'children': [{'data': {'display_name': 'foo'}}, ...]}}
        children = (raw.get("data") or {}).get("children")
        if isinstance(children, list):
            for c in children:
                try:
                    name = c["data"]["display_name"]
                    _add_many([name])
                except (KeyError, TypeError):
                    continue
        # Also walk any top-level arrays by common keys
        for k in ("subreddits", "subs", "items"):
            v = raw.get(k)
            if isinstance(v, list):
                _add_many(
                    x if isinstance(x, str) else x.get("name") or x.get("display_name") or ""
                    for x in v
                )

    # Deduplicate, preserve order
    seen: set[str] = set()
    out: list[str] = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


@bp.post("/subreddits/import")
def import_subs():
    """Accept a raw-text or JSON body, or a multipart file upload with field name 'file'."""
    names: list[str] = []

    # File upload?
    if "file" in request.files:
        f = request.files["file"]
        names = _parse_import_payload(f.read())
    else:
        ctype = (request.content_type or "").lower()
        if "json" in ctype:
            names = _parse_import_payload(request.get_json(silent=True) or {})
        else:
            names = _parse_import_payload(request.get_data(as_text=True))

    if not names:
        return jsonify({"error": "no valid subreddit names found"}), 400

    db = get_db()
    now = int(time.time())
    added, existing = [], []
    for n in names:
        cur = db.execute(
            "INSERT INTO subscribed_subreddits(name, added_at, active, weight) "
            "VALUES(?,?,1,1.0) ON CONFLICT(name) DO NOTHING",
            (n, now),
        )
        if cur.rowcount > 0:
            added.append(n)
        else:
            existing.append(n)

    return jsonify({
        "success": True,
        "added": added,
        "already_subscribed": existing,
        "added_count": len(added),
        "skipped_count": len(existing),
    })
