/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9edff',
          200: '#bce0ff',
          300: '#8eccff',
          400: '#59afff',
          500: '#338eff',
          600: '#1d6ff5',
          700: '#155ae1',
          800: '#1749b6',
          900: '#19408f',
          950: '#142a57',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e1',
          300: '#b1b8c6',
          400: '#8793a6',
          500: '#68748a',
          600: '#525c72',
          700: '#444c5e',
          800: '#2c3240',
          900: '#232836',
          950: '#12141d',
        },
        mint: {
          50: '#effaf5',
          100: '#d8f2e6',
          200: '#b4e4d1',
          300: '#83cfaf',
          400: '#4fb189',
          500: '#2d9670',
          600: '#1f7859',
          700: '#185f47',
          800: '#154c3b',
          900: '#123f32',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        cardHover: '0 4px 8px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.06)',
        pop: '0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 8px -2px rgb(16 24 40 / 0.06)',
        overlay: '0 24px 48px -12px rgb(16 24 40 / 0.24)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
      },
    },
  },
  plugins: [],
};