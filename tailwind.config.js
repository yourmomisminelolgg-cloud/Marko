/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: { 500: "#7c3aed", 600: "#6d28d9", accent: "#ff3b30" },
      },
      fontFamily: { display: ["Inter","system-ui","sans-serif"] },
      animation: { "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite" }
    },
  },
  plugins: [],
};
