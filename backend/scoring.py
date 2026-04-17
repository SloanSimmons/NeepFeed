"""Scoring + ranking.

Two layers:

1. Baseline score stored on each post (`posts.calculated_score`):
      final_score = base_score * recency_weight * sub_weight

   where
      recency_weight = 1 / (1 + age_hours ** decay_rate)
      sub_weight     = custom_weight * new_sub_boost

2. Re-ranking at feed-query time for things that depend on the *result set*:
      - Diversity cap (penalize posts from over-represented subs in the result)
      - Cross-post dedup (collapse posts sharing url_hash)
      - Velocity sort (derived from score_snapshots; computed at query time)

Sort modes (selected via `sort_mode` setting or ?sort= query arg):
   calculated (default)   baseline formula, re-ranked by diversity/dedup
   score                  raw reddit upvotes
   recency                newest first
   velocity               recent score growth (see _velocity below)
"""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass

log = logging.getLogger("neepfeed.scoring")


# ---------------------------------------------------------------------------
# Baseline scoring (stored on posts.calculated_score)
# ---------------------------------------------------------------------------

def _recency_weight(age_hours: float, decay_rate: float) -> float:
    age_hours = max(0.0, age_hours)
    return 1.0 / (1.0 + age_hours ** decay_rate)


def recompute_all_scores(conn: sqlite3.Connection) -> int:
    """Recompute posts.calculated_score for every post inside the time window.

    Run after collection (fresh scores/comments) and whenever settings that
    affect scoring change (decay_rate, per-sub weight, new_sub_weight).

    Returns the number of rows updated.
    """
    cfg = {
        row["key"]: row["value"]
        for row in conn.execute("SELECT key, value FROM user_config").fetchall()
    }
    decay_rate = float(cfg.get("decay_rate", "0.7"))
    window_h = float(cfg.get("time_window_hours", "96"))
    new_sub_weight = float(cfg.get("new_sub_weight", "1.5"))

    # Aggregate per-sub weights across lists: highest weight wins in "All Lists"
    # mode (which is what the stored calculated_score represents).
    # New-sub boost applies if ANY list-membership has the boost active.
    sub_rows = conn.execute(
        "SELECT name, MAX(weight) AS weight, MAX(is_new_boost) AS is_new_boost "
        "FROM subscribed_subreddits GROUP BY name"
    ).fetchall()
    weights = {r["name"]: float(r["weight"] or 1.0) for r in sub_rows}
    new_boost = {r["name"]: bool(r["is_new_boost"]) for r in sub_rows}

    now = int(time.time())
    cutoff = now - int(window_h * 3600)

    updated = 0
    # Batch UPDATE — fetch posts, compute, write back
    rows = conn.execute(
        "SELECT reddit_id, subreddit, score, created_utc FROM posts WHERE created_utc >= ?",
        (cutoff,),
    ).fetchall()
    for r in rows:
        sub = (r["subreddit"] or "").lower()
        age_h = max(0.0, (now - (r["created_utc"] or now)) / 3600.0)
        base = int(r["score"] or 0)
        rw = _recency_weight(age_h, decay_rate)
        sw = weights.get(sub, 1.0) * (new_sub_weight if new_boost.get(sub) else 1.0)
        calc = base * rw * sw
        conn.execute(
            "UPDATE posts SET calculated_score=?, last_scored_at=? WHERE reddit_id=?",
            (calc, now, r["reddit_id"]),
        )
        updated += 1
    return updated


# ---------------------------------------------------------------------------
# Velocity scoring (derived from snapshots, computed at query time)
# ---------------------------------------------------------------------------

def _velocity_for(conn: sqlite3.Connection, reddit_id: str, now: int) -> float:
    """velocity = (delta_1h * 10) + (delta_6h * 3) + current_score

    Uses the closest snapshot within [now-2h, now-0.5h] for the 1h window, and
    within [now-8h, now-4h] for the 6h window. Missing windows => 0 delta.
    """
    cur = conn.execute("SELECT score FROM posts WHERE reddit_id=?", (reddit_id,)).fetchone()
    if not cur:
        return 0.0
    current = int(cur["score"] or 0)

    def _closest_snapshot(target_ago_sec: int, tolerance_sec: int) -> int | None:
        target = now - target_ago_sec
        lo, hi = target - tolerance_sec, target + tolerance_sec
        row = conn.execute(
            "SELECT score FROM score_snapshots WHERE reddit_id=? AND snapshot_at BETWEEN ? AND ? "
            "ORDER BY ABS(snapshot_at - ?) LIMIT 1",
            (reddit_id, lo, hi, target),
        ).fetchone()
        return int(row["score"]) if row else None

    snap_1h = _closest_snapshot(3600, 45 * 60)       # 1h ago ±45min
    snap_6h = _closest_snapshot(6 * 3600, 2 * 3600)  # 6h ago ±2h

    d1 = (current - snap_1h) if snap_1h is not None else 0
    d6 = (current - snap_6h) if snap_6h is not None else 0
    return (d1 * 10.0) + (d6 * 3.0) + current


# ---------------------------------------------------------------------------
# Feed query + re-ranking
# ---------------------------------------------------------------------------

@dataclass
class FeedQuery:
    sort: str = "calculated"      # calculated | score | recency | velocity
    limit: int = 25
    offset: int = 0
    hide_nsfw: bool = False
    hide_seen: bool = False
    min_score: int = 0
    time_window_hours: float = 96.0
    subreddit: str | None = None   # filter to single sub
    search: str | None = None      # FTS5 query; None => all
    list_ids: list[int] | None = None  # None => All Lists; otherwise filter to these list ids


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    # Parse gallery_urls JSON
    if d.get("gallery_urls"):
        try:
            d["gallery_urls"] = json.loads(d["gallery_urls"])
        except (TypeError, json.JSONDecodeError):
            d["gallery_urls"] = []
    else:
        d["gallery_urls"] = []
    # Coerce booleans
    d["is_nsfw"] = bool(d.get("is_nsfw"))
    d["is_video"] = bool(d.get("is_video"))
    d["seen"] = bool(d.get("seen_at"))
    d["bookmarked"] = bool(d.get("bookmarked_at"))
    # Drop internal timestamp columns the UI doesn't need
    for k in ("seen_at", "bookmarked_at", "hidden_at"):
        d.pop(k, None)
    return d


def _load_blocklist(conn: sqlite3.Connection) -> dict[str, set[str]]:
    rows = conn.execute("SELECT type, value FROM blocklist").fetchall()
    out: dict[str, set[str]] = {"keyword": set(), "author": set(), "domain": set(), "subreddit": set()}
    for r in rows:
        out.setdefault(r["type"], set()).add((r["value"] or "").lower())
    return out


def _matches_blocklist(post: dict, bl: dict[str, set[str]]) -> bool:
    title = (post.get("title") or "").lower()
    author = (post.get("author") or "").lower()
    sub = (post.get("subreddit") or "").lower()
    url = (post.get("url") or "").lower()

    if author in bl["author"]:
        return True
    if sub in bl["subreddit"]:
        return True
    if any(kw in title for kw in bl["keyword"] if kw):
        return True
    if any(d in url for d in bl["domain"] if d):
        return True
    return False


def _apply_diversity_cap(posts: list[dict], cap: float) -> list[dict]:
    """Re-rank so no single sub exceeds `cap` fraction of the first N positions.

    Implementation: greedy pass; at each position, prefer the highest-scoring
    post whose sub hasn't exceeded the running cap. If forced (no valid
    alternative), take the best available regardless.
    """
    if cap <= 0 or cap >= 1 or not posts:
        return posts

    total = len(posts)
    max_per_sub = max(1, int(total * cap))
    result: list[dict] = []
    seen_counts: dict[str, int] = {}
    remaining = posts.copy()

    while remaining:
        # Find the best candidate whose sub is still under cap
        chosen_idx = None
        for i, p in enumerate(remaining):
            if seen_counts.get(p["subreddit"], 0) < max_per_sub:
                chosen_idx = i
                break
        if chosen_idx is None:
            # All remaining subs are at cap — just take the highest-scoring
            chosen_idx = 0
        chosen = remaining.pop(chosen_idx)
        seen_counts[chosen["subreddit"]] = seen_counts.get(chosen["subreddit"], 0) + 1
        result.append(chosen)
    return result


def _apply_crosspost_dedup(posts: list[dict], sort: str = "calculated") -> list[dict]:
    """Collapse posts sharing url_hash. The winner depends on the active sort
    so dedup doesn't reorder against the caller's expectation:

      calculated -> highest calculated_score
      score      -> highest raw upvotes
      recency    -> newest (first in sorted list)
      velocity   -> first in sorted list (caller already velocity-sorted)

    For 'calculated' and 'score', we break ties by picking the first
    occurrence (stable). For 'recency' and 'velocity', picking the first
    occurrence in the already-sorted input IS the correct winner.
    """
    # Group by hash while preserving first-seen order
    order: list[str] = []
    by_hash: dict[str, list[dict]] = {}
    nonhashed: list[dict] = []
    for p in posts:
        h = p.get("url_hash")
        if not h:
            nonhashed.append(p)
            continue
        if h not in by_hash:
            order.append(h)
            by_hash[h] = []
        by_hash[h].append(p)

    # Pick a winner per group according to sort
    def pick(group: list[dict]) -> dict:
        if sort == "score":
            return max(group, key=lambda x: (x.get("score") or 0))
        if sort == "calculated":
            return max(group, key=lambda x: (x.get("calculated_score") or 0))
        # recency / velocity / anything else: trust the caller's ordering
        return group[0]

    out: list[dict] = []
    for key in order:
        group = by_hash[key]
        best = pick(group)
        others = [g for g in group if g is not best]
        if others:
            best = {
                **best,
                "crossposts": [
                    {"subreddit": o["subreddit"], "reddit_id": o["reddit_id"]} for o in others
                ],
            }
        out.append(best)

    out.extend(nonhashed)
    return out


def get_feed(conn: sqlite3.Connection, q: FeedQuery) -> dict:
    """Fetch a paginated feed according to query options + settings/blocklist."""
    cfg = {
        row["key"]: row["value"]
        for row in conn.execute("SELECT key, value FROM user_config").fetchall()
    }
    diversity_cap = float(cfg.get("diversity_cap", "0.3"))
    dedup_enabled = cfg.get("dedup_crossposts", "true").lower() == "true"
    hide_seen_setting = cfg.get("hide_seen", "false").lower() == "true"
    blocklist = _load_blocklist(conn)

    now = int(time.time())
    cutoff = now - int(q.time_window_hours * 3600)

    # Build filtered base query — over-fetch to survive post-filtering (blocklist, dedup, diversity)
    over_fetch_factor = 4  # conservative; tuned so a typical page still fills after dedup
    want = q.offset + q.limit
    fetch_n = want * over_fetch_factor

    sort_sql = {
        "calculated": "p.calculated_score DESC",
        "score":      "p.score DESC",
        "recency":    "p.created_utc DESC",
        "velocity":   "p.calculated_score DESC",  # placeholder; we re-sort in Python for velocity
    }.get(q.sort, "p.calculated_score DESC")

    params: list = [cutoff, q.min_score]
    where = ["p.created_utc >= ?", "COALESCE(p.score, 0) >= ?"]

    # Exclude hidden always
    where.append("NOT EXISTS (SELECT 1 FROM post_state ps WHERE ps.reddit_id=p.reddit_id AND ps.hidden_at IS NOT NULL)")

    if q.hide_nsfw:
        where.append("p.is_nsfw = 0")
    if q.subreddit:
        where.append("p.subreddit = ?")
        params.append(q.subreddit.lower())
    if q.list_ids:
        placeholders = ",".join(["?"] * len(q.list_ids))
        where.append(
            f"p.subreddit IN (SELECT name FROM subscribed_subreddits "
            f"WHERE list_id IN ({placeholders}) AND active=1)"
        )
        params.extend(q.list_ids)

    hide_seen_effective = q.hide_seen or hide_seen_setting
    if hide_seen_effective:
        where.append("NOT EXISTS (SELECT 1 FROM post_state ps WHERE ps.reddit_id=p.reddit_id AND ps.seen_at IS NOT NULL)")

    # Search (FTS5): if q.search, filter to matching reddit_ids.
    # User search input is plain text, NOT a raw FTS5 expression. Tokens like
    # 'OR', 'AND', 'NEAR', unbalanced quotes, and the column: prefix are FTS5
    # syntax and would either 500 or behave unexpectedly. We tokenize on
    # whitespace and quote each token so the query becomes a safe ANDed
    # phrase match.
    if q.search:
        tokens = [
            t for t in q.search.split()
            if t and not any(ch in t for ch in '"*:()')
        ]
        if tokens:
            # Each token as a quoted phrase; ANDed together by default.
            match = " ".join(f'"{t}"' for t in tokens)
            where.append("p.reddit_id IN (SELECT reddit_id FROM posts_fts WHERE posts_fts MATCH ?)")
            params.append(match)
        else:
            # All tokens filtered out -> no results
            where.append("1=0")

    where_sql = " AND ".join(where)

    sql = f"""
        SELECT p.*, ps.seen_at, ps.bookmarked_at, ps.hidden_at
        FROM posts p
        LEFT JOIN post_state ps ON ps.reddit_id = p.reddit_id
        WHERE {where_sql}
        ORDER BY {sort_sql}
        LIMIT ?
    """
    params.append(fetch_n)

    rows = conn.execute(sql, params).fetchall()
    posts = [_row_to_dict(r) for r in rows]

    # Blocklist filter (app-side because keywords are substring-matched)
    if any(blocklist.values()):
        posts = [p for p in posts if not _matches_blocklist(p, blocklist)]

    # Velocity re-sort
    if q.sort == "velocity":
        for p in posts:
            p["_velocity"] = _velocity_for(conn, p["reddit_id"], now)
        posts.sort(key=lambda p: p["_velocity"], reverse=True)
        for p in posts:
            p.pop("_velocity", None)

    # Cross-post dedup (winner selection depends on the active sort)
    if dedup_enabled:
        posts = _apply_crosspost_dedup(posts, sort=q.sort)

    # Diversity cap (only meaningful for 'calculated' sort where ordering is by score)
    if q.sort == "calculated" and diversity_cap > 0:
        posts = _apply_diversity_cap(posts, diversity_cap)

    # Page slice
    total_before_slice = len(posts)
    page = posts[q.offset : q.offset + q.limit]

    # Total estimate (post-filter) — exact count is expensive; give approximate based on baseline rows
    # Cheaper: use the pre-filter count (before blocklist/dedup/cap) so the UI can show "~N posts".
    # For simplicity report the number we fetched that matched the SQL filter.
    est_total_row = conn.execute(
        f"SELECT COUNT(*) AS n FROM posts p WHERE {where_sql.replace(' LIMIT ?','')}",
        params[:-1],
    ).fetchone()
    est_total = est_total_row["n"] if est_total_row else total_before_slice

    return {
        "posts": page,
        "total": est_total,
        "offset": q.offset,
        "limit": q.limit,
        "sort": q.sort,
    }
