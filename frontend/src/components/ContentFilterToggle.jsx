/**
 * Segmented pill that controls the NSFW axis for the active feed view.
 * Binary and complementary — the two states pick distinct content sets:
 *   'sfw'  → only SFW posts
 *   'nsfw' → only NSFW posts
 *
 * The same state drives the "Everything (SFW)" / "Everything (NSFW)"
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
      <Pill id="sfw"  label="SFW"  title="SFW posts only" />
      <Pill id="nsfw" label="NSFW" title="NSFW posts only" />
    </div>
  );
}
