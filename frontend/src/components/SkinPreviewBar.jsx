import { useMemo, useState } from 'react';
import { countFailing } from '../skins/contrast.js';

/**
 * Floating toolbar shown while a skin is being previewed. Uses hardcoded
 * inline styles that are NEVER driven by the CSS skin variables — this
 * guarantees the toolbar stays legible even if the skin is a mess.
 */
const TOOLBAR_STYLE = {
  position: 'fixed',
  top: 0, left: 0, right: 0,
  zIndex: 9999,
  background: '#1a1a2e',
  color: '#ffffff',
  borderBottom: '2px solid #3b82f6',
  padding: '10px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '13px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
};

const BTN = {
  padding: '6px 12px',
  borderRadius: '6px',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
  border: 'none',
};

export default function SkinPreviewBar({ skin, contrastIssues, onApply, onCancel }) {
  const [showDetails, setShowDetails] = useState(false);
  const failing = useMemo(() => countFailing(contrastIssues || []), [contrastIssues]);
  const failingList = (contrastIssues || []).filter((c) => !c.passes && c.level !== 'unknown');

  return (
    <div style={TOOLBAR_STYLE}>
      <span style={{ opacity: 0.8 }}>🎨</span>
      <span>
        Previewing: <strong>{skin?.label || skin?.name}</strong>
        {skin?.author && <span style={{ opacity: 0.6 }}> by {skin.author}</span>}
      </span>

      {failing > 0 ? (
        <button
          onClick={() => setShowDetails((v) => !v)}
          style={{
            ...BTN,
            background: '#f59e0b',
            color: '#000',
          }}
          title="Click for details"
        >
          ⚠️ {failing} low-contrast
        </button>
      ) : (
        <span style={{ color: '#22c55e' }}>✓ Good contrast</span>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={onApply}
        style={{ ...BTN, background: '#22c55e', color: '#0b0d10' }}
      >
        ✓ Apply
      </button>
      <button
        onClick={onCancel}
        style={{ ...BTN, background: '#334155', color: '#ffffff' }}
      >
        ✕ Cancel
      </button>

      {showDetails && failingList.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%', right: '16px',
            marginTop: '6px',
            background: '#1a1a2e',
            color: '#ffffff',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '12px',
            maxWidth: '320px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>Low-contrast pairs:</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {failingList.map((c, i) => (
              <li key={i} style={{ marginBottom: '3px' }}>
                <span style={{ opacity: 0.75 }}>{c.label}:</span>{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {c.ratio ? c.ratio.toFixed(2) : '?'}:1
                </span>
              </li>
            ))}
          </ul>
          <div style={{ opacity: 0.6, marginTop: '6px' }}>
            WCAG AA requires 4.5:1 for body text.
          </div>
        </div>
      )}
    </div>
  );
}
