# NeepFeed — Lists & Recommender Feature Extension

> This document extends the base NeepFeed spec. It assumes the core spec (flat subreddit list, feed, scoring, settings) already exists and describes the additions needed for multi-list support and per-list subreddit recommendations.

**Status (updated):** Phase split. Data-model + API layer (L1, L2) implemented as of v2 migration. Recommendation engine (L3) and full list UI (L4) deferred pending real Reddit API credentials + daily-drive feedback. The backend exposes all list endpoints; the frontend currently operates against the default "My Feed" list and shows Feed/Bookmarks but not a list selector. See *"Implementation status"* at the bottom for a precise breakdown.

---

## 1. Feature Overview

### What Changes

- **Lists:** Subreddits are organized into named lists (e.g., "Tech", "Game Dev", "Casual"). A subreddit can belong to multiple lists.
- **List selector:** The feed can show "All Lists" (merged, deduplicated) or filter to a single list.
- **Per-list recommendations:** Each list gets subreddit suggestions based on the communities already in that list.
- **Hybrid settings:** Global settings apply by default. Per-list overrides are supported in the data model but deferred from the UI until a later phase.

### What Doesn't Change

- Scoring algorithm (same formula, same freshness slider)
- Core feed behavior (infinite scroll, sort modes, video handling)
- Collection job (still fetches from all active subreddits regardless of list)
- Docker deployment, PWA, export/import

---

## 2. Data Model Changes

### New Table: `lists`

```sql
CREATE TABLE lists (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '📋',           -- emoji icon for the list
  position INTEGER DEFAULT 0,       -- display order
  created_at INTEGER,
  settings_overrides TEXT DEFAULT '{}'  -- JSON: per-list setting overrides (future use)
);

-- Default list created on first run:
-- INSERT INTO lists (name, icon, position, created_at) VALUES ('My Feed', '📋', 0, <now>);
```

The `settings_overrides` column stores a JSON object that can override any global setting for this list. Example:

```json
{
  "time_window_hours": 48,
  "min_score_threshold": 50,
  "sort_mode": "score"
}
```

**For this phase, the UI does NOT expose per-list overrides.** The column exists for future use. All lists use global settings.

### Updated Table: `subscribed_subreddits`

```sql
-- BEFORE (flat list):
CREATE TABLE subscribed_subreddits (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  added_at INTEGER,
  active BOOLEAN DEFAULT 1,
  weight REAL DEFAULT 1.0,
  is_new_boost BOOLEAN DEFAULT 0
);

-- AFTER (belongs to a list):
CREATE TABLE subscribed_subreddits (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  added_at INTEGER,
  active BOOLEAN DEFAULT 1,
  weight REAL DEFAULT 1.0,
  is_new_boost BOOLEAN DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id),
  UNIQUE(list_id, name)           -- no duplicate subs within a list
);
```

**Key change:** `name` is no longer UNIQUE globally — a subreddit can appear in multiple lists. The uniqueness constraint is per-list.

**Migration note:** When upgrading from the flat-list version, all existing subreddits should be moved into the default "My Feed" list.

### New Table: `list_recommendations`

```sql
CREATE TABLE list_recommendations (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL,
  subreddit_name TEXT NOT NULL,
  relevance_score REAL NOT NULL,     -- higher = more relevant
  source_subs TEXT,                   -- JSON array of which subs recommended this
  source_method TEXT,                 -- 'api' or 'sidebar' or 'both'
  refreshed_at INTEGER,
  FOREIGN KEY (list_id) REFERENCES lists(id)
);

CREATE INDEX idx_rec_list_id ON list_recommendations(list_id);
CREATE INDEX idx_rec_score ON list_recommendations(relevance_score DESC);
```

### `user_config` — New Keys

```sql
-- New config keys:
-- ('recommendations_enabled', 'true')
-- ('recommendations_refresh_hours', '24')
-- ('recommendations_max_per_list', '15')
```

---

## 3. Feed Behavior with Lists

### "All Lists" Mode (Default)

When viewing all lists merged:

1. Fetch all posts from all active subreddits across all lists
2. **Deduplicate by `reddit_id`** — a post appears once even if its subreddit is in multiple lists
3. **Weight resolution:** If a subreddit appears in multiple lists with different weights, use the **highest weight** for scoring
4. **New-sub boost:** If a subreddit was added to ANY list <7 days ago, the boost applies
5. Score and sort using the global formula

### "Single List" Mode

When a specific list is selected:

1. Fetch posts only from subreddits in that list
2. Use each subreddit's per-list weight for scoring
3. Score and sort using the global formula
4. Recommendations shown are for this list only

### Weight Precedence

| Scenario | Weight Used |
|---|---|
| Sub in one list | That list's weight for that sub |
| Sub in multiple lists, "All Lists" mode | Highest weight across all lists |
| Sub in multiple lists, specific list mode | That list's weight for that sub |

---

## 4. API Changes

### New Endpoints

#### Lists

**GET `/api/lists`**
```json
{
  "lists": [
    {
      "id": 1,
      "name": "Tech",
      "icon": "💻",
      "position": 0,
      "subreddit_count": 45,
      "active_count": 43,
      "has_recommendations": true,
      "recommendation_count": 12,
      "created_at": 1708342800
    }
  ],
  "total": 5
}
```

**POST `/api/lists`** — Create a new list
```json
// Request:
{ "name": "Game Dev", "icon": "🎮" }

// Response:
{ "success": true, "list": { "id": 2, "name": "Game Dev", "icon": "🎮", "position": 1 } }
```

**PATCH `/api/lists/:id`** — Update list name/icon/position
```json
// Request:
{ "name": "Game Development", "icon": "🕹️" }

// Response:
{ "success": true, "list": { "id": 2, "name": "Game Development", "icon": "🕹️" } }
```

**DELETE `/api/lists/:id`** — Delete a list (removes all subreddit associations, does NOT delete the subreddits from other lists)

#### List Subreddits

**GET `/api/lists/:id/subreddits`** — Subreddits in a specific list
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
  "total": 45,
  "active_count": 43
}
```

**POST `/api/lists/:id/subreddits`** — Add/remove subreddit to/from a list
```json
// Request:
{ "action": "add", "name": "rust" }
// or:
{ "action": "remove", "name": "rust" }

// Response:
{ "success": true, "subreddit": { "name": "rust", "weight": 1.0, "is_new_boost": true } }
```

**POST `/api/lists/:id/subreddits/bulk`** — Bulk add subreddits
```json
// Request:
{ "names": ["rust", "golang", "python", "csharp"] }

// Response:
{ "success": true, "added": 4, "skipped": 0, "subreddits": [...] }
```

**PATCH `/api/lists/:id/subreddits/:name/weight`** — Update per-sub weight within a list
```json
// Request:
{ "weight": 2.5 }

// Response:
{ "success": true, "subreddit": { "name": "rust", "weight": 2.5 } }
```

#### Recommendations

**GET `/api/lists/:id/recommendations`** — Get cached recommendations for a list
```json
{
  "recommendations": [
    {
      "subreddit_name": "coding",
      "relevance_score": 3.0,
      "source_subs": ["programming", "rust", "learnprogramming"],
      "source_method": "api",
      "already_subscribed": false,
      "refreshed_at": 1708342800
    },
    {
      "subreddit_name": "webdev",
      "relevance_score": 2.0,
      "source_subs": ["programming", "javascript"],
      "source_method": "sidebar",
      "already_subscribed": false,
      "refreshed_at": 1708342800
    }
  ],
  "total": 12,
  "refreshed_at": 1708342800
}
```

**POST `/api/lists/:id/recommendations/refresh`** — Manually trigger recommendation refresh for a list
```json
{ "started": true }
```

#### Updated Feed Endpoint

**GET `/api/feed?limit=25&offset=0&sort=calculated&list=all`**

- `list=all` (default) — Merge all lists, deduplicate
- `list=1` — Filter to list ID 1 only
- `list=1,3` — Merge lists 1 and 3 (comma-separated)

#### Updated Subreddits Endpoint

**GET `/api/subreddits`** — Now returns subreddits across all lists, with `list_ids` field
```json
{
  "subreddits": [
    {
      "name": "programming",
      "list_ids": [1, 3],
      "weight_by_list": { "1": 1.0, "3": 1.5 },
      "active": true,
      "is_new_boost": false,
      "post_count": 87
    }
  ],
  "total": 204,
  "active_count": 198
}
```

#### Updated Config Export/Import

**POST `/api/config/export`** — Now includes lists
```json
{
  "exported_at": "2025-04-16T10:30:00Z",
  "settings": { ... },
  "lists": [
    {
      "name": "Tech",
      "icon": "💻",
      "subreddits": ["programming", "rust", "linux"]
    }
  ]
}
```

**POST `/api/config/import`** — Restores lists + subreddits + settings

---

## 5. Recommendation Engine

### Architecture

```
┌─────────────────────────────────────────────────┐
│ RECOMMENDATION JOB (Background, every 24h)     │
│                                                 │
│ For each list:                                  │
│   1. Get all subreddit names in the list        │
│   2. For each subreddit:                        │
│      a. Try Reddit recommendation API           │
│      b. If API fails, parse sidebar for related │
│      c. Collect recommended subreddit names    │
│   3. Aggregate: count how many subs in the     │
│      list "vote" for each recommendation        │
│   4. Filter out: already-subscribed subs        │
│   5. Score: relevance = overlap count            │
│   6. Store top N in list_recommendations table  │
│   7. Cache for 24h                              │
└─────────────────────────────────────────────────┘
```

### Source 1: Reddit Recommendation API

```
GET https://www.reddit.com/api/recommendation/subreddits
  ?subreddits=programming,rust,linux
  &over_18=false

Returns: JSON array of recommended subreddits with relevance scores
```

- This endpoint takes a comma-separated list of subreddit names and returns related communities
- Rate limit: treat as 1 API call per list (not per subreddit)
- If the endpoint returns an error or is deprecated, fall back to Source 2

### Source 2: Sidebar "Related Communities" Scraping

Many subreddits list related communities in their sidebar or description:

```
GET https://www.reddit.com/r/programming/about.json
→ Parse description, sidebar, and wiki for subreddit links
→ Extract r/xxx patterns and /r/xxx URLs
```

- More stable than the recommendation API
- Less comprehensive (not all subs have sidebar links)
- Parse `description`, `submit_text`, and wiki pages for links

### Aggregation Algorithm

```python
def generate_recommendations(list_id):
    subs = get_subreddits_in_list(list_id)
    all_recommendations = {}  # name -> { score, source_subs, method }

    # Try Reddit recommendation API first (1 call per list)
    try:
        api_recs = reddit_client.get_recommendations([s.name for s in subs])
        for rec in api_recs:
            if rec.name not in all_recommendations:
                all_recommendations[rec.name] = {
                    'score': 0,
                    'source_subs': [],
                    'method': 'api'
                }
            all_recommendations[rec.name]['score'] += 1
            all_recommendations[rec.name]['source_subs'].extend(
                rec.source_subs
            )
    except Exception:
        pass  # Fall through to sidebar scraping

    # Supplement with sidebar scraping (1 call per subreddit)
    for sub in subs:
        try:
            related = reddit_client.get_related_from_sidebar(sub.name)
            for related_name in related:
                if related_name not in all_recommendations:
                    all_recommendations[related_name] = {
                        'score': 0,
                        'source_subs': [],
                        'method': 'sidebar'
                    }
                all_recommendations[related_name]['score'] += 1
                all_recommendations[related_name]['source_subs'].append(sub.name)
        except Exception:
            continue

    # Filter out already-subscribed subreddits (across ALL lists)
    all_subscribed = get_all_subscribed_subreddit_names()
    recommendations = {
        name: data for name, data in all_recommendations.items()
        if name not in all_subscribed
    }

    # Sort by relevance score, take top N
    sorted_recs = sorted(
        recommendations.items(),
        key=lambda x: x[1]['score'],
        reverse=True
    )[:max_per_list]

    # Store in database
    store_recommendations(list_id, sorted_recs)
```

### Scheduling

- **Automatic:** Background job runs every 24 hours (configurable via `recommendations_refresh_hours`)
- **Manual:** User can click "Refresh Recommendations" in the UI, which calls `/api/lists/:id/recommendations/refresh`
- **On new list creation:** Recommendations are generated for a new list within 5 minutes
- **On subreddit add/remove:** Recommendations for the affected list are marked stale and refreshed within the next cycle

### Rate Limit Budget

- Reddit recommendation API: ~1 call per list per 24h = 5-10 calls/day
- Sidebar scraping: ~1 call per subreddit per 24h = 200-500 calls/day
- Total: ~200-510 calls/day, well within the 60/min rate limit
- Spread sidebar scraping across the 24h window (1 call every ~3 minutes)

---

## 6. Frontend Changes

### List Selector (Header)

```
┌─────────────────────────────────────────────────────────┐
│ NeepFeed   [All Lists ▼]   [Sort ▼]   🌙   [⚙️]       │
└─────────────────────────────────────────────────────────┘
```

Dropdown options:
- **All Lists** (default) — merged, deduplicated feed
- **💻 Tech** (45 subs) — filtered to Tech list
- **🎮 Game Dev** (23 subs) — filtered to Game Dev list
- **📖 Learning** (31 subs) — filtered to Learning list
- **🍿 Casual** (67 subs) — filtered to Casual list
- **+ Create New List** — opens list creation dialog

When a specific list is selected, the feed shows only posts from that list's subreddits.

### SubredditManager (Updated)

The SubredditManager now has a list selector at the top, and shows recommendations below the sub list:

```
┌──────────────────────────────────────────────┐
│ Settings                                [✕] │
├──────────────────────────────────────────────┤
│                                              │
│ 📚 Subreddits                                │
│ ┌──────────────────────────────────────────┐ │
│ │ List: [💻 Tech ▼]                        │ │
│ │                                          │ │
│ │ r/programming    weight: ──●── 1.0  [✕]  │ │
│ │ r/rust           weight: ──●── 1.0  [✕]  │ │
│ │ r/linux          weight: ──●── 1.5  [✕]  │ │
│ │   ↑ (new sub boost active)               │ │
│ └──────────────────────────────────────────┘ │
│ [+ Add Subreddit]  [Bulk Import]             │
│                                              │
│ 💡 Recommended for Tech (12 suggestions)     │
│ ┌──────────────────────────────────────────┐ │
│ │ r/coding        (3 subs recommend)    [+] │ │
│ │ r/webdev        (2 subs recommend)    [+] │ │
│ │ r/learnrust     (2 subs recommend)    [+] │ │
│ │ r/cpp           (1 sub recommends)    [+] │ │
│ │ r/devops        (1 sub recommends)    [+] │ │
│ └──────────────────────────────────────────┘ │
│ [🔄 Refresh Recommendations]                  │
│                                              │
│ ⏱️ Content Freshness ...                     │
│ ... (rest of settings unchanged) ...         │
└──────────────────────────────────────────────┘
```

### List Management (New Section in Settings)

Below the SubredditManager, add a "Manage Lists" section:

```
📋 Manage Lists
┌──────────────────────────────────────────┐
│ 💻 Tech (45 subs)                    [✎] [🗑] │
│ 🎮 Game Dev (23 subs)               [✎] [🗑] │
│ 📖 Learning (31 subs)                [✎] [🗑] │
│ 🍿 Casual (67 subs)                  [✎] [🗑] │
└──────────────────────────────────────────┘
[+ Create New List]

✎ = Rename/edit icon
🗑 = Delete list (confirms first, does NOT delete subreddits from other lists)
```

### Recommendation Badge on List Selector

When a list has new recommendations (not yet viewed), show a badge:

```
NeepFeed   [All Lists ▼]   [Sort ▼]   🌙   [⚙️]
              ↓
           💻 Tech (45) 💡3
           🎮 Game Dev (23)
           📖 Learning (31) 💡7
           🍿 Casual (67)
```

The 💡 badge shows the count of unviewed recommendations. Clicking the list opens settings to the recommendations for that list.

### Recommendation Card

Each recommendation shows:
- Subreddit name (r/coding)
- How many of your subs recommended it ("3 subs recommend")
- Source indicator (API vs sidebar)
- [+] button to add to current list
- Clicking the name opens the subreddit in a new tab for preview

---

## 7. Collection Job Changes

### Updated Collection Logic

The collection job still fetches from ALL active subreddits regardless of list membership. The list structure only affects display and scoring, not data collection.

```python
def collection_job():
    # Get ALL unique active subreddits across all lists
    subreddits = get_all_unique_active_subreddits()

    for sub in subreddits:
        try:
            posts = reddit_client.get_top_posts(sub.name, limit=30, time_filter='day')
            for post in posts:
                if not post_exists(post.id):
                    insert_post(post)
                else:
                    update_post(post)
                    save_score_snapshot(post)
        except Exception as e:
            log_error(f"Failed to fetch {sub.name}: {e}")
            continue

    update_new_sub_boosts()
    recalculate_scores()
    delete_old_posts()
    delete_old_snapshots()
```

### New: Recommendation Job

```python
def recommendation_job():
    """Runs every 24 hours"""
    lists = get_all_lists()

    for list_obj in lists:
        try:
            generate_recommendations(list_obj.id)
        except Exception as e:
            log_error(f"Failed to generate recommendations for list {list_obj.id}: {e}")
            continue
```

This is scheduled separately from the collection job, running once every 24 hours.

---

## 8. Scoring Changes

### Weight Resolution in "All Lists" Mode

When computing `sub_weight` for a post in "All Lists" mode:

```python
def get_effective_weight(subreddit_name, list_id=None):
    """
    If list_id is specified, use that list's weight.
    If list_id is None (All Lists mode), use the highest weight across all lists.
    """
    if list_id:
        return get_sub_weight_in_list(subreddit_name, list_id)
    else:
        weights = get_all_weights_for_sub(subreddit_name)
        return max(weights) if weights else 1.0
```

### New-Sub Boost

A subreddit gets the new-sub boost if it was added to ANY list <7 days ago. The boost multiplier is the global `new_sub_weight` setting (default 1.5).

---

## 9. Migration from Flat List

When upgrading from the flat-list version (Phase 1) to lists (Phase 2):

1. **Create default list:** Insert a "My Feed" list with icon 📋
2. **Migrate subreddits:** Move all rows from the old `subscribed_subreddits` table into the new table with `list_id = 1`
3. **Drop old unique constraint:** The old table had `name TEXT UNIQUE`, the new table has `UNIQUE(list_id, name)`
4. **Preserve weights:** Keep each subreddit's existing weight

Migration script:

```python
def migrate_to_lists(db):
    # Create lists table
    db.execute(CREATE_LISTS_TABLE)

    # Create default list
    db.execute("INSERT INTO lists (name, icon, position) VALUES (?, ?, ?)",
               ("My Feed", "📋", 0))

    # Create new subscribed_subreddits table
    db.execute(CREATE_NEW_SUBSCRIBERS_TABLE)

    # Migrate data
    db.execute("""
        INSERT INTO subscribed_subreddits_new (list_id, name, added_at, active, weight, is_new_boost)
        SELECT 1, name, added_at, active, weight, is_new_boost
        FROM subscribed_subreddits
    """)

    # Drop old table, rename new
    db.execute("DROP TABLE subscribed_subreddits")
    db.execute("ALTER TABLE subscribed_subreddits_new RENAME TO subscribed_subreddits")

    # Create list_recommendations table
    db.execute(CREATE_LIST_RECOMMENDATIONS_TABLE)
```

---

## 10. Implementation Order

This feature should be built after the core NeepFeed MVP is fully working. Build in this order:

### L1: Data Model & Migration (2-3 hours)
- Create `lists` table
- Update `subscribed_subreddits` schema (add `list_id`, change unique constraint)
- Create `list_recommendations` table
- Write migration script from flat list to lists
- Update `db.py` CRUD helpers for all new tables
- Update `config.py` to add new config keys

### L2: List API Endpoints (2-3 hours)
- CRUD for lists (`/api/lists`)
- Subreddit management per list (`/api/lists/:id/subreddits`, bulk add)
- Weight management per list (`/api/lists/:id/subreddits/:name/weight`)
- Update `/api/feed` to accept `list` parameter
- Update `/api/subreddits` to include `list_ids`
- Update `/api/config/export` and `/api/config/import` to include lists

### L3: Recommendation Engine (3-4 hours)
- `MockRecommendationClient` for development
- Reddit recommendation API integration
- Sidebar scraping fallback
- Aggregation algorithm
- Background job (APScheduler, every 24h)
- Manual refresh endpoint
- Rate limiting and error handling

### L4: Frontend — List Management (3-4 hours)
- List selector dropdown in header
- List management section in settings (create, rename, delete lists)
- Updated SubredditManager with list selector
- Subreddit add/remove per list
- Bulk import per list
- Recommendation display in SubredditManager
- Recommendation badge on list selector dropdown

### L5: Polish & Testing (2-3 hours)
- Feed filtering by list (All Lists vs. single list)
- Weight resolution in All Lists mode
- Migration testing (flat list → lists)
- Recommendation refresh timing and caching
- Error states (empty list, no recommendations, API failures)
- Export/import with lists

**Total estimated effort: 12-17 hours**

---

## 11. Key Implementation Notes

### Deduplication in "All Lists" Mode
When merging posts from multiple lists, deduplicate by `reddit_id`. A post from r/programming appears once even if r/programming is in both "Tech" and "Learning". Use the highest weight across all lists for scoring.

### Recommendation Staleness
Recommendations are cached for 24 hours. Show a "Last refreshed: X hours ago" timestamp. If recommendations are >24h old, show a subtle indicator that they may be stale.

### Recommendation Filtering
When displaying recommendations, filter out:
1. Subreddits already in ANY list (not just the current list)
2. Subreddits that don't exist (404 from Reddit)
3. NSFW subreddits if `hide_nsfw` is enabled

### List Deletion
Deleting a list removes the list and its subreddit associations, but does NOT:
- Delete the subreddits from other lists
- Delete collected posts from those subreddits
- Affect the feed if those subreddits exist in other lists

If a subreddit is ONLY in the deleted list, it becomes inactive (no longer collected) unless added to another list.

### Default List
The app creates one default list ("My Feed") on first run. This ensures the app works identically to the flat-list version for users who don't want to use multiple lists.

### Sidebar Scraping Pattern
Look for these patterns in subreddit descriptions and sidebars:
- `/r/subredditname`
- `r/subredditname`
- Links to `/r/` URLs
- Wiki pages with "related communities" sections

### Rate Limiting for Recommendations
- Reddit recommendation API: 1 call per list per 24h (5-10 calls/day)
- Sidebar scraping: 1 call per subreddit per 24h, spread across the day
- Total budget: ~200-510 calls/day, well within limits
- Use the same PRAW client instance, respect rate limits

---

## 12. Future Considerations (Not in This Phase)

These are explicitly out of scope for this feature but documented for future planning:

- **Per-list settings UI** — The `settings_overrides` column exists in the `lists` table but is not exposed in the UI yet. Future phase will add per-list time window, sort mode, min score, etc.
- **Preset list templates** — Pre-built list templates ("Tech Starter Pack", "Gaming Essentials") that users can import.
- **List-based feed presets** — Quick-switch between list configurations.
- **Recommendation learning** — Track which recommendations the user adds vs. ignores, use this to improve future recommendations.
- **Cross-list recommendation deduplication** — If r/coding is recommended for both Tech and Learning, show it once with "recommended by 2 of your lists".

---

## 13. Implementation status

**Shipped (L1 + L2):**

- `lists` table and `list_recommendations` table created.
- `subscribed_subreddits` rebuilt via the v2 migration with `list_id` FK + composite `(list_id, name)` uniqueness. Default "My Feed" list (id = 1) absorbs all v1-era subs on upgrade.
- Full list CRUD: `GET/POST /api/lists`, `PATCH/DELETE /api/lists/<id>`.
- Per-list subreddit management: `GET /api/lists/<id>/subreddits`, `POST /api/lists/<id>/subreddits` (add|remove|toggle), `POST /api/lists/<id>/subreddits/bulk`, `PATCH /api/lists/<id>/subreddits/<name>/weight`.
- Feed filter: `GET /api/feed?list=all` (default) or `?list=1,3`. Scoring uses MAX weight across list memberships in All Lists mode; EXISTS subquery in SQL filters to specified lists.
- Collection job deduplicates subs (`SELECT DISTINCT name FROM subscribed_subreddits WHERE active=1`) so the same sub is fetched once even if it belongs to many lists.
- `/api/config/export` emits v2 format with lists nested; `/api/config/import` accepts both v1 and v2 payloads (v1 payloads load subs into the default list).
- Recommendations endpoints return `engine_status: "not_implemented"` or HTTP 501 so a future UI can wire against them unconditionally.

**Deferred (L3):**

- No recommendation engine. The `Reddit recommendation API` endpoint referenced in Section 5 was deprecated by Reddit in 2018, so the primary implementation would need to rely on sidebar scraping, which in turn needs real Reddit API credentials. Deferred until PRAW approval lands and we can confirm the scraping pattern against real data.

**Deferred (L4):**

- No list selector in the header. The current frontend shows Feed / Bookmarks mode toggle only.
- No list management UI in Settings (create / rename / delete / reorder lists).
- No recommendation cards in SubredditManager.
- All legacy "flat list" flows continue to work because the legacy `/api/subreddits` endpoints operate on the default list (`list_id = 1`) transparently.

**Weight resolution note:** In the current implementation, the baseline `calculated_score` stored on each post always uses MAX weight across list memberships, regardless of feed filter. When viewing a specific list, posts are filtered in SQL but scores are not recomputed per-list. This is acceptable while L4 is deferred (ranking within a filtered set remains correct); full per-list weight recompute is tracked for L4.