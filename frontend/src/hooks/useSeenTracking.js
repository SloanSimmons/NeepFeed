import { useCallback, useEffect, useRef } from 'react';
import { api } from '../api/client.js';

/**
 * Tracks which posts have been scrolled past the viewport for ≥ `dwellMs`,
 * batches them, and POSTs to /api/posts/seen-batch.
 *
 * Usage: call markSeen(reddit_id) from your IntersectionObserver handler.
 * Flushes on a 3-second debounce and on page unload.
 */
export function useSeenTracking({ dwellMs = 600, flushMs = 3000 } = {}) {
  const pendingRef = useRef(new Set());
  const timerRef = useRef(null);
  const seenLocalRef = useRef(new Set());

  const flush = useCallback(() => {
    if (pendingRef.current.size === 0) return;
    const ids = Array.from(pendingRef.current);
    pendingRef.current = new Set();
    api.markSeenBatch(ids).catch(() => {
      // Best-effort; don't block UI on failure
    });
  }, []);

  const markSeen = useCallback((redditId) => {
    if (!redditId || seenLocalRef.current.has(redditId)) return;
    seenLocalRef.current.add(redditId);
    pendingRef.current.add(redditId);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, flushMs);
  }, [flush]);

  useEffect(() => {
    const onUnload = () => flush();
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush]);

  // Dwell-based "seen" tracker for use with IntersectionObserver
  const trackers = useRef(new Map()); // reddit_id -> timeoutId
  const onPostVisibilityChange = useCallback((redditId, visible) => {
    if (!redditId) return;
    if (visible) {
      if (trackers.current.has(redditId)) return;
      const t = setTimeout(() => {
        markSeen(redditId);
        trackers.current.delete(redditId);
      }, dwellMs);
      trackers.current.set(redditId, t);
    } else {
      const t = trackers.current.get(redditId);
      if (t) {
        clearTimeout(t);
        trackers.current.delete(redditId);
      }
    }
  }, [dwellMs, markSeen]);

  return { onPostVisibilityChange, markSeen, flush };
}
