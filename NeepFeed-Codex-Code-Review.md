# NeepFeed Codex Code Review

**Date:** April 17, 2026  
**Reviewer:** Codex  
**Scope:** Follow-up review of the NeepFeed Reddit client at `C:\Users\sloan\Projects\NeepFeed`, using `NeepFeed-Code-Review.md` as prior context.

## Summary

This review focused on runtime correctness, stale-state behavior, data validation, and user-visible edge cases in the current codebase. The first review remains useful as a specification-drift audit, but a few of its high-priority claims are now stale or overstated:

- `frontend/src/hooks/useSkin.js` no longer has the reported variable-ordering bug.
- `frontend/public/skin-template.md` exists in the current tree.
- `frontend/src/hooks/useFeed.js` does not have an infinite render loop just because it uses `JSON.stringify(...)` in the dependency array. The resulting value is a primitive string and React compares it by value.

The most important current risks are stale service-worker API responses after mutations and unvalidated imported settings that can crash `/api/feed`.

## Findings

### P1. Avoid stale service-worker API reads after mutations

**File:** `frontend/public/sw.js` lines 59-68

The service worker returns cached API responses immediately for mutable resources such as `/api/subreddits`, `/api/settings`, `/api/skins`, and `/api/blocklist`.

After a successful POST, the UI often performs a follow-up GET. In production/PWA mode, that GET can render the old cached response, making adds, removes, skin changes, or settings updates appear to fail until a later refresh.

**Recommendation:** Use network-first for mutable API reads, or invalidate `API_CACHE` when related mutations complete. A conservative split would be:

- Cache-first or stale-while-revalidate only for genuinely static shell assets.
- Network-first for `/api/settings`, `/api/subreddits`, `/api/skins`, `/api/blocklist`, `/api/bookmarks`, and `/api/feed`.
- Optional stale fallback only when the network fails.

### P1. Validate imported settings before persisting

**File:** `backend/routes/settings.py` lines 191-197

Config import writes settings directly into `user_config` without using the same validation and clamping path as `POST /api/settings`.

I verified this failure mode with a temporary database:

1. Importing `{"settings": {"min_score_threshold": "not-an-int"}}` returns success.
2. The next `GET /api/feed` crashes with a 500 because `feed.py` calls `int()` on the invalid value.

**Recommendation:** Run imported settings through `_serialize()` or a shared validation helper before writing them. Reject invalid imports with a 400, ideally transactionally so partial imports do not leave the app in a mixed state.

### P2. Batch seen endpoint 500s on stale post ids

**File:** `backend/routes/posts.py` lines 55-63

The `WHERE EXISTS` clause only guards the conflict update path, not the initial insert. If the client flushes a post id that was already cleaned up, or any invalid id, SQLite raises a foreign-key error and the endpoint returns 500.

I reproduced this by posting `does_not_exist` to `/api/posts/seen-batch` against a fresh temporary database.

**Recommendation:** Prefilter ids against `posts`, or insert through a guarded `INSERT INTO ... SELECT ... WHERE EXISTS (...)` statement. The endpoint should ignore stale ids or report skipped ids, not fail the whole batch.

### P2. Raw FTS query syntax can crash search

**File:** `backend/scoring.py` lines 315-318

The search string is passed directly to SQLite FTS5 `MATCH` after only quote replacement. User input such as `foo OR` raises `sqlite3.OperationalError` and returns a 500.

I reproduced this with `GET /api/feed?q=foo+OR`.

**Recommendation:** Treat normal user search as plain text by tokenizing and quoting terms before constructing the FTS query, or catch FTS syntax errors and return a 400 with a usable message. A simple fallback can also retry as quoted plain text when raw FTS syntax fails.

### P2. AbortController is created but never used

**File:** `frontend/src/hooks/useFeed.js` lines 38-50

`fetchPage()` creates and aborts `AbortController` instances, but `api.feed()` and `api.bookmarks()` never receive `ctrl.signal`, so old requests continue running.

A `loadMore()` or prefetch from an old search, sort, or filter can still resolve after the feed resets, append stale posts, or flip `loading` for a newer request.

**Recommendation:** Pass `signal` through the API wrapper and into `fetch()`. Also consider a request-generation guard so stale responses cannot update state even when they are not abortable.

### P2. Dedup winner ignores the active sort mode

**File:** `backend/scoring.py` lines 247-249

Cross-post dedup always keeps the item with the highest `calculated_score`. Because dedup is applied for `score`, `recency`, and `velocity` sorts too, a recency-sorted feed can replace the newest copy with an older higher-calculated copy, and a score-sorted feed can pick the wrong representative.

**Recommendation:** Preserve the first item in the already-sorted group, or pass the active sort key into `_apply_crosspost_dedup()` and select the winner according to that sort.

### P3. Bookmark button can drift from parent state

**File:** `frontend/src/components/PostCard.jsx` line 35

`PostCard` initializes local `bookmarked` state from `post.bookmarked` but never syncs when the prop changes. Keyboard bookmarking updates the parent `posts` array, but the button icon can keep showing the old state until the card remounts.

**Recommendation:** Add an effect that syncs local state from `post.bookmarked`, or make the bookmark state controlled by the parent.

### P3. Dev seed route is broken after list migration

**File:** `backend/routes/collect.py` lines 34-37

The v2 migration changes `subscribed_subreddits` uniqueness to `(list_id, name)`, but the dev seed route still uses `ON CONFLICT(name)`.

I verified that `POST /api/_dev/seed-sub` returns a 500 on a fresh migrated database.

**Recommendation:** Remove the dev-only route if it is no longer needed, or update it to include `list_id` and use `ON CONFLICT(list_id, name)`.

## Still-Valid Notes From The First Review

The earlier review identified several lower-risk items that still appear valid:

- Only three built-in skins are implemented: Dark, Light, and Paper. The skin spec still references Cyberpunk and Solarized.
- `.dockerignore` is missing, so Docker build context can include `node_modules`, virtualenvs, database files, and generated artifacts.
- The runtime Docker image still runs as root.
- `FLASK_SECRET_KEY` is present in `.env.example` but not passed through `docker-compose.yml`.
- The Docker Compose port comment still says the host port is TBD even though `5002:5000` is configured.
- `SettingsModal` still has a legacy `theme` setting alongside the newer skin system, which creates a confusing source of truth.

## Verification Performed

I ran these non-invasive checks:

```powershell
npm run build
python -m compileall backend
```

Both completed successfully.

I also used temporary SQLite databases through Flask's test client to reproduce:

- `/api/posts/seen-batch` returning 500 for a stale post id.
- `/api/config/import` accepting an invalid setting that later crashes `/api/feed`.
- `/api/feed?q=foo+OR` returning 500 due to FTS5 syntax.
- `/api/_dev/seed-sub` returning 500 after the list migration.

## Suggested Improvements And Features

### Main feed list selector

The backend already supports list filtering via `list=all` or comma-separated list ids, but the current app only exposes Feed vs Bookmarks. Add a main-screen list selector so users can switch between All, Tech, Gaming, News, or any custom list without opening settings.

### Undo queue for destructive actions

Hide and unbookmark are fast keyboard-driven actions. Add a small undo bar for recent changes, especially after `h`, unbookmarking in Bookmarks mode, and bulk blocklist changes.

### Collection diagnostics page

Add a diagnostics view showing:

- Last collection start/end time.
- Last collection error.
- Reddit client mode: mock or PRAW.
- Per-subreddit fetch counts.
- Inserted, updated, skipped, and removed counts.
- Failed batches and rate-limit hints.

This would make Reddit API issues much easier to debug in a self-hosted deployment.

### Saved searches and named filters

Allow users to save reusable feed views that combine:

- List or subreddit filter.
- Sort mode.
- Search query.
- NSFW setting.
- Hide-seen setting.
- Blocklist profile.

This would turn NeepFeed from one global feed into a set of lightweight custom timelines.

### Safer PWA offline behavior

The PWA is valuable, but mutable API caching should be explicit. Consider an offline banner and a "showing cached data" indicator when network requests fail and the app falls back to cached API data.

### Skin system completion

Finish the skin spec surface:

- Add Cyberpunk and Solarized built-ins, or update the spec to say there are three built-ins.
- Remove or integrate the legacy `theme` setting.
- Decide whether built-in skins should apply immediately or enter preview like custom skins.

### Docker hardening

For self-hosted use, deployment polish matters:

- Add `.dockerignore`.
- Run the app as a non-root user.
- Pass `FLASK_SECRET_KEY` through Compose or remove it if Flask sessions are not used.
- Update stale Compose comments.

## Recommended Fix Order

1. Fix config import validation.
2. Change service-worker API caching for mutable endpoints.
3. Fix batch seen stale-id handling.
4. Harden FTS search input.
5. Wire abort signals through feed requests and guard stale responses.
6. Make cross-post dedup respect active sort mode.
7. Sync bookmark UI state.
8. Remove or repair the dev seed route.

