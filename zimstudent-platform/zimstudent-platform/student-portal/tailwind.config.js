/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Same token names as the staff dashboard (../dashboard/tailwind.config.js)
      // so the portal reads as the same institution, just in a mobile-first layout.
      colors: {
        ink: { DEFAULT: "#12172A", light: "#1C2340" },
        paper: { DEFAULT: "#F7F6F2", card: "#FFFFFF", line: "#E4E1D6" },
        slate: { text: "#232838", muted: "#6B7085" },
        gold: { DEFAULT: "#C89B3C", soft: "#F1E4C3" },
        petrol: { DEFAULT: "#2F6F6B", dark: "#1F4E4B" },
        status: {
          success: "#3F7D53",
          successBg: "#E7F1E9",
          warning: "#B8862B",
          warningBg: "#FBF1DD",
          danger: "#A23B3B",
          dangerBg: "#F6E6E6",
          info: "#4A6FA5",
          infoBg: "#E9EEF6",
        },
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        seal: "4px",
      },
    },
  },
  plugins: [],
};
