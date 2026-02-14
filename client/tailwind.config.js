/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0C0F14",
          1: "#131720",
          2: "#1A1F2E",
          3: "#222839",
        },
        accent: {
          blue: "#4F8EF7",
          violet: "#8B5CF6",
        },
        bullish: "#10B981",
        bearish: "#EF4444",
        alert: "#F59E0B",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
