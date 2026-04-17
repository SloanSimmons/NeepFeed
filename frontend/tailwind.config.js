/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Modern-dark, media-forward palette
        bg: {
          DEFAULT: '#0b0d10',
          card: '#14171c',
          elev: '#1a1e25',
        },
        fg: {
          DEFAULT: '#e8ebef',
          muted: '#8a939f',
          dim: '#5a6370',
        },
        brand: {
          DEFAULT: '#ff6b3d',  // orange accent (Reddit-ish but less loud)
          hover: '#ff855e',
        },
        seen: '#3a4150',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
