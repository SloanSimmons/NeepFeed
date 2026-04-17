"""Manual collection trigger.

    POST /api/collect/trigger   -> runs a collection synchronously, returns stats
"""
from __future__ import annotations

from flask import Blueprint, jsonify

from collection import trigger_now

bp = Blueprint("collect", __name__)


@bp.post("/collect/trigger")
def collect_trigger():
    stats = trigger_now()
    return jsonify(stats)
