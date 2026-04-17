import { useState } from 'react';

const LS_DISMISS_KEY = 'neepfeed_skip_skin_template_modal';

export function shouldShowSkinTemplateModal() {
  try { return localStorage.getItem(LS_DISMISS_KEY) !== '1'; } catch { return true; }
}

/**
 * Explains how to use the AI skin template with an LLM before the download
 * starts. User can opt out of seeing it again.
 */
export default function SkinTemplateModal({ open, onDownload, onClose }) {
  const [dontShow, setDontShow] = useState(false);
  if (!open) return null;

  const onConfirm = () => {
    if (dontShow) {
      try { localStorage.setItem(LS_DISMISS_KEY, '1'); } catch {}
    }
    onDownload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-card border border-white/10 rounded-2xl max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-start gap-3 mb-3">
          <span className="text-2xl">🎨</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Create a skin with AI</h2>
            <p className="text-sm text-fg-muted">
              Download a template, paste it into your LLM, and paste the JSON back.
            </p>
          </div>
        </div>

        <ol className="text-sm space-y-2 list-decimal list-inside mb-4">
          <li>
            Click <strong>Download template</strong> below to save{' '}
            <code className="text-xs text-fg-muted">NeepFeed-Skin-Template.md</code>.
          </li>
          <li>
            Open Claude, ChatGPT, or any LLM you like. Paste the whole template into
            the chat.
          </li>
          <li>
            At the top of your message, describe the theme you want. For example:
            <ul className="list-disc list-inside ml-4 mt-1 text-fg-muted text-xs space-y-0.5">
              <li><em>"A warm autumn theme with earthy rust-orange accents and a serif font."</em></li>
              <li><em>"High-contrast accessibility theme that passes WCAG AAA."</em></li>
              <li><em>"Retro terminal theme, phosphor green on black."</em></li>
            </ul>
          </li>
          <li>
            Copy the JSON the LLM returns, come back to NeepFeed, open{' '}
            <strong>Settings → Skins → Import skin</strong>, and paste it.
          </li>
          <li>
            Preview the skin in-app. If the contrast warnings look bad, tell the LLM
            which pairs failed and ask for a revision.
          </li>
        </ol>

        <div className="text-xs text-fg-dim mb-4 p-2 bg-bg border border-white/5 rounded">
          The template includes the full list of CSS variables NeepFeed understands,
          the output format, and contrast rules the LLM should target. It works with
          any assistant — no special integration needed.
        </div>

        <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-brand"
          />
          <span className="text-fg-muted">Don't show this again</span>
        </label>

        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="btn text-sm">Cancel</button>
          <button onClick={onConfirm} className="btn-primary text-sm">
            Download template
          </button>
        </div>
      </div>
    </div>
  );
}
