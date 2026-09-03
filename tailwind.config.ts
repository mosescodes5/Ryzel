import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0A0F14',
          900: '#0F161D',
          800: '#151E27',
          700: '#1F2C38',
          600: '#334454'
        },
        signal: {
          400: '#4DE8C8',
          500: '#22D3A6',
          600: '#16A888'
        },
        amber: {
          400: '#F5B860',
          500: '#EDA23F'
        },
        mist: {
          100: '#F4F7F7',
          300: '#C8D2D6',
          500: '#8AA0A8'
        },
        // "brand" is the indigo/violet used by the light dashboard shell
        // (sidebar, primary buttons, active nav state) — separate from
        // the dark marketing-site "ink/signal" palette above so the two
        // themes can evolve independently. Shifted slightly bluer/richer
        // than the original indigo for a bit more depth in the sidebar.
        brand: {
          50: '#F1F0FF',
          100: '#E3E1FF',
          200: '#C9C4FF',
          300: '#A59DFB',
          400: '#8177F5',
          500: '#6259ED',
          600: '#4E3FDB',
          700: '#4030B8',
          800: '#312590',
          900: '#251C6B'
        }
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        sm: '4px',
        md: '8px'
      }
    }
  },
  plugins: []
};

export default config;
