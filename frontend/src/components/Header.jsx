import SortModeToggle from './SortModeToggle.jsx';
import { IconSearch, IconSettings } from './icons.jsx';

export default function Header({
  sort, onSortChange,
  stats,
  onOpenSettings,
  search, onSearchChange,
  searchInputRef,
}) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-bg/75 border-b border-white/5">
      <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
            <svg viewBox="0 0 32 32" className="w-5 h-5"><path d="M8 20 L16 10 L24 20 Z M16 20 Q16 22 16 24" fill="black" /></svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight hidden sm:block">NeepFeed</h1>
        </div>

        <div className="flex-1 min-w-0 flex items-center">
          <label className="relative flex-1 max-w-sm">
            <IconSearch className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              value={search || ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder="Search…   (press / )"
              className="w-full bg-bg-elev border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-sm
                         placeholder:text-fg-dim focus:outline-none focus:border-brand/40"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <SortModeToggle value={sort} onChange={onSortChange} />
          <button
            onClick={onOpenSettings}
            className="btn text-sm"
            title="Settings"
            aria-label="Settings"
          >
            <IconSettings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {stats && (
        <div className="max-w-3xl mx-auto px-4 pb-2 text-xs text-fg-dim flex items-center gap-3 flex-wrap">
          <span>{stats.total_posts} posts · {stats.active_subreddits}/{stats.total_subreddits} subs</span>
          {stats.last_collection_at && (
            <span>·  last refresh: {relativeSec(Date.now() / 1000 - stats.last_collection_at)}</span>
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
