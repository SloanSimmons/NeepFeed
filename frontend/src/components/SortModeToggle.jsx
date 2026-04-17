import { useState } from 'react';
import { IconChevron } from './icons.jsx';

const OPTIONS = [
  { value: 'calculated', label: 'Calculated', hint: 'Formula-based ranking' },
  { value: 'score',      label: 'Score',      hint: 'Raw upvotes' },
  { value: 'recency',    label: 'Recency',    hint: 'Newest first' },
  { value: 'velocity',   label: 'Velocity',   hint: 'Trending (score growth)' },
];

export default function SortModeToggle({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = OPTIONS.find((o) => o.value === value) || OPTIONS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        className="btn text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Sort: <span className="font-semibold">{current.label}</span>
        <IconChevron className="w-3 h-3" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 w-56 bg-bg-elev border border-white/10 rounded-lg shadow-xl z-30 overflow-hidden"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange?.(o.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 hover:bg-white/5 ${
                o.value === value ? 'bg-white/5 text-brand' : ''
              }`}
            >
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs text-fg-muted">{o.hint}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
