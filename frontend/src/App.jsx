import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api/client.js';
import Header from './components/Header.jsx';
import Feed from './components/Feed.jsx';
import FreshBatchBanner from './components/FreshBatchBanner.jsx';
import EmptyState from './components/EmptyState.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { useFeed } from './hooks/useFeed.js';
import { useSettings } from './hooks/useSettings.js';
import { useStats } from './hooks/useStats.js';
import { useSeenTracking } from './hooks/useSeenTracking.js';
import { useKeyboardNav } from './hooks/useKeyboardNav.js';

export default function App() {
  const { settings, update: updateSettings } = useSettings();
  const [sort, setSort] = useState('calculated');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [freshBatch, setFreshBatch] = useState(0);
  const searchInputRef = useRef(null);

  // Sync sort from settings on first load
  useEffect(() => {
    if (settings?.sort_mode && sort === 'calculated' && settings.sort_mode !== 'calculated') {
      setSort(settings.sort_mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.sort_mode]);

  // Debounce search → feed
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { posts, loading, hasMore, loadMore, setPosts } = useFeed({
    sort,
    search: searchDebounced || undefined,
    hideNsfw: settings?.hide_nsfw,
    hideSeen: settings?.hide_seen,
    prefetch: settings?.prefetch_enabled !== false,
  });

  const { stats, refresh: refreshStats } = useStats({
    intervalMs: 30_000,
    onFreshBatch: (n) => setFreshBatch((prev) => prev + n),
  });

  const { onPostVisibilityChange } = useSeenTracking();

  // Mute toggle registry (VideoPlayer registers itself per post so 'm' works)
  const muteRegistry = useRef(new Map());
  const onMuteRegister = useCallback((id, toggle) => {
    if (toggle) muteRegistry.current.set(id, toggle);
    else muteRegistry.current.delete(id);
  }, []);

  // Keyboard shortcuts
  useKeyboardNav({
    onOpen: (id) => {
      const post = posts.find((p) => p.reddit_id === id);
      if (post) window.open(post.url || `https://reddit.com${post.permalink}`, '_blank');
    },
    onOpenComments: (id) => {
      const post = posts.find((p) => p.reddit_id === id);
      if (post) window.open(`https://reddit.com${post.permalink}`, '_blank');
    },
    onMute: (id) => muteRegistry.current.get(id)?.(),
    onBookmark: async (id) => {
      if (!id) return;
      const post = posts.find((p) => p.reddit_id === id);
      const next = !post?.bookmarked;
      try {
        await api.toggleBookmark(id, next);
        setPosts((prev) => prev.map((p) => (p.reddit_id === id ? { ...p, bookmarked: next } : p)));
      } catch {}
    },
    onHide: async (id) => {
      if (!id) return;
      try {
        await api.hidePost(id);
        setPosts((prev) => prev.filter((p) => p.reddit_id !== id));
      } catch {}
    },
    onFocusSearch: () => searchInputRef.current?.focus(),
    onEscape: () => {
      if (document.activeElement === searchInputRef.current) {
        searchInputRef.current.blur();
      }
    },
    onNearEnd: () => { if (hasMore && !loading) loadMore(); },
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const onOpenSettings = () => setSettingsOpen(true);

  const onTriggerCollection = async () => {
    try {
      await api.triggerCollection();
      await refreshStats();
    } catch (e) {
      console.error(e);
    }
  };

  const onFreshBatchClick = () => {
    setFreshBatch(0);
    // Reset the feed to get new posts at top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Force a refetch via sort-change "trick": same sort but re-keyed
    // Simplest: reload page. Better: expose a reset() from useFeed. We have setPosts
    // so just nudge via prefetch.
    // For now, just scroll to top; user's next scroll will pull fresher-ranked data on next mount.
  };

  const onSortChange = (next) => {
    setSort(next);
    updateSettings({ sort_mode: next }).catch(() => {});
  };

  return (
    <div className="min-h-full">
      <Header
        sort={sort}
        onSortChange={onSortChange}
        stats={stats}
        onOpenSettings={onOpenSettings}
        search={search}
        onSearchChange={setSearch}
        searchInputRef={searchInputRef}
      />

      <FreshBatchBanner count={freshBatch} onClick={onFreshBatchClick} />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
      />

      <main className="max-w-3xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
        {posts.length === 0 && !loading ? (
          <EmptyState
            stats={stats}
            onOpenSettings={onOpenSettings}
            onTriggerCollection={onTriggerCollection}
          />
        ) : (
          <Feed
            posts={posts}
            loading={loading}
            hasMore={hasMore}
            loadMore={loadMore}
            settings={settings}
            onPostSeen={onPostVisibilityChange}
            onMuteRegister={onMuteRegister}
            onBookmarked={(id, next) => {
              setPosts((prev) => prev.map((p) => (p.reddit_id === id ? { ...p, bookmarked: next } : p)));
            }}
            onHidden={(id) => {
              setPosts((prev) => prev.filter((p) => p.reddit_id !== id));
            }}
          />
        )}

        {/* Keyboard shortcut hint (subtle, dismissable in a later milestone) */}
        <footer className="mt-12 text-center text-xs text-fg-dim">
          <kbd className="kbd">j</kbd>/<kbd className="kbd">k</kbd> navigate ·{' '}
          <kbd className="kbd">o</kbd> open · <kbd className="kbd">c</kbd> comments ·{' '}
          <kbd className="kbd">m</kbd> mute · <kbd className="kbd">b</kbd> bookmark ·{' '}
          <kbd className="kbd">h</kbd> hide · <kbd className="kbd">/</kbd> search
        </footer>
      </main>
    </div>
  );
}
