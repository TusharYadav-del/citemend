export const designTokens = {
  color: {
    background: "#090B0F",
    surface: "#0E1117",
    surfaceRaised: "#141922",
    surfaceSoft: "#1A202B",
    text: "#E6EAF0",
    textSecondary: "#A3ADBB",
    textTertiary: "#8C96A5",
    accent: "#4CC9F0",
    accentStrong: "#75D9F5",
    success: "#4CC38A",
    cyan: "#4CC9F0",
    danger: "#F26D78",
    warning: "#E5B54A",
    border: "#202733",
    borderStrong: "#2E3846",
  },
  typography: {
    sans: 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", Consolas, monospace',
    display: "clamp(2.5rem, 6vw, 5rem)",
  },
  spacing: { section: "clamp(3.5rem, 7vw, 6.5rem)", page: "min(100% - 2.5rem, 80rem)" },
  radius: { small: "0.5rem", medium: "0.75rem", large: "1rem", panel: "1.25rem", pill: "999px" },
  shadow: { panel: "0 18px 48px -34px rgb(0 0 0 / 78%)", glow: "0 0 28px rgb(76 201 240 / 9%)" },
  motion: { fast: "160ms", standard: "280ms", easing: "cubic-bezier(.2, .75, .25, 1)" },
  zIndex: { sticky: 20, overlay: 40, toast: 60 },
} as const;

export type DesignTokens = typeof designTokens;
