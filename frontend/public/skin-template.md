# NeepFeed Skin Template

This file is a prompt scaffold. Paste it into an AI (Claude, ChatGPT, etc.)
along with your theme description. The AI will return a JSON object you can
paste into **Settings → Skins → Import skin** in NeepFeed.

---

## How to use

1. **Copy this entire file.**
2. **Paste it into your AI of choice.**
3. At the top, add a description of the theme you want. Examples:
   - *"Design a warm autumn theme with earthy rust-orange accents and a serif font."*
   - *"Create a high-contrast accessibility theme that passes WCAG AAA."*
   - *"Make a retro terminal theme with phosphor-green text on black."*
   - *"Cozy reading theme, cream paper background, soft shadows, generous spacing."*
4. **Paste the AI's JSON response** into NeepFeed's import dialog, then preview
   before applying.

---

## Output format

Return **only** a JSON object in this shape (no prose around it):

```json
{
  "name": "Your Theme Name",
  "author": "Your Name",
  "version": 1,
  "variables": {
    "--nf-bg-primary": "#0f172a",
    "--nf-accent": "#3b82f6"
    // ...any subset of the variables below
  }
}
```

**Rules:**
- `name` is required; keep it under 50 chars. Cannot be `dark`, `light`, or `paper` (reserved).
- `version` must be `1`.
- `variables` may include any subset of the keys below. Omitted keys fall back
  to the default Dark skin.
- Color values: hex (`#0f172a`, `#f00`), `rgb()`, or `rgba()` only.
  **No** `hsl()`, named colors, or CSS functions other than `rgba`.
- Font values must include fallbacks (e.g., `"Inter", system-ui, sans-serif`).
- Size values use `px` (e.g. `14px`, `720px`).
- **Do not** include `;`, `{`, `}`, or `@` anywhere — validation will reject.

---

## Variable reference

### Backgrounds

| Variable | What it styles | Default (Dark) |
|---|---|---|
| `--nf-bg-primary`   | Page background, header strip | `#0b0d10` |
| `--nf-bg-secondary` | Post cards, modal panels      | `#14171c` |
| `--nf-bg-tertiary`  | Hover states, nested UI       | `#1a1e25` |

### Text

| Variable | What it styles | Default |
|---|---|---|
| `--nf-text-primary`   | Titles, body text       | `#e8ebef` |
| `--nf-text-secondary` | Subreddit meta, time    | `#8a939f` |
| `--nf-text-muted`     | Placeholder, hints      | `#5a6370` |

### Accent + interactive

| Variable | What it styles | Default |
|---|---|---|
| `--nf-accent`         | Brand color, hovers, focus rings | `#ff6b3d` |
| `--nf-accent-hover`   | Accent in hover state            | `#ff855e` |
| `--nf-upvote`         | Upvote arrow/count               | `#ff6b3d` |
| `--nf-downvote`       | Downvote color                   | `#6b7280` |
| `--nf-comment-color`  | Comment count color              | `#8a939f` |
| `--nf-nsfw-badge`     | NSFW tag background              | `#ef4444` |
| `--nf-flair-bg`       | Post flair chip background       | `rgba(255,107,61,0.1)` |
| `--nf-flair-text`     | Post flair chip text             | `#ff6b3d` |

### Borders, shadows

| Variable | What it styles | Default |
|---|---|---|
| `--nf-border`       | Card & input borders    | `rgba(255,255,255,0.05)` |
| `--nf-border-focus` | Border on focus         | `#ff6b3d` |
| `--nf-shadow`       | Card drop shadow        | `0 10px 15px -3px rgba(0,0,0,0.3)` |

### UI elements

| Variable | What it styles | Default |
|---|---|---|
| `--nf-header-bg`       | Header bar (may use alpha for blur) | `rgba(11,13,16,0.75)` |
| `--nf-modal-overlay`   | Settings modal backdrop | `rgba(0,0,0,0.7)` |
| `--nf-modal-bg`        | Settings modal panel    | `#14171c` |
| `--nf-button-bg`       | Primary button bg       | `#ff6b3d` |
| `--nf-button-text`     | Primary button text     | `#000000` |
| `--nf-button-hover`    | Primary button hover    | `#ff855e` |
| `--nf-input-bg`        | Text input background   | `#0b0d10` |
| `--nf-input-border`    | Text input border       | `rgba(255,255,255,0.1)` |
| `--nf-input-focus`     | Input border when focused | `rgba(255,107,61,0.4)` |
| `--nf-scrollbar-thumb` | Scrollbar thumb         | `#3a4150` |
| `--nf-scrollbar-track` | Scrollbar track         | `#0b0d10` |
| `--nf-link-color`      | Inline links            | `#ff6b3d` |
| `--nf-link-hover`      | Link hover color        | `#ff855e` |
| `--nf-video-overlay`   | Video "Watch on Reddit" fallback overlay | `rgba(0,0,0,0.5)` |

### Status

| Variable | What it styles | Default |
|---|---|---|
| `--nf-success` | Success indicators | `#22c55e` |
| `--nf-warning` | Warning indicators | `#f59e0b` |
| `--nf-error`   | Error indicators   | `#ef4444` |

### Feed-specific

| Variable | What it styles | Default |
|---|---|---|
| `--nf-seen` | Dimmed color for already-read posts | `#3a4150` |

### Typography

| Variable | What it styles | Default |
|---|---|---|
| `--nf-font-family`   | Global font stack  | `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |
| `--nf-font-size-base` | Body text          | `14px` |
| `--nf-font-size-sm`   | Meta, badges       | `12px` |
| `--nf-font-size-lg`   | Post titles        | `18px` |
| `--nf-font-size-xl`   | Section headings   | `24px` |

### Spacing + shape

| Variable | What it styles | Default |
|---|---|---|
| `--nf-card-radius`    | Border radius on cards    | `14px` |
| `--nf-card-padding`   | Inner padding of cards    | `16px` |
| `--nf-feed-max-width` | Max width of the feed column | `768px` |

---

## Contrast guidance (important)

NeepFeed runs a WCAG contrast check on every skin. For readable text:

- **Body text (`--nf-text-primary` on `--nf-bg-primary`)** should meet **4.5:1** minimum (AA).
- **Accent (`--nf-accent` on `--nf-bg-primary`)** should meet **3:1** for UI affordances.
- **Button text on button (`--nf-button-text` on `--nf-button-bg`)** should meet **4.5:1**.

Before returning JSON, silently sanity-check these ratios yourself. If a pair
fails, adjust the darker/lighter value until it passes.

---

## Full example — "Autumn Paper"

```json
{
  "name": "Autumn Paper",
  "author": "AI assistant",
  "version": 1,
  "variables": {
    "--nf-bg-primary": "#fbf4e9",
    "--nf-bg-secondary": "#ffffff",
    "--nf-bg-tertiary": "#f2e8d5",
    "--nf-text-primary": "#2a1d10",
    "--nf-text-secondary": "#6b5840",
    "--nf-text-muted": "#a08868",
    "--nf-accent": "#b24a18",
    "--nf-accent-hover": "#c95920",
    "--nf-upvote": "#c24a00",
    "--nf-border": "#e5d4b8",
    "--nf-border-focus": "#b24a18",
    "--nf-shadow": "0 2px 6px rgba(42,29,16,0.08)",
    "--nf-button-bg": "#b24a18",
    "--nf-button-text": "#fbf4e9",
    "--nf-button-hover": "#c95920",
    "--nf-input-bg": "#ffffff",
    "--nf-input-border": "#e5d4b8",
    "--nf-font-family": "\"Lora\", \"Georgia\", \"Times New Roman\", serif",
    "--nf-font-size-base": "15px",
    "--nf-card-radius": "6px",
    "--nf-card-padding": "18px"
  }
}
```

---

*End of template. Your response should begin with the JSON object only.*
