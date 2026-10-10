/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: { preflight: false }, // AntD manages its own reset
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#006B73',
          dark: '#00545B',
          light: '#E6F4F5',
        },
        surface: '#FFFFFF',
        appbg: '#F4F6F8',
        border: '#DCE3E9',
        strong: '#12233F',
        secondary: '#536278',
        ok: '#18794E',
        warn: '#925400',
        bad: '#B42318',
        info: '#1D4ED8',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "'Segoe UI'", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
