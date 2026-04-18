"""Reddit client abstraction.

Three implementations:
  - MockRedditClient: generates realistic synthetic posts, no network required.
    Explicit opt-in via REDDIT_CLIENT_MODE=mock for offline dev.
  - HTTPRedditClient: hits Reddit's public .json endpoints (no OAuth). Default.
  - PRAWRedditClient: real Reddit API via PRAW, activated when OAuth env vars
    are set or REDDIT_CLIENT_MODE=praw. Retained in case a Reddit app is ever
    approved under the post-Nov-2025 Responsible Builder Policy.

All three expose the same interface so the collection job doesn't care which
is active:

    fetch_hot_batch(subreddits, limit_per_batch=100, batch_size=25) -> Iterable[PostData]
    fetch_top_day(subreddit, limit=30) -> Iterable[PostData]
    refresh_video_url(reddit_id) -> str | None

`PostData` is a lightweight dataclass; the collection module handles DB insert/update.
"""
from __future__ import annotations

import json
import logging
import os
import random
import time
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator, Protocol

log = logging.getLogger("neepfeed.reddit")


# ---------------------------------------------------------------------------
# Data model shared between mock and real client
# ---------------------------------------------------------------------------

@dataclass
class PostData:
    reddit_id: str
    subreddit: str
    title: str
    url: str
    permalink: str
    author: str
    score: int
    num_comments: int
    upvote_ratio: float
    created_utc: int
    is_nsfw: bool = False
    is_video: bool = False
    thumbnail: str | None = None
    video_url: str | None = None
    selftext_preview: str | None = None
    link_flair: str | None = None
    post_hint: str | None = None
    gallery_urls: list[str] = field(default_factory=list)


class RedditClient(Protocol):
    def fetch_hot_batch(
        self,
        subreddits: list[str],
        limit_per_batch: int = 100,
        batch_size: int = 25,
    ) -> Iterable[PostData]: ...

    def fetch_top_day(self, subreddit: str, limit: int = 30) -> Iterable[PostData]: ...

    def refresh_video_url(self, reddit_id: str) -> str | None: ...


# ---------------------------------------------------------------------------
# Mock client
# ---------------------------------------------------------------------------

# Public sample media for realistic previews
_SAMPLE_VIDEOS = [
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
]

# Plausible-looking usernames (not real)
_AUTHORS = [
    "throwaway4857", "deleted_user", "notabot", "coffee_gremlin", "sgtmittens",
    "alice_liddell", "bearclawz", "pineapple_express", "kernelpanik", "redstapler",
    "nocturne88", "hashmapqueen", "saltybeacon", "hexless", "midwestmoth",
    "quietgarden", "ziggy_played_guitar", "typo_baron", "mrs_sandwich", "foobarbaz",
]

# Flair pools (used when a sub seems to want them)
_FLAIR_POOLS = {
    "default": [None, "Discussion", "Question", "News", "Showcase", "Meta"],
    "tech": ["Discussion", "Question", "Help", "News", "Showcase", "Meta", "Rant"],
    "gaming": ["News", "Discussion", "Clip", "Screenshot", "Humor", "Question"],
    "news": ["Politics", "International", "US", "Opinion", "Analysis"],
}

# Subreddit archetypes influence post-type mix and title style.
_ARCHETYPES = {
    "tech":   {"self": 0.25, "link": 0.50, "image": 0.15, "video": 0.05, "gallery": 0.05},
    "gaming": {"self": 0.15, "link": 0.15, "image": 0.35, "video": 0.25, "gallery": 0.10},
    "news":   {"self": 0.05, "link": 0.85, "image": 0.05, "video": 0.03, "gallery": 0.02},
    "pics":   {"self": 0.02, "link": 0.08, "image": 0.65, "video": 0.05, "gallery": 0.20},
    "mixed":  {"self": 0.20, "link": 0.30, "image": 0.25, "video": 0.15, "gallery": 0.10},
}

_TITLE_SNIPPETS = {
    "self": [
        "I finally understand why {topic} matters",
        "Unpopular opinion about {topic}",
        "My 5-year journey with {topic}",
        "What's your take on {topic}?",
        "Looking for advice on {topic}",
        "Confession: I've been wrong about {topic} this whole time",
    ],
    "link": [
        "{topic} — deep dive analysis",
        "Breaking: {topic} hits new milestone",
        "The hidden story behind {topic}",
        "Why {topic} is changing everything",
        "Long read: {topic} explained",
    ],
    "image": [
        "First attempt at {topic} 📷",
        "{topic} at golden hour",
        "[OC] my take on {topic}",
        "Caught this {topic} shot yesterday",
    ],
    "video": [
        "Watch: {topic} in slow motion",
        "30-second clip: {topic}",
        "They said it couldn't be done — {topic}",
        "Timelapse of {topic}",
    ],
    "gallery": [
        "Album: {topic} — 5 pics",
        "{topic} progression over 6 months",
        "Before/after: {topic}",
    ],
}

_TOPICS = [
    "Rust ownership", "home lab setup", "sourdough starter", "indie game dev",
    "cold-brew coffee", "self-hosted apps", "the new Mac Studio", "espresso pulls",
    "fountain pen inks", "mechanical keyboards", "Kubernetes at home", "vintage synths",
    "plant propagation", "wood joinery", "3D printing", "vintage cameras",
    "LLM evals", "beer brewing", "cyberdeck builds", "ham radio",
]


def _archetype_for(sub: str) -> str:
    s = sub.lower()
    if any(k in s for k in ("program", "python", "rust", "golang", "devops", "linux", "selfhosted", "homelab")):
        return "tech"
    if any(k in s for k in ("gaming", "games", "minecraft", "indie", "nintendo", "playstation", "xbox")):
        return "gaming"
    if any(k in s for k in ("news", "world", "politics", "economy", "geopolitics")):
        return "news"
    if any(k in s for k in ("pic", "photo", "earthporn", "natureisfu", "wallpaper")):
        return "pics"
    return "mixed"


def _weighted_choice(mix: dict[str, float], rng: random.Random) -> str:
    r = rng.random()
    acc = 0.0
    for kind, p in mix.items():
        acc += p
        if r <= acc:
            return kind
    return next(iter(mix))


def _log_normal_score(rng: random.Random, base: int = 200) -> int:
    """Log-normal-ish score distribution; occasionally spikes to 10k-50k."""
    r = rng.random()
    if r > 0.98:
        return rng.randint(15000, 50000)
    if r > 0.85:
        return rng.randint(2000, 15000)
    if r > 0.55:
        return rng.randint(200, 2000)
    return rng.randint(5, 200)


def _random_age_hours(rng: random.Random, max_hours: int = 24) -> float:
    """Biased toward recent (within last 6h)."""
    r = rng.random()
    if r < 0.5:
        return rng.uniform(0, 3)
    if r < 0.85:
        return rng.uniform(3, 12)
    return rng.uniform(12, max_hours)


class MockRedditClient:
    """Generates realistic synthetic posts for development."""

    def __init__(self, seed: int | None = None):
        self._rng = random.Random(seed if seed is not None else time.time_ns())

    # -- internal generator ------------------------------------------------

    def _make_post(self, subreddit: str, archetype: str | None = None) -> PostData:
        rng = self._rng
        arche = archetype or _archetype_for(subreddit)
        mix = _ARCHETYPES[arche]
        kind = _weighted_choice(mix, rng)

        topic = rng.choice(_TOPICS)
        title = rng.choice(_TITLE_SNIPPETS[kind]).format(topic=topic)

        # Unique-ish reddit-style base36 id (6-7 chars)
        reddit_id = "".join(rng.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=7))

        created_hours_ago = _random_age_hours(rng)
        created_utc = int(time.time() - created_hours_ago * 3600)

        score = _log_normal_score(rng)
        num_comments = max(0, int(score * rng.uniform(0.05, 0.35)))
        upvote_ratio = round(rng.uniform(0.72, 0.99), 2)

        author = rng.choice(_AUTHORS)
        permalink = f"/r/{subreddit}/comments/{reddit_id}/"
        base_url = f"https://reddit.com{permalink}"
        is_nsfw = rng.random() < 0.04

        flair_pool = _FLAIR_POOLS.get(arche if arche in _FLAIR_POOLS else "default", _FLAIR_POOLS["default"])
        link_flair = rng.choice(flair_pool)

        post = PostData(
            reddit_id=reddit_id,
            subreddit=subreddit,
            title=title,
            url=base_url,
            permalink=permalink,
            author=author,
            score=score,
            num_comments=num_comments,
            upvote_ratio=upvote_ratio,
            created_utc=created_utc,
            is_nsfw=is_nsfw,
            link_flair=link_flair,
        )

        if kind == "self":
            post.post_hint = "self"
            post.selftext_preview = (
                f"Been thinking about {topic} lately. Long post incoming with my thoughts, "
                f"some data, and a couple of questions for the community. "
                f"First, a bit of background on why this matters..."
            )[:300]
        elif kind == "link":
            post.post_hint = "link"
            host = rng.choice(["arstechnica.com", "theverge.com", "nytimes.com", "bbc.com", "wired.com", "bloomberg.com"])
            slug = topic.lower().replace(" ", "-")
            post.url = f"https://{host}/article/{slug}-{reddit_id}"
            post.thumbnail = f"https://picsum.photos/seed/{reddit_id}/320/180"
        elif kind == "image":
            post.post_hint = "image"
            post.url = f"https://picsum.photos/seed/{reddit_id}/1200/900"
            post.thumbnail = f"https://picsum.photos/seed/{reddit_id}/320/240"
        elif kind == "video":
            post.post_hint = "hosted:video"
            post.is_video = True
            post.video_url = rng.choice(_SAMPLE_VIDEOS)
            post.thumbnail = f"https://picsum.photos/seed/{reddit_id}/640/360"
        elif kind == "gallery":
            post.post_hint = "gallery"
            n = rng.randint(3, 7)
            post.gallery_urls = [
                f"https://picsum.photos/seed/{reddit_id}-{i}/1200/900" for i in range(n)
            ]
            post.thumbnail = f"https://picsum.photos/seed/{reddit_id}-0/320/240"
            post.url = f"https://reddit.com/gallery/{reddit_id}"

        # A small fraction of posts are cross-posts of an existing URL (same URL across subs).
        # We simulate this by re-using a deterministic URL for some image posts.
        if kind in ("image", "link") and rng.random() < 0.08:
            shared = rng.choice([
                "https://www.nytimes.com/2026/04/14/climate/heat-dome.html",
                "https://picsum.photos/seed/shared-hot-123/1200/900",
                "https://youtu.be/dQw4w9WgXcQ",
            ])
            post.url = shared
            if shared.startswith("https://picsum.photos"):
                post.thumbnail = f"https://picsum.photos/seed/shared-hot-123/320/240"

        return post

    # -- interface ---------------------------------------------------------

    def fetch_hot_batch(
        self,
        subreddits: list[str],
        limit_per_batch: int = 100,
        batch_size: int = 25,
    ) -> Iterator[PostData]:
        if not subreddits:
            return iter(())
        # Mimic reddit's interleaved hot across a batch.
        # We just round-robin through the sub list, generating roughly limit_per_batch posts
        # distributed across them, weighted slightly toward larger-looking subs.
        rng = self._rng
        for i in range(0, len(subreddits), batch_size):
            batch = subreddits[i : i + batch_size]
            # Simulate Reddit's hot merge: produce ~min(limit_per_batch, 12 posts/sub),
            # with posts distributed proportionally to (uniform) simulated activity weights.
            n = min(limit_per_batch, len(batch) * 12)
            weights = [rng.uniform(0.5, 1.5) for _ in batch]
            for _ in range(n):
                sub = rng.choices(batch, weights=weights, k=1)[0]
                yield self._make_post(sub)

    def fetch_top_day(self, subreddit: str, limit: int = 30) -> Iterator[PostData]:
        for _ in range(limit):
            yield self._make_post(subreddit)

    def refresh_video_url(self, reddit_id: str) -> str | None:
        # Mock: pick a "new" sample video (pretend CDN URL changed)
        return self._rng.choice(_SAMPLE_VIDEOS)


# ---------------------------------------------------------------------------
# PRAW client (real Reddit API)
# ---------------------------------------------------------------------------

class PRAWRedditClient:
    """Real Reddit API client using PRAW.

    Activated when all four env vars are set:
        REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
    """

    def __init__(self):
        import praw  # lazy import — not needed in mock-only dev
        self._praw = praw
        self._reddit = praw.Reddit(
            client_id=os.environ["REDDIT_CLIENT_ID"],
            client_secret=os.environ["REDDIT_CLIENT_SECRET"],
            username=os.environ["REDDIT_USERNAME"],
            password=os.environ["REDDIT_PASSWORD"],
            user_agent=os.environ.get("REDDIT_USER_AGENT", "NeepFeed/1.0"),
        )
        # Sanity check auth lazily — PRAW will actually hit the API on first request
        log.info("PRAWRedditClient initialized (user=%s)", os.environ.get("REDDIT_USERNAME"))

    def _to_postdata(self, sub) -> PostData:
        # Extract video URL for hosted videos
        video_url = None
        if getattr(sub, "is_video", False) and getattr(sub, "media", None):
            reddit_video = sub.media.get("reddit_video", {}) if isinstance(sub.media, dict) else {}
            video_url = reddit_video.get("fallback_url")

        # Galleries
        gallery_urls: list[str] = []
        if getattr(sub, "is_gallery", False) and getattr(sub, "media_metadata", None):
            for _mid, meta in sub.media_metadata.items():
                # meta['s']['u'] is the full-size URL (HTML-encoded)
                try:
                    url = meta["s"]["u"].replace("&amp;", "&")
                    gallery_urls.append(url)
                except (KeyError, TypeError):
                    continue

        # Selftext preview
        selftext_preview = None
        if getattr(sub, "is_self", False) and getattr(sub, "selftext", None):
            selftext_preview = sub.selftext[:300]

        # Thumbnail: "self", "default", "" are placeholders — skip them
        thumb = getattr(sub, "thumbnail", None)
        if thumb in ("self", "default", "nsfw", "spoiler", "image", ""):
            thumb = None

        # post_hint: Reddit sometimes doesn't set this
        post_hint = getattr(sub, "post_hint", None)
        if not post_hint:
            if getattr(sub, "is_video", False):
                post_hint = "hosted:video"
            elif getattr(sub, "is_gallery", False):
                post_hint = "gallery"
            elif getattr(sub, "is_self", False):
                post_hint = "self"
            else:
                post_hint = "link"

        return PostData(
            reddit_id=sub.id,
            subreddit=str(sub.subreddit).lower(),
            title=sub.title,
            url=sub.url,
            permalink=sub.permalink,
            author=str(sub.author) if sub.author else "[deleted]",
            score=sub.score,
            num_comments=sub.num_comments,
            upvote_ratio=sub.upvote_ratio,
            created_utc=int(sub.created_utc),
            is_nsfw=bool(sub.over_18),
            is_video=bool(getattr(sub, "is_video", False)),
            thumbnail=thumb,
            video_url=video_url,
            selftext_preview=selftext_preview,
            link_flair=getattr(sub, "link_flair_text", None),
            post_hint=post_hint,
            gallery_urls=gallery_urls,
        )

    def fetch_hot_batch(
        self,
        subreddits: list[str],
        limit_per_batch: int = 100,
        batch_size: int = 25,
    ) -> Iterator[PostData]:
        if not subreddits:
            return iter(())
        for i in range(0, len(subreddits), batch_size):
            batch = subreddits[i : i + batch_size]
            try:
                joined = "+".join(batch)
                for sub in self._reddit.subreddit(joined).hot(limit=limit_per_batch):
                    yield self._to_postdata(sub)
                # Rate limit: ~1 req/sec
                time.sleep(1.0)
            except Exception as e:  # noqa: BLE001 — we want to keep going
                log.warning("Batch %s failed: %s", batch, e)
                continue

    def fetch_top_day(self, subreddit: str, limit: int = 30) -> Iterator[PostData]:
        try:
            for sub in self._reddit.subreddit(subreddit).top(time_filter="day", limit=limit):
                yield self._to_postdata(sub)
        except Exception as e:  # noqa: BLE001
            log.warning("top/day for r/%s failed: %s", subreddit, e)

    def refresh_video_url(self, reddit_id: str) -> str | None:
        try:
            sub = self._reddit.submission(id=reddit_id)
            if getattr(sub, "is_video", False) and getattr(sub, "media", None):
                reddit_video = sub.media.get("reddit_video", {}) if isinstance(sub.media, dict) else {}
                return reddit_video.get("fallback_url")
        except Exception as e:  # noqa: BLE001
            log.warning("refresh_video_url(%s) failed: %s", reddit_id, e)
        return None


# ---------------------------------------------------------------------------
# HTTP client (public Reddit JSON endpoints — no OAuth)
# ---------------------------------------------------------------------------

def _to_postdata(d: dict[str, Any]) -> PostData:
    """Map a Reddit child `data` dict (from raw_json=1 responses) to PostData."""
    media = d.get("media") or {}
    reddit_video = media.get("reddit_video") if isinstance(media, dict) else None
    video_url = reddit_video.get("fallback_url") if isinstance(reddit_video, dict) else None

    gallery_urls: list[str] = []
    if d.get("is_gallery") and isinstance(d.get("media_metadata"), dict):
        for _mid, meta in d["media_metadata"].items():
            try:
                gallery_urls.append(meta["s"]["u"])
            except (KeyError, TypeError):
                continue

    selftext_preview = None
    if d.get("is_self") and d.get("selftext"):
        selftext_preview = d["selftext"][:300]

    thumb = d.get("thumbnail")
    if thumb in ("self", "default", "nsfw", "spoiler", "image", "", None):
        thumb = None

    post_hint = d.get("post_hint")
    if not post_hint:
        if d.get("is_video"):
            post_hint = "hosted:video"
        elif d.get("is_gallery"):
            post_hint = "gallery"
        elif d.get("is_self"):
            post_hint = "self"
        else:
            post_hint = "link"

    return PostData(
        reddit_id=d["id"],
        subreddit=str(d["subreddit"]).lower(),
        title=d["title"],
        url=d.get("url") or "",
        permalink=d.get("permalink") or "",
        author=d.get("author") or "[deleted]",
        score=int(d.get("score") or 0),
        num_comments=int(d.get("num_comments") or 0),
        upvote_ratio=float(d.get("upvote_ratio") or 0.0),
        created_utc=int(d.get("created_utc") or 0),
        is_nsfw=bool(d.get("over_18")),
        is_video=bool(d.get("is_video")),
        thumbnail=thumb,
        video_url=video_url,
        selftext_preview=selftext_preview,
        link_flair=d.get("link_flair_text"),
        post_hint=post_hint,
        gallery_urls=gallery_urls,
    )


_COOKIE_CONFIG_KEY = "_reddit_session_cookie"
_STALE_CONFIG_KEY = "_reddit_session_stale"


def _load_reddit_cookie_from_db() -> str | None:
    """Read the stored Reddit session cookie without a Flask request context."""
    try:
        from db import new_connection
    except ImportError:
        return None
    conn = None
    try:
        conn = new_connection()
        row = conn.execute(
            "SELECT value FROM user_config WHERE key=?", (_COOKIE_CONFIG_KEY,)
        ).fetchone()
        value = (row["value"] if row else None) or None
        return value.strip() or None if value else None
    except Exception as e:  # noqa: BLE001
        log.warning("load reddit_session_cookie failed: %s", e)
        return None
    finally:
        if conn is not None:
            conn.close()


def _mark_reddit_session_stale(stale: bool) -> None:
    """Toggle the stale flag in user_config from any thread."""
    try:
        from db import new_connection
    except ImportError:
        return
    conn = None
    try:
        conn = new_connection()
        conn.execute(
            "INSERT INTO user_config(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (_STALE_CONFIG_KEY, "true" if stale else "false"),
        )
    except Exception as e:  # noqa: BLE001
        log.warning("mark reddit_session_stale failed: %s", e)
    finally:
        if conn is not None:
            conn.close()


def _is_login_redirect(location: str) -> bool:
    """True if a redirect Location header looks like Reddit's auth/age gate."""
    if not location:
        return False
    loc = location.lower()
    return any(marker in loc for marker in ("/login", "over18", "quarantine", "reddit.com/login"))


class HTTPRedditClient:
    """Reddit public JSON endpoints. No OAuth, no app approval required.

    Rate-limited to ~60 req/min unauthenticated; we throttle at 1 req/sec with a
    real User-Agent header to stay within Reddit's politeness norms.

    If a Reddit session cookie is stored in user_config (via the Settings UI),
    it is attached to every request so the client sees NSFW / quarantined /
    subscription-gated content as if it were the logged-in user. A stale flag
    is raised when a cookie'd request is redirected to login — the UI surfaces
    this as a banner prompting the user to paste fresh cookies.
    """

    BASE = "https://www.reddit.com"

    def __init__(self) -> None:
        import httpx  # lazy import

        self._httpx = httpx
        self._ua = os.environ.get(
            "REDDIT_USER_AGENT",
            "NeepFeed/1.0 (self-hosted personal reader)",
        )
        headers = {
            "User-Agent": self._ua,
            "Accept": "application/json",
            # httpx defaults to `Accept-Encoding: gzip, deflate` and
            # `Connection: keep-alive`, which in combination with a Cookie
            # header gets 403'd by Reddit's WAF (empirically: urllib returns
            # 200 with the same cookie, so it's an httpx-fingerprint block).
            # Forcing identity encoding lifts the block and the JSON payloads
            # we fetch are small enough that compression barely matters.
            "Accept-Encoding": "identity",
        }
        self._cookie = _load_reddit_cookie_from_db()
        if self._cookie:
            headers["Cookie"] = self._cookie
        self._client = httpx.Client(
            headers=headers,
            timeout=30.0,
            follow_redirects=False,
        )
        self._last_call = 0.0
        if self._cookie:
            log.info("HTTPRedditClient initialized (UA=%s, session cookie attached)", self._ua)
        else:
            log.info("HTTPRedditClient initialized (UA=%s)", self._ua)

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        self._last_call = time.monotonic()

    def _get(self, path: str, params: dict | None = None) -> Any:
        self._throttle()
        url = self.BASE + path
        full_params = {"raw_json": 1, **(params or {})}
        try:
            r = self._client.get(url, params=full_params)
        except self._httpx.HTTPError as e:
            log.warning("GET %s failed: %s", path, e)
            return None

        if r.status_code == 429:
            retry_after = int(r.headers.get("Retry-After", "60") or 60)
            log.warning("Rate limited on %s; sleeping %ds", path, retry_after)
            time.sleep(retry_after)
            return None
        if r.status_code in (301, 302):
            location = r.headers.get("Location", "")
            if self._cookie and _is_login_redirect(location):
                log.warning(
                    "GET %s -> %d to %s while session cookie attached; marking session stale",
                    path, r.status_code, location[:120],
                )
                _mark_reddit_session_stale(True)
            else:
                log.info("GET %s -> %d (skipping; loc=%s)", path, r.status_code, location[:80])
            return None
        if r.status_code in (403, 404):
            log.info("GET %s -> %d (skipping)", path, r.status_code)
            return None
        if r.status_code >= 500:
            log.warning("GET %s -> %d (server error)", path, r.status_code)
            return None
        if r.status_code != 200:
            log.warning("GET %s -> %d (unexpected)", path, r.status_code)
            return None

        try:
            return r.json()
        except ValueError:
            log.warning("GET %s -> non-JSON body", path)
            return None

    def fetch_hot_batch(
        self,
        subreddits: list[str],
        limit_per_batch: int = 100,
        batch_size: int = 25,
    ) -> Iterator[PostData]:
        if not subreddits:
            return
        for i in range(0, len(subreddits), batch_size):
            batch = subreddits[i : i + batch_size]
            joined = "+".join(batch)
            data = self._get(f"/r/{joined}/hot.json", {"limit": limit_per_batch})
            if data:
                for child in ((data.get("data") or {}).get("children") or []):
                    d = child.get("data") or {}
                    try:
                        yield _to_postdata(d)
                    except (KeyError, ValueError) as e:
                        log.warning("skipping malformed post: %s", e)
                        continue
                continue
            # Batched fetch failed (Reddit 403s multi-reddit URLs that include
            # certain NSFW / gated subs even when authenticated). Fall back to
            # per-sub fetches so one gated sub doesn't poison the batch.
            per_sub_limit = max(10, limit_per_batch // max(1, len(batch)))
            log.info(
                "batch %s failed; falling back to per-sub fetches (limit=%d each)",
                joined[:80], per_sub_limit,
            )
            for sub in batch:
                solo = self._get(f"/r/{sub}/hot.json", {"limit": per_sub_limit})
                if not solo:
                    continue
                for child in ((solo.get("data") or {}).get("children") or []):
                    d = child.get("data") or {}
                    try:
                        yield _to_postdata(d)
                    except (KeyError, ValueError) as e:
                        log.warning("skipping malformed post: %s", e)
                        continue

    def fetch_top_day(self, subreddit: str, limit: int = 30) -> Iterator[PostData]:
        data = self._get(f"/r/{subreddit}/top.json", {"t": "day", "limit": limit})
        if not data:
            return
        for child in ((data.get("data") or {}).get("children") or []):
            d = child.get("data") or {}
            try:
                yield _to_postdata(d)
            except (KeyError, ValueError) as e:
                log.warning("skipping malformed post: %s", e)
                continue

    def refresh_video_url(self, reddit_id: str) -> str | None:
        data = self._get(f"/comments/{reddit_id}.json")
        if not isinstance(data, list) or not data:
            return None
        try:
            post = data[0]["data"]["children"][0]["data"]
        except (KeyError, TypeError, IndexError):
            return None
        media = post.get("media") or {}
        reddit_video = media.get("reddit_video") if isinstance(media, dict) else None
        if isinstance(reddit_video, dict):
            return reddit_video.get("fallback_url")
        return None


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_client() -> RedditClient:
    """Select a Reddit client based on env.

    REDDIT_CLIENT_MODE explicit values: 'mock' | 'http' | 'praw'.
    Unset: use PRAW if all four OAuth env vars are present, otherwise HTTP.

    Default (post-Nov-2025) is the HTTP public-JSON client — no OAuth app
    approval is required. Mock is explicit opt-in for offline dev.
    """
    mode = os.environ.get("REDDIT_CLIENT_MODE", "").strip().lower()
    if mode == "mock":
        log.info("RedditClient: mock (forced by REDDIT_CLIENT_MODE)")
        return MockRedditClient()
    if mode == "praw":
        log.info("RedditClient: PRAW (forced by REDDIT_CLIENT_MODE)")
        return PRAWRedditClient()
    if mode == "http":
        log.info("RedditClient: HTTP (forced by REDDIT_CLIENT_MODE)")
        return HTTPRedditClient()

    has_praw_creds = all(
        os.environ.get(k)
        for k in ("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USERNAME", "REDDIT_PASSWORD")
    )
    if has_praw_creds:
        log.info("RedditClient: PRAW (credentials detected)")
        return PRAWRedditClient()
    log.info("RedditClient: HTTP (public JSON endpoints \u2014 no auth required)")
    return HTTPRedditClient()
