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
          bg: '#f9f9f9',
          sidebar: '#f3f3f3',
          card: '#ffffff',
          border: '#e5e5e5',
          'border-soft': '#ececec',
          text: '#1a1a1a',
          muted: '#757575',
          faint: '#9b9b9b',
          accent: '#2962ff',
        },
      },
    },
  },
  plugins: [],
}
