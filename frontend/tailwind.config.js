/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#050508",
        "bg-1": "#0c0c12",
        "bg-2": "#111118",
        "bg-3": "#1a1a24",
        "bg-4": "#22222e",
        "border-custom": "rgba(255, 255, 255, 0.06)",
        "border-bright": "rgba(255, 255, 255, 0.12)",
        "text-custom": "#ffffff",
        "text-2": "#f3f4f6",
        "text-3": "#e5e7eb",
        "text-4": "#d1d5db",
        "green-custom": "#00e5a0",
        "green-dim": "rgba(0, 229, 160, 0.12)",
        "red-custom": "#ff3b5c",
        "red-dim": "rgba(255, 59, 92, 0.12)",
        "amber-custom": "#ffb020",
        "amber-dim": "rgba(255, 176, 32, 0.12)",
        "blue-custom": "#4d9fff",
        "blue-dim": "rgba(77, 159, 255, 0.12)",
        "cyan-custom": "#00d4f5",
        "purple-custom": "#9b6dff",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        display: ["Outfit", "sans-serif"],
        body: ["Plus Jakarta Sans", "sans-serif"],
      },
      borderRadius: {
        custom: "2px",
        "radius-lg-custom": "4px",
      },
    },
  },
  plugins: [],
};
