/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Fixed brand palette (do not vary per theme)
        sage: '#9AB1AE',
        'sage-deep': '#7E9895',
        blush: '#E3BFB9',
        'blush-deep': '#D3A79F',
        beige: '#E1CBAD',
        tan: '#CFAE96',
        cream: '#FAF3EF',
        ink: '#3B3A3F',

        // Semantic tokens (driven by CSS vars, dark-mode aware)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',

        // Status
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger:  'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Fraunces', '"Playfair Display"', 'serif'],
        serif: ['Fraunces', '"Playfair Display"', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -20px rgba(59,58,63,0.25)',
        card: '0 8px 30px -15px rgba(59,58,63,0.18)',
        lift: '0 24px 60px -30px rgba(59,58,63,0.35)',
        // Dark-mode aware via CSS custom var if needed later
        'inner-soft': 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'accent-shine':
          'linear-gradient(120deg, rgb(var(--accent) / 0.9) 0%, rgb(var(--accent) / 0.65) 50%, rgb(var(--accent) / 0.9) 100%)',
        'radial-fade':
          'radial-gradient(ellipse at top, rgb(var(--accent) / 0.12), transparent 60%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 300ms ease-out',
        'slide-up': 'slide-up 400ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
