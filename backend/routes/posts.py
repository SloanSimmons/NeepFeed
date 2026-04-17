"""Post-level actions: seen/bookmark/hide + video URL refresh + bookmark list.

POST  /api/posts/<reddit_id>/seen       -> mark seen (idempotent)
POST  /api/posts/<reddit_id>/bookmark   -> toggle bookmark (body: {"bookmarked": bool} optional)
POST  /api/posts/<reddit_id>/hidden     -> mark hidden (idempotent)
DELETE /api/posts/<reddit_id>/hidden    -> unhide
GET   /api/posts/<reddit_id>/refresh-video -> fetch fresh video URL
GET   /api/bookmarks                    -> list bookmarked posts
POST  /api/posts/seen-batch             -> body: {"reddit_ids": [...]} — bulk mark seen from viewport
"""
from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

from db import get_db
from reddit_client import get_client
from scoring import FeedQuery, _row_to_dict

bp = Blueprint("posts", __name__)


def _ensure_post_exists(db, reddit_id: str) -> bool:
    row = db.execute("SELECT 1 FROM posts WHERE reddit_id=?", (reddit_id,)).fetchone()
    return row is not None


def _upsert_state(db, reddit_id: str, field: str, value) -> None:
    db.execute(
        f"INSERT INTO post_state(reddit_id, {field}) VALUES(?, ?) "
        f"ON CONFLICT(reddit_id) DO UPDATE SET {field}=excluded.{field}",
        (reddit_id, value),
    )


@bp.post("/posts/<reddit_id>/seen")
def mark_seen(reddit_id: str):
    db = get_db()
    if not _ensure_post_exists(db, reddit_id):
        return jsonify({"error": "post not found"}), 404
    _upsert_state(db, reddit_id, "seen_at", int(time.time()))
    return jsonify({"success": True, "reddit_id": reddit_id})


@bp.post("/posts/seen-batch")
def mark_seen_batch():
    """Mark a batch of posts as seen.

    Ids that reference posts no longer in the DB (pruned by the collection
    cleanup, or never existed) are silently skipped so the endpoint never
    fails the whole batch on a single stale id. Returns `marked` (posts
    that got updated) and `skipped` (ids that didn't match any post).
    """
    body = request.get_json(silent=True) or {}
    ids = [str(x).strip() for x in (body.get("reddit_ids") or []) if str(x).strip()]
    if not ids:
        return jsonify({"success": True, "marked": 0, "skipped": 0})

    db = get_db()
    now = int(time.time())

    # Prefilter against posts table to avoid FK-violation errors on stale ids.
    placeholders = ",".join(["?"] * len(ids))
    existing = {
        r["reddit_id"]
        for r in db.execute(
            f"SELECT reddit_id FROM posts WHERE reddit_id IN ({placeholders})", ids
        ).fetchall()
    }
    marked = 0
    for rid in ids:
        if rid not in existing:
            continue
        db.execute(
            "INSERT INTO post_state(reddit_id, seen_at) VALUES(?, ?) "
            "ON CONFLICT(reddit_id) DO UPDATE SET seen_at=COALESCE(post_state.seen_at, excluded.seen_at)",
            (rid, now),
        )
        marked += 1

    return jsonify({
        "success": True,
        "marked": marked,
        "skipped": len(ids) - marked,
    })


@bp.post("/posts/<reddit_id>/bookmark")
def toggle_bookmark(reddit_id: str):
    body = request.get_json(silent=True) or {}
    db = get_db()
    if not _ensure_post_exists(db, reddit_id):
        return jsonify({"error": "post not found"}), 404

    if "bookmarked" in body:
        target = bool(body["bookmarked"])
    else:
        row = db.execute(
            "SELECT bookmarked_at FROM post_state WHERE reddit_id=?", (reddit_id,)
        ).fetchone()
        target = not (row and row["bookmarked_at"])

    new_val = int(time.time()) if target else None
    _upsert_state(db, reddit_id, "bookmarked_at", new_val)
    return jsonify({"success": True, "reddit_id": reddit_id, "bookmarked": target})


@bp.post("/posts/<reddit_id>/hidden")
def mark_hidden(reddit_id: str):
    db = get_db()
    if not _ensure_post_exists(db, reddit_id):
        return jsonify({"error": "post not found"}), 404
    _upsert_state(db, reddit_id, "hidden_at", int(time.time()))
    return jsonify({"success": True, "reddit_id": reddit_id})


@bp.delete("/posts/<reddit_id>/hidden")
def unhide(reddit_id: str):
    db = get_db()
    _upsert_state(db, reddit_id, "hidden_at", None)
    return jsonify({"success": True, "reddit_id": reddit_id})


@bp.get("/posts/<reddit_id>/refresh-video")
def refresh_video(reddit_id: str):
    db = get_db()
    if not _ensure_post_exists(db, reddit_id):
        return jsonify({"error": "post not found"}), 404
    client = get_client()
    fresh = client.refresh_video_url(reddit_id)
    if fresh:
        db.execute("UPDATE posts SET video_url=? WHERE reddit_id=?", (fresh, reddit_id))
    return jsonify({"reddit_id": reddit_id, "video_url": fresh})


@bp.get("/bookmarks")
def list_bookmarks():
    db = get_db()
    limit = min(200, max(1, int(request.args.get("limit", 50))))
    offset = max(0, int(request.args.get("offset", 0)))
    rows = db.execute(
        "SELECT p.*, ps.seen_at, ps.bookmarked_at, ps.hidden_at "
        "FROM posts p JOIN post_state ps ON ps.reddit_id=p.reddit_id "
        "WHERE ps.bookmarked_at IS NOT NULL "
        "ORDER BY ps.bookmarked_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    posts = [_row_to_dict(r) for r in rows]
    total = db.execute(
        "SELECT COUNT(*) AS n FROM post_state WHERE bookmarked_at IS NOT NULL"
    ).fetchone()["n"]
    return jsonify({"posts": posts, "total": total, "offset": offset, "limit": limit})
