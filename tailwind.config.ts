import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#080b10',
        bg1:     '#0e1117',
        bg2:     '#161b24',
        bg3:     '#1e2532',
        border:  '#232b38',
        accent:  '#22c55e',
        'accent-dim': 'rgba(34,197,94,0.12)',
        energy:  '#f97316',
        'energy-dim': 'rgba(249,115,22,0.12)',
        text1:   '#f1f5f9',
        text2:   '#94a3b8',
        text3:   '#64748b',
        danger:  '#ef4444',
        warn:    '#f59e0b',
        info:    '#60a5fa',
        purple:  '#a78bfa',
        // — design-system-v1.0 tokens (paper + clay editorial) —
        paper:   '#F5F1E8',
        surface: '#FFFDF7',
        'surface-2': '#EFEADC',
        ink: { DEFAULT: '#121110', 2: '#4A453C', 3: '#8F877A' },
        hairline: { DEFAULT: '#E0D8C6', 2: '#C9BFA7' },
        clay: { DEFAULT: '#B84B3A', hover: '#9C3D2E', wash: '#F7E6E0', dim: '#D69F94' },
        sage:    '#5A7A3C',
        mustard: '#C68B1E',
      },
      fontFamily: {
        sans:      ['var(--font-barlow)', 'system-ui', 'sans-serif'],
        condensed: ['var(--font-barlow-condensed)', 'system-ui', 'sans-serif'],
        mono:      ['var(--font-jetbrains-mono)', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      fontVariantNumeric: { tabular: 'tabular-nums' },
      borderRadius: {
        card: '14px',
        sm:   '10px',
      },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
};

export default config;
