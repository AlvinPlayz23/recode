/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      colors: {
        rc: {
          bg: 'var(--rc-bg)',
          sidebar: 'var(--rc-sidebar)',
          card: 'var(--rc-card)',
          elevated: 'var(--rc-elevated)',
          border: 'var(--rc-border)',
          'border-soft': 'var(--rc-border-soft)',
          text: 'var(--rc-text)',
          muted: 'var(--rc-text-muted)',
          faint: 'var(--rc-text-faint)',
          accent: 'var(--rc-accent)',
          'accent-soft': 'var(--rc-accent-soft)',
          hover: 'var(--rc-hover)',
          'hover-strong': 'var(--rc-hover-strong)',
          bubble: 'var(--rc-bubble)',
        },
      },
    },
  },
  plugins: [],
}
