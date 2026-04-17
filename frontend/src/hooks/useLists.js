import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const LS_KEY = 'neepfeed_active_list_id';
export const ALL_LISTS = 'all';    // sentinel: merge all lists, no filter

/**
 * useLists — fetch + cache lists, provide CRUD helpers, persist the
 * active selection to localStorage.
 *
 * Exposes:
 *   lists                — [{id, name, icon, position, subreddit_count, ...}]
 *   activeListId         — 'all' | number
 *   setActiveListId(id)  — select a list (or ALL_LISTS). Persists.
 *   refresh()            — re-fetch from /api/lists
 *   create({name, icon})
 *   update(id, patch)
 *   remove(id)
 *   loading, error
 */
export function useLists() {
  const [lists, setLists] = useState([]);
  const [activeListId, setActiveListIdState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return ALL_LISTS;
      if (raw === ALL_LISTS) return ALL_LISTS;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : ALL_LISTS;
    } catch {
      return ALL_LISTS;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.lists();
      setLists(r.lists || []);
      setError(null);
      // If the persisted selection no longer exists, fall back to All Lists
      setActiveListIdState((curr) => {
        if (curr === ALL_LISTS) return curr;
        const found = (r.lists || []).some((l) => l.id === curr);
        return found ? curr : ALL_LISTS;
      });
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setActiveListId = useCallback((id) => {
    setActiveListIdState(id);
    try { localStorage.setItem(LS_KEY, String(id)); } catch {}
  }, []);

  const create = useCallback(async ({ name, icon }) => {
    const r = await api.createList({ name, icon });
    await refresh();
    return r;
  }, [refresh]);

  const update = useCallback(async (id, patch) => {
    const r = await api.updateList(id, patch);
    await refresh();
    return r;
  }, [refresh]);

  const remove = useCallback(async (id) => {
    const r = await api.deleteList(id);
    await refresh();
    // If we deleted the active list, fall back to All Lists
    setActiveListIdState((curr) => (curr === id ? ALL_LISTS : curr));
    try {
      if (localStorage.getItem(LS_KEY) === String(id)) {
        localStorage.setItem(LS_KEY, ALL_LISTS);
      }
    } catch {}
    return r;
  }, [refresh]);

  return {
    lists,
    activeListId,
    setActiveListId,
    refresh,
    create,
    update,
    remove,
    loading,
    error,
  };
}
