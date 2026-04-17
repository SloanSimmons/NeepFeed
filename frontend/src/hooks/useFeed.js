import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/**
 * useFeed — infinite-scroll feed manager with prefetch.
 *
 * Returns:
 *   posts, loading, error, hasMore, loadMore(), reset()
 *
 * Triggers auto-fetch on mount + whenever deps (sort/hide_seen/etc) change.
 * When `prefetch` is true, pre-loads the next page as soon as current page resolves.
 */
export function useFeed({
  sort = 'calculated',
  hideNsfw,
  hideSeen,
  subreddit,
  search,
  source = 'feed',          // 'feed' | 'bookmarks'
  prefetch = true,
} = {}) {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  const abortRef = useRef(null);
  const prefetchRef = useRef(null);
  const limit = 25;

  const deps = JSON.stringify({ sort, hideNsfw, hideSeen, subreddit, search, source });

  const fetchPage = useCallback(async (nextOffset) => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (source === 'bookmarks') {
        return await api.bookmarks({ limit, offset: nextOffset });
      }
      const params = { sort, limit, offset: nextOffset };
      if (hideNsfw) params.hide_nsfw = 'true';
      if (hideSeen) params.hide_seen = 'true';
      if (subreddit) params.subreddit = subreddit;
      if (search) params.q = search;
      const data = await api.feed(params);
      return data;
    } finally {
      setLoading(false);
    }
  }, [deps]);

  const reset = useCallback(() => {
    setPosts([]);
    setTotal(0);
    setOffset(0);
    setHasMore(true);
    prefetchRef.current = null;
  }, []);

  useEffect(() => {
    // On deps change, reset and load first page
    reset();
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPage(0);
        if (cancelled) return;
        setPosts(data.posts || []);
        setTotal(data.total || 0);
        setOffset(data.posts?.length || 0);
        setHasMore((data.posts?.length || 0) >= limit);
        // Prefetch next page
        if (prefetch && (data.posts?.length || 0) >= limit) {
          prefetchRef.current = fetchPage(data.posts.length);
        }
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') setError(e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    try {
      // Use prefetched page if available
      const pending = prefetchRef.current;
      prefetchRef.current = null;
      const data = pending ? await pending : await fetchPage(offset);
      setPosts((prev) => {
        const seenIds = new Set(prev.map((p) => p.reddit_id));
        const newOnes = (data.posts || []).filter((p) => !seenIds.has(p.reddit_id));
        return [...prev, ...newOnes];
      });
      const newOffset = offset + (data.posts?.length || 0);
      setOffset(newOffset);
      setHasMore((data.posts?.length || 0) >= limit);
      if (prefetch && (data.posts?.length || 0) >= limit) {
        prefetchRef.current = fetchPage(newOffset);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e);
    }
  }, [loading, hasMore, offset, fetchPage, prefetch]);

  const retry = useCallback(async () => {
    reset();
    try {
      const data = await fetchPage(0);
      setPosts(data.posts || []);
      setTotal(data.total || 0);
      setOffset(data.posts?.length || 0);
      setHasMore((data.posts?.length || 0) >= limit);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e);
    }
  }, [reset, fetchPage]);

  return { posts, total, loading, error, hasMore, loadMore, reset, setPosts, retry };
}
