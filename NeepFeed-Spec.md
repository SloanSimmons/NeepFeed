# NeepFeed — Implementation Specification

> Self-hosted Reddit feed aggregator with engagement-weighted scoring, infinite scroll, video autoplay, and per-subreddit customization.

**Repo:** https://github.com/SloanSimmons/NeepFeed (public, for Reddit API approval)
**Local dev path:** `C:\Users\sloan\Projects\NeepFeed`
**Deploy target:** gweep server `192.168.50.19:5002` via Docker/Dockge
**Status:** Reddit API approval pending — build with mock data first, swap in PRAW when approved

---

## 1. Architecture

Single Docker container: Flask serves the built React SPA as static files + JSON API. SQLite on a persistent volume. APScheduler runs background collection jobs.

```
┌─────────────────────────────────────────────┐
│  Docker Container (port 5000)               │
│                                             │
│  Flask (Python 3.10+)                       │
│  ├─ /api/*     → JSON endpoints            │
│  └─ /*         → React static SPA          │
│                                             │
│  APScheduler (background)                   │
│  └─ Collection job every 25 min             │
│                                             │
│  SQLite (/app/data/neepfeed.db)             │
│  └─ Persisted via Docker volume             │
└─────────────────────────────────────────────┘
```

**Tech stack:**
- Backend: Flask, SQLite (WAL mode), PRAW (with mock fallback), APScheduler
- Frontend: React 18, Tailwind CSS, Vite
- Deployment: Docker + Docker Compose

---

## 2. Database Schema

### `posts`

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  reddit_id TEXT UNIQUE NOT NULL,
  subreddit TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  permalink TEXT,
  author TEXT,
  score INTEGER,
  num_comments INTEGER,
  upvote_ratio REAL,
  created_utc INTEGER,
  fetched_at INTEGER,
  last_scored_at INTEGER,
  is_nsfw BOOLEAN DEFAULT 0,
  is_video BOOLEAN DEFAULT 0,
  thumbnail TEXT,
  video_url TEXT,
  selftext_preview TEXT,
  link_flair TEXT,
  current_score REAL
);

CREATE INDEX idx_created_utc ON posts(created_utc);
CREATE INDEX idx_subreddit ON posts(subreddit);
CREATE INDEX idx_is_nsfw ON posts(is_nsfw);
CREATE INDEX idx_current_score ON posts(current_score DESC);
```

### `subscribed_subreddits`

```sql
CREATE TABLE subscribed_subreddits (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  added_at INTEGER,
  active BOOLEAN DEFAULT 1,
  weight REAL DEFAULT 1.0,
  is_new_boost BOOLEAN DEFAULT 0
);
```

### `score_snapshots`

```sql
CREATE TABLE score_snapshots (
  id INTEGER PRIMARY KEY,
  reddit_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  num_comments INTEGER,
  snapshot_at INTEGER NOT NULL,
  FOREIGN KEY (reddit_id) REFERENCES posts(reddit_id)
);

CREATE INDEX idx_snapshots_reddit_id ON score_snapshots(reddit_id);
CREATE INDEX idx_snapshots_at ON score_snapshots(snapshot_at);
```

### `user_config`

```sql
CREATE TABLE user_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Default rows:
-- ('decay_rate', '1.0')
-- ('time_window_hours', '96')
-- ('min_score_threshold', '10')
-- ('new_sub_weight', '1.5')
-- ('hide_nsfw', 'false')
-- ('sort_mode', 'calculated')
-- ('theme', 'dark')
-- ('autoplay_videos', 'true')
-- ('default_video_muted', 'true')
```

---

## 3. Scoring Algorithm

### Main Formula

```
final_score = base_score × recency_weight × sub_weight
```

Where:
- `base_score` = post upvotes (score field)
- `recency_weight = 1 / (1 + age_in_hours ^ decay_rate)`
  - `decay_rate` comes from `user_config`, default 1.0
  - Range: 0.5 ("More Variety") → 2.0 ("Latest Only")
  - Default 1.0 ("Balanced")
- `sub_weight = custom_weight × new_sub_boost`
  - `custom_weight`: per-subreddit weight (default 1.0, range 0.1–5.0)
  - `new_sub_boost`: 1.5 if subreddit added <7 days ago, else 1.0

### Velocity Sort (uses score_snapshots)

```
velocity = (score_delta_last_1h × 10) + (score_delta_last_6h × 3) + (current_score × 1)
```

Where `score_delta_last_1h` = current score minus snapshot from ~1 hour ago.

### Sort Modes (UI toggle)

1. **Calculated** (default) — Uses formula above
2. **Score Only** — Just upvotes, ignores age
3. **Recency Only** — Newest first
4. **Velocity** — Uses velocity formula above

### Content Freshness Slider (UI)

| UI Label | Underlying Value | Behavior |
|---|---|---|
| "More Variety" | 0.5 | Slow decay, older posts stay visible |
| "Balanced" (recommended) | 1.0 | Moderate decay |
| "Latest Only" | 2.0 | Aggressive, only very recent posts |

The slider should be continuous (0.5–2.0) with labeled stops and a "recommended" marker at 1.0. Do NOT label it "exponent" or "decay rate" — call it "Content Freshness".

---

## 4. API Endpoints

### Feed

**GET `/api/feed?limit=25&offset=0&sort=calculated`**

Response:
```json
{
  "posts": [
    {
      "reddit_id": "t3_abc123",
      "subreddit": "programming",
      "title": "Why Rust is great...",
      "url": "https://reddit.com/r/programming/...",
      "permalink": "/r/programming/comments/abc123/",
      "author": "user123",
      "score": 4200,
      "num_comments": 892,
      "upvote_ratio": 0.94,
      "created_utc": 1708342800,
      "is_nsfw": false,
      "is_video": false,
      "thumbnail": "https://...",
      "video_url": null,
      "selftext_preview": "First 300 chars...",
      "link_flair": "Discussion",
      "current_score": 24.75
    }
  ],
  "total": 5847,
  "offset": 0,
  "limit": 25
}
```

### Subreddits

**GET `/api/subreddits`**
```json
{
  "subreddits": [
    {
      "name": "programming",
      "added_at": 1707650400,
      "active": true,
      "weight": 1.0,
      "is_new_boost": false,
      "post_count": 87
    }
  ],
  "total": 204,
  "active_count": 198
}
```

**POST `/api/subreddits`**
```json
// Request:
{ "action": "add", "name": "python" }
// or:
{ "action": "remove", "name": "python" }
// or:
{ "action": "toggle", "name": "python" }

// Response:
{ "success": true, "subreddit": { "name": "python", "added_at": ..., "active": true, "weight": 1.0, "is_new_boost": true } }
```

**PATCH `/api/subreddits/:name/weight`**
```json
// Request:
{ "weight": 2.5 }

// Response:
{ "success": true, "subreddit": { "name": "python", "weight": 2.5 } }
```

### Settings

**GET `/api/settings`**
```json
{
  "decay_rate": 1.0,
  "time_window_hours": 96,
  "min_score_threshold": 10,
  "new_sub_weight": 1.5,
  "hide_nsfw": false,
  "sort_mode": "calculated",
  "theme": "dark",
  "autoplay_videos": true,
  "default_video_muted": true
}
```

**POST `/api/settings`** — Same shape as GET response, returns updated settings.

### Config Export/Import

**POST `/api/config/export`** — Returns downloadable JSON:
```json
{
  "exported_at": "2025-04-16T10:30:00Z",
  "settings": { ... },
  "subreddits": [ ... ]
}
```

**POST `/api/config/import`** — Upload JSON file, restores settings + subreddits.

### Video Refresh

**GET `/api/posts/:reddit_id/refresh-video`** — Re-fetches video URL from Reddit for expired video links. Returns `{ "video_url": "https://..." }` or `{ "video_url": null }` if unavailable.

### Stats

**GET `/api/stats`**
```json
{
  "last_collection_at": 1708342800,
  "total_posts": 5847,
  "active_subreddits": 198,
  "db_size_mb": 12.4
}
```

### Manual Collection

**POST `/api/collect/trigger`** — Manually trigger a collection run. Returns `{ "started": true }`.

---

## 5. Collection Job

### Scheduling

- **Frequency:** Every 25 minutes (configurable via `COLLECTION_INTERVAL_MINUTES` env var)
- **Implementation:** APScheduler background task
- **Rate limiting:** 1 request/second to Reddit API (60 req/min limit, this uses ~8 req/min average)

### Logic

```python
def collection_job():
    subreddits = get_active_subreddits()

    for sub in subreddits:
        try:
            posts = reddit_client.get_top_posts(sub, limit=30, time_filter='day')
            for post in posts:
                if not post_exists(post.id):
                    insert_post(post)
                else:
                    update_post(post)  # update score, comments, video_url
                    save_score_snapshot(post)  # for velocity calculation
        except Exception as e:
            log_error(f"Failed to fetch {sub}: {e}")
            continue  # skip failed subs, don't crash

    # Update is_new_boost flags (subs added <7 days ago)
    update_new_sub_boosts()

    # Recalculate scores for all posts in time window
    recalculate_scores()

    # Cleanup: Delete posts older than time_window + 24h buffer
    delete_old_posts()

    # Cleanup: Delete score snapshots older than 7 days
    delete_old_snapshots()
```

### Error Handling

- Skip failed subreddits (don't crash the job)
- Log all errors
- Retry up to 3 times with exponential backoff per subreddit
- Alert if >20% of subs fail in a single run

### Mock Client (for development before Reddit API approval)

```python
class MockRedditClient:
    """Returns realistic fake data for development"""
    def get_top_posts(self, subreddit, limit=30, time_filter='day'):
        # Generate realistic-looking fake posts
        # Use subreddit name in titles for realism
        # Include mix of text posts, link posts, and video posts
        pass
```

The real client and mock client should share the same interface so swapping is clean.

---

## 6. Video Handling

### Strategy

1. At collection time, store `video_url` (Reddit's `fallback_url` — a direct MP4 link)
2. Reddit CDN URLs expire after ~15 minutes, so older video URLs may be stale
3. When a user scrolls to a video post:
   - Try playing the stored `video_url`
   - If it fails (network error, 403, etc.), call `/api/posts/:reddit_id/refresh-video` to get a fresh URL
   - If refresh also fails, fall back to showing the thumbnail with a "Watch on Reddit" link
4. Videos autoplay when scrolled into view (IntersectionObserver), muted by default
5. Click to unmute

### Frontend Implementation

```jsx
// VideoPlayer.jsx
// - HTML5 <video> with autoplay, muted, playsInline, loop
// - IntersectionObserver: play when visible, pause when not
// - Click handler: toggle mute/unmute
// - Error handler: try refresh-video API, then fallback to thumbnail
// - Loading state while refreshing URL
```

---

## 7. Frontend Component Tree

```
App.jsx
├── Header.jsx
│   ├── Logo + "NeepFeed" title
│   ├── SortModeToggle (calculated/score/recency/velocity)
│   ├── ThemeToggle (dark/light)
│   └── SettingsButton (gear icon)
├── Feed.jsx
│   ├── Infinite scroll (IntersectionObserver-based, no library dependency)
│   └── PostCard.jsx (repeated)
│       ├── Thumbnail or VideoPlayer (conditional on is_video)
│       ├── PostMeta (subreddit, time ago, flair badge)
│       ├── PostTitle (clickable, opens Reddit in new tab)
│       ├── SelftextPreview (if text post, max 3 lines)
│       ├── ScoreBar (upvotes, upvote_ratio %, comments)
│       └── OpenLink button
└── SettingsModal.jsx
    ├── SubredditManager.jsx
    │   ├── Search/filter input
    │   ├── SubredditList (scrollable, each with weight slider + remove button)
    │   └── AddSubredditInput (text input + Add button, accepts "python" or "r/python")
    ├── FreshnessSlider.jsx (0.5–2.0, labeled stops, "recommended" marker at 1.0)
    ├── TimeWindowToggle (48h / 72h / 96h / custom)
    ├── MinScoreSlider (0–100)
    ├── NewSubWeightInput (default 1.5)
    ├── NsfwToggle (checkbox)
    ├── SortModeSelector (radio group)
    ├── VideoAutoplayToggle (checkbox)
    ├── ThemeToggle (dark/light)
    └── ActionButtons (Save / Cancel / Reset to Defaults / Export / Import)
```

### UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Header: "NeepFeed"  [Sort ▼]  🌙  [⚙️ Settings]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  MAIN FEED (infinite scroll)                       │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ r/programming · Discussion · 2h ago         │   │
│  │ Why Rust is great for systems programming    │   │
│  │ First 300 chars of selftext preview...       │   │
│  │ ⬆️ 4.2k (94%) 💬 892  [Open ↗]             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ r/gamedev · 45m ago                         │   │
│  │ ▶ [Video autoplay, muted]                   │   │
│  │ My indie game hit 10k players                │   │
│  │ ⬆️ 2.1k (88%) 💬 334  [Open ↗]             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [... more posts, infinite scroll ...]            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Settings Modal Layout

```
┌──────────────────────────────────────────────┐
│ Settings                                [✕] │
├──────────────────────────────────────────────┤
│                                              │
│ 📚 Subreddits (198 active)                   │
│ ┌──────────────────────────────────────────┐ │
│ │ [Search filter...                    ] 🔍 │ │
│ │                                          │ │
│ │ r/programming    weight: ──●── 1.0  [✕]  │ │
│ │ r/gamedev        weight: ──●── 1.0  [✕]  │ │
│ │ r/selfhosted     weight: ──●── 1.5  [✕]  │ │
│ │   ↑ (new sub boost active)               │ │
│ └──────────────────────────────────────────┘ │
│ [+ Add Subreddit]  [Bulk Import]             │
│                                              │
│ 🕐 Content Freshness                         │
│ More Variety ──────●────────── Latest Only   │
│                  1.0 (Balanced) ★            │
│                                              │
│ ⏱️ Time Window                               │
│ ○ 48h  ○ 72h  ● 96h  ○ Custom: [__]         │
│                                              │
│ 📊 Min Score Threshold: 10                   │
│ ├─────────────●──────────────────────┤       │
│ 0                                    100     │
│                                              │
│ 🆕 New Sub Weight: [1.5]                     │
│                                              │
│ 🔞 Hide NSFW Content  ☐                     │
│                                              │
│ 📈 Sort By                                   │
│ ● Calculated  ○ Score  ○ Recency  ○ Velocity │
│                                              │
│ 🎬 Video Autoplay  ☑  Muted by default  ☑   │
│                                              │
│ 🎨 Theme  ● Dark  ○ Light                    │
│                                              │
│ [Save]  [Cancel]  [Reset Defaults]           │
│ [Export Config]  [Import Config]              │
└──────────────────────────────────────────────┘
```

### Mobile Responsiveness

- Settings modal: Full-width on mobile, scrollable
- Feed: Single column, touch-friendly tap targets (min 44px)
- Video: Full-width, tap to unmute
- Subreddit weight sliders: Simplified on mobile (number input instead of slider)

---

## 8. Project Structure

```
NeepFeed/
├── backend/
│   ├── app.py                # Flask app entry point, serves React static files
│   ├── routes/
│   │   ├── feed.py           # GET /api/feed
│   │   ├── subreddits.py     # GET/POST/PATCH /api/subreddits
│   │   ├── settings.py       # GET/POST /api/settings
│   │   ├── config.py         # POST /api/config/export, /api/config/import
│   │   └── stats.py          # GET /api/stats, POST /api/collect/trigger
│   ├── reddit_client.py      # PRAW wrapper + MockRedditClient
│   ├── db.py                 # SQLite connection, schema init, CRUD helpers
│   ├── scoring.py            # Scoring algorithm (calculated, velocity, etc.)
│   ├── collection.py         # APScheduler background job
│   ├── config.py             # Settings management (read/write user_config)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/
│   │   │   ├── Header.jsx
│   │   │   ├── Feed.jsx
│   │   │   ├── PostCard.jsx
│   │   │   ├── VideoPlayer.jsx
│   │   │   ├── SettingsModal.jsx
│   │   │   ├── SubredditManager.jsx
│   │   │   ├── FreshnessSlider.jsx
│   │   │   └── SortModeToggle.jsx
│   │   ├── hooks/
│   │   │   ├── useFeed.js          # Infinite scroll + fetch logic
│   │   │   ├── useSettings.js      # Settings state management
│   │   │   └── useSubreddits.js    # Subreddit CRUD
│   │   ├── api/
│   │   │   └── client.js           # Fetch wrapper for all API calls
│   │   └── index.css               # Tailwind imports
│   ├── public/
│   │   ├── index.html
│   │   ├── manifest.json           # PWA manifest
│   │   └── service-worker.js       # PWA service worker
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── data/
│   └── neepfeed.db              # SQLite (gitignored)
├── .env.example
├── .gitignore
├── README.md
└── LICENSE
```

---

## 9. Docker Configuration

### Dockerfile

```dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install Node.js for frontend build
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend build
COPY frontend/ ./frontend/
RUN cd frontend && npm install && npm run build

# Copy backend code
COPY backend/ ./backend/

# Flask serves built React from frontend/dist
ENV FLASK_APP=backend/app.py
ENV DATABASE_PATH=/app/data/neepfeed.db

EXPOSE 5000

CMD ["python", "backend/app.py"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  neepfeed:
    build: .
    container_name: neepfeed
    ports:
      - "5002:5000"
    volumes:
      - ./data:/app/data
    environment:
      - REDDIT_CLIENT_ID=${REDDIT_CLIENT_ID}
      - REDDIT_CLIENT_SECRET=${REDDIT_CLIENT_SECRET}
      - REDDIT_USERNAME=${REDDIT_USERNAME}
      - REDDIT_PASSWORD=${REDDIT_PASSWORD}
      - REDDIT_USER_AGENT=NeepFeed/1.0
      - FLASK_ENV=production
      - DATABASE_PATH=/app/data/neepfeed.db
      - COLLECTION_INTERVAL_MINUTES=25
    restart: unless-stopped
```

### .env.example

```bash
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USERNAME=your_reddit_username
REDDIT_PASSWORD=your_reddit_password
REDDIT_USER_AGENT=NeepFeed/1.0 (by /u/your_reddit_username)
FLASK_ENV=production
DATABASE_PATH=/app/data/neepfeed.db
COLLECTION_INTERVAL_MINUTES=25
```

---

## 10. Implementation Order

Build in this order, each milestone should be testable independently:

### M1: Skeleton (Start Here)
- Create project structure at `C:\Users\sloan\Projects\NeepFeed`
- Initialize git repo, push to https://github.com/SloanSimmons/NeepFeed
- Flask app with `/api/health` endpoint
- SQLite schema creation (all 4 tables)
- React scaffold with Vite + Tailwind
- Dockerfile + docker-compose.yml
- `.gitignore`, `.env.example`, `README.md`

### M2: Collection
- `MockRedditClient` that generates realistic fake posts (mix of text, link, video posts)
- `PRAWRedditClient` (real implementation, behind a feature flag or env var)
- Collection job with APScheduler
- Score snapshot recording
- Rate limiting (1 req/sec)
- Error handling + logging

### M3: Scoring & API
- Scoring algorithm (all 4 sort modes)
- All API endpoints (feed, subreddits, settings, config, stats, video refresh)
- Config management (read/write user_config)
- Video URL refresh endpoint

### M4: Feed UI
- PostCard component (thumbnail, video, selftext preview, score bar, upvote ratio)
- VideoPlayer with IntersectionObserver, autoplay, mute toggle, expired URL refresh
- Infinite scroll (IntersectionObserver-based, no library)
- Sort mode toggle in header
- Dark/light theme

### M5: Settings UI
- SettingsModal with all controls
- SubredditManager (list, add, remove, per-sub weight sliders, bulk import)
- FreshnessSlider (0.5–2.0 with labels)
- All other settings controls (time window, min score, NSFW, etc.)
- Export/import config as JSON

### M6: Polish & Deploy
- PWA manifest + service worker
- Error handling (API errors, empty states, loading states)
- Docker build + deploy to gweep
- README with setup instructions
- Test with real Reddit API credentials (once approved)

---

## 11. Key Implementation Notes

### SQLite
- Use WAL mode for concurrent reads during collection
- Batch inserts in transactions (not one-by-one)
- Auto-prune posts older than `time_window_hours + 24h` on each collection run
- Auto-prune score_snapshots older than 7 days

### Reddit API
- PRAW handles OAuth refresh automatically
- Rate limit: 60 requests/min (authenticated)
- Collection job: ~200 subs x 1 req = ~3.5 min at 1 req/sec
- Use `time_filter='day'` for top posts, `limit=30` per subreddit
- Store `post.thumbnail`, `post.url`, `post.media` for video URL extraction

### Video URL Extraction (PRAW)
```python
# For video posts, extract the fallback MP4 URL:
if submission.is_video and submission.media:
    video_url = submission.media.get('reddit_video', {}).get('fallback_url')
```

### Frontend
- No external state management library — React hooks + localStorage for UI preferences
- localStorage mirrors user_config for instant UI, API for persistence
- Infinite scroll: use IntersectionObserver on a sentinel div at the bottom
- All links to Reddit open in new tab (`target="_blank"`, `rel="noopener noreferrer"`)

### Subreddit Input
- Accept both "python" and "r/python" formats
- Strip "r/" prefix if present
- Validate subreddit exists via Reddit API before adding (or add anyway and handle 404 in collection)
- Bulk import: textarea where user can paste a list (one per line, comma-separated, or space-separated)

### No Default Data
- The app starts with zero subreddits
- User adds subreddits from scratch via the settings modal
- The feed shows an empty state with a prompt to add subreddits

---

## 12. Performance Requirements

- Feed page load: <500ms (from cached DB)
- Infinite scroll pagination: <200ms per load
- Settings modal open: <100ms
- DB should handle 10,000+ posts without slowdown
- Total disk footprint: <20MB (SQLite only)
- Memory: <256MB for the container

---

## 13. Security Notes

- Reddit credentials via environment variables, never hardcoded
- `.env` file in `.gitignore`
- SQLite file permissions 600 inside container
- No user authentication (single-user homelab app, LAN only)
- HTTPS optional (runs on LAN only)

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Reddit API rate limits during 200-sub collection | Job fails or gets throttled | Throttle to 1 req/sec, batch with delays, log failures |
| Video URLs expire (Reddit CDN ~15min TTL) | Videos won't play for older posts | Re-fetch video URL on demand via `/api/posts/:id/refresh-video`, fallback to thumbnail |
| SQLite write contention (collection + scoring + snapshots) | Slow writes | Use WAL mode, batch inserts in transactions |
| PRAW OAuth token expiry | Collection stops | PRAW handles refresh automatically, add retry logic |
| Large subreddit list management in UI | Clunky UX | Search/filter in subreddit manager, bulk import from text area |