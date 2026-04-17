import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.settings();
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const update = useCallback(async (patch) => {
    // Optimistic
    setSettings((prev) => ({ ...(prev || {}), ...patch }));
    try {
      const next = await api.updateSettings(patch);
      setSettings(next);
      return next;
    } catch (e) {
      setError(e);
      refresh(); // rollback
      throw e;
    }
  }, [refresh]);

  return { settings, loading, error, update, refresh };
}
