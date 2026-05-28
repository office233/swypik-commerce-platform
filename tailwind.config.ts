import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#7C3AED",
          accent: "#EC4899",
          indigo: "#4F46E5",
        },
        // WCAG 2.2 AA-compliant palette (contrast >= 4.5:1 vs white)
        // Replaces #EF4444 (3.76:1), #F59E0B (2.13:1), #A1A1AA (2.85:1) — all FAIL on white.
        "brand-aa": {
          red: "#DC2626",     // red-600  — 4.83:1 vs white
          amber: "#B45309",   // amber-700 — 5.93:1 vs white
          gray: "#52525B",    // zinc-600 — 7.16:1 vs white
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(124,58,237,.28)",
      },
    },
  },
  plugins: [
    // WCAG 2.2 — target size >= 24px (AA) / 44px (AAA). Hit-area utility for icon buttons.
    plugin(({ addUtilities }) => {
      addUtilities({
        ".hit-target-44": {
          position: "relative",
          minWidth: "44px",
          minHeight: "44px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "manipulation",
        },
      });
    }),
  ],
  future: {
    hoverOnlyWhenSupported: true,
  },
};

export default config;
