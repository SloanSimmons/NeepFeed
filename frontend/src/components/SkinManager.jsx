import { useRef, useState } from 'react';
import { BUILTIN_SKINS } from '../skins/builtin.js';

/**
 * Skin library list + import/share controls. The parent App passes in
 * the useSkin() bundle so state lives in one place (active, preview, etc.).
 */
export default function SkinManager({ skin }) {
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState(null);
  const fileRef = useRef(null);

  const activeName = skin.preview?.name || skin.active;

  const onSelect = (s) => {
    // Click built-in → apply directly (no preview). Click custom that's
    // not active → apply directly. Makes the list feel "radio button"-ish.
    skin.selectSkin(s.name);
  };

  const onPreview = (s) => {
    skin.previewSkin(s);
  };

  const onShare = (s) => {
    // Download as JSON file (simpler than URL encoding + works for custom + built-in)
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.name}.neepfeed-skin.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDelete = (name) => {
    if (!confirm(`Delete custom skin "${name}"?`)) return;
    skin.deleteCustom(name);
  };

  const doImport = (rawText) => {
    setImportError(null);
    try {
      const obj = JSON.parse(rawText);
      if (!obj.name || !obj.variables) {
        setImportError('Not a valid skin: missing name or variables');
        return;
      }
      // Enter preview mode — user can Apply or Cancel from the floating toolbar
      skin.importCustom(obj);
      setImportOpen(false);
      setImportText('');
    } catch (e) {
      setImportError('Invalid JSON: ' + e.message);
    }
  };

  const onFilePicked = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    doImport(text);
    e.target.value = '';
  };

  const onDownloadTemplate = async () => {
    try {
      const r = await fetch('/skin-template.md');
      const text = await r.text();
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NeepFeed-Skin-Template.md';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Template not available yet');
    }
  };

  return (
    <div>
      <p className="text-xs text-fg-muted mb-3">
        Clicking a skin applies it immediately. Importing a new skin opens preview mode where you can Apply or Cancel.
      </p>

      {/* Built-in skins */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-fg-dim mb-1">Built-in</div>
        <div className="space-y-1">
          {BUILTIN_SKINS.map((s) => (
            <SkinRow
              key={s.name}
              skin={s}
              active={activeName === s.name}
              onSelect={() => onSelect(s)}
              onPreview={() => onPreview(s)}
              onShare={() => onShare(s)}
            />
          ))}
        </div>
      </div>

      {/* Custom skins */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wide text-fg-dim mb-1">
          Custom ({skin.custom.length})
        </div>
        {skin.custom.length === 0 ? (
          <div className="text-xs text-fg-muted px-2 py-3">
            No custom skins yet. Import one below.
          </div>
        ) : (
          <div className="space-y-1">
            {skin.custom.map((s) => (
              <SkinRow
                key={s.name}
                skin={s}
                active={activeName === s.name}
                onSelect={() => onSelect(s)}
                onPreview={() => onPreview(s)}
                onShare={() => onShare(s)}
                onDelete={() => onDelete(s.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={() => setImportOpen((o) => !o)} className="btn-primary text-sm">
          + Import skin
        </button>
        <button onClick={onDownloadTemplate} className="btn text-sm">
          Create with AI (template)
        </button>
      </div>

      {importOpen && (
        <div className="mt-3 bg-bg border border-white/5 rounded-lg p-3">
          <label className="block text-xs text-fg-muted mb-1">
            Paste skin JSON, or upload a .json file:
          </label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            className="w-full bg-bg-card border border-white/5 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-brand/40"
            placeholder='{ "name": "My Theme", "version": 1, "variables": { "--nf-accent": "#0066ff" } }'
          />
          {importError && (
            <div className="text-red-400 text-xs mt-1">{importError}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => doImport(importText)}
              disabled={!importText.trim()}
              className="btn-primary text-sm disabled:opacity-40"
            >
              Preview
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={onFilePicked}
              className="hidden"
            />
            <button onClick={() => fileRef.current?.click()} className="btn text-sm">
              Upload file…
            </button>
            <button onClick={() => { setImportOpen(false); setImportError(null); }} className="btn text-sm ml-auto">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkinRow({ skin, active, onSelect, onPreview, onShare, onDelete }) {
  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
        active ? 'border-brand/40 bg-brand/5' : 'border-transparent hover:bg-white/5'
      }`}
    >
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-2 text-left"
      >
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${active ? 'bg-brand' : 'border border-white/20'}`} />
        <span className="text-sm font-medium truncate">
          {skin.label || skin.name}
          {skin.author && skin.author !== 'NeepFeed' && (
            <span className="ml-2 text-xs text-fg-dim">by {skin.author}</span>
          )}
        </span>
        {skin.built_in && (
          <span className="text-[10px] uppercase tracking-wide text-fg-dim">Built-in</span>
        )}
      </button>
      <button
        onClick={onPreview}
        className="text-fg-muted hover:text-fg text-xs px-1"
        title="Preview"
      >
        👁
      </button>
      <button
        onClick={onShare}
        className="text-fg-muted hover:text-fg text-xs px-1"
        title="Download as .json"
      >
        ⤓
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          className="text-fg-muted hover:text-red-400 text-xs px-1"
          title="Delete"
        >
          ✕
        </button>
      )}
    </div>
  );
}
