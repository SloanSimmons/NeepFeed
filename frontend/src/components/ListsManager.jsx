import { useState } from 'react';
import { api } from '../api/client.js';

const DEFAULT_LIST_ID = 1; // "My Feed" — backend also enforces this
const COMMON_ICONS = ['📋', '💻', '🎮', '📖', '🍿', '🎵', '🔧', '🍳', '📰', '🧪', '🎨', '🏠', '✈️', '📺', '🚲', '🌱', '📷', '🕹️', '☕', '🧠'];

/**
 * Settings tab for managing lists themselves — create / rename / icon /
 * delete. Per-list subreddit management lives in SubredditManager which
 * has its own list selector.
 */
export default function ListsManager({ listsHook }) {
  const { lists, refresh, create, update, remove } = listsHook;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📋');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('📋');
  const [error, setError] = useState(null);

  const resetCreate = () => { setCreating(false); setNewName(''); setNewIcon('📋'); };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create({ name, icon: newIcon });
      resetCreate();
      setError(null);
    } catch (e) { setError(e.message); }
  };

  const startEdit = (l) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditIcon(l.icon || '📋');
  };

  const cancelEdit = () => { setEditingId(null); setEditName(''); setEditIcon('📋'); };

  const saveEdit = async () => {
    if (!editName.trim()) return;
    try {
      await update(editingId, { name: editName.trim(), icon: editIcon });
      cancelEdit();
      setError(null);
    } catch (e) { setError(e.message); }
  };

  const onDelete = async (l) => {
    if (l.id === DEFAULT_LIST_ID) return;
    if (!confirm(`Delete list "${l.name}"? Subreddits in this list are removed from it but kept in any other lists they're in.`)) return;
    try {
      await remove(l.id);
      setError(null);
    } catch (e) { setError(e.message); }
  };

  const onRefreshRecs = async (id) => {
    try {
      await api.refreshRecommendations?.(id);
    } catch (e) {
      // Expected 501 while L3 is deferred — surface it.
      setError(e.payload?.reason || e.message || 'Recommendations engine is not implemented yet.');
    }
  };

  return (
    <div>
      {error && (
        <div className="text-red-400 text-xs mb-2 font-mono whitespace-pre-wrap">{error}</div>
      )}

      <p className="text-xs text-fg-muted mb-3">
        Lists group subreddits for focused feeds. The default <strong>My Feed</strong> list always exists and can't be deleted.
        A subreddit can live in multiple lists with different weights.
      </p>

      <div className="space-y-1 mb-3">
        {lists.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 px-2 py-2 rounded-lg border border-transparent hover:bg-white/5"
          >
            {editingId === l.id ? (
              <>
                <IconPicker value={editIcon} onChange={setEditIcon} />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  autoFocus
                  className="flex-1 min-w-0 bg-bg border border-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-brand/40"
                />
                <button onClick={saveEdit} className="btn-primary text-xs">Save</button>
                <button onClick={cancelEdit} className="btn text-xs">Cancel</button>
              </>
            ) : (
              <>
                <span className="text-xl">{l.icon || '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.name}</div>
                  <div className="text-xs text-fg-dim">
                    {l.active_count ?? l.subreddit_count ?? 0} of {l.subreddit_count ?? 0} active
                    {l.recommendation_count > 0 && <span className="ml-2">· {l.recommendation_count} suggestions</span>}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(l)}
                  className="text-fg-muted hover:text-fg text-xs px-2"
                  title="Rename / change icon"
                >
                  ✎
                </button>
                {l.id !== DEFAULT_LIST_ID && (
                  <button
                    onClick={() => onDelete(l)}
                    className="text-fg-muted hover:text-red-400 text-xs px-2"
                    title="Delete list"
                  >
                    ✕
                  </button>
                )}
                {l.id === DEFAULT_LIST_ID && (
                  <span className="text-[10px] text-fg-dim uppercase tracking-wide px-2">Default</span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="bg-bg border border-white/5 rounded-lg p-3 mb-2">
          <div className="flex items-center gap-2 mb-2">
            <IconPicker value={newIcon} onChange={setNewIcon} />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') resetCreate(); }}
              placeholder="List name (e.g. Tech, Casual)…"
              autoFocus
              className="flex-1 bg-bg-card border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand/40"
            />
            <button onClick={onCreate} disabled={!newName.trim()} className="btn-primary text-sm disabled:opacity-40">
              Create
            </button>
            <button onClick={resetCreate} className="btn text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} className="btn-primary text-sm">+ New list</button>
      )}

      <div className="mt-6 pt-3 border-t border-white/5">
        <div className="text-xs font-semibold text-fg-muted mb-1">Recommendations</div>
        <p className="text-xs text-fg-dim">
          Per-list subreddit recommendations aren't active yet. The engine comes online once Reddit API credentials are configured —
          until then, GET <code className="text-fg-muted">/api/lists/&lt;id&gt;/recommendations</code> reports
          <code className="text-fg-muted"> engine_status: &quot;not_implemented&quot;</code>.
        </p>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="w-8 h-8 rounded-lg bg-bg-card border border-white/10 hover:border-brand/40 flex items-center justify-center text-lg"
        title="Pick an icon"
      >
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-bg-elev border border-white/10 rounded-lg shadow-xl z-40 p-2 grid grid-cols-5 gap-1 w-60">
          {COMMON_ICONS.map((em) => (
            <button
              key={em}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(em); setOpen(false); }}
              className={`w-10 h-10 rounded hover:bg-white/5 text-xl ${em === value ? 'bg-white/5 ring-1 ring-brand/40' : ''}`}
            >
              {em}
            </button>
          ))}
          <input
            type="text"
            maxLength={4}
            placeholder="✎"
            onBlur={(e) => { if (e.target.value) { onChange(e.target.value); setOpen(false); } }}
            className="col-span-5 mt-1 bg-bg-card border border-white/10 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand/40"
            title="Custom emoji"
          />
        </div>
      )}
    </div>
  );
}
