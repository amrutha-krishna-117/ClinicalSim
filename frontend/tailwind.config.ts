import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        clinical: {
          blue: '#1a56db',
          teal: '#0694a2',
          green: '#057a55',
        }
      }
    },
  },
  plugins: [],
}
export default config
