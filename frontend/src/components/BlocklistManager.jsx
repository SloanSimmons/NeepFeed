import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const TYPES = [
  { value: 'keyword',   label: 'Keyword',   hint: 'substring match in title' },
  { value: 'author',    label: 'Author',    hint: 'exact username' },
  { value: 'domain',    label: 'Domain',    hint: 'substring match in URL' },
  { value: 'subreddit', label: 'Subreddit', hint: 'hide posts from this sub' },
];

export default function BlocklistManager() {
  const [items, setItems] = useState({});
  const [type, setType] = useState('keyword');
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const r = await api.blocklist();
      setItems(r.blocklist || {});
      setError(null);
    } catch (err) {
      setError('Failed to load blocklist: ' + err.message);
    }
  };
  useEffect(() => { refresh(); }, []);

  const onAdd = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    try {
      await api.addBlock(type, v);
      setValue('');
      await refresh();
    } catch (err) {
      setError('Failed to add: ' + err.message);
    }
  };

  const onRemove = async (t, v) => {
    try {
      await api.removeBlock(t, v);
      await refresh();
    } catch (err) {
      setError('Failed to remove: ' + err.message);
    }
  };

  const allItems = Object.entries(items).flatMap(([t, arr]) => arr.map((i) => ({ ...i, type: t })));

  return (
    <div>
      {error && <div className="text-red-400 text-xs mb-2 font-mono">{error}</div>}
      <form onSubmit={onAdd} className="flex gap-2 mb-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-bg border border-white/10 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-brand/40"
        >
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Add ${type}…`}
          className="flex-1 bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
        />
        <button type="submit" className="btn-primary text-sm">Add</button>
      </form>

      <div className="max-h-60 overflow-y-auto space-y-1">
        {allItems.length === 0 && (
          <div className="text-fg-dim text-sm text-center p-3">
            Nothing blocked. Add keywords, authors, domains, or subs above.
          </div>
        )}
        {allItems.map((it) => (
          <div key={`${it.type}:${it.value}`} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white/5">
            <span className="text-xs text-fg-dim uppercase tracking-wide w-20">{it.type}</span>
            <span className="flex-1 font-mono truncate">{it.value}</span>
            <button
              onClick={() => onRemove(it.type, it.value)}
              className="text-fg-dim hover:text-red-400 px-2"
              title="Remove"
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
