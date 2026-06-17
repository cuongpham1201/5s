import type { Config } from "tailwindcss";

/**
 * Tailwind theme mapped onto the ds.css design tokens (Fluent 2).
 * Tokens live as CSS variables in src/app/globals.css; Tailwind references them
 * so the prototype's visual language is preserved 1:1.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "var(--primary-50)",
          100: "var(--primary-100)",
          600: "var(--primary-600)",
          700: "var(--primary-700)",
          800: "var(--primary-800)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          app: "var(--app-bg)",
        },
        ink: {
          DEFAULT: "var(--text)",
          muted: "var(--text-muted)",
          disabled: "var(--text-disabled)",
        },
        line: "var(--border)",
        "line-strong": "var(--border-strong)",
        success: { DEFAULT: "var(--success)", bg: "var(--success-bg)" },
        warning: { DEFAULT: "var(--warning)", bg: "var(--warning-bg)" },
        danger: { DEFAULT: "var(--danger)", bg: "var(--danger-bg)" },
        info: { DEFAULT: "var(--info)", bg: "var(--info-bg)" },
        gold: "var(--gold)",
        silver: "var(--silver)",
        bronze: "var(--bronze)",
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "-apple-system", "Inter", "Roboto", "Arial", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        pill: "999px",
      },
      boxShadow: {
        e2: "0 2px 8px rgba(15,23,42,.06)",
        e4: "0 8px 24px rgba(15,23,42,.08)",
        e8: "0 12px 28px rgba(15,23,42,.12)",
        e16: "0 20px 40px rgba(15,23,42,.18)",
        cta: "0 12px 28px rgba(22,163,74,.22)",
        ctaBlue: "0 12px 28px rgba(10,116,218,.22)",
      },
    },
  },
  plugins: [],
};

export default config;
