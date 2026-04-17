"""Skin system — built-in names + custom skin JSON blobs.

Built-in skins (Dark / Light / Paper) live on the frontend. The backend
only stores:
  - user_config.active_skin  — name of the currently applied skin
  - user_config.custom_skins — JSON array of full custom skin objects

Contrast validation and CSS value sanity checks run on the frontend.
Here we validate the JSON shape, name uniqueness, and basic size guards.
"""
from __future__ import annotations

import json
import re

from flask import Blueprint, jsonify, request

from db import get_db, get_config, set_config

bp = Blueprint("skins", __name__)

BUILTIN_NAMES = {"dark", "light", "paper"}
DEFAULT_ACTIVE = "dark"

MAX_SKIN_JSON_BYTES = 16 * 1024    # 16KB per skin is already huge
MAX_CUSTOM_SKINS = 50
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9 _\-]{0,48}[a-z0-9]$", re.IGNORECASE)
VAR_RE = re.compile(r"^--nf-[a-z0-9-]+$")


def _load_custom_skins() -> list[dict]:
    raw = get_config("custom_skins", "[]") or "[]"
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def _save_custom_skins(skins: list[dict]) -> None:
    set_config("custom_skins", json.dumps(skins))


def _validate_skin_shape(skin: dict) -> str | None:
    """Returns an error string, or None if valid."""
    if not isinstance(skin, dict):
        return "skin must be an object"

    name = skin.get("name")
    if not isinstance(name, str) or not name.strip():
        return "name is required"
    if not NAME_RE.match(name.strip()):
        return "name has invalid characters (letters/numbers/space/dash/underscore only)"

    version = skin.get("version")
    if version != 1:
        return "version must be 1"

    variables = skin.get("variables")
    if not isinstance(variables, dict) or not variables:
        return "variables must be a non-empty object"

    # Only accept --nf-* keys to prevent injection of unrelated CSS props
    for key, val in variables.items():
        if not isinstance(key, str) or not VAR_RE.match(key):
            return f"invalid variable name: {key!r}"
        if not isinstance(val, str):
            return f"variable {key!r} value must be a string"
        if len(val) > 200:
            return f"variable {key!r} value too long"
        # Reject obvious CSS injection: no ; } { @ closing chars
        if any(ch in val for ch in (";", "{", "}", "@")):
            return f"variable {key!r} contains disallowed characters"

    encoded = json.dumps(skin).encode("utf-8")
    if len(encoded) > MAX_SKIN_JSON_BYTES:
        return f"skin JSON too large ({len(encoded)} bytes, max {MAX_SKIN_JSON_BYTES})"

    return None


def _get_active() -> str:
    active = get_config("active_skin", DEFAULT_ACTIVE) or DEFAULT_ACTIVE
    return active.strip().lower()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@bp.get("/skins")
def list_skins():
    custom = _load_custom_skins()
    active = _get_active()
    return jsonify({
        "built_in": sorted(BUILTIN_NAMES),
        "custom": custom,
        "active": active,
    })


@bp.post("/skins")
def save_skin():
    skin = request.get_json(silent=True)
    err = _validate_skin_shape(skin if isinstance(skin, dict) else {})
    if err:
        return jsonify({"error": err}), 400

    name = skin["name"].strip()
    name_lower = name.lower()
    if name_lower in BUILTIN_NAMES:
        return jsonify({"error": "name conflicts with a built-in skin"}), 409

    custom = _load_custom_skins()
    if any(s.get("name", "").lower() == name_lower for s in custom):
        return jsonify({"error": "a custom skin with this name already exists"}), 409

    if len(custom) >= MAX_CUSTOM_SKINS:
        return jsonify({"error": f"max {MAX_CUSTOM_SKINS} custom skins reached"}), 400

    # Canonicalize: normalize name case but keep user-given display
    custom.append(skin)
    _save_custom_skins(custom)
    return jsonify({"success": True, "skin": skin})


@bp.patch("/skins/<name>")
def update_skin(name: str):
    name_lower = name.strip().lower()
    if name_lower in BUILTIN_NAMES:
        return jsonify({"error": "built-in skins cannot be edited"}), 400

    payload = request.get_json(silent=True) or {}
    # Allow rename if 'name' present in payload; else keep original
    new_skin = {
        "name": payload.get("name", name),
        "author": payload.get("author"),
        "version": payload.get("version", 1),
        "variables": payload.get("variables", {}),
    }
    err = _validate_skin_shape(new_skin)
    if err:
        return jsonify({"error": err}), 400

    custom = _load_custom_skins()
    idx = next(
        (i for i, s in enumerate(custom) if s.get("name", "").lower() == name_lower),
        None,
    )
    if idx is None:
        return jsonify({"error": "not found"}), 404

    # If renaming, check for conflicts
    new_name_lower = new_skin["name"].strip().lower()
    if new_name_lower != name_lower:
        if new_name_lower in BUILTIN_NAMES:
            return jsonify({"error": "name conflicts with a built-in skin"}), 409
        if any(
            i != idx and s.get("name", "").lower() == new_name_lower
            for i, s in enumerate(custom)
        ):
            return jsonify({"error": "a custom skin with this name already exists"}), 409
        # Update active_skin if this was the active one
        if _get_active() == name_lower:
            set_config("active_skin", new_skin["name"])

    custom[idx] = new_skin
    _save_custom_skins(custom)
    return jsonify({"success": True, "skin": new_skin})


@bp.delete("/skins/<name>")
def delete_skin(name: str):
    name_lower = name.strip().lower()
    if name_lower in BUILTIN_NAMES:
        return jsonify({"error": "built-in skins cannot be deleted"}), 400

    custom = _load_custom_skins()
    new_list = [s for s in custom if s.get("name", "").lower() != name_lower]
    if len(new_list) == len(custom):
        return jsonify({"error": "not found"}), 404

    _save_custom_skins(new_list)

    # If active, revert to default
    if _get_active() == name_lower:
        set_config("active_skin", DEFAULT_ACTIVE)

    return jsonify({"success": True, "deleted": name})


@bp.post("/skins/active")
def set_active_skin():
    body = request.get_json(silent=True) or {}
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400

    name_lower = name.lower()
    if name_lower in BUILTIN_NAMES:
        set_config("active_skin", name_lower)
        return jsonify({"success": True, "active": name_lower})

    custom = _load_custom_skins()
    if not any(s.get("name", "").lower() == name_lower for s in custom):
        return jsonify({"error": "skin not found"}), 404
    set_config("active_skin", name)
    return jsonify({"success": True, "active": name})
