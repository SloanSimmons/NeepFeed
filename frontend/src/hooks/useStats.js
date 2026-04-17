import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Polls /api/stats every `intervalMs`. Fires `onFreshBatch(newCount)` when
 * total_posts grows (signalling a successful collection cycle).
 */
export function useStats({ intervalMs = 30_000, onFreshBatch } = {}) {
  const [stats, setStats] = useState(null);
  const lastTotal = useRef(null);
  const onFresh = useRef(onFreshBatch);
  onFresh.current = onFreshBatch;

  const fetchOnce = useCallback(async () => {
    try {
      const s = await api.stats();
      setStats(s);
      if (lastTotal.current != null && s.total_posts > lastTotal.current) {
        onFresh.current?.(s.total_posts - lastTotal.current);
      }
      lastTotal.current = s.total_posts;
    } catch {
      // swallow; keep polling
    }
  }, []);

  useEffect(() => {
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => clearInterval(id);
  }, [fetchOnce, intervalMs]);

  return { stats, refresh: fetchOnce };
}
