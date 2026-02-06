import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'daisio': {
          dark: '#0a0a0f',
          darker: '#050508',
          card: '#12121a',
          border: '#1f1f2e',
          text: '#ffffff',
          'text-muted': '#8b8b9e',
          blue: '#3b82f6',
          'blue-light': '#60a5fa',
          purple: '#8b5cf6',
          green: '#10b981',
        },
      },
    },
  },
  plugins: [],
};

export default config;
