import { useState } from 'react';
import { IconChevron } from './icons.jsx';
import { ALL_LISTS } from '../hooks/useLists.js';

/**
 * Dropdown that selects the active list for the feed view.
 *
 * Options:
 *   - All Lists (sentinel 'all') — feed merges posts across every active sub
 *   - Each list with its icon + sub count
 *   - Create new list (callback; parent opens the Lists settings tab)
 */
export default function ListSelector({ lists, activeId, onSelect, onCreate }) {
  const [open, setOpen] = useState(false);

  const close = () => setTimeout(() => setOpen(false), 100);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={close}
        className="btn text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch custom feed"
      >
        Custom Feeds
        <IconChevron className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 w-60 bg-bg-elev border border-white/10 rounded-lg shadow-xl z-30 overflow-hidden"
        >
          <Row
            active={activeId === ALL_LISTS}
            icon="🗂️"
            name="All Lists"
            hint="Merged feed across every list"
            onClick={() => { onSelect(ALL_LISTS); setOpen(false); }}
          />
          {lists.length > 0 && <div className="border-t border-white/5" />}
          {lists.map((l) => (
            <Row
              key={l.id}
              active={activeId === l.id}
              icon={l.icon}
              name={l.name}
              hint={`${l.active_count ?? l.subreddit_count ?? 0} sub${(l.active_count ?? l.subreddit_count ?? 0) === 1 ? '' : 's'}`}
              onClick={() => { onSelect(l.id); setOpen(false); }}
            />
          ))}
          {onCreate && (
            <>
              <div className="border-t border-white/5" />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onCreate(); setOpen(false); }}
                className="block w-full text-left px-3 py-2 hover:bg-white/5 text-sm text-brand"
              >
                + New list…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ active, icon, name, hint, onClick }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`block w-full text-left px-3 py-2 hover:bg-white/5 ${active ? 'bg-white/5 text-brand' : ''}`}
    >
      <div className="text-sm font-medium flex items-center gap-2">
        <span>{icon}</span>
        <span className="truncate">{name}</span>
      </div>
      {hint && <div className="text-xs text-fg-muted ml-6">{hint}</div>}
    </button>
  );
}
