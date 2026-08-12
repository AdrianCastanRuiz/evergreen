/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#1B853F",
        "primary-hover": "#19570D",
        "primary-foreground": "#FFFFFF",
        secondary: "#2C643F",
        "secondary-foreground": "#FFFFFF",
        accent: "#2E8C8F",
        "accent-blue": "#3070A5",
        "accent-blue-hover": "#3C7AD1",
        "accent-blue-foreground": "#FFFFFF",
        background: "#FFFFFF",
        foreground: "#222222",
        card: "#FFFFFF",
        "card-foreground": "#222222",
        muted: "#F8F8F8",
        "muted-alt": "#F6F6F6",
        "muted-foreground": "#5C5C5C",
        border: "#8C8C8C",
        "border-strong": "#6E6E6E",
        input: "#8C8C8C",
        ring: "#1B853F",
        destructive: "#C23934",
        "destructive-foreground": "#FFFFFF",
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "8px",
        md: "11px",
        lg: "16px",
        full: "9999px",
      },
      spacing: {
        gutter: "16px",
        "margin-mobile": "16px",
        "margin-desktop": "32px",
        "section-gap": "32px",
        "card-padding": "16px",
      },
      fontFamily: {
        // Each token maps to an exact @expo-google-fonts variant (name embeds
        // the weight). A fontFamily plus a separate fontWeight does NOT work
        // on Android for custom fonts — the device looks for a font file of
        // that exact family+weight and renders empty when it can't find it.
        hero: ["Roboto_600SemiBold", "sans-serif"],
        heading: ["Oswald_600SemiBold", "sans-serif"],
        "heading-sm": ["Oswald_600SemiBold", "sans-serif"],
        "section-title": ["Raleway_600SemiBold", "sans-serif"],
        body: ["OpenSans_400Regular", "sans-serif"],
        "body-emphasis": ["OpenSans_600SemiBold", "sans-serif"],
        "body-medium": ["OpenSans_500Medium", "sans-serif"],
        "button-label": ["OpenSans_600SemiBold", "sans-serif"],
        caption: ["OpenSans_400Regular", "sans-serif"],
      },
    },
  },
  plugins: [],
};
