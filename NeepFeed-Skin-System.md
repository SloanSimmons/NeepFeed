# NeepFeed — Skin System Feature Extension

> This document extends the base NeepFeed spec. It assumes the core MVP (with CSS custom property foundation) already exists and describes the additions needed for the full skin system: library, live preview, import/export, shareable URLs, and AI-generated skins.

**Status:** Implemented with deliberate deviations — see *"Implementation deviations"* at the bottom. The code is the source of truth; this spec describes the original design intent.

---

## 1. Feature Overview

### What This Adds

- **Skin library:** Multiple skins (5 built-in + unlimited custom), switch freely between them
- **Live feed preview:** Apply a skin to your actual feed before committing, with contrast validation
- **Import/export:** Upload skin JSON files, paste JSON, or import from shareable URLs
- **Shareable URLs:** Encode a skin as a URL fragment — share it with anyone, no server storage needed
- **AI skin workflow:** Download a .md template, prompt an AI, paste back the result

### What Doesn't Change

- Scoring algorithm, feed behavior, collection job
- List/recommender system (separate feature extension)
- Docker deployment, PWA

### Prerequisite (Must Be in MVP)

Every visual property in NeepFeed must use a CSS custom property. No hardcoded colors, fonts, or spacing values in any component. The dark/light theme toggle in the MVP is just two built-in skins swapping variable sets.

---

## 2. CSS Variable Reference

All NeepFeed styling is driven by these CSS custom properties. A skin is a JSON object that maps a subset (or all) of these variables to new values. Any variable not specified in a skin falls back to the current active skin's value.

### Colors — Backgrounds

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-bg-primary` | Main background (feed, page) | `#0f172a` |
| `--nf-bg-secondary` | Card background, panels | `#1e293b` |
| `--nf-bg-tertiary` | Hover states, nested elements | `#334155` |

### Colors — Text

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-text-primary` | Main body text | `#f1f5f9` |
| `--nf-text-secondary` | Muted text (time, meta) | `#94a3b8` |
| `--nf-text-muted` | Disabled/hint text | `#64748b` |

### Colors — Accent & Interactive

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-accent` | Primary accent (links, highlights) | `#3b82f6` |
| `--nf-accent-hover` | Accent on hover/focus | `#60a5fa` |
| `--nf-upvote` | Upvote arrow color | `#ff4500` |
| `--nf-downvote` | Downvote arrow color | `#7b7bff` |
| `--nf-comment-color` | Comment count color | `#22d3ee` |
| `--nf-nsfw-badge` | NSFW tag background | `#ef4444` |

### Colors — Flair & Tags

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-flair-bg` | Flair badge background | `#334155` |
| `--nf-flair-text` | Flair badge text | `#94a3b8` |

### Colors — Borders & Shadows

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-border` | Default border/divider | `#334155` |
| `--nf-border-focus` | Border on focus/active | `#3b82f6` |
| `--nf-shadow` | Card shadow | `0 1px 3px rgba(0,0,0,0.3)` |

### Colors — UI Elements

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-header-bg` | Header background | `#0f172a` |
| `--nf-modal-overlay` | Modal backdrop overlay | `rgba(0,0,0,0.5)` |
| `--nf-modal-bg` | Modal background | `#1e293b` |
| `--nf-button-bg` | Primary button background | `#3b82f6` |
| `--nf-button-text` | Primary button text | `#ffffff` |
| `--nf-button-hover` | Primary button hover | `#60a5fa` |
| `--nf-input-bg` | Text input background | `#1e293b` |
| `--nf-input-border` | Text input border | `#334155` |
| `--nf-input-focus` | Text input focus border | `#3b82f6` |
| `--nf-scrollbar-thumb` | Scrollbar thumb | `#475569` |
| `--nf-scrollbar-track` | Scrollbar track | `#0f172a` |
| `--nf-link-color` | Inline link color | `#3b82f6` |
| `--nf-link-hover` | Inline link hover | `#60a5fa` |
| `--nf-video-overlay` | Video overlay (play button bg) | `rgba(0,0,0,0.3)` |

### Colors — Status

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-success` | Success messages/indicators | `#22c55e` |
| `--nf-warning` | Warning messages/indicators | `#f59e0b` |
| `--nf-error` | Error messages/indicators | `#ef4444` |

### Typography

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-font-family` | Main font stack | `"Inter", system-ui, -apple-system, sans-serif` |
| `--nf-font-size-base` | Base text size | `14px` |
| `--nf-font-size-sm` | Small text (meta, badges) | `12px` |
| `--nf-font-size-lg` | Large text (post titles) | `18px` |
| `--nf-font-size-xl` | Extra large (headings) | `24px` |

### Spacing & Shape

| Variable | Description | Dark Default |
|---|---|---|
| `--nf-card-radius` | Border radius for cards | `8px` |
| `--nf-card-padding` | Inner card spacing | `16px` |
| `--nf-feed-max-width` | Maximum feed width | `680px` |

---

## 3. Skin JSON Format

A skin is a JSON object with metadata and a `variables` map:

```json
{
  "name": "Cyberpunk Neon",
  "author": "Sloan",
  "version": 1,
  "variables": {
    "--nf-bg-primary": "#0a0a1a",
    "--nf-bg-secondary": "#12122a",
    "--nf-bg-tertiary": "#1a1a3a",
    "--nf-text-primary": "#e0e0ff",
    "--nf-text-secondary": "#8888bb",
    "--nf-text-muted": "#555588",
    "--nf-accent": "#00ffcc",
    "--nf-accent-hover": "#33ffdd",
    "--nf-upvote": "#ff4500",
    "--nf-downvote": "#7b7bff",
    "--nf-comment-color": "#00ccaa",
    "--nf-nsfw-badge": "#ff3366",
    "--nf-flair-bg": "#2a2a4a",
    "--nf-flair-text": "#00ffcc",
    "--nf-border": "#2a2a4a",
    "--nf-border-focus": "#00ffcc",
    "--nf-shadow": "0 2px 8px rgba(0,255,204,0.1)",
    "--nf-card-radius": "8px",
    "--nf-card-padding": "16px",
    "--nf-feed-max-width": "680px",
    "--nf-font-family": "\"JetBrains Mono\", \"Fira Code\", monospace",
    "--nf-font-size-base": "14px",
    "--nf-font-size-sm": "12px",
    "--nf-font-size-lg": "18px",
    "--nf-font-size-xl": "24px",
    "--nf-header-bg": "#0a0a1a",
    "--nf-modal-overlay": "rgba(0,0,0,0.7)",
    "--nf-modal-bg": "#12122a",
    "--nf-button-bg": "#00ffcc",
    "--nf-button-text": "#0a0a1a",
    "--nf-button-hover": "#33ffdd",
    "--nf-input-bg": "#1a1a3a",
    "--nf-input-border": "#2a2a4a",
    "--nf-input-focus": "#00ffcc",
    "--nf-scrollbar-thumb": "#2a2a4a",
    "--nf-scrollbar-track": "#0a0a1a",
    "--nf-link-color": "#00ffcc",
    "--nf-link-hover": "#33ffdd",
    "--nf-video-overlay": "rgba(0,0,0,0.5)",
    "--nf-success": "#00cc66",
    "--nf-warning": "#ffaa00",
    "--nf-error": "#ff3366"
  }
}
```

**Rules:**
- `name` is required and must be unique (cannot duplicate a built-in skin name)
- `author` is optional
- `version` must be `1`
- `variables` can include any subset of the CSS variables above. Omitted variables inherit from the currently active skin
- Variable values must be valid CSS values (hex colors, rgba, font stacks, pixel sizes, etc.)

---

## 4. Built-in Skins

Five skins ship with NeepFeed. They cannot be deleted or renamed.

### Dark (Default)

Clean dark theme with slate blues and Inter font. The default skin that ships with the app.

| Variable | Value |
|---|---|
| `--nf-bg-primary` | `#0f172a` |
| `--nf-bg-secondary` | `#1e293b` |
| `--nf-bg-tertiary` | `#334155` |
| `--nf-text-primary` | `#f1f5f9` |
| `--nf-text-secondary` | `#94a3b8` |
| `--nf-accent` | `#3b82f6` |
| `--nf-font-family` | `"Inter", system-ui, -apple-system, sans-serif` |

(Full variable set as defined in Section 2 defaults.)

### Light

Clean light theme with white backgrounds and dark text.

| Variable | Value |
|---|---|
| `--nf-bg-primary` | `#ffffff` |
| `--nf-bg-secondary` | `#f8fafc` |
| `--nf-bg-tertiary` | `#f1f5f9` |
| `--nf-text-primary` | `#0f172a` |
| `--nf-text-secondary` | `#475569` |
| `--nf-text-muted` | `#94a3b8` |
| `--nf-accent` | `#2563eb` |
| `--nf-accent-hover` | `#1d4ed8` |
| `--nf-border` | `#e2e8f0` |
| `--nf-border-focus` | `#2563eb` |
| `--nf-shadow` | `0 1px 3px rgba(0,0,0,0.1)` |
| `--nf-header-bg` | `#ffffff` |
| `--nf-modal-bg` | `#ffffff` |
| `--nf-button-bg` | `#2563eb` |
| `--nf-button-text` | `#ffffff` |
| `--nf-input-bg` | `#ffffff` |
| `--nf-input-border` | `#e2e8f0` |
| `--nf-scrollbar-thumb` | `#cbd5e1` |
| `--nf-scrollbar-track` | `#f1f5f9` |

### Cyberpunk

Neon on dark. Deep navy/black backgrounds, cyan/magenta accents, monospace font.

| Variable | Value |
|---|---|
| `--nf-bg-primary` | `#0a0a1a` |
| `--nf-bg-secondary` | `#12122a` |
| `--nf-bg-tertiary` | `#1a1a3a` |
| `--nf-text-primary` | `#e0e0ff` |
| `--nf-text-secondary` | `#8888bb` |
| `--nf-text-muted` | `#555588` |
| `--nf-accent` | `#00ffcc` |
| `--nf-accent-hover` | `#33ffdd` |
| `--nf-upvote` | `#ff4500` |
| `--nf-downvote` | `#7b7bff` |
| `--nf-comment-color` | `#00ccaa` |
| `--nf-nsfw-badge` | `#ff3366` |
| `--nf-flair-bg` | `#2a2a4a` |
| `--nf-flair-text` | `#00ffcc` |
| `--nf-border` | `#2a2a4a` |
| `--nf-border-focus` | `#00ffcc` |
| `--nf-shadow` | `0 2px 8px rgba(0,255,204,0.1)` |
| `--nf-header-bg` | `#0a0a1a` |
| `--nf-modal-overlay` | `rgba(0,0,0,0.7)` |
| `--nf-modal-bg` | `#12122a` |
| `--nf-button-bg` | `#00ffcc` |
| `--nf-button-text` | `#0a0a1a` |
| `--nf-button-hover` | `#33ffdd` |
| `--nf-input-bg` | `#1a1a3a` |
| `--nf-input-border` | `#2a2a4a` |
| `--nf-input-focus` | `#00ffcc` |
| `--nf-scrollbar-thumb` | `#2a2a4a` |
| `--nf-scrollbar-track` | `#0a0a1a` |
| `--nf-link-color` | `#00ffcc` |
| `--nf-link-hover` | `#33ffdd` |
| `--nf-font-family` | `"JetBrains Mono", "Fira Code", monospace` |

### Solarized

Warm earth tones based on the Solarized palette. Beige backgrounds, orange accent.

| Variable | Value |
|---|---|
| `--nf-bg-primary` | `#002b36` |
| `--nf-bg-secondary` | `#073642` |
| `--nf-bg-tertiary` | `#0a4050` |
| `--nf-text-primary` | `#839496` |
| `--nf-text-secondary` | `#657b83` |
| `--nf-text-muted` | `#586e75` |
| `--nf-accent` | `#cb4b16` |
| `--nf-accent-hover` | `#dc6e30` |
| `--nf-upvote` | `#cb4b16` |
| `--nf-downvote` | `#6c71c4` |
| `--nf-comment-color` | `#2aa198` |
| `--nf-nsfw-badge` | `#dc322f` |
| `--nf-flair-bg` | `#073642` |
| `--nf-flair-text` | `#b58900` |
| `--nf-border` | `#073642` |
| `--nf-border-focus` | `#cb4b16` |
| `--nf-shadow` | `0 1px 3px rgba(0,0,0,0.4)` |
| `--nf-header-bg` | `#002b36` |
| `--nf-modal-bg` | `#073642` |
| `--nf-button-bg` | `#cb4b16` |
| `--nf-button-text` | `#fdf6e3` |
| `--nf-button-hover` | `#dc6e30` |
| `--nf-input-bg` | `#073642` |
| `--nf-input-border` | `#586e75` |
| `--nf-input-focus` | `#cb4b16` |
| `--nf-scrollbar-thumb` | `#586e75` |
| `--nf-scrollbar-track` | `#002b36` |
| `--nf-link-color` | `#b58900` |
| `--nf-link-hover` | `#dc6e30` |
| `--nf-font-family` | `"IBM Plex Mono", "Source Code Pro", monospace` |

### Paper

Warm reading experience. Cream background, serif font, soft borders, generous spacing.

| Variable | Value |
|---|---|
| `--nf-bg-primary` | `#faf6f0` |
| `--nf-bg-secondary` | `#ffffff` |
| `--nf-bg-tertiary` | `#f0ebe3` |
| `--nf-text-primary` | `#2c2418` |
| `--nf-text-secondary` | `#6b5d4d` |
| `--nf-text-muted` | `#9c8e7e` |
| `--nf-accent` | `#8b4513` |
| `--nf-accent-hover` | `#a0522d` |
| `--nf-upvote` | `#cc4400` |
| `--nf-downvote` | `#5b4a8a` |
| `--nf-comment-color` | `#2e7d32` |
| `--nf-nsfw-badge` | `#b71c1c` |
| `--nf-flair-bg` | `#f0ebe3` |
| `--nf-flair-text` | `#8b4513` |
| `--nf-border` | `#d4c5b0` |
| `--nf-border-focus` | `#8b4513` |
| `--nf-shadow` | `0 1px 4px rgba(44,36,24,0.08)` |
| `--nf-card-radius` | `6px` |
| `--nf-card-padding` | `20px` |
| `--nf-feed-max-width` | `720px` |
| `--nf-header-bg` | `#faf6f0` |
| `--nf-modal-overlay` | `rgba(44,36,24,0.4)` |
| `--nf-modal-bg` | `#ffffff` |
| `--nf-button-bg` | `#8b4513` |
| `--nf-button-text` | `#faf6f0` |
| `--nf-button-hover` | `#a0522d` |
| `--nf-input-bg` | `#ffffff` |
| `--nf-input-border` | `#d4c5b0` |
| `--nf-input-focus` | `#8b4513` |
| `--nf-scrollbar-thumb` | `#d4c5b0` |
| `--nf-scrollbar-track` | `#faf6f0` |
| `--nf-link-color` | `#8b4513` |
| `--nf-link-hover` | `#a0522d` |
| `--nf-font-family` | `"Georgia", "Times New Roman", serif` |
| `--nf-font-size-base` | `15px` |

---

## 5. Live Feed Preview

### How It Works

When a user selects any skin (built-in or custom) or imports a new one, the app enters preview mode:

1. The skin's CSS variables are applied as inline styles on the `<html>` element
2. A floating toolbar appears at the top of the screen
3. The toolbar uses **hardcoded high-contrast colors** that are NOT affected by CSS variables — always visible regardless of the skin being previewed
4. The user sees their actual feed with the new skin applied
5. They can scroll, interact, and see how everything looks with real data
6. "Apply" saves the skin as active and exits preview mode
7. "Cancel" removes the inline styles and reverts to the previous skin

### Preview Toolbar

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔍 Previewing: "Cyberpunk Neon"  ⚠️ Low contrast  [✓ Apply] [✕ Cancel] │
└──────────────────────────────────────────────────────────────────┘
```

The toolbar is rendered with inline styles that are NOT driven by CSS variables:

```css
/* Hardcoded toolbar styles — never affected by skin variables */
.nf-preview-toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: #1a1a2e;        /* always dark */
  color: #ffffff;             /* always white */
  border-bottom: 2px solid #3b82f6;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: system-ui, sans-serif;  /* never affected by skin font */
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
```

### Contrast Validation

When previewing a skin, the app checks contrast ratios for key text/background combinations:

```javascript
function checkContrast(fgColor, bgColor) {
  // Calculate relative luminance for both colors
  // Calculate contrast ratio: (L1 + 0.05) / (L2 + 0.05)
  // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
  // Return: { ratio, passes, level: 'AAA' | 'AA' | 'fail' }
}

function validateSkin(variables) {
  const checks = [
    { label: 'Primary text on background', fg: '--nf-text-primary', bg: '--nf-bg-primary' },
    { label: 'Secondary text on background', fg: '--nf-text-secondary', bg: '--nf-bg-primary' },
    { label: 'Accent on background', fg: '--nf-accent', bg: '--nf-bg-primary' },
    { label: 'Button text on button', fg: '--nf-button-text', bg: '--nf-button-bg' },
    { label: 'Link on background', fg: '--nf-link-color', bg: '--nf-bg-primary' },
  ];

  return checks.map(check => {
    const ratio = checkContrast(variables[check.fg], variables[check.bg]);
    return { ...check, ...ratio };
  });
  // If any check fails, show ⚠️ warning in toolbar
}
```

The toolbar shows:
- **✓ Good contrast** — all checks pass WCAG AA
- **⚠️ Low contrast** — one or more checks fail, with details on hover

Users can still apply a skin with low contrast (it's a warning, not a block), but they're informed.

### Preview Mode State Management

```javascript
// useSkin hook manages:
const [currentSkin, setCurrentSkin] = useState('dark');     // persisted active skin
const [previewSkin, setPreviewSkin] = useState(null);       // skin being previewed
const [isPreviewing, setIsPreviewing] = useState(false);     // preview mode active
const [contrastWarnings, setContrastWarnings] = useState([]); // validation results

// Apply variables to <html> element
function applySkinToDOM(skinVariables) {
  const root = document.documentElement;
  Object.entries(skinVariables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

// Clear preview, revert to current skin
function cancelPreview() {
  applySkinToDOM(getSkinVariables(currentSkin));
  setPreviewSkin(null);
  setIsPreviewing(false);
  setContrastWarnings([]);
}

// Commit preview skin as active
function applyPreview() {
  setCurrentSkin(previewSkin.name);
  saveActiveSkin(previewSkin.name);
  setIsPreviewing(false);
  setPreviewSkin(null);
  setContrastWarnings([]);
}
```

### Flash Prevention

To avoid a flash of unstyled content on page load:

1. Read `active_skin` from localStorage (set immediately on apply, before API response)
2. Apply the skin's CSS variables to `<html>` in a `<script>` tag in `index.html` before React renders
3. This ensures the correct colors appear before the JS bundle loads

```html
<!-- In index.html <head> -->
<script>
  (function() {
    try {
      var skin = JSON.parse(localStorage.getItem('neepfeed_active_skin') || '{}');
      var vars = skin.variables || {};
      var root = document.documentElement;
      Object.keys(vars).forEach(function(key) {
        root.style.setProperty(key, vars[key]);
      });
    } catch(e) {}
  })();
</script>
```

---

## 6. Shareable URLs

### How It Works

Skins can be shared via URL. The skin JSON is compressed and base64-encoded into a URL fragment:

```
https://neepfeed.example.com/#/skin?d=eyJuYW1lIjoiQ3liZXJw...
```

### Encoding Flow

1. User clicks "Share Current Skin"
2. App JSON.stringify's the skin object
3. Compress with pako (deflate): `pako.deflate(json)`
4. Base64-encode the compressed bytes
5. Construct URL: `{base_url}/#/skin?d={base64_string}`
6. Copy to clipboard

### Decoding Flow

1. On app load, check `window.location.hash` for `#/skin?d=`
2. If found, extract the base64 string
3. Base64-decode to bytes
4. Decompress with pako: `pako.inflate(bytes, { to: 'string' })`
5. JSON.parse the result
6. Validate the skin object (check `name`, `version`, `variables` keys exist)
7. Enter preview mode with the decoded skin
8. Clear the URL hash after decoding

### Size Considerations

- A typical skin JSON is ~1.5KB uncompressed
- After pako compression: ~600-800 bytes
- After base64 encoding: ~800-1100 bytes
- Well within browser URL limits (most browsers support 64KB+ URLs)
- The URL fragment is never sent to the server

### URL Import

Users can also paste a shareable URL directly into the import dialog. The app detects the `#/skin?d=` pattern and decodes it automatically.

---

## 7. Skin Library UI

### Location

The skin manager is a section inside the Settings modal, after the existing settings sections:

```
┌──────────────────────────────────────────────┐
│ Settings                                [✕] │
├──────────────────────────────────────────────┤
│ ... (existing settings sections) ...         │
│                                              │
│ 🎨 Skins                                     │
│ ┌──────────────────────────────────────────┐ │
│ │ ● Dark (Built-in)                   [✓]  │ │
│ │ ○ Light (Built-in)                       │ │
│ │ ○ Cyberpunk (Built-in)                   │ │
│ │ ○ Solarized (Built-in)                   │ │
│ │ ○ Paper (Built-in)                       │ │
│ │ ─────────────────────────────────────── │ │
│ │ ○ My Custom Theme (Custom)     [✎][📤][🗑] │ │
│ │ ○ Warm Sunset (Custom)         [✎][📤][🗑] │ │
│ └──────────────────────────────────────────┘ │
│ [+ Import Skin]  [+ Create with AI]          │
└──────────────────────────────────────────────┘
```

### Controls

- **Radio buttons** — select active skin. Selecting a skin enters preview mode.
- **[✓]** — currently active skin (not a button, just an indicator)
- **[✎]** — edit custom skin (opens JSON editor or re-import)
- **[📤]** — share skin (generates shareable URL, copies to clipboard)
- **[🗑]** — delete custom skin (confirms first, built-ins can't be deleted)
- **[+ Import Skin]** — opens import dialog (file upload, paste JSON, or paste URL)
- **[+ Create with AI]** — downloads the .md template file

### Import Dialog

```
┌──────────────────────────────────────────────┐
│ Import Skin                                  │
├──────────────────────────────────────────────┤
│                                              │
│ [📁 Upload JSON File]                        │
│                                              │
│ ── or paste JSON ──                          │
│ ┌──────────────────────────────────────────┐ │
│ │ {                                        │ │
│ │   "name": "My Theme",                    │ │
│ │   "variables": { ... }                   │ │
│ │ }                                        │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ── or paste a shareable URL ──              │
│ ┌──────────────────────────────────────────┐ │
│ │ https://neepfeed.example.com/#/skin?d=...│ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [Preview]  [Cancel]                          │
└──────────────────────────────────────────────┘
```

- **[Preview]** — validates the JSON, enters preview mode
- If JSON is invalid, shows error message
- If URL is detected, auto-decodes and enters preview mode
- Preview mode shows the live feed with the skin applied

---

## 8. AI Skin Template

### Template File

The template is a markdown file that documents every CSS variable with descriptions, expected formats, and example values. It's designed to be pasted into an AI (ChatGPT, Claude, etc.) along with a prompt describing the desired theme.

**Available in two places:**
1. **In-app:** Settings → Skins → "Create with AI" button → downloads `NeepFeed-Skin-Template.md`
2. **README:** Included in the project README under "Creating Custom Skins"

### Template Content

The template file contains:

1. **Instructions** for the user on how to use it with an AI
2. **Example prompts** the user can copy ("Make me a warm autumn theme", "Create a high-contrast accessibility theme", etc.)
3. **The full variable reference** (same as Section 2 of this doc)
4. **The output format** — a JSON skeleton the AI should fill in
5. **Validation rules** — contrast requirements, valid CSS value formats

### Example Prompt in Template

```markdown
## How to Use This Template

1. Copy this entire template
2. Paste it into ChatGPT, Claude, or your preferred AI
3. Add your prompt below, for example:
   - "Make me a warm autumn theme with earthy colors and a serif font"
   - "Create a high-contrast accessibility theme that passes WCAG AAA"
   - "Design a retro terminal theme with green text on black"
   - "Make a cozy reading theme with warm cream backgrounds and soft shadows"
4. The AI will return a JSON object you can paste into NeepFeed's Import Skin dialog
5. Preview the skin in NeepFeed before applying it
```

### Output Format in Template

```markdown
## Output Format

Return a JSON object with this structure:

{
  "name": "Your Theme Name",
  "author": "Your Name",
  "version": 1,
  "variables": {
    "--nf-bg-primary": "#hexcolor",
    "--nf-bg-secondary": "#hexcolor",
    ... (fill in as many or as few variables as you want)
  }
}

Rules:
- You must include "name" and "version": 1
- You can include any subset of variables. Omitted variables will inherit from the currently active skin.
- All color values must be valid CSS (hex, rgb, rgba, hsl)
- Font families should include fallbacks (e.g., "Your Font", system-ui, sans-serif)
- Ensure text colors have at least 4.5:1 contrast ratio against their backgrounds (WCAG AA)
- Ensure accent colors have at least 3:1 contrast ratio against backgrounds
```

---

## 9. Data Model Changes

### `user_config` — New Keys

```sql
-- New config keys for skin system:
-- ('active_skin', 'dark')                    -- name of the active skin
-- ('custom_skins', '[]')                    -- JSON array of custom skin objects
```

The `custom_skins` value stores the full JSON array of custom skin objects:

```json
[
  {
    "name": "My Custom Theme",
    "author": "Sloan",
    "version": 1,
    "variables": { ... }
  },
  {
    "name": "Warm Sunset",
    "author": "Sloan",
    "version": 1,
    "variables": { ... }
  }
]
```

Built-in skins are NOT stored in the database. They are defined in frontend code and always available.

### Skin Resolution Order

When applying a skin, variables are resolved in this order:

1. **Custom skin variables** — if the active skin is custom, use its variables
2. **Built-in skin variables** — if the active skin is built-in, use its variables
3. **CSS defaults** — any variable not specified in the skin falls back to the `:root` defaults in `index.css`

This means a custom skin can override just a few variables (e.g., only colors) and inherit everything else from the defaults.

---

## 10. API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/skins` | List all skins (built-in names + custom skins) |
| GET | `/api/skins/:name` | Get a specific skin's full JSON |
| POST | `/api/skins` | Save a new custom skin |
| PATCH | `/api/skins/:name` | Update a custom skin |
| DELETE | `/api/skins/:name` | Delete a custom skin |
| GET | `/api/skins/template` | Download the .md template file |
| GET | `/api/settings` | Updated to include `active_skin` |

### Endpoint Details

**GET `/api/skins`**
```json
{
  "built_in": ["dark", "light", "cyberpunk", "solarized", "paper"],
  "custom": [
    {
      "name": "My Custom Theme",
      "author": "Sloan",
      "version": 1,
      "variables": { ... }
    }
  ],
  "active": "dark"
}
```

**POST `/api/skins`** — Save a new custom skin
```json
// Request:
{
  "name": "My Custom Theme",
  "author": "Sloan",
  "version": 1,
  "variables": { ... }
}

// Response:
{ "success": true, "skin": { "name": "My Custom Theme", ... } }
```

Validates:
- Name is not empty
- Name doesn't duplicate a built-in skin
- Name doesn't duplicate an existing custom skin
- `variables` contains valid CSS values
- Contrast checks are run (warnings returned, not blocking)

**PATCH `/api/skins/:name`** — Update a custom skin
```json
// Request:
{
  "name": "My Updated Theme",
  "variables": { ... }
}

// Response:
{ "success": true, "skin": { "name": "My Updated Theme", ... } }
```

**DELETE `/api/skins/:name`** — Delete a custom skin
```json
// Response:
{ "success": true }
```

Cannot delete built-in skins. If the deleted skin is currently active, reverts to "dark".

**GET `/api/skins/template`** — Returns the .md template file as a downloadable attachment.

---

## 11. Frontend Components

```
App.jsx
└── SettingsModal.jsx
    └── SkinManager.jsx (new section)
        ├── SkinLibrary.jsx
        │   ├── Built-in skin list (radio buttons)
        │   ├── Custom skin list (with edit/share/delete)
        │   └── Action buttons (Import, Create with AI)
        ├── SkinPreview.jsx
        │   ├── Floating toolbar (hardcoded colors)
        │   ├── Contrast validation indicator
        │   └── Apply/Cancel buttons
        ├── SkinImporter.jsx
        │   ├── File upload input
        │   ├── JSON paste textarea
        │   ├── URL paste input (auto-detects #/skin?d=)
        │   └── Preview button
        └── SkinSharer.jsx
            ├── Generate shareable URL
            └── Copy to clipboard button
```

### useSkin Hook

```javascript
// Manages skin state across the app
function useSkin() {
  const [currentSkin, setCurrentSkin] = useState('dark');
  const [previewSkin, setPreviewSkin] = useState(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [contrastWarnings, setContrastWarnings] = useState([]);

  // Apply skin variables to DOM
  const applyToDOM = (skinVariables) => { ... };
  // Clear preview, revert to current
  const cancelPreview = () => { ... };
  // Commit preview as active
  const applyPreview = () => { ... };
  // Select a skin (enters preview mode)
  const selectSkin = (skinName) => { ... };
  // Import a skin JSON (enters preview mode)
  const importSkin = (skinJson) => { ... };
  // Validate contrast
  const validateContrast = (variables) => { ... };

  return {
    currentSkin,
    previewSkin,
    isPreviewing,
    contrastWarnings,
    selectSkin,
    importSkin,
    cancelPreview,
    applyPreview,
    validateContrast,
  };
}
```

---

## 12. Implementation Order

This feature should be built after the core NeepFeed MVP is working. The CSS variable foundation must be in the MVP.

### S1: Skin System Core (3-4 hours)
- Define all CSS custom properties in `index.css`
- Create built-in skin definitions (5 skins as JS objects)
- Skin library UI in settings (radio buttons, skin switching)
- `useSkin` hook (apply skin to DOM, persist active skin)
- Save/load active skin and custom skins from `user_config`
- Flash prevention script in `index.html`

### S2: Live Preview (2-3 hours)
- Preview mode state management
- Floating toolbar component (hardcoded colors, always visible)
- Contrast validation utility
- Apply/Cancel flow
- Contrast warning indicator in toolbar

### S3: Import/Export/Share (2-3 hours)
- Skin importer component (file upload, JSON paste, URL paste)
- Skin JSON validation
- Shareable URL generation (pako compression + base64)
- URL fragment detection on app load
- Share button in skin library
- Copy to clipboard

### S4: AI Template (1-2 hours)
- Create `NeepFeed-Skin-Template.md` file
- In-app download button in settings
- README section on creating custom skins
- Example prompts

**Total estimated effort: 8-12 hours**

---

## 13. Key Implementation Notes

### CSS Variable Scoping
When previewing a skin, apply variables to `<html style="...">`. When applying permanently, save to `user_config` and set variables on `<html>` on page load. The active skin's variables should be set before React renders to avoid flash of unstyled content.

### Built-in Skin Definitions
Store as JS objects in a `frontend/src/skins/` directory. Each skin is a file like `dark.js`, `light.js`, `cyberpunk.js`, etc. Export the variable mapping. Import them into the SkinManager.

### Custom Skin Storage
Stored as a JSON string in `user_config` under the `custom_skins` key. Parsed on load, available in the skin library.

### Font Loading
If a skin specifies a custom font (e.g., "JetBrains Mono"), the app should attempt to load it via Google Fonts or a `@font-face` declaration. If the font fails to load, fall back to the system font stack. Skins should always specify a full font stack with fallbacks, not a single font name.

### Variable Inheritance
When a custom skin only specifies some variables, the missing ones inherit from the `:root` defaults in `index.css`. This means a skin can be as minimal as:

```json
{
  "name": "Just Blue",
  "version": 1,
  "variables": {
    "--nf-accent": "#0066ff",
    "--nf-accent-hover": "#3388ff"
  }
}
```

And everything else stays as the current default.

### Skin Name Validation
- Must be 1-50 characters
- Must not duplicate a built-in skin name (dark, light, cyberpunk, solarized, paper)
- Must not duplicate an existing custom skin name
- Must not contain special characters that would break CSS or JSON

### Deleting the Active Skin
If the user deletes the custom skin that is currently active, the app reverts to the "dark" built-in skin.

### URL Fragment Handling
On app load, check `window.location.hash` for `#/skin?d=`. If found:
1. Decode and decompress the skin JSON
2. Validate the JSON structure
3. Enter preview mode with the decoded skin
4. Clear the hash from the URL (replace state)
5. Show the preview toolbar

This allows shareable links to work without any server-side storage.

---

## 14. Future Considerations (Not in This Phase)

These are explicitly out of scope but documented for future planning:

- **Skin editor UI** — A visual editor where users can pick colors, fonts, and spacing without writing JSON. Could be a future addition.
- **Community skin gallery** — A server-side repository of shared skins that users can browse and install. Requires backend changes.
- **Per-list skins** — Apply different skins to different lists (e.g., dark theme for Tech, paper theme for Casual).
- **Animated transitions** — Smooth CSS transitions when switching between skins.
- **Skin versioning** — If the variable set changes between app versions, handle migration of old skins.

---

## 15. Implementation deviations from this spec

1. **Three built-in skins instead of five.** Only Dark, Light, and Paper are shipped as built-ins. Cyberpunk and Solarized were dropped from the built-in set to reduce maintenance (every new variable must otherwise be back-filled across all built-ins or fall through to defaults). They remain describable as custom skins imported via the JSON format.

2. **Dark skin uses the app's brand palette,** not the slate-blue hex values in Section 4 of this doc. Code values: `--nf-bg-primary: #0b0d10`, `--nf-accent: #ff6b3d`. Section 4 is preserved as historical design intent but the code is authoritative. See `frontend/src/skins/builtin.js` for the actual values.

3. **Shareable URLs were removed.** Section 6's pako-compressed base64 URL flow was dropped — it would add a ~40 KB runtime dependency for a feature a single-user self-hosted app rarely needs. JSON file download per skin (`{name}.neepfeed-skin.json`) handles sharing.

4. **Contrast validation runs entirely client-side.** The backend's skin save/update endpoints do not run WCAG checks; that's a frontend concern. The `POST /api/skins` validator enforces the `--nf-*` prefix, rejects `; { } @` in values (CSS injection guard), caps skin JSON at 16 KB, and caps custom-skin count at 50.

5. **`GET /api/skins/template` was not implemented as a backend endpoint.** The AI prompt template lives at `/skin-template.md` in `frontend/public/` and is served as a static file by Flask.

6. **Built-in skins apply immediately on click; only imported skins enter preview.** Built-ins are trusted and authored alongside the code, so a preview round-trip is unnecessary friction. Imported skins go through preview mode with the contrast warning so the user has a chance to catch a broken JSON paste before Apply persists it.

7. **Skin import validation** checks `version === 1`, rejects arrays-as-variables, and disallows CSS injection characters in variable values both client-side and server-side. (The spec's Section 9 lists these rules; the implementation enforces them.)

8. **Legacy `theme` setting was removed** in favor of the skin system. Previously `user_config.theme = 'dark' | 'light'` coexisted with the skin system; it's been deleted since selecting the Dark or Light built-in skin is the single source of truth.