"""Settings + config export/import.

GET  /api/settings            -> all known settings
POST /api/settings            -> update settings (partial or full)
POST /api/config/export       -> downloadable JSON of settings + subs + blocklist
POST /api/config/import       -> restore from exported JSON
"""
from __future__ import annotations

import datetime as dt
import json
import time

from flask import Blueprint, Response, jsonify, request

from db import get_db

bp = Blueprint("settings", __name__)


# Known settings keys + their parse/serialize helpers.
# Anything not in this map can still be set via generic string passthrough.
_SETTING_SPECS: dict[str, dict] = {
    "decay_rate":          {"type": "float",  "min": 0.1,  "max": 5.0,  "default": "0.7"},
    "time_window_hours":   {"type": "float",  "min": 1.0,  "max": 720.0, "default": "96"},
    "min_score_threshold": {"type": "int",    "min": 0,    "max": 10000, "default": "10"},
    "new_sub_weight":      {"type": "float",  "min": 1.0,  "max": 5.0,  "default": "1.5"},
    "hide_nsfw":           {"type": "bool",   "default": "false"},
    "sort_mode":           {"type": "enum",   "enum": ["calculated","score","recency","velocity"], "default": "calculated"},
    "theme":               {"type": "enum",   "enum": ["dark","light"], "default": "dark"},
    "autoplay_videos":     {"type": "bool",   "default": "true"},
    "default_video_muted": {"type": "bool",   "default": "true"},
    "diversity_cap":       {"type": "float",  "min": 0.0,  "max": 1.0,  "default": "0.3"},
    "dedup_crossposts":    {"type": "bool",   "default": "true"},
    "prefetch_enabled":    {"type": "bool",   "default": "true"},
    "hide_seen":           {"type": "bool",   "default": "false"},
    "dim_seen":            {"type": "bool",   "default": "true"},
    "compact_mode":        {"type": "bool",   "default": "false"},
    "collection_mode":     {"type": "enum",   "enum": ["batched_hot","per_sub_top"], "default": "batched_hot"},
}


def _deserialize(key: str, raw: str | None):
    spec = _SETTING_SPECS.get(key)
    if spec is None or raw is None:
        return raw
    t = spec["type"]
    try:
        if t == "bool":  return raw.lower() == "true"
        if t == "int":   return int(raw)
        if t == "float": return float(raw)
        if t == "enum":  return raw
    except (TypeError, ValueError):
        return raw
    return raw


def _serialize(key: str, value) -> str:
    spec = _SETTING_SPECS.get(key)
    if spec is None:
        return str(value)
    t = spec["type"]
    if t == "bool":
        return "true" if bool(value) else "false"
    if t == "enum":
        if value not in spec["enum"]:
            raise ValueError(f"{key}: must be one of {spec['enum']}")
        return str(value)
    if t in ("int", "float"):
        num = float(value) if t == "float" else int(value)
        if "min" in spec and num < spec["min"]:
            num = spec["min"]
        if "max" in spec and num > spec["max"]:
            num = spec["max"]
        return str(num)
    return str(value)


@bp.get("/settings")
def get_settings():
    db = get_db()
    rows = db.execute("SELECT key, value FROM user_config").fetchall()
    raw = {r["key"]: r["value"] for r in rows}
    out: dict = {}
    for key in _SETTING_SPECS:
        out[key] = _deserialize(key, raw.get(key, _SETTING_SPECS[key]["default"]))
    # Any unknown keys we leave as strings
    for key, val in raw.items():
        if key not in _SETTING_SPECS and not key.startswith("_"):
            out.setdefault(key, val)
    return jsonify(out)


@bp.post("/settings")
def update_settings():
    body = request.get_json(silent=True) or {}
    db = get_db()
    errors: dict[str, str] = {}
    applied: dict[str, str] = {}
    for key, value in body.items():
        if key not in _SETTING_SPECS:
            continue  # silently ignore unknown keys
        try:
            serialized = _serialize(key, value)
        except ValueError as e:
            errors[key] = str(e)
            continue
        db.execute(
            "INSERT INTO user_config(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, serialized),
        )
        applied[key] = serialized
    if errors:
        return jsonify({"success": False, "errors": errors, "applied": applied}), 400
    return get_settings()


# ---------------------------------------------------------------------------
# Config export / import
# ---------------------------------------------------------------------------

@bp.post("/config/export")
def export_config():
    db = get_db()
    settings = {
        r["key"]: r["value"]
        for r in db.execute("SELECT key, value FROM user_config").fetchall()
        if not r["key"].startswith("_")
    }
    # Lists + memberships (v2 format)
    list_rows = db.execute("SELECT id, name, icon, position, created_at, settings_overrides FROM lists ORDER BY position, id").fetchall()
    lists_out = []
    for lr in list_rows:
        subs_in_list = db.execute(
            "SELECT name, active, weight, sort_override, added_at FROM subscribed_subreddits WHERE list_id=? ORDER BY name",
            (lr["id"],),
        ).fetchall()
        lists_out.append({
            "id": lr["id"],
            "name": lr["name"],
            "icon": lr["icon"],
            "position": lr["position"],
            "created_at": lr["created_at"],
            "settings_overrides": lr["settings_overrides"],
            "subreddits": [dict(s) for s in subs_in_list],
        })
    # Legacy flat `subreddits` array for backward compat — unique names with max weight
    legacy_subs = [
        dict(r) for r in db.execute(
            "SELECT name, MAX(active) AS active, MAX(weight) AS weight, MAX(is_new_boost) AS is_new_boost, "
            "MIN(added_at) AS added_at FROM subscribed_subreddits GROUP BY name ORDER BY name"
        ).fetchall()
    ]
    blocklist = [dict(r) for r in db.execute("SELECT type, value FROM blocklist ORDER BY type, value").fetchall()]
    payload = {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "neepfeed_export_version": 2,
        "settings": settings,
        "lists": lists_out,
        "subreddits": legacy_subs,  # preserved for v1-era import tools
        "blocklist": blocklist,
    }
    body = json.dumps(payload, indent=2)
    return Response(
        body,
        mimetype="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="neepfeed-config.json"',
        },
    )


@bp.post("/config/import")
def import_config():
    # File upload or raw JSON
    if "file" in request.files:
        try:
            payload = json.loads(request.files["file"].read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            return jsonify({"error": f"invalid JSON: {e}"}), 400
    else:
        payload = request.get_json(silent=True) or {}

    if not isinstance(payload, dict):
        return jsonify({"error": "payload must be an object"}), 400

    db = get_db()
    now = int(time.time())

    # Settings
    for key, value in (payload.get("settings") or {}).items():
        db.execute(
            "INSERT INTO user_config(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )

    # Lists (v2 format): upsert lists, then their subreddits
    exported_version = int(payload.get("neepfeed_export_version") or 1)

    if exported_version >= 2 and payload.get("lists"):
        for lst in payload["lists"]:
            name = (lst.get("name") or "").strip()
            if not name:
                continue
            icon = lst.get("icon") or "📋"
            position = int(lst.get("position") or 0)
            overrides = lst.get("settings_overrides") or "{}"
            if isinstance(overrides, dict):
                overrides = json.dumps(overrides)
            # Upsert by name (stable identifier across exports)
            existing = db.execute("SELECT id FROM lists WHERE name=?", (name,)).fetchone()
            if existing:
                list_id = existing["id"]
                db.execute(
                    "UPDATE lists SET icon=?, position=?, settings_overrides=? WHERE id=?",
                    (icon, position, overrides, list_id),
                )
            else:
                cur = db.execute(
                    "INSERT INTO lists(name, icon, position, created_at, settings_overrides) VALUES(?,?,?,?,?)",
                    (name, icon, position, int(lst.get("created_at") or now), overrides),
                )
                list_id = cur.lastrowid
            # Subreddits within this list
            for sub in (lst.get("subreddits") or []):
                sub_name = (sub.get("name") or "").strip().lower()
                if not sub_name:
                    continue
                db.execute(
                    "INSERT INTO subscribed_subreddits(list_id, name, added_at, active, weight, sort_override) "
                    "VALUES(?,?,?,?,?,?) "
                    "ON CONFLICT(list_id, name) DO UPDATE SET "
                    "  active=excluded.active, weight=excluded.weight, sort_override=excluded.sort_override",
                    (
                        list_id,
                        sub_name,
                        int(sub.get("added_at") or now),
                        1 if sub.get("active", True) else 0,
                        float(sub.get("weight", 1.0) or 1.0),
                        sub.get("sort_override"),
                    ),
                )
    else:
        # Legacy v1 payload: drop everything into the default list
        for sub in (payload.get("subreddits") or []):
            name = (sub.get("name") or "").strip().lower()
            if not name:
                continue
            db.execute(
                "INSERT INTO subscribed_subreddits(list_id, name, added_at, active, weight, sort_override) "
                "VALUES(1, ?,?,?,?,?) "
                "ON CONFLICT(list_id, name) DO UPDATE SET "
                "  active=excluded.active, weight=excluded.weight, sort_override=excluded.sort_override",
                (
                    name,
                    int(sub.get("added_at") or now),
                    1 if sub.get("active", True) else 0,
                    float(sub.get("weight", 1.0) or 1.0),
                    sub.get("sort_override"),
                ),
            )

    # Blocklist (replace)
    if "blocklist" in payload:
        db.execute("DELETE FROM blocklist")
        for item in payload["blocklist"]:
            t = (item.get("type") or "").lower()
            v = item.get("value")
            if t in ("keyword", "author", "domain", "subreddit") and v:
                db.execute(
                    "INSERT OR IGNORE INTO blocklist(type, value, added_at) VALUES(?,?,?)",
                    (t, v, now),
                )

    return jsonify({"success": True, "imported_at": now})
