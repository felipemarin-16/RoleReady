import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0E1726",
        mist: "#F4F6FB",
        accent: "#C78C3D",
        pine: "#1D5B57",
        rose: "#E9D5C9",
        slate: "#5E6B84",
      },
      boxShadow: {
        panel: "0 22px 55px -24px rgba(11, 23, 49, 0.38)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(14,23,38,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(14,23,38,0.06) 1px, transparent 1px)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)"],
        display: ["var(--font-fraunces)"],
      },
    },
  },
  plugins: [],
};

export default config;
