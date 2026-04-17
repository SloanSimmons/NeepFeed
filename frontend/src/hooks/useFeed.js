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
  list,                     // undefined => all lists; number | 'all' | '1,3'
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
  // Monotonic request generation — responses that arrive after their
  // generation has been superseded are ignored, so stale prefetches can't
  // overwrite newer state. Abort handles the common case; generation is
  // the belt-and-braces defence.
  const genRef = useRef(0);
  const limit = 25;

  const deps = JSON.stringify({ sort, hideNsfw, hideSeen, subreddit, search, source, list });

  const fetchPage = useCallback(async (nextOffset) => {
    setLoading(true);
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const myGen = ++genRef.current;
    try {
      let data;
      if (source === 'bookmarks') {
        data = await api.bookmarks({ limit, offset: nextOffset }, { signal: ctrl.signal });
      } else {
        const params = { sort, limit, offset: nextOffset };
        if (hideNsfw) params.hide_nsfw = 'true';
        if (hideSeen) params.hide_seen = 'true';
        if (subreddit) params.subreddit = subreddit;
        if (search) params.q = search;
        if (list !== undefined && list !== null) params.list = String(list);
        data = await api.feed(params, { signal: ctrl.signal });
      }
      // Stale-response guard: return a sentinel so callers skip state writes.
      if (myGen !== genRef.current) {
        return { stale: true };
      }
      return data;
    } finally {
      if (myGen === genRef.current) setLoading(false);
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
        if (cancelled || data.stale) return;
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
      if (data.stale) return;
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
      if (data.stale) return;
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
