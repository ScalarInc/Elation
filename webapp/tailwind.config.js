/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: '#9AB1AE',
        'sage-deep': '#7E9895',
        blush: '#E3BFB9',
        'blush-deep': '#D3A79F',
        beige: '#E1CBAD',
        tan: '#CFAE96',
        cream: '#FAF3EF',
        ink: '#3B3A3F',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans: ['Lato', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -20px rgba(59,58,63,0.25)',
        card: '0 8px 30px -15px rgba(59,58,63,0.18)',
      },
    },
  },
  plugins: [],
}
