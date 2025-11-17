// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          light: 'hsl(var(--color-primary-light) / <alpha-value>)',
          DEFAULT: 'hsl(var(--color-primary-default) / <alpha-value>)',
          dark: 'hsl(var(--color-primary-dark) / <alpha-value>)',
        },
        bkg: 'hsl(var(--color-bkg) / <alpha-value>)',
        content: 'hsl(var(--color-content) / <alpha-value>)',
        'content-secondary': 'hsl(var(--color-content-secondary) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};