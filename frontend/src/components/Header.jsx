import { useEffect, useRef, useState } from 'react';
import SortModeToggle from './SortModeToggle.jsx';
import ModeToggle from './ModeToggle.jsx';
import ListSelector from './ListSelector.jsx';
import ContentFilterToggle from './ContentFilterToggle.jsx';
import { IconSearch, IconSettings, IconMenu, IconClose, IconRefresh } from './icons.jsx';

/**
 * Responsive app header.
 *
 * Desktop (>= md, 768px):
 *   [Logo · search input]  ................  [Feed|Bookmarks]  ....  [Custom Feeds] [Sort by] [⚙]
 *
 * Mobile (< md):
 *   [☰]  [Logo]  ..........................................  [🔍 search-expand]  [⚙]
 *   Tap ☰ → slide-in sidebar with Feed/Bookmarks/Custom Feeds/Sort
 *   Tap 🔍 → full-width search overlay slides down under the header
 */
export default function Header({
  sort, onSortChange,
  stats,
  onOpenSettings,
  search, onSearchChange,
  searchInputRef,
  mode, onModeChange, bookmarkCount,
  lists, activeListId, onListChange, onCreateList,
  onOpenSidebar,
  contentFilter, onContentFilterChange,
  onTriggerCollection,
}) {
  // Mobile search expand state
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef(null);
  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  // Collect-now button state
  const [collecting, setCollecting] = useState(false);
  const onCollect = async () => {
    if (collecting || !onTriggerCollection) return;
    setCollecting(true);
    try { await onTriggerCollection(); }
    finally { setCollecting(false); }
  };

  // Auto-close mobile search on Esc or when cleared+blurred
  const onMobileSearchKey = (e) => {
    if (e.key === 'Escape') setMobileSearchOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-bg/75 border-b border-white/5">
      {/* ================== DESKTOP ROW (md and up) ================== */}
      {/* Layout: left cluster is flush-left, right cluster is flush-right,
          Feed/Bookmarks is absolute-positioned over viewport center so it
          aligns with the feed column's center (which is mx-auto max-w-3xl). */}
      <div className="hidden md:flex relative items-center gap-3 px-4 lg:px-6 py-3">
        {/* Left cluster: logo + wide search */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-5 h-5">
                <path d="M8 20 L16 10 L24 20 Z M16 20 Q16 22 16 24" fill="black" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">NeepFeed</h1>
          </div>
          <label className="relative">
            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              value={search || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search stored posts…   (press / )"
              className="w-[20rem] lg:w-[24rem] bg-bg-elev border border-white/5 rounded-lg pl-9 pr-8 py-1.5 text-sm
                         placeholder:text-fg-dim focus:outline-none focus:border-brand/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg w-6 h-6 flex items-center justify-center"
                aria-label="Clear search"
                title="Clear (Esc)"
              >✕</button>
            )}
          </label>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Centered Feed/Bookmarks toggle — anchored to viewport center so it
            lines up with the feed column (which is max-w-3xl mx-auto). */}
        {mode && onModeChange && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="pointer-events-auto">
              <ModeToggle value={mode} onChange={onModeChange} bookmarkCount={bookmarkCount} />
            </div>
          </div>
        )}

        {/* Right cluster: list / content filter / sort / settings */}
        <div className="flex items-center gap-2">
          {mode !== 'bookmarks' && lists && onListChange && (
            <ListSelector
              lists={lists}
              activeId={activeListId}
              onSelect={onListChange}
              onCreate={onCreateList}
              contentFilter={contentFilter}
              onContentFilterChange={onContentFilterChange}
            />
          )}
          {mode !== 'bookmarks' && contentFilter && onContentFilterChange && (
            <ContentFilterToggle value={contentFilter} onChange={onContentFilterChange} />
          )}
          {mode !== 'bookmarks' && (
            <SortModeToggle value={sort} onChange={onSortChange} />
          )}
          {onTriggerCollection && (
            <button
              onClick={onCollect}
              className="btn text-sm"
              title="Collect now"
              aria-label="Collect now"
              disabled={collecting}
            >
              <IconRefresh className={`w-4 h-4 ${collecting ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{collecting ? 'Collecting…' : 'Collect'}</span>
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="btn text-sm"
            title="Settings"
            aria-label="Settings"
          >
            <IconSettings className="w-4 h-4" />
            <span className="hidden lg:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* ================== MOBILE ROW (< md) ================== */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2.5">
        <button
          onClick={onOpenSidebar}
          className="p-2 -ml-1 text-fg-muted hover:text-fg"
          aria-label="Open menu"
        >
          <IconMenu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-6 h-6 rounded bg-brand flex-shrink-0" />
          <span className="font-semibold truncate">NeepFeed</span>
        </div>
        <button
          onClick={() => setMobileSearchOpen((o) => !o)}
          className="p-2 text-fg-muted hover:text-fg"
          aria-label={mobileSearchOpen ? 'Close search' : 'Search'}
          title="Search"
        >
          {mobileSearchOpen ? <IconClose className="w-5 h-5" /> : <IconSearch className="w-5 h-5" />}
        </button>
        {onTriggerCollection && (
          <button
            onClick={onCollect}
            className="p-2 text-fg-muted hover:text-fg disabled:opacity-50"
            aria-label="Collect now"
            title="Collect now"
            disabled={collecting}
          >
            <IconRefresh className={`w-5 h-5 ${collecting ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="p-2 text-fg-muted hover:text-fg"
          aria-label="Settings"
          title="Settings"
        >
          <IconSettings className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile search expand row */}
      {mobileSearchOpen && (
        <div className="md:hidden px-3 pb-2">
          <label className="relative block">
            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              ref={mobileSearchRef}
              value={search || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onKeyDown={onMobileSearchKey}
              placeholder="Search stored posts…"
              className="w-full bg-bg-elev border border-white/5 rounded-lg pl-9 pr-8 py-2 text-sm
                         placeholder:text-fg-dim focus:outline-none focus:border-brand/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg w-6 h-6 flex items-center justify-center"
                aria-label="Clear search"
              >✕</button>
            )}
          </label>
        </div>
      )}

      {(stats || search) && (
        <div className="max-w-3xl mx-auto px-4 pb-2 text-xs text-fg-dim flex items-center gap-3 flex-wrap">
          {stats && (
            <>
              <span>{stats.total_posts} posts · {stats.active_subreddits}/{stats.total_subreddits} subs</span>
              {stats.last_collection_at && (
                <span>· last refresh: {relativeSec(Date.now() / 1000 - stats.last_collection_at)}</span>
              )}
            </>
          )}
          {search && (
            <span className="text-brand">· searching stored posts for "{search}"</span>
          )}
        </div>
      )}
    </header>
  );
}

function relativeSec(s) {
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
