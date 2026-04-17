import { useEffect } from 'react';
import { SORT_OPTIONS } from './SortModeToggle.jsx';
import { ALL_LISTS } from '../hooks/useLists.js';
import { IconBookmark } from './icons.jsx';
import ContentFilterToggle from './ContentFilterToggle.jsx';

/**
 * Slide-in left drawer for mobile. Contains nav controls (Feed/Bookmarks
 * toggle, Custom Feeds list picker, Sort by). Settings stays its own modal,
 * triggered via the sidebar footer.
 *
 * The sidebar is only rendered when `open` is true to avoid capturing
 * off-screen pointer events on desktop where it's always hidden anyway.
 */
export default function MobileSidebar({
  open, onClose,
  mode, onModeChange, bookmarkCount,
  lists, activeListId, onListChange, onCreateList,
  sort, onSortChange,
  onOpenSettings,
  contentFilter, onContentFilterChange,
}) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const pick = (fn) => (value) => { fn(value); onClose(); };

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-bg-card border-r border-white/10
                   shadow-2xl overflow-y-auto flex flex-col"
        role="dialog"
        aria-label="Navigation"
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-brand" />
            <span className="font-semibold">NeepFeed</span>
          </div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg text-xl"
            aria-label="Close menu"
          >✕</button>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* Mode */}
          <Section label="View">
            <PillRow
              options={[
                { value: 'feed',      label: 'Feed' },
                { value: 'bookmarks', label: <span className="inline-flex items-center gap-1"><IconBookmark className="w-3.5 h-3.5"/>Bookmarks{bookmarkCount > 0 && <span className="text-[10px] bg-black/20 rounded-full px-1.5">{bookmarkCount}</span>}</span> },
              ]}
              value={mode}
              onChange={pick(onModeChange)}
            />
          </Section>

          {mode !== 'bookmarks' && (
            <>
              {contentFilter && onContentFilterChange && (
                <Section label="Content">
                  <ContentFilterToggle
                    value={contentFilter}
                    onChange={(v) => { onContentFilterChange(v); /* stay in drawer; small interaction */ }}
                  />
                </Section>
              )}

              <Section label="Custom Feeds">
                <div className="space-y-1">
                  <DrawerRow
                    active={activeListId === ALL_LISTS && contentFilter === 'sfw'}
                    icon="🛡️"
                    name="Everything (SFW)"
                    hint="All lists merged · NSFW hidden"
                    onClick={() => { onContentFilterChange?.('sfw'); pick(onListChange)(ALL_LISTS); }}
                  />
                  <DrawerRow
                    active={activeListId === ALL_LISTS && contentFilter === 'all'}
                    icon="🌐"
                    name="Everything (Uncensored)"
                    hint="All lists merged · NSFW included"
                    onClick={() => { onContentFilterChange?.('all'); pick(onListChange)(ALL_LISTS); }}
                  />
                  <DrawerRow
                    active={false}
                    icon="🗂️"
                    name="All Lists"
                    hint="Respects the content toggle"
                    onClick={() => pick(onListChange)(ALL_LISTS)}
                  />
                  {lists.map((l) => (
                    <DrawerRow
                      key={l.id}
                      active={activeListId === l.id}
                      icon={l.icon || '📋'}
                      name={l.name}
                      hint={`${l.active_count ?? 0} sub${(l.active_count ?? 0) === 1 ? '' : 's'}`}
                      onClick={() => pick(onListChange)(l.id)}
                    />
                  ))}
                  {onCreateList && (
                    <button
                      onClick={() => { onCreateList(); onClose(); }}
                      className="block w-full text-left px-3 py-2 rounded-lg text-sm text-brand hover:bg-white/5"
                    >+ New list…</button>
                  )}
                </div>
              </Section>

              <Section label="Sort by">
                <div className="space-y-1">
                  {SORT_OPTIONS.map((o) => (
                    <DrawerRow
                      key={o.value}
                      active={sort === o.value}
                      name={o.label}
                      hint={o.hint}
                      onClick={() => pick(onSortChange)(o.value)}
                    />
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>

        <div className="p-3 border-t border-white/5">
          <button
            onClick={() => { onClose(); onOpenSettings?.(); }}
            className="btn w-full justify-center text-sm"
          >⚙ Settings</button>
        </div>
      </aside>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-fg-dim mb-2">{label}</div>
      {children}
    </div>
  );
}

function PillRow({ options, value, onChange }) {
  return (
    <div className="inline-flex p-0.5 bg-bg-elev border border-white/5 rounded-lg w-full">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            value === o.value ? 'bg-brand text-black font-semibold' : 'text-fg-muted hover:text-fg'
          }`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DrawerRow({ active, icon, name, hint, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-2 rounded-lg transition-colors ${
        active ? 'bg-brand/10 text-brand' : 'hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon && <span>{icon}</span>}
        <span className="truncate">{name}</span>
      </div>
      {hint && <div className="text-xs text-fg-muted ml-6 mt-0.5">{hint}</div>}
    </button>
  );
}
