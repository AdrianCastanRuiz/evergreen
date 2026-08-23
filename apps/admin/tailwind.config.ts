import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Tokens sourced from DESIGN.md (_bmad-output/planning-artifacts/ux-designs) —
// keep this file and apps/mobile's tailwind.config.js in sync when a token
// changes; both surfaces share one CSS-variable naming convention.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          blue: "hsl(var(--accent-blue))",
          "blue-hover": "hsl(var(--accent-blue-hover))",
          "blue-foreground": "hsl(var(--accent-blue-foreground))",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          alt: "hsl(var(--muted-alt))",
          foreground: "hsl(var(--muted-foreground))",
        },
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "8px",
        md: "11px",
        lg: "16px",
        full: "9999px",
      },
      fontFamily: {
        hero: ["Roboto", "sans-serif"],
        heading: ["Oswald", "sans-serif"],
        "section-title": ["Raleway", "sans-serif"],
        body: ["Open Sans", "sans-serif"],
      },
      spacing: {
        gutter: "16px",
        "margin-mobile": "16px",
        "margin-desktop": "32px",
        "section-gap": "32px",
        "card-padding": "16px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
