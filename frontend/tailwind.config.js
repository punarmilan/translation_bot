/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "var(--color-bg-primary)",
          mid: "var(--color-surface)",
          accent: "var(--color-accent)",
          bg: "var(--color-text-primary)",
        },
        ui: {
          secondary: "var(--color-bg-secondary)",
          elevated: "var(--color-surface-elevated)",
          text: "var(--color-text-primary)",
          muted: "var(--color-text-secondary)",
          subtle: "var(--color-text-muted)",
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error: "var(--color-error)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        panel: "var(--shadow-panel)",
      },
      borderRadius: {
        panel: "var(--radius-panel)",
        control: "var(--radius-control)",
      },
      transitionDuration: {
        ui: "var(--transition-ui)",
      },
    },
  },
  plugins: [],
};
