import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';

const IMPORT_HINT = [
  "Paste a list of subreddits: one per line, or comma/space-separated.",
  "Accepts 'r/python', 'python', or 'https://reddit.com/r/python/'.",
  "Also accepts JSON from Reddit data export, Apollo, or Sync backups.",
].join('\n');

export default function SubredditManager() {
  const [subs, setSubs] = useState([]);
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const refresh = async () => {
    try {
      const r = await api.subreddits();
      setSubs(r.subreddits || []);
      setError(null);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter((s) => s.name.includes(q));
  }, [subs, filter]);

  const onAdd = async (e) => {
    e?.preventDefault();
    const name = adding.trim();
    if (!name) return;
    try {
      await api.addSub(name);
      setAdding('');
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onRemove = async (name) => {
    if (!confirm(`Unsubscribe from r/${name}?`)) return;
    try {
      await api.removeSub(name);
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onToggle = async (name) => {
    try {
      await api.toggleSub(name);
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onSetWeight = async (name, weight) => {
    // Optimistic
    setSubs((prev) => prev.map((s) => (s.name === name ? { ...s, weight } : s)));
    try {
      await api.setSubWeight(name, weight);
    } catch (e) { setError(e.message); refresh(); }
  };

  const onBulkImport = async () => {
    try {
      const result = await api.importSubs(bulkText, 'text/plain');
      setBulkResult(result);
      setBulkText('');
      await refresh();
    } catch (e) { setError(e.message); }
  };

  const onFileImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    // Try JSON first, fall back to text
    let contentType = 'application/json';
    try { JSON.parse(text); } catch { contentType = 'text/plain'; }
    try {
      const result = await api.importSubs(text, contentType);
      setBulkResult(result);
      await refresh();
    } catch (e) { setError(e.message); }
    e.target.value = '';
  };

  return (
    <div>
      {error && (
        <div className="text-red-400 text-xs mb-2 font-mono whitespace-pre-wrap">{error}</div>
      )}

      {/* Add single */}
      <form onSubmit={onAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder="Add subreddit (e.g. python, r/rust)…"
          className="flex-1 bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand/40"
        />
        <button type="submit" className="btn-primary text-sm">Add</button>
        <button
          type="button"
          onClick={() => setBulkOpen((o) => !o)}
          className="btn text-sm"
        >
          Bulk Import
        </button>
      </form>

      {/* Bulk import panel */}
      {bulkOpen && (
        <div className="bg-bg border border-white/5 rounded-lg p-3 mb-3">
          <label className="block text-xs text-fg-muted mb-1 whitespace-pre-line">{IMPORT_HINT}</label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={5}
            className="w-full bg-bg-card border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand/40"
            placeholder="python, golang, rust&#10;selfhosted&#10;r/homelab"
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={onBulkImport} disabled={!bulkText.trim()} className="btn-primary text-sm disabled:opacity-40">
              Import text
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/plain,text/csv"
              onChange={onFileImport}
              className="hidden"
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn text-sm">
              Import file…
            </button>
            {bulkResult && (
              <span className="text-xs text-fg-muted">
                Added {bulkResult.added_count}, skipped {bulkResult.skipped_count}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter subreddits…"
        className="w-full bg-bg border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-brand/40"
      />

      {/* Sub list */}
      <div className="max-h-96 overflow-y-auto pr-1 -mr-1 space-y-1">
        {filtered.map((s) => (
          <div
            key={s.name}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${s.active ? '' : 'opacity-50'}`}
          >
            <button
              onClick={() => onToggle(s.name)}
              className={`w-2 h-2 rounded-full flex-shrink-0 ${s.active ? 'bg-brand' : 'bg-fg-dim'}`}
              title={s.active ? 'Active (click to pause)' : 'Paused (click to activate)'}
            />
            <span className="text-sm flex-1 min-w-0 truncate">
              r/{s.name}
              {s.is_new_boost && <span className="ml-1 text-[10px] text-brand font-mono">NEW</span>}
              <span className="text-xs text-fg-dim ml-2">{s.post_count || 0}</span>
            </span>
            <WeightSlider value={s.weight} onChange={(w) => onSetWeight(s.name, w)} />
            <button
              onClick={() => onRemove(s.name)}
              className="text-fg-dim hover:text-red-400 text-sm px-2"
              title="Remove"
            >✕</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-fg-dim text-sm p-4 text-center">
            {subs.length === 0 ? 'No subreddits yet.' : 'No matches.'}
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-fg-dim">
        {subs.filter((s) => s.active).length} active / {subs.length} total
      </div>
    </div>
  );
}

function WeightSlider({ value, onChange }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-1 w-28 flex-shrink-0">
      <input
        type="range"
        min="0.1"
        max="3.0"
        step="0.1"
        value={v}
        onChange={(e) => setV(parseFloat(e.target.value))}
        onMouseUp={() => onChange(v)}
        onTouchEnd={() => onChange(v)}
        className="flex-1 accent-brand"
      />
      <span className="text-[10px] font-mono text-fg-muted w-6 text-right">{v.toFixed(1)}</span>
    </div>
  );
}
