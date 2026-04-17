/**
 * Segmented pill that controls NSFW filtering for the active feed view.
 * Two states: 'sfw' (NSFW posts hidden) and 'all' (everything shown).
 *
 * The same state drives the "Everything (SFW)" vs "Everything (Uncensored)"
 * entries in the Custom Feeds dropdown when the active scope is ALL_LISTS.
 */
export default function ContentFilterToggle({ value, onChange, compact = false }) {
  const Pill = ({ id, label, title }) => (
    <button
      onClick={() => onChange(id)}
      className={`${compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} rounded-md transition-colors font-medium ${
        value === id
          ? 'bg-brand text-black'
          : 'text-fg-muted hover:text-fg'
      }`}
      aria-pressed={value === id}
      title={title}
    >
      {label}
    </button>
  );
  return (
    <div
      className={`inline-flex p-0.5 bg-bg-elev border border-white/5 rounded-lg ${compact ? 'text-xs' : ''}`}
      role="group"
      aria-label="Content filter"
    >
      <Pill id="sfw" label="SFW"  title="Hide NSFW posts" />
      <Pill id="all" label="All" title="Show all posts, including NSFW" />
    </div>
  );
}
