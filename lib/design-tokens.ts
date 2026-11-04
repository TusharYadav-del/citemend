export const designTokens = {
  color: {
    background: "#07090E",
    surface: "#0D1119",
    surfaceRaised: "#101722",
    surfaceSoft: "#151E2A",
    text: "#F5F7FA",
    textSecondary: "#929CAA",
    textTertiary: "#66717F",
    accent: "#37F5A0",
    accentStrong: "#20D787",
    cyan: "#39D9FF",
    danger: "#FF6482",
    warning: "#F4BD68",
    border: "rgb(255 255 255 / 8%)",
  },
  typography: {
    sans: '"Inter", "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", Consolas, monospace',
    display: "clamp(3rem, 7vw, 6.5rem)",
  },
  spacing: { section: "clamp(4.75rem, 9vw, 8.25rem)", page: "min(100% - 2.5rem, 80rem)" },
  radius: { small: "0.625rem", medium: "0.875rem", large: "1.125rem", panel: "1.5rem", pill: "999px" },
  shadow: { panel: "0 24px 72px -40px rgb(0 0 0 / 82%)", glow: "0 0 48px rgb(55 245 160 / 12%)" },
  motion: { fast: "160ms", standard: "280ms", easing: "cubic-bezier(.2, .75, .25, 1)" },
  zIndex: { sticky: 20, overlay: 40, toast: 60 },
} as const;

export type DesignTokens = typeof designTokens;
