"""GET /api/feed  +  GET /api/search (FTS5)."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from db import get_db, get_config
from scoring import FeedQuery, get_feed

bp = Blueprint("feed", __name__)


def _parse_bool(s: str | None, default: bool = False) -> bool:
    if s is None:
        return default
    return s.lower() in ("1", "true", "yes", "on")


@bp.get("/feed")
def feed():
    args = request.args
    # Pull settings-based defaults
    hide_nsfw_default = (get_config("hide_nsfw", "false") or "false").lower() == "true"
    sort_default = get_config("sort_mode", "calculated") or "calculated"
    min_score_default = int(get_config("min_score_threshold", "10") or 10)
    window_default = float(get_config("time_window_hours", "96") or 96)

    q = FeedQuery(
        sort=(args.get("sort") or sort_default).lower(),
        limit=min(100, max(1, int(args.get("limit", 25)))),
        offset=max(0, int(args.get("offset", 0))),
        hide_nsfw=_parse_bool(args.get("hide_nsfw"), hide_nsfw_default),
        hide_seen=_parse_bool(args.get("hide_seen"), False),
        min_score=int(args.get("min_score", min_score_default)),
        time_window_hours=float(args.get("window", window_default)),
        subreddit=(args.get("subreddit") or None),
        search=(args.get("q") or None),
    )

    if q.sort not in ("calculated", "score", "recency", "velocity"):
        return jsonify({"error": f"invalid sort: {q.sort}"}), 400

    return jsonify(get_feed(get_db(), q))


@bp.get("/search")
def search():
    """Alias for /api/feed with a required q parameter."""
    q_text = (request.args.get("q") or "").strip()
    if not q_text:
        return jsonify({"error": "missing q"}), 400
    # Reuse feed()'s handler by injecting q
    args = dict(request.args)
    args["q"] = q_text
    # Rebuild a feed query
    q = FeedQuery(
        sort=(args.get("sort") or "calculated").lower(),
        limit=min(100, max(1, int(args.get("limit", 25)))),
        offset=max(0, int(args.get("offset", 0))),
        search=q_text,
        hide_nsfw=_parse_bool(args.get("hide_nsfw"), False),
        min_score=0,  # don't gate search results on min_score
        time_window_hours=float(args.get("window", 24 * 30)),  # broader window for search
    )
    return jsonify(get_feed(get_db(), q))
