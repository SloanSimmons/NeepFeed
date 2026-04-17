import { useState } from 'react';
import { IconChevron } from './icons.jsx';
import { ALL_LISTS } from '../hooks/useLists.js';

/**
 * Dropdown that selects the active custom feed.
 *
 * Top of the dropdown: two "Everything" presets that combine scope with a
 * content-filter policy:
 *   - Everything (SFW)        — scope=all, contentFilter=sfw
 *   - Everything (Uncensored) — scope=all, contentFilter=all
 * Picking one sets both pieces of state. The header's ContentFilterToggle
 * mirrors the current filter and lets the user flip it independently for
 * any feed view (including the Everything presets).
 *
 * Below: each user-defined list. Picking one switches scope only; the
 * current content filter carries over from wherever it was.
 */
export default function ListSelector({
  lists, activeId, onSelect, onCreate,
  contentFilter, onContentFilterChange,
}) {
  const [open, setOpen] = useState(false);
  const close = () => setTimeout(() => setOpen(false), 100);

  // When scope=all, the two Everything presets light up based on the
  // current content filter. "All Lists" is always a third option that
  // doesn't touch the filter on click — useful when the user wants to
  // flip the toggle independently.
  const scopeIsAll = activeId === ALL_LISTS;
  const everythingSfwActive = scopeIsAll && contentFilter === 'sfw';
  const everythingNsfwActive = scopeIsAll && contentFilter === 'nsfw';

  const pickEverything = (filter) => {
    onContentFilterChange?.(filter);
    onSelect(ALL_LISTS);
    setOpen(false);
  };
  const pickAllLists = () => { onSelect(ALL_LISTS); setOpen(false); };
  const pickList = (id) => { onSelect(id); setOpen(false); };

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
          className="absolute right-0 mt-1 w-64 bg-bg-elev border border-white/10 rounded-lg shadow-xl z-30 overflow-hidden"
        >
          <Row
            active={everythingSfwActive}
            icon="🛡️"
            name="Everything (SFW)"
            hint="All lists merged · SFW posts only"
            onClick={() => pickEverything('sfw')}
          />
          <Row
            active={everythingNsfwActive}
            icon="🔞"
            name="Everything (NSFW)"
            hint="All lists merged · NSFW posts only"
            onClick={() => pickEverything('nsfw')}
          />
          <div className="border-t border-white/5" />
          <Row
            // Only highlight "All Lists" when scope=all AND neither
            // Everything preset matches the current filter — in practice,
            // this row stays unhighlighted because one of the presets
            // above always matches a valid filter. It's kept as a
            // deliberate shortcut for "go to all scope without changing
            // my filter choice."
            active={false}
            icon="🗂️"
            name="All Lists"
            hint="Merged feed · respects the filter toggle"
            onClick={pickAllLists}
          />
          {lists.length > 0 && <div className="border-t border-white/5" />}
          {lists.map((l) => (
            <Row
              key={l.id}
              active={activeId === l.id}
              icon={l.icon}
              name={l.name}
              hint={`${l.active_count ?? l.subreddit_count ?? 0} sub${(l.active_count ?? l.subreddit_count ?? 0) === 1 ? '' : 's'}`}
              onClick={() => pickList(l.id)}
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
