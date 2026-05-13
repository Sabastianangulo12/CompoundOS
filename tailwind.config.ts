import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#09090B",
        foreground: "#F4F4F5",
        card: "#111114",
        border: "#27272A",
        accent: "#D6FD51",
        muted: "#A1A1AA"
      }
    }
  },
  plugins: []
};

export default config;

