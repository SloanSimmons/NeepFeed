-- NeepFeed schema. Safe to run repeatedly (IF NOT EXISTS everywhere).

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ==========================================================================
-- Core tables
-- ==========================================================================

CREATE TABLE IF NOT EXISTS posts (
    id                 INTEGER PRIMARY KEY,
    reddit_id          TEXT UNIQUE NOT NULL,         -- bare id, no t3_ prefix
    subreddit          TEXT NOT NULL,
    title              TEXT NOT NULL,
    url                TEXT NOT NULL,                -- link target (post url, or permalink for self posts)
    permalink          TEXT,                         -- /r/sub/comments/xxx/ (reddit comment permalink)
    author             TEXT,
    score              INTEGER,                      -- raw reddit upvotes
    num_comments       INTEGER,
    upvote_ratio       REAL,
    created_utc        INTEGER,
    fetched_at         INTEGER,
    last_scored_at     INTEGER,
    is_nsfw            BOOLEAN DEFAULT 0,
    is_video           BOOLEAN DEFAULT 0,
    thumbnail          TEXT,
    video_url          TEXT,
    selftext_preview   TEXT,
    link_flair         TEXT,
    calculated_score   REAL,                         -- computed via scoring algorithm
    post_hint          TEXT,                         -- 'image' | 'hosted:video' | 'rich:video' | 'link' | 'self' | 'gallery'
    gallery_urls       TEXT,                         -- JSON array of image URLs (for galleries)
    url_hash           TEXT,                         -- normalized-URL hash for cross-post dedup
    blurhash           TEXT                          -- optional compact image placeholder
);

CREATE INDEX IF NOT EXISTS idx_posts_created_utc      ON posts(created_utc);
CREATE INDEX IF NOT EXISTS idx_posts_subreddit        ON posts(subreddit);
CREATE INDEX IF NOT EXISTS idx_posts_is_nsfw          ON posts(is_nsfw);
CREATE INDEX IF NOT EXISTS idx_posts_calculated_score ON posts(calculated_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_url_hash         ON posts(url_hash);

-- ==========================================================================
-- Subscriptions
-- ==========================================================================

CREATE TABLE IF NOT EXISTS subscribed_subreddits (
    id           INTEGER PRIMARY KEY,
    name         TEXT UNIQUE NOT NULL,               -- lowercased, no r/ prefix
    added_at     INTEGER,
    active       BOOLEAN DEFAULT 1,
    weight       REAL DEFAULT 1.0,
    is_new_boost BOOLEAN DEFAULT 0,
    sort_override TEXT                               -- optional: 'calculated' | 'score' | 'recency' | 'velocity'
);

CREATE INDEX IF NOT EXISTS idx_subs_active ON subscribed_subreddits(active);

-- ==========================================================================
-- Engagement snapshots (for velocity scoring)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS score_snapshots (
    id           INTEGER PRIMARY KEY,
    reddit_id    TEXT NOT NULL,
    score        INTEGER NOT NULL,
    num_comments INTEGER,
    snapshot_at  INTEGER NOT NULL,
    FOREIGN KEY (reddit_id) REFERENCES posts(reddit_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_reddit_id ON score_snapshots(reddit_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_at        ON score_snapshots(snapshot_at);

-- ==========================================================================
-- Local state (seen / bookmarked / hidden — single-user app)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS post_state (
    reddit_id    TEXT PRIMARY KEY,
    seen_at      INTEGER,
    bookmarked_at INTEGER,
    hidden_at    INTEGER,
    FOREIGN KEY (reddit_id) REFERENCES posts(reddit_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_state_seen       ON post_state(seen_at);
CREATE INDEX IF NOT EXISTS idx_post_state_bookmarked ON post_state(bookmarked_at);

-- ==========================================================================
-- Blocklist (keywords, authors, domains, subs)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS blocklist (
    id        INTEGER PRIMARY KEY,
    type      TEXT NOT NULL CHECK (type IN ('keyword','author','domain','subreddit')),
    value     TEXT NOT NULL,
    added_at  INTEGER,
    UNIQUE(type, value)
);

CREATE INDEX IF NOT EXISTS idx_blocklist_type ON blocklist(type);

-- ==========================================================================
-- Configuration (key/value)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS user_config (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Defaults (INSERT OR IGNORE so we don't overwrite on re-run)
INSERT OR IGNORE INTO user_config(key,value) VALUES
  ('decay_rate',             '0.7'),  -- variety-leaning: older high-score posts stay visible
  ('time_window_hours',      '96'),
  ('min_score_threshold',    '10'),
  ('new_sub_weight',         '1.5'),
  ('hide_nsfw',              'false'),
  ('sort_mode',              'calculated'),
  ('theme',                  'dark'),
  ('autoplay_videos',        'true'),
  ('default_video_muted',    'true'),
  ('diversity_cap',          '0.3'),     -- max fraction of feed from any single sub (0 to disable)
  ('dedup_crossposts',       'true'),
  ('prefetch_enabled',       'true'),
  ('hide_seen',              'false'),
  ('dim_seen',               'true'),
  ('compact_mode',           'false');

-- ==========================================================================
-- Full-text search (title + selftext_preview)
-- ==========================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    reddit_id UNINDEXED,
    title,
    selftext_preview,
    subreddit,
    author,
    content=''
);

-- Meta: store schema version + last-collection time as user_config entries
INSERT OR IGNORE INTO user_config(key,value) VALUES ('schema_version', '1');
