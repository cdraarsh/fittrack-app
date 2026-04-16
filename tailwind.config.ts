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
      },
      fontFamily: {
        sans:      ['var(--font-barlow)', 'system-ui', 'sans-serif'],
        condensed: ['var(--font-barlow-condensed)', 'system-ui', 'sans-serif'],
      },
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
