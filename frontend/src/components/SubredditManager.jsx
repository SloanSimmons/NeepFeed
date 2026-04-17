import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';

const IMPORT_HINT_SUBS = [
  "Paste a list of subreddits: one per line, or comma/space-separated.",
  "Accepts 'r/python', 'python', or 'https://reddit.com/r/python/'.",
  "Also accepts JSON from Reddit data export, Apollo, or Sync backups.",
].join('\n');

const IMPORT_HINT_LIST = [
  "Paste or upload a single-list JSON file to create a new list.",
  'Shape: {"name": "Tech", "icon": "💻", "subreddits": ["rust", "python", ...]}',
  'Pass {"mode": "merge"} to add into an existing list of the same name instead of erroring.',
].join('\n');

/**
 * SubredditManager — per-list subreddit management.
 *
 * Takes `listsHook` (from useLists) so the list picker here stays in sync
 * with the header selector and the Lists tab. Operations target the list
 * currently selected in the listsHook.
 */
export default function SubredditManager({ listsHook }) {
  const { lists, activeListId, setActiveListId } = listsHook;

  // Which list are we editing? If the current activeListId is 'all' we still
  // need a concrete target — default to My Feed (id=1).
  const [editingListId, setEditingListId] = useState(() =>
    typeof activeListId === 'number' ? activeListId : 1
  );

  // When the parent's active list changes (e.g. from the header) and it's a
  // real list, follow it. Don't flip away when the parent is 'all'.
  useEffect(() => {
    if (typeof activeListId === 'number') setEditingListId(activeListId);
  }, [activeListId]);

  const editingList = lists.find((l) => l.id === editingListId);

  const [subs, setSubs] = useState([]);
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState('subs'); // 'subs' | 'list'
  const [bulkText, setBulkText] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!editingListId) return;
    try {
      const r = await api.listSubreddits(editingListId);
      setSubs(r.subreddits || []);
      setError(null);
    } catch (e) { setError(e.message); }
  }, [editingListId]);

  useEffect(() => { refresh(); }, [refresh]);

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
      await api.addSubToList(editingListId, name);
      setAdding('');
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onRemove = async (name) => {
    if (!confirm(`Remove r/${name} from ${editingList?.name || 'this list'}?`)) return;
    try {
      await api.removeSubFromList(editingListId, name);
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onToggle = async (name) => {
    try {
      await api.toggleSubInList(editingListId, name);
      await refresh();
    } catch (err) { setError(err.message); }
  };

  const onSetWeight = async (name, weight) => {
    // Optimistic
    setSubs((prev) => prev.map((s) => (s.name === name ? { ...s, weight } : s)));
    try {
      await api.setSubWeightInList(editingListId, name, weight);
    } catch (e) { setError(e.message); refresh(); }
  };

  const describeResult = (r) => {
    if (!r) return '';
    if (r.list) {
      const verb = r.created ? 'Created list' : 'Merged into list';
      return `${verb} "${r.list.name}" · added ${r.added_count}, skipped ${r.skipped_count}`;
    }
    return `Added ${r.added_count}, skipped ${r.skipped_count}`;
  };

  const runImport = async (text, contentType) => {
    try {
      let result;
      if (bulkMode === 'list') {
        // Single-list JSON blob -> /api/lists/import (creates a new list)
        const payload = typeof text === 'string' ? JSON.parse(text) : text;
        result = await api.importList(payload);
        // Auto-switch the header + editing to the new list if one was created
        if (result.list?.id && result.created) {
          setEditingListId(result.list.id);
          setActiveListId?.(result.list.id);
        }
      } else {
        // Rich-format subs -> /api/lists/<id>/subreddits/import (into current list)
        result = await api.importSubsIntoList(editingListId, text, contentType);
      }
      setBulkResult(result);
      if (bulkMode === 'subs') setBulkText('');
      await refresh();
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const onBulkImport = () => runImport(bulkText, 'text/plain');

  const onFileImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    let contentType = 'application/json';
    if (bulkMode === 'subs') {
      try { JSON.parse(text); } catch { contentType = 'text/plain'; }
    }
    await runImport(text, contentType);
    e.target.value = '';
  };

  return (
    <div>
      {error && (
        <div className="text-red-400 text-xs mb-2 font-mono whitespace-pre-wrap">{error}</div>
      )}

      {/* List selector */}
      {lists.length > 1 && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <span className="text-xs text-fg-muted">Managing:</span>
          <select
            value={editingListId}
            onChange={(e) => setEditingListId(Number(e.target.value))}
            className="bg-bg border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand/40"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.icon} {l.name} ({l.active_count ?? l.subreddit_count ?? 0})
              </option>
            ))}
          </select>
          <span className="text-xs text-fg-dim">
            {editingList ? `${editingList.active_count ?? 0} of ${editingList.subreddit_count ?? 0} active` : ''}
          </span>
        </div>
      )}

      {/* Add single */}
      <form onSubmit={onAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={`Add subreddit to ${editingList?.name || 'list'}…`}
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
          <div className="inline-flex p-0.5 bg-bg-card border border-white/5 rounded-lg mb-2 text-xs">
            <button
              onClick={() => { setBulkMode('subs'); setBulkResult(null); }}
              className={`px-3 py-1 rounded ${bulkMode === 'subs' ? 'bg-brand text-black font-semibold' : 'text-fg-muted hover:text-fg'}`}
            >
              Add subs to {editingList?.name || 'this list'}
            </button>
            <button
              onClick={() => { setBulkMode('list'); setBulkResult(null); }}
              className={`px-3 py-1 rounded ${bulkMode === 'list' ? 'bg-brand text-black font-semibold' : 'text-fg-muted hover:text-fg'}`}
            >
              Import as new list
            </button>
          </div>

          <label className="block text-xs text-fg-muted mb-1 whitespace-pre-line">
            {bulkMode === 'list' ? IMPORT_HINT_LIST : IMPORT_HINT_SUBS}
          </label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={bulkMode === 'list' ? 8 : 5}
            className="w-full bg-bg-card border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand/40"
            placeholder={bulkMode === 'list'
              ? '{\n  "name": "Tech",\n  "icon": "💻",\n  "subreddits": ["rust", "python", "linux"]\n}'
              : 'python, golang, rust\nselfhosted\nr/homelab'}
          />
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button
              onClick={onBulkImport}
              disabled={!bulkText.trim()}
              className="btn-primary text-sm disabled:opacity-40"
            >
              {bulkMode === 'list' ? 'Create list' : 'Import text'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/plain,text/csv"
              onChange={onFileImport}
              className="hidden"
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn text-sm">
              {bulkMode === 'list' ? 'Upload list JSON…' : 'Import file…'}
            </button>
            {bulkResult && (
              <span className="text-xs text-fg-muted">{describeResult(bulkResult)}</span>
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
              title="Remove from this list"
            >✕</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-fg-dim text-sm p-4 text-center">
            {subs.length === 0 ? `No subreddits in ${editingList?.name || 'this list'} yet.` : 'No matches.'}
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-fg-dim">
        {subs.filter((s) => s.active).length} active / {subs.length} total in {editingList?.name || 'this list'}
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
