# NeepFeed

> Self-hosted Reddit feed aggregator with engagement-weighted scoring, lists, live preview themes, and public-JSON-endpoint collection.

![Python 3.12](https://img.shields.io/badge/python-3.12-blue) ![Node 22](https://img.shields.io/badge/node-22-green) ![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it is

A personal Reddit reader you run on your own machine. Every 25 minutes it fetches top posts from your subscribed subreddits, stores them in SQLite, and serves a deduplicated, de-duplicated-across-crossposts, diversity-capped feed you can sort four different ways.

Designed for **daily driving**. Keyboard-first. Mobile + desktop. Media-forward. No ads, no recommendation tracking, no engagement dark patterns — you control the scoring knobs directly.

## Features

- **Four sort modes.** Calculated (upvotes × freshness × per-sub weight), Score, Recency, Velocity (score growth derived from 1-hour and 6-hour snapshots).
- **Engagement-weighted scoring** with a user-facing "Content Freshness" slider (0.3 → 2.0) and per-subreddit weights (0.1× → 3.0×).
- **Cross-post dedup.** Same URL across r/news + r/worldnews shows once, with "also in r/X" metadata on the card.
- **Diversity cap.** Configurable max share of the feed any single sub can occupy. No sub floods your screen.
- **Lists.** Subs can belong to multiple named lists (Tech / Gaming / News / …). Feed filters by list or shows all merged.
- **Mock client for offline development.** Set `REDDIT_CLIENT_MODE=mock` and a synthetic generator produces archetype-aware posts (tech subs get self/link heavy, pics subs get image/gallery heavy) with cross-posts, varied ages, and video URLs backed by public sample MP4s.
- **Media-forward UI.** Videos autoplay muted via IntersectionObserver, galleries swipe on touch, link thumbnails lazy-load, videos refresh expired CDN URLs on first error.
- **Seen tracking.** Posts mark themselves seen after 600ms dwell, batched every 3 s. Toggle to dim them or hide entirely.
- **Blocklists.** Keywords, authors, domains, subreddits.
- **Full-text search.** SQLite FTS5 over everything you've ever collected — Reddit's own search is bad; yours is instant.
- **Bookmarks.** Save posts to a local bookmarks view. Not limited by Reddit's 1000-save cap.
- **Keyboard shortcuts.** `j k` navigate, `o` open post, `c` comments, `m` mute, `b` bookmark, `h` hide, `/` search, `Esc` clear.
- **Skin system.** 3 built-ins (Dark / Light / Paper). Import custom skins as JSON. Live preview with WCAG contrast check before apply. AI-assistable template. See [skin-template.md](frontend/public/skin-template.md).
- **PWA.** Installable. Service worker caches the app shell + images cache-first, API responses stale-while-revalidate.
- **Bulk import.** Paste a list of subs, or upload a Reddit subscription export / Apollo backup / Sync backup / Reddit API JSON.

## Architecture

Single Docker container. Flask serves the built React SPA as static files + JSON API. SQLite (WAL + FTS5) on a persistent volume. APScheduler runs the collection job in-process.

```
┌─────────────────────────────────────────────┐
│  Docker container (port 5002 by default)    │
│                                             │
│  Flask (Python 3.12)                        │
│  ├─ /api/*     → JSON endpoints             │
│  └─ /*         → React static SPA           │
│                                             │
│  APScheduler (background)                   │
│  └─ Collection every COLLECTION_INTERVAL_   │
│     MINUTES (default 25)                    │
│                                             │
│  SQLite (/app/data/neepfeed.db)             │
│  ├─ posts, post_state, score_snapshots      │
│  ├─ lists, subscribed_subreddits (per-list) │
│  ├─ blocklist, user_config                  │
│  └─ posts_fts (FTS5 search)                 │
└─────────────────────────────────────────────┘
```

- **Backend:** Flask 3 + APScheduler + SQLite (WAL + FTS5)
- **Reddit API:** public `.json` endpoints via httpx (default, no auth). PRAW 7 retained as an opt-in path if a Reddit OAuth app is ever approved. Mock client available for offline dev.
- **Frontend:** React 18 + Vite + Tailwind (with CSS-variable-driven skins)
- **Deploy:** Docker + Docker Compose (Dockerfile is multi-stage: node:22 builder → python:3.12-slim runtime)

### Project layout

```
NeepFeed/
├── backend/
│   ├── app.py                Flask entry, SPA fallback, blueprint wiring
│   ├── db.py                 SQLite connection, schema init, config helpers
│   ├── schema.sql            Base schema (v1)
│   ├── migrations.py         Versioned migrations (currently v1→v2 for lists)
│   ├── reddit_client.py      Abstract protocol + Mock/HTTP/PRAW client implementations
│   ├── collection.py         Background collection job + cleanup
│   ├── scoring.py            calculated_score + velocity + diversity cap + crosspost dedup
│   ├── url_utils.py          URL normalization + hashing for dedup
│   └── routes/
│       ├── feed.py           GET /api/feed + /api/search
│       ├── subreddits.py     GET/POST/PATCH /api/subreddits + bulk import
│       ├── lists.py          Full CRUD for lists + per-list subs + recommendations stub
│       ├── settings.py       GET/POST /api/settings + /api/config/export,import
│       ├── posts.py          /seen /bookmark /hidden + /refresh-video + /bookmarks
│       ├── skins.py          GET/POST/PATCH/DELETE /api/skins + /skins/active
│       ├── blocklist.py      Keyword/author/domain/subreddit blocklist
│       ├── stats.py          DB + collection metadata
│       ├── health.py         Liveness + smoke-test
│       └── collect.py        Manual collection trigger + dev seed helper
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx                (ErrorBoundary + React root)
│   │   ├── api/client.js           (fetch wrapper — one entry per endpoint)
│   │   ├── components/             (PostCard, VideoPlayer, GalleryViewer,
│   │   │                            Feed, Header, SettingsModal, etc.)
│   │   ├── hooks/                  (useFeed, useSkin, useSettings, useStats,
│   │   │                            useSeenTracking, useKeyboardNav)
│   │   ├── skins/                  (builtin.js + contrast.js)
│   │   └── index.css               (CSS custom properties = skin surface)
│   └── public/
│       ├── manifest.json           (PWA)
│       ├── sw.js                   (service worker: SWR for /api, cache-first for images)
│       ├── favicon.svg, icon-maskable.svg
│       └── skin-template.md        (downloadable AI prompt scaffold)
└── docker/
    └── Dockerfile                   (multi-stage, produces one image)
```

## Quick start (local dev)

You'll need Python 3.12+ and Node 22+.

```bash
git clone https://github.com/SloanSimmons/NeepFeed.git
cd NeepFeed
cp .env.example .env           # tweak Reddit creds later; mock client runs without them

# Backend
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Unix:     source .venv/bin/activate
pip install -r requirements.txt
python app.py                  # serves on :5000

# Frontend (separate terminal; proxies /api to :5000)
cd ../frontend
npm install
npm run dev                    # serves on :5173
```

Open `http://localhost:5173`. First load shows an empty state — open **Settings → Subreddits** and add some (paste a list, or bulk-import from a Reddit/Apollo/Sync backup JSON).

Or, if you want to kick the mock pipeline manually:

```bash
# Seed some subs and run the collection job
for s in programming rust python gaming selfhosted pics; do
  curl -X POST -H 'Content-Type: application/json' \
       -d "{\"action\":\"add\",\"name\":\"$s\"}" \
       http://localhost:5000/api/subreddits
done
curl -X POST http://localhost:5000/api/collect/trigger
```

## Reddit API setup

**NeepFeed uses Reddit's public JSON endpoints by default.** No API application or approval is required. Just set a descriptive `REDDIT_USER_AGENT` in `.env` — Reddit throttles blank / default User-Agents aggressively.

```bash
REDDIT_USER_AGENT=NeepFeed/1.0 (self-hosted personal reader; by /u/your_reddit_username)
```

On startup the log line will read `RedditClient: HTTP (public JSON endpoints — no auth required)`.

OAuth via PRAW is optional and only useful if you've been granted an approved Reddit app under the Responsible Builder Policy (self-service key creation was retired in November 2025, and personal self-hosted readers are the highest-rejection category — don't plan on it). If you do have credentials, drop all four OAuth vars into `.env` and restart; the app auto-detects and switches clients.

**Rate limits (unauthenticated):** ~60 requests per minute. NeepFeed's default collection cycle does ~8 requests for 200 subscribed subs, so you're well under the limit with headroom for manual triggers.

Force a specific client with `REDDIT_CLIENT_MODE=mock` (offline dev), `REDDIT_CLIENT_MODE=http`, or `REDDIT_CLIENT_MODE=praw`.

## Docker (production)

```bash
docker compose up --build -d
```

Served on port **5002** by default (mapped to the container's 5000). Data persists to `./data/neepfeed.db` on the host. To change the host port, edit the `ports:` line in `docker-compose.yml`.

### Deploying to a home server

If you're deploying to a gweep-style homelab box with Dockge or Portainer:

1. `rsync` or `git clone` the repo to the server.
2. Confirm the host port is free: `ss -ltn | grep :5002` (or your chosen port).
3. Populate `.env` with real Reddit creds.
4. `docker compose up -d` inside the project dir.
5. Watch the healthcheck: `docker ps` → look for `healthy`.
6. Add a reverse-proxy entry (nginx/caddy/traefik) if you want it on a hostname.

**No authentication** is built in — run this on a LAN or behind a reverse proxy with auth. It's a single-user app.

## Creating a custom skin

**Option A — paste JSON in Settings:**

1. Settings → Skins → **+ Import skin**
2. Paste a skin JSON blob, hit **Preview**
3. The preview toolbar shows live contrast validation; **Apply** to save.

**Option B — have an AI generate one:**

1. Settings → Skins → **Create with AI (template)** downloads `NeepFeed-Skin-Template.md`.
2. Paste that into Claude/ChatGPT with your prompt ("cozy autumn theme", "high contrast terminal", etc.).
3. Paste the AI's JSON response into the Import dialog.

A minimal skin is just a few vars:

```json
{
  "name": "Just Blue",
  "version": 1,
  "variables": {
    "--nf-accent": "#0066ff",
    "--nf-accent-hover": "#3388ff"
  }
}
```

Everything else inherits from the current Dark defaults.

## Configuration knobs

All configurable from Settings (auto-saves):

| Setting | Default | Effect |
|---|---|---|
| Content freshness (decay rate) | 0.7 | Lower = older posts stay relevant; higher = aggressive recency |
| Time window | 96h | Only posts newer than this are eligible |
| Min score threshold | 10 | Hides very-low-upvote posts |
| New-sub boost | 1.5× | Multiplier for subs added <7 days ago |
| Diversity cap | 30% | Max share of feed from any single sub (0 = disabled) |
| Cross-post dedup | on | Collapse same URL across multiple subs |
| Collection mode | `batched_hot` | `batched_hot` (fast, ~10s/200 subs) or `per_sub_top` (exhaustive) |
| Hide / dim seen | off / on | Already-read posts disappear or just dim |
| Video autoplay | on, muted | Autoplay in view; click to unmute |
| Prefetch next page | on | Preloads page N+1 for snappy infinite scroll |

## API

Quick reference — full details in route source.

```
GET    /api/feed?sort=&limit=&offset=&q=&list=&hide_nsfw=&hide_seen=
GET    /api/search?q=
GET    /api/bookmarks
GET    /api/subreddits                 → unique subs with list_ids[], weight_by_list{}
POST   /api/subreddits                 action: add|remove|toggle (default list)
POST   /api/subreddits/import           plaintext or JSON (Reddit/Apollo/Sync)
PATCH  /api/subreddits/<name>/weight
GET    /api/lists
POST   /api/lists                       {name, icon}
PATCH  /api/lists/<id>
DELETE /api/lists/<id>
GET    /api/lists/<id>/subreddits
POST   /api/lists/<id>/subreddits       action: add|remove|toggle
POST   /api/lists/<id>/subreddits/bulk  {names: [...]}
PATCH  /api/lists/<id>/subreddits/<name>/weight
GET    /api/lists/<id>/recommendations  (stub — L3 recommender not yet implemented)
GET    /api/settings
POST   /api/settings                    partial update
POST   /api/config/export               → JSON download
POST   /api/config/import               restore
POST   /api/posts/<id>/seen
POST   /api/posts/seen-batch            {reddit_ids: [...]}
POST   /api/posts/<id>/bookmark         {bookmarked?: bool}
POST   /api/posts/<id>/hidden
DELETE /api/posts/<id>/hidden
GET    /api/posts/<id>/refresh-video    fetch fresh Reddit CDN URL
GET    /api/skins                       → {built_in, custom, active}
POST   /api/skins                       save custom
PATCH  /api/skins/<name>
DELETE /api/skins/<name>
POST   /api/skins/active                {name}
GET    /api/blocklist
POST   /api/blocklist                   action: add|remove; type: keyword|author|domain|subreddit
GET    /api/stats
GET    /api/health
POST   /api/collect/trigger             manual collection run
```

## Performance

- Feed render: <500 ms from cached DB on a typical homelab box.
- DB comfortably handles 10k+ posts. Collection job prunes posts older than `time_window_hours + 24h`.
- Container RSS: ~100-150 MB.
- Bundle: ~65 KB JS gzipped, ~5 KB CSS gzipped.

## Security notes

- `.env` is gitignored; commit `.env.example` only.
- Reddit credentials via env vars, never hardcoded.
- No user authentication (single-user). Expose through a reverse-proxy auth layer if needed.
- Service worker is scoped to the origin — do not deploy behind a shared hostname.
- The skin-import validator rejects CSS injection characters (`;`, `{`, `}`, `@`).

## Status

- Core MVP + lists infrastructure + skin system + M6 polish: **shipped**.
- Reddit API: **public JSON endpoints** (no OAuth required). PRAW path retained in case a Reddit app is ever approved; mock available for offline dev.
- Reviewed + hardened against two external code reviews (April 2026): all verified P1/P2 findings resolved — config import validation, network-first SW for mutable APIs, seen-batch FK safety, FTS input sanitization, feed abort signals + request-generation guard, sort-aware crosspost dedup, PostCard bookmark sync, dev-seed route removed.
- Deferred (intentionally, until daily-drive feedback):
  - Recommendation engine (L3) — unblocked now that public JSON endpoints work (`/r/<sub>/about.json` sidebar scraping needs no OAuth); waiting on usage feedback to prioritize.
  - Full list-selector UI (L4) — data model exists, UI waits for usage feedback

## License

MIT
