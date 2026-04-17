import { IconBookmark } from './icons.jsx';

/** Segmented control: Feed | Bookmarks. */
export default function ModeToggle({ value, onChange, bookmarkCount }) {
  const Pill = ({ id, label, icon, count }) => (
    <button
      onClick={() => onChange(id)}
      className={`px-3 py-1.5 text-sm flex items-center gap-1.5 rounded-md transition-colors ${
        value === id
          ? 'bg-brand text-black font-semibold'
          : 'text-fg-muted hover:text-fg'
      }`}
      aria-pressed={value === id}
    >
      {icon}
      {label}
      {count != null && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          value === id ? 'bg-black/20' : 'bg-white/10'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
  return (
    <div className="inline-flex p-0.5 bg-bg-elev border border-white/5 rounded-lg">
      <Pill id="feed" label="Feed" />
      <Pill id="bookmarks" label="Bookmarks" icon={<IconBookmark className="w-3.5 h-3.5" />} count={bookmarkCount} />
    </div>
  );
}
