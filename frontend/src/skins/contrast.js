// WCAG contrast math + skin validation.
// Used for the live preview contrast indicator (S2) and by the Skin importer
// to warn on low-contrast skins before apply.

// Parse any CSS color to {r,g,b} 0-255. Handles #RGB, #RRGGBB, #RRGGBBAA,
// rgb(), rgba(). Named colors / hsl() not supported (rare in skin JSON).
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();

  const rgbMatch = v.match(/^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,]+([0-9.]+))?\s*\)$/);
  if (rgbMatch) {
    return {
      r: Math.round(+rgbMatch[1]),
      g: Math.round(+rgbMatch[2]),
      b: Math.round(+rgbMatch[3]),
      a: rgbMatch[4] !== undefined ? +rgbMatch[4] : 1,
    };
  }

  let h = v.startsWith('#') ? v.slice(1) : null;
  if (h) {
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

// WCAG 2.0 relative luminance.
export function luminance({ r, g, b }) {
  const ch = (c) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

// Composite a possibly-translucent foreground over a solid background.
function composite(fg, bg) {
  if (!fg || !bg) return fg;
  const a = fg.a ?? 1;
  if (a >= 1) return fg;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

export function contrastRatio(fgStr, bgStr) {
  const bg = parseColor(bgStr);
  let fg = parseColor(fgStr);
  if (!fg || !bg) return null;
  fg = composite(fg, bg);
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function ratioLevel(ratio) {
  if (ratio == null) return 'unknown';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

// Check the key pairs for a skin.
// Returns [{label, fg, bg, ratio, level, passes}, ...]
export function validateSkin(variables) {
  const checks = [
    ['Body text on background',       '--nf-text-primary',   '--nf-bg-primary'],
    ['Muted text on background',      '--nf-text-secondary', '--nf-bg-primary'],
    ['Text on card',                  '--nf-text-primary',   '--nf-bg-secondary'],
    ['Accent on background',          '--nf-accent',         '--nf-bg-primary'],
    ['Link on background',            '--nf-link-color',     '--nf-bg-primary'],
    ['Button text on button',         '--nf-button-text',    '--nf-button-bg'],
  ];
  return checks.map(([label, fgVar, bgVar]) => {
    const fg = variables[fgVar];
    const bg = variables[bgVar];
    const ratio = contrastRatio(fg, bg);
    const level = ratioLevel(ratio);
    return {
      label,
      fg, bg,
      ratio,
      level,
      passes: level === 'AA' || level === 'AAA',
    };
  });
}

export function countFailing(results) {
  return results.filter((r) => !r.passes && r.level !== 'unknown').length;
}
