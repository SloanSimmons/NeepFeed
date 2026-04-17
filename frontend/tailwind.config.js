/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Color tokens reference CSS custom properties so skins can override
      // them at runtime without rebuilding. For Tailwind utilities that
      // need alpha (bg-black/40, border-white/5, etc.), we keep using
      // Tailwind's built-in palette rather than these skin-driven tokens.
      colors: {
        bg: {
          DEFAULT: 'var(--nf-bg-primary)',
          card:    'var(--nf-bg-secondary)',
          elev:    'var(--nf-bg-tertiary)',
        },
        fg: {
          DEFAULT: 'var(--nf-text-primary)',
          muted:   'var(--nf-text-secondary)',
          dim:     'var(--nf-text-muted)',
        },
        brand: {
          DEFAULT: 'var(--nf-accent)',
          hover:   'var(--nf-accent-hover)',
        },
        seen: 'var(--nf-seen)',
      },
      fontFamily: {
        // Single entry referencing the skin font-family var.
        sans: ['var(--nf-font-family)'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: 'var(--nf-card-radius)',
      },
      maxWidth: {
        feed: 'var(--nf-feed-max-width)',
      },
    },
  },
  plugins: [],
};
