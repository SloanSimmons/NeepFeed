"""Collection job: fetches posts from Reddit (or mock), upserts into SQLite,
records score snapshots for velocity calculation, cleans up expired data.

The job is idempotent and safe to trigger manually via POST /api/collect/trigger.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from typing import Iterable

from db import new_connection
from reddit_client import PostData, RedditClient, get_client
from scoring import recompute_all_scores
from url_utils import url_hash

log = logging.getLogger("neepfeed.collection")

# Concurrency guard — only one collection at a time
_collection_lock = threading.Lock()


# ---------------------------------------------------------------------------
# DB helpers (use their own connection; not Flask-request-scoped)
# ---------------------------------------------------------------------------

def _get_active_subreddits(conn: sqlite3.Connection) -> list[str]:
    # DISTINCT because a subreddit can live in multiple lists post-v2.
    rows = conn.execute(
        "SELECT DISTINCT name FROM subscribed_subreddits WHERE active=1 ORDER BY name"
    ).fetchall()
    return [r["name"] for r in rows]


def _upsert_post(conn: sqlite3.Connection, p: PostData, now: int) -> bool:
    """Insert or update a post. Returns True if inserted, False if updated."""
    gallery_json = json.dumps(p.gallery_urls) if p.gallery_urls else None
    uh = url_hash(p.url) if p.url else None

    existing = conn.execute(
        "SELECT id, score, num_comments FROM posts WHERE reddit_id=?",
        (p.reddit_id,),
    ).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO posts (
                reddit_id, subreddit, title, url, permalink, author,
                score, num_comments, upvote_ratio, created_utc, fetched_at,
                last_scored_at, is_nsfw, is_video, thumbnail, video_url,
                selftext_preview, link_flair, post_hint, gallery_urls, url_hash
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                p.reddit_id, p.subreddit.lower(), p.title, p.url, p.permalink, p.author,
                p.score, p.num_comments, p.upvote_ratio, p.created_utc, now,
                now, int(p.is_nsfw), int(p.is_video), p.thumbnail, p.video_url,
                p.selftext_preview, p.link_flair, p.post_hint, gallery_json, uh,
            ),
        )
        # Mirror into FTS
        conn.execute(
            "INSERT INTO posts_fts(reddit_id, title, selftext_preview, subreddit, author) VALUES (?,?,?,?,?)",
            (p.reddit_id, p.title, p.selftext_preview or "", p.subreddit.lower(), p.author or ""),
        )
        return True
    else:
        conn.execute(
            """
            UPDATE posts SET
                score=?, num_comments=?, upvote_ratio=?, last_scored_at=?,
                video_url=COALESCE(?, video_url), thumbnail=COALESCE(?, thumbnail),
                link_flair=?, post_hint=COALESCE(?, post_hint),
                gallery_urls=COALESCE(?, gallery_urls), url_hash=COALESCE(?, url_hash)
            WHERE reddit_id=?
            """,
            (
                p.score, p.num_comments, p.upvote_ratio, now,
                p.video_url, p.thumbnail,
                p.link_flair, p.post_hint,
                gallery_json, uh,
                p.reddit_id,
            ),
        )
        return False


def _record_snapshot(conn: sqlite3.Connection, p: PostData, now: int) -> None:
    conn.execute(
        "INSERT INTO score_snapshots(reddit_id, score, num_comments, snapshot_at) VALUES (?,?,?,?)",
        (p.reddit_id, p.score, p.num_comments, now),
    )


def _update_new_sub_boosts(conn: sqlite3.Connection, now: int) -> None:
    """Flip is_new_boost flag on list-memberships added <7 days ago.

    Post-v2 each row is a (list_id, name) membership; a sub can have the boost
    active in one list and not another. Scoring reads ANY boost across lists,
    so this per-row treatment is correct.
    """
    seven_days = 7 * 24 * 3600
    conn.execute(
        "UPDATE subscribed_subreddits SET is_new_boost = CASE "
        "WHEN added_at IS NOT NULL AND (? - added_at) < ? THEN 1 ELSE 0 END",
        (now, seven_days),
    )


def _cleanup_old_posts(conn: sqlite3.Connection, now: int) -> int:
    """Delete posts beyond time_window + 24h buffer."""
    row = conn.execute("SELECT value FROM user_config WHERE key='time_window_hours'").fetchone()
    window_h = float(row["value"]) if row else 96.0
    cutoff = now - int((window_h + 24) * 3600)
    # Delete from FTS first (FKs don't cascade to virtual tables)
    conn.execute("DELETE FROM posts_fts WHERE reddit_id IN (SELECT reddit_id FROM posts WHERE created_utc < ?)", (cutoff,))
    cur = conn.execute("DELETE FROM posts WHERE created_utc < ?", (cutoff,))
    return cur.rowcount or 0


def _cleanup_old_snapshots(conn: sqlite3.Connection, now: int) -> int:
    cutoff = now - 7 * 24 * 3600
    cur = conn.execute("DELETE FROM score_snapshots WHERE snapshot_at < ?", (cutoff,))
    return cur.rowcount or 0


# ---------------------------------------------------------------------------
# Main job
# ---------------------------------------------------------------------------

def run_collection_once(client: RedditClient | None = None) -> dict:
    """Run one collection cycle. Returns a stats dict."""
    if not _collection_lock.acquire(blocking=False):
        log.info("Collection already in progress — skipping this tick")
        return {"skipped": True}

    started = time.time()
    stats = {"inserted": 0, "updated": 0, "subs": 0, "elapsed_s": 0.0, "errors": 0}

    try:
        client = client or get_client()
        conn = new_connection()
        try:
            subs = _get_active_subreddits(conn)
            stats["subs"] = len(subs)

            if not subs:
                log.info("No active subreddits — nothing to collect")
                return stats

            # Read collection mode from user_config (default: batched_hot)
            row = conn.execute("SELECT value FROM user_config WHERE key='collection_mode'").fetchone()
            mode = row["value"] if row else "batched_hot"
            log.info("Collection starting: mode=%s subs=%d", mode, len(subs))

            now = int(time.time())
            # Batch mode
            conn.execute("BEGIN")
            try:
                if mode == "per_sub_top":
                    for s in subs:
                        for p in client.fetch_top_day(s, limit=30):
                            inserted = _upsert_post(conn, p, now)
                            _record_snapshot(conn, p, now)
                            stats["inserted" if inserted else "updated"] += 1
                else:  # batched_hot (default)
                    for p in client.fetch_hot_batch(subs, limit_per_batch=100, batch_size=25):
                        inserted = _upsert_post(conn, p, now)
                        _record_snapshot(conn, p, now)
                        stats["inserted" if inserted else "updated"] += 1

                _update_new_sub_boosts(conn, now)
                # Recompute baseline scores for all posts in the window
                recompute_all_scores(conn)
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                stats["errors"] += 1
                log.exception("Collection transaction failed; rolled back")
                raise

            # Cleanup (separate transaction so it commits even if collection partially failed)
            conn.execute("BEGIN")
            removed_posts = _cleanup_old_posts(conn, now)
            removed_snaps = _cleanup_old_snapshots(conn, now)
            # Record last collection time
            conn.execute(
                "INSERT INTO user_config(key,value) VALUES('last_collection_at', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(now),),
            )
            conn.execute("COMMIT")
            stats["removed_posts"] = removed_posts
            stats["removed_snapshots"] = removed_snaps

        finally:
            conn.close()

    finally:
        stats["elapsed_s"] = round(time.time() - started, 2)
        _collection_lock.release()
        log.info("Collection done: %s", stats)

    return stats


# ---------------------------------------------------------------------------
# Scheduler wiring
# ---------------------------------------------------------------------------

_scheduler = None


def start_scheduler() -> None:
    """Start APScheduler background job. Safe to call multiple times (no-op after first)."""
    global _scheduler
    if _scheduler is not None:
        return

    # Skip in test contexts if explicitly disabled
    if os.environ.get("NEEPFEED_DISABLE_SCHEDULER") == "1":
        log.info("Scheduler disabled via NEEPFEED_DISABLE_SCHEDULER")
        return

    from apscheduler.schedulers.background import BackgroundScheduler

    interval = int(os.environ.get("COLLECTION_INTERVAL_MINUTES", "25"))
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        run_collection_once,
        "interval",
        minutes=interval,
        id="neepfeed-collection",
        coalesce=True,
        max_instances=1,
        next_run_time=None,  # don't auto-run on startup; let user trigger or wait
    )
    _scheduler.start()
    log.info("Scheduler started; collection runs every %d min", interval)


def trigger_now() -> dict:
    """Synchronously trigger a collection (for /api/collect/trigger and tests)."""
    return run_collection_once()
