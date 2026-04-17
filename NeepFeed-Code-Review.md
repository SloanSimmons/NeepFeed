# NeepFeed — Code Review Report

> Full review of the NeepFeed codebase against the three spec documents (NeepFeed-Spec.md, NeepFeed-Lists-and-Recommender.md, NeepFeed-Skin-System.md). Covers bugs, spec discrepancies, missing features, and deployment issues.

**Date:** April 2026  
**Scope:** All backend Python, frontend JSX/JS, Docker config, and spec documentation

---

## 🔴 High Priority Bugs

### H1. `useFeed.js` — Infinite Re-render Loop Risk

**File:** `frontend/src/hooks/useFeed.js` line 33

`deps` is created via `JSON.stringify(...)` inside the component body, producing a new string reference every render. The `useEffect` that triggers `reset()` depends on `[deps, fetchPage]`, so it fires on every render, causing the feed to reset and re-fetch constantly.

```javascript
// Current (broken):
const deps = JSON.stringify({ sort, hideNsfw, hideSeen, subreddit, search, source });
// ...
useEffect(() => {
    reset();
    // ...
}, [deps, fetchPage]); // deps is new every render → effect fires every render
```

**Fix:** Use `useMemo` or `useRef` to stabilize the deps string, or use individual primitive values in the dependency array.

---

### H2. `useSkin.js` — Variable Ordering Bug

**File:** `frontend/src/hooks/useSkin.js` line 98

`apply(skin)` is called before `skin` is assigned from `findSkin(name)`. It works accidentally because `findSkin` always returns a fallback, but the ordering is wrong and fragile.

```javascript
// Current (fragile):
apply(skin);           // line 98 — uses skin before it's defined
const skin = findSkin(name);  // line 99 — defined here
```

**Fix:** Swap lines so `skin` is assigned before `apply(skin)`.

---

### H3. Only 3 of 5 Built-in Skins Implemented

**File:** `frontend/src/skins/builtin.js`

The spec (NeepFeed-Skin-System.md Section 4) defines 5 built-in skins: Dark, Light, **Cyberpunk**, **Solarized**, Paper. Only Dark, Light, and Paper exist in the code. Cyberpunk and Solarized are completely missing.

**Fix:** Add Cyberpunk and Solarized skin definitions per the spec's Section 4 variable tables.

---

## 🟡 Medium Priority Issues

### M1. Decay Rate Default Mismatch

| Location | Value |
|---|---|
| NeepFeed-Spec.md (line 111) | `1.0` ("Balanced") |
| schema.sql (line 115) | `0.7` (comment: "variety-leaning") |
| settings.py (line 24) | `0.7` |
| SettingsModal.jsx FreshnessSlider | "Balanced" marker at `0.7` |

The code intentionally changed the default to 0.7 for a "variety-leaning" feel, but the spec still says 1.0. The FreshnessSlider also marks 0.7 as "Balanced" instead of 1.0.

**Decision needed:** Update the spec to match the code (0.7), or update the code to match the spec (1.0)?

---

### M2. FreshnessSlider Range Mismatch

| Location | Range |
|---|---|
| NeepFeed-Spec.md | 0.5 – 2.0 |
| SettingsModal.jsx line 51 | 0.3 – 2.0 |

Values below 0.5 produce extremely flat scoring where nearly all posts have similar recency weight. The spec's 0.5 floor is more sensible.

**Fix:** Change the slider min to 0.5, or update the spec to document the 0.3 floor.

---

### M3. CSS Variable Defaults Differ from Spec

| Variable | Spec (Dark) | Code (Dark) |
|---|---|---|
| `--nf-bg-primary` | `#0f172a` (slate blue) | `#0b0d10` (near-black) |
| `--nf-accent` | `#3b82f6` (blue) | `#ff6b3d` (orange) |
| `--nf-bg-secondary` | `#1e293b` | `#14171c` |
| `--nf-text-primary` | `#f1f5f9` | `#e8ebef` |

The code's Dark skin is a near-black theme with orange accent. The spec describes a slate-blue theme with blue accent. The code version is more distinctive, but the spec docs are now inaccurate.

**Fix:** Update the spec's Dark skin defaults to match the actual code, or vice versa.

---

### M4. Built-in Skins Apply Without Preview

**Spec (Section 7):** "When a user selects any skin (built-in or custom), the app enters preview mode."

**Code:** Built-in skins apply immediately on click (`onSelect` → `selectSkin`). Only custom/imported skins go through the preview flow (`onPreview`).

**Fix:** Either update the spec to document that built-in skins apply immediately (since they're trusted), or change the code to preview all skins.

---

### M5. Skin Import Missing `version` Validation

**File:** `frontend/src/components/SkinManager.jsx` line 42

The spec (Section 9) requires `version: 1` in skin JSON, but the import function doesn't validate this field. A skin with `version: 2` or missing `version` would be accepted.

**Fix:** Add `if (obj.version !== 1) { setError('Skin version must be 1'); return; }` to the import validation.

---

### M6. `SubredditManager.jsx` — Missing Error Handling on `refresh()`

**File:** `frontend/src/components/SubredditManager.jsx` lines 55-60

`onToggle` wraps `api.toggleSub` in try/catch but doesn't wrap the subsequent `refresh()` call. If the API succeeds but `refresh()` throws, the error is unhandled.

```javascript
const onToggle = async (name) => {
    try {
        await api.toggleSub(name);
    } catch (e) { setError(e.message); }
    await refresh(); // not protected!
};
```

**Fix:** Wrap `refresh()` in try/catch or add `.catch()`.

---

### M7. `FLASK_SECRET_KEY` Not Passed to Container

**File:** `docker-compose.yml`

The `.env.example` defines `FLASK_SECRET_KEY` but it's not in the `environment` section of `docker-compose.yml`, so the container won't receive it. Flask will use an insecure default.

**Fix:** Add `- FLASK_SECRET_KEY=${FLASK_SECRET_KEY}` to the environment section.

---

### M8. Score Column Name Mismatch

| Location | Name |
|---|---|
| NeepFeed-Spec.md (line 64) | `current_score` |
| schema.sql (line 30) | `calculated_score` |
| API response | `calculated_score` |

The spec uses `current_score` but the code uses `calculated_score`. The code name is more descriptive, but the spec is inconsistent.

**Fix:** Update the spec to use `calculated_score`.

---

## 🟢 Low Priority Issues

### L1. `PostCard.jsx` — Double `domainOf()` Call

**File:** `frontend/src/components/PostCard.jsx` line 87

`domainOf(post.url)` is called twice for the same URL in the same render. Should cache the result.

---

### L2. `theme` Setting Coexists with Skin System

**File:** `frontend/src/components/SettingsModal.jsx` lines 226-233

SettingsModal has both a `theme` toggle (dark/light) and a full skin system. The spec says skins replace themes entirely. These should be unified — selecting the "Light" skin should set `theme=light`, and vice versa.

---

### L3. Dockerfile Doesn't Match Spec

| Aspect | Spec | Actual |
|---|---|---|
| Build strategy | Single-stage (python:3.10-slim + apt nodejs) | Multi-stage (node:22-alpine → python:3.12-slim) |
| Python version | 3.10 | 3.12 |
| CMD | `python backend/app.py` | `python app.py` (WORKDIR is /app/backend) |

The actual Dockerfile is better than the spec's version. Update the spec to match.

---

### L4. Missing `.dockerignore`

No `.dockerignore` file exists. The Docker build context includes `node_modules/`, `.venv/`, etc., slowing builds.

**Fix:** Add a `.dockerignore` with: `node_modules`, `.venv`, `__pycache__`, `data/`, `.git`, `*.db`

---

### L5. Container Runs as Root

**File:** `docker/Dockerfile`

The container runs as the default root user. Best practice is to create and switch to a non-root user.

---

### L6. Stale Comment in docker-compose.yml

Line 8 has: `# Host port TBD — pick an unused one on gweep before deploy. Spec said 5002.`

The port is confirmed as 5002. This comment should be removed or updated.

---

### L7. `api/client.js` — `importSubs` Uses Raw Fetch

**File:** `frontend/src/api/client.js` lines 37-42

`importSubs` uses raw `fetch` instead of the `req` wrapper. If the server returns a non-OK status with non-JSON body, `.json()` will throw rather than returning a structured error.

---

### L8. `BlocklistManager.jsx` — Silent Error Swallowing

**File:** `frontend/src/components/BlocklistManager.jsx` lines 30, 35

`refresh()` errors are silently swallowed. `onAdd` and `onRemove` don't wrap the API calls in try/catch at all.

---

### L9. Skin Template File Missing

**File:** `frontend/public/skin-template.md` — referenced in `SkinManager.jsx` but doesn't exist

The SkinManager component tries to `fetch('/skin-template.md')` but the file doesn't exist in `frontend/public/`. The spec (Section 8) describes this file.

**Fix:** Create the skin template markdown file per the spec.

---

### L10. `stats.total_subreddits` Used But Not in Spec

**Files:** `frontend/src/components/Header.jsx` line 71, `frontend/src/hooks/useStats.js`

The frontend references `stats.total_subreddits` but the spec's stats endpoint response defines `active_subreddits`, not `total_subreddits`. The backend (`routes/stats.py`) does return `total_subreddits`, so this works — it's just not documented in the spec.

---

## 📋 Features in Code But Not in Any Spec

These were added during development and should be documented in the spec:

| Feature | Description | Key Files |
|---|---|---|
| **Blocklist** | Filter posts by keyword, author, domain, subreddit | `routes/blocklist.py`, `BlocklistManager.jsx` |
| **Post state tracking** | Seen/bookmark/hide per post | `schema.sql` (post_state table), `routes/posts.py`, `useSeenTracking.js` |
| **Per-sub sort_override** | Override global sort mode per subreddit | `schema.sql` (sort_override column), `routes/subreddits.py` |
| **Diversity cap** | Limit single-subreddit dominance in feed | `scoring.py` (_apply_diversity_cap), `settings.py` |
| **Cross-post dedup** | Collapse posts sharing url_hash | `scoring.py` (_apply_crosspost_dedup), `url_utils.py` |
| **Collection mode** | `batched_hot` vs `per_sub_top` strategy | `collection.py`, `settings.py` |
| **FTS5 search** | Full-text search on posts | `schema.sql` (posts_fts), `routes/feed.py` (/api/search) |
| **Gallery posts** | Support for Reddit gallery posts | `schema.sql` (gallery_urls), `reddit_client.py`, `GalleryViewer.jsx` |
| **Blurhash** | Compact image placeholder | `schema.sql` (blurhash column) |
| **Keyboard navigation** | j/k/o/c/m/b/h// shortcuts | `useKeyboardNav.js`, `App.jsx` |
| **Bookmarks view** | Separate feed mode for bookmarked posts | `routes/posts.py` (/api/bookmarks), `App.jsx` (mode toggle) |
| **Fresh batch banner** | Notification when new posts arrive | `FreshBatchBanner.jsx`, `useStats.js` |
| **Compact mode** | `compact_mode` setting | `settings.py` |
| **Dim seen posts** | `dim_seen` setting | `settings.py` |
| **Prefetch** | `prefetch_enabled` setting | `settings.py` |

---

## 📋 Spec Features Not Yet Implemented

| Feature | Spec | Status |
|---|---|---|
| **Cyberpunk skin** | Skin System §4 | ❌ Missing |
| **Solarized skin** | Skin System §4 | ❌ Missing |
| **Shareable skin URLs** | Skin System §6 | ❌ Missing |
| **AI skin template** | Skin System §8 | ❌ Missing |
| **`/api/skins/template` endpoint** | Skin System §10 | ❌ Missing |
| **Recommendation engine** | Lists §5 | ❌ Returns 501 |
| **Reddit rec API integration** | Lists §5 | ❌ Missing |
| **Sidebar scraping** | Lists §5 | ❌ Missing |
| **Recommendation background job** | Lists §5 | ❌ Missing |
| **PWA service worker** | Base Spec §7 | ⚠️ `sw.js` exists but may be placeholder |

---

## 📋 Spec vs Code: Database Schema Differences

### Extra columns in `posts` (not in base spec)

| Column | Type | Purpose |
|---|---|---|
| `post_hint` | TEXT | Post type hint (image, video, self, link, gallery) |
| `gallery_urls` | TEXT | JSON array of gallery image URLs |
| `url_hash` | TEXT | Normalized URL hash for cross-post dedup |
| `blurhash` | TEXT | Compact image placeholder |

### Extra tables (not in base spec)

| Table | Purpose |
|---|---|
| `post_state` | Tracks seen/bookmarked/hidden per post |
| `blocklist` | Keyword/author/domain/subreddit filtering |

### Extra column in `subscribed_subreddits`

| Column | Type | Purpose |
|---|---|---|
| `sort_override` | TEXT | Per-subreddit sort mode override |

### Column name change

| Spec Name | Code Name |
|---|---|
| `current_score` | `calculated_score` |

---

## 📋 Spec vs Code: Settings Differences

### Settings in code but not in any spec

| Key | Default | Purpose |
|---|---|---|
| `diversity_cap` | `0.3` | Max fraction of feed from any single sub |
| `dedup_crossposts` | `true` | Collapse cross-posts sharing url_hash |
| `prefetch_enabled` | `true` | Prefetch next feed page |
| `hide_seen` | `false` | Hide posts already viewed |
| `dim_seen` | `true` | Dim (not hide) seen posts |
| `compact_mode` | `false` | Compact feed display |
| `collection_mode` | `batched_hot` | Collection strategy (batched_hot or per_sub_top) |

### Settings defaults that differ from spec

| Key | Spec Default | Code Default |
|---|---|---|
| `decay_rate` | `1.0` | `0.7` |
| `theme` enum | Not restricted | Restricted to `dark`/`light` only |

---

## 📋 Spec vs Code: API Endpoint Differences

### Endpoints in code but not in any spec

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/posts/<id>/seen` | Mark post as seen |
| POST | `/api/posts/seen-batch` | Bulk mark posts as seen |
| POST | `/api/posts/<id>/bookmark` | Toggle bookmark |
| POST | `/api/posts/<id>/hidden` | Hide a post |
| DELETE | `/api/posts/<id>/hidden` | Unhide a post |
| GET | `/api/bookmarks` | List bookmarked posts |
| GET | `/api/search` | FTS5 search |
| GET | `/api/blocklist` | List blocklist entries |
| POST | `/api/blocklist` | Add/remove blocklist entries |
| POST | `/api/_dev/seed-sub` | Dev-only: add subreddit |

### Endpoints in spec but not fully implemented

| Method | Path | Status |
|---|---|---|
| GET | `/api/lists/<id>/recommendations` | Returns empty list (engine not built) |
| POST | `/api/lists/<id>/recommendations/refresh` | Returns 501 |
| GET | `/api/skins/template` | Not implemented |

---

## ✅ What's Working Well

- **Core feed** — infinite scroll, scoring, pagination, sort modes all functional
- **Collection job** — mock client, PRAW client, APScheduler, score snapshots, rate limiting
- **Lists system** — full CRUD for lists and per-list subreddit management, v1→v2 migration
- **Skin system** — custom skin import/export, preview bar, contrast validation, active skin persistence
- **Video player** — autoplay, IntersectionObserver, mute toggle, refresh-on-error
- **Settings** — all settings with validation, export/import with v1/v2 format support
- **Blocklist** — keyword/author/domain/subreddit filtering in feed query
- **Search** — FTS5 full-text search with relevance ranking
- **Keyboard navigation** — comprehensive vim-style shortcuts
- **Cross-post dedup** — URL normalization and deduplication
- **Diversity cap** — prevents single-subreddit dominance in feed
- **Post state** — seen/bookmark/hide tracking with dim-seen UI

---

## Recommended Priority Actions

1. **Fix `useFeed` re-render bug** (H1) — most impactful real bug, causes constant re-fetching
2. **Fix `useSkin` ordering bug** (H2) — simple swap, prevents future crashes
3. **Add Cyberpunk and Solarized skins** (H3) — spec requires 5 built-in skins
4. **Add `FLASK_SECRET_KEY` to docker-compose.yml** (M7) — security issue
5. **Add `.dockerignore`** (L4) — build performance
6. **Create `skin-template.md`** (L9) — referenced but missing
7. **Update spec docs** to reflect intentional changes:
   - `decay_rate` default is 0.7, not 1.0
   - Dark skin colors are orange/near-black, not blue/slate
   - Score column is `calculated_score`, not `current_score`
   - Document all extra features (blocklist, post state, diversity cap, etc.)
   - Document all extra API endpoints
8. **Decide on FreshnessSlider range** — align code (0.3) with spec (0.5) or update spec
9. **Decide on built-in skin preview behavior** — should all skins go through preview, or is immediate-apply for built-ins acceptable?
10. **Decide on `theme` vs skins** — should the theme toggle be removed in favor of the skin system?