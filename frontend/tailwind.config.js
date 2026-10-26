export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Global Design Language: Black, Yellow, and White
        primary: "#F59E0B", // Brand Action Yellow (amber-500)
        "on-primary": "#18191B", // Deep charcoal text on primary yellow
        "primary-container": "#FEF3C7", // Soft warm yellow container
        "on-primary-container": "#78350F",

        "brand-yellow": "#F59E0B",
        "brand-dark": "#18191B", // Deep charcoal/near-black for active navigation & headers
        "brand-charcoal": "#23272E",

        // Background & Surfaces
        background: "#FAFAF7", // Warm off-white
        surface: "#FFFFFF", // Clean crisp white surface
        "surface-container-lowest": "#FFFFFF",
        "surface-container-low": "#F5F5F3",
        "surface-container": "#EEEEEC",
        "surface-container-high": "#E5E5E2",
        "surface-variant": "#E4E4E7",

        // Typography
        "on-background": "#18191B",
        "on-surface": "#18191B",
        "on-surface-variant": "#525866", // Muted label & description text

        // Neutral Borders
        outline: "#D1D5DB", // Neutral gray border
        "outline-variant": "#E5E7EB", // Light neutral divider

        // Semantic Operational Colors
        success: "#10B981",
        "on-success": "#FFFFFF",
        warning: "#F59E0B",
        danger: "#EF4444",
        error: "#EF4444",
        "error-container": "#FEE2E2",
        "on-error-container": "#991B1B",
        info: "#3B82F6",
        "secondary-container": "#F3F4F6",
        "on-secondary-container": "#1F2937",
        secondary: "#4B5563",
        "on-secondary": "#FFFFFF",
        "surface-tint": "#F59E0B",
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        "2xl": "2rem",
        full: "9999px",
      },
      spacing: {
        gutter: "1rem",
        "margin-page": "1.5rem",
        "sidebar-collapsed": "80px",
        "sidebar-expanded": "288px",
        "stack-compact": "0.5rem",
      },
      fontFamily: {
        lexend: ["Lexend", "sans-serif"],
      },
      boxShadow: {
        lift: "0 12px 32px rgba(24, 25, 27, 0.08)",
        soft: "0 2px 12px rgba(24, 25, 27, 0.04)",
      },
    },
  },
  plugins: [],
};
