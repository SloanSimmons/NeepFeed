import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import SubredditManager from './SubredditManager.jsx';
import BlocklistManager from './BlocklistManager.jsx';
import SkinManager from './SkinManager.jsx';

/** Setting row helpers */
function Row({ label, hint, children }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-fg-muted mt-0.5">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-white/10'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Slider({ value, onChange, min, max, step = 0.1, format = (v) => v.toFixed(1) }) {
  return (
    <div className="flex items-center gap-2 w-52">
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-brand"
      />
      <span className="text-xs font-mono text-fg-muted w-10 text-right">{format(value)}</span>
    </div>
  );
}

function FreshnessSlider({ value, onChange }) {
  // Labels at 0.5, 1.0, 1.3, 2.0 — we invert-ish so slider reads left->right = more variety->latest only
  return (
    <div className="w-64">
      <input
        type="range" min="0.3" max="2.0" step="0.1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
      <div className="flex justify-between text-[10px] text-fg-dim mt-0.5 font-medium">
        <span>More variety</span>
        <span className={Math.abs(value - 0.7) < 0.05 ? 'text-brand' : ''}>Balanced</span>
        <span>Latest only</span>
      </div>
      <div className="text-center text-[10px] text-fg-muted font-mono mt-0.5">decay={value.toFixed(2)}</div>
    </div>
  );
}

export default function SettingsModal({ open, onClose, settings, onUpdate, skin }) {
  const [tab, setTab] = useState('subs');
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const s = settings || {};

  const onField = (key) => (val) => onUpdate({ [key]: val });

  const onExport = async () => {
    try {
      const blob = await api.exportConfig();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neepfeed-config-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Export failed: ' + e.message); }
  };

  const onImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const payload = JSON.parse(text);
      await api.importConfig(payload);
      alert('Config imported — reloading.');
      location.reload();
    } catch (err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  const onResetDefaults = async () => {
    if (!confirm('Reset ALL settings to defaults? Subreddits and blocklist are preserved.')) return;
    const defaults = {
      decay_rate: 0.7, time_window_hours: 96, min_score_threshold: 10,
      new_sub_weight: 1.5, hide_nsfw: false, sort_mode: 'calculated',
      theme: 'dark', autoplay_videos: true, default_video_muted: true,
      diversity_cap: 0.3, dedup_crossposts: true, prefetch_enabled: true,
      hide_seen: false, dim_seen: true, compact_mode: false,
      collection_mode: 'batched_hot',
    };
    await api.updateSettings(defaults);
    location.reload();
  };

  const TABS = [
    { id: 'subs',     label: 'Subreddits' },
    { id: 'scoring',  label: 'Scoring' },
    { id: 'display',  label: 'Display' },
    { id: 'media',    label: 'Media' },
    { id: 'skins',    label: 'Skins' },
    { id: 'blocklist', label: 'Blocklist' },
    { id: 'data',     label: 'Data' },
  ];

  return (
    <div
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center bg-black/70 p-2 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        className="bg-bg-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-fg-muted hover:text-fg text-2xl leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <nav className="flex overflow-x-auto border-b border-white/5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id ? 'border-brand text-brand' : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'subs' && <SubredditManager />}

          {tab === 'scoring' && (
            <div>
              <Row label="Content Freshness" hint="Lower = older posts stay relevant longer. Higher = prefer very recent posts.">
                <FreshnessSlider value={s.decay_rate ?? 0.7} onChange={onField('decay_rate')} />
              </Row>
              <Row label="Time Window (hours)" hint="Only posts newer than this are eligible.">
                <Slider value={s.time_window_hours ?? 96} onChange={onField('time_window_hours')} min={12} max={240} step={12} format={(v) => `${v.toFixed(0)}h`} />
              </Row>
              <Row label="Minimum Score" hint="Posts with fewer upvotes are hidden.">
                <Slider value={s.min_score_threshold ?? 10} onChange={onField('min_score_threshold')} min={0} max={500} step={5} format={(v) => v.toFixed(0)} />
              </Row>
              <Row label="New-sub Boost" hint="Multiplier for subs added <7 days ago.">
                <Slider value={s.new_sub_weight ?? 1.5} onChange={onField('new_sub_weight')} min={1.0} max={3.0} step={0.1} />
              </Row>
              <Row label="Diversity Cap" hint="Max fraction of feed from any single sub. 0 = disabled.">
                <Slider value={s.diversity_cap ?? 0.3} onChange={onField('diversity_cap')} min={0} max={0.8} step={0.05} format={(v) => `${Math.round(v * 100)}%`} />
              </Row>
              <Row label="Dedup Cross-posts" hint="Collapse the same link appearing across multiple subs.">
                <Toggle checked={s.dedup_crossposts !== false} onChange={onField('dedup_crossposts')} />
              </Row>
              <Row label="Collection Mode" hint="Batched hot is faster & better for discovery; per-sub top is more representative.">
                <select
                  value={s.collection_mode || 'batched_hot'}
                  onChange={(e) => onField('collection_mode')(e.target.value)}
                  className="bg-bg border border-white/10 rounded-lg px-2 py-1 text-sm"
                >
                  <option value="batched_hot">Batched hot (fast)</option>
                  <option value="per_sub_top">Per-sub top/day (exhaustive)</option>
                </select>
              </Row>
            </div>
          )}

          {tab === 'display' && (
            <div>
              <Row label="Default Sort" hint="Applied when the app first opens.">
                <select
                  value={s.sort_mode || 'calculated'}
                  onChange={(e) => onField('sort_mode')(e.target.value)}
                  className="bg-bg border border-white/10 rounded-lg px-2 py-1 text-sm"
                >
                  <option value="calculated">Calculated</option>
                  <option value="score">Score</option>
                  <option value="recency">Recency</option>
                  <option value="velocity">Velocity</option>
                </select>
              </Row>
              <Row label="Hide NSFW Content"><Toggle checked={!!s.hide_nsfw} onChange={onField('hide_nsfw')} /></Row>
              <Row label="Hide Seen Posts" hint="Completely remove already-viewed posts.">
                <Toggle checked={!!s.hide_seen} onChange={onField('hide_seen')} />
              </Row>
              <Row label="Dim Seen Posts" hint="Show viewed posts at reduced opacity.">
                <Toggle checked={s.dim_seen !== false} onChange={onField('dim_seen')} />
              </Row>
              <Row label="Compact Mode" hint="Smaller cards, more posts per screen.">
                <Toggle checked={!!s.compact_mode} onChange={onField('compact_mode')} />
              </Row>
              <Row label="Theme" hint="Dark recommended for media-forward viewing.">
                <select
                  value={s.theme || 'dark'}
                  onChange={(e) => onField('theme')(e.target.value)}
                  className="bg-bg border border-white/10 rounded-lg px-2 py-1 text-sm"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </Row>
            </div>
          )}

          {tab === 'media' && (
            <div>
              <Row label="Autoplay Videos" hint="Play videos automatically as they enter view.">
                <Toggle checked={s.autoplay_videos !== false} onChange={onField('autoplay_videos')} />
              </Row>
              <Row label="Videos Muted by Default" hint="Click a video to unmute.">
                <Toggle checked={s.default_video_muted !== false} onChange={onField('default_video_muted')} />
              </Row>
              <Row label="Prefetch Next Page" hint="Load the next feed page before you need it.">
                <Toggle checked={s.prefetch_enabled !== false} onChange={onField('prefetch_enabled')} />
              </Row>
            </div>
          )}

          {tab === 'skins' && skin && <SkinManager skin={skin} />}

          {tab === 'blocklist' && <BlocklistManager />}

          {tab === 'data' && (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                Export your settings, subreddits, and blocklist as a single JSON file.
                Import to restore on another instance.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={onExport} className="btn-primary text-sm">Export config</button>
                <label className="btn text-sm cursor-pointer">
                  Import config
                  <input type="file" accept="application/json,.json" onChange={onImport} className="hidden" />
                </label>
                <button onClick={onResetDefaults} className="btn text-sm text-red-400 hover:bg-red-500/10">
                  Reset to defaults
                </button>
              </div>
              <div className="text-xs text-fg-dim pt-3 border-t border-white/5 mt-4">
                <div>Keyboard shortcuts:</div>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                  <span><kbd className="kbd">j</kbd> / <kbd className="kbd">k</kbd> navigate</span>
                  <span><kbd className="kbd">o</kbd> open post</span>
                  <span><kbd className="kbd">c</kbd> open comments</span>
                  <span><kbd className="kbd">m</kbd> toggle mute</span>
                  <span><kbd className="kbd">b</kbd> bookmark</span>
                  <span><kbd className="kbd">h</kbd> hide</span>
                  <span><kbd className="kbd">/</kbd> focus search</span>
                  <span><kbd className="kbd">Esc</kbd> clear focus</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/5 text-right text-xs text-fg-dim">
          Settings auto-save.
        </div>
      </div>
    </div>
  );
}
