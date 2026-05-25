export const DesignTokens = {
  color: {
    background: "var(--ui-bg)",
    foreground: "var(--ui-fg)",
    accent: "var(--ui-accent)",
    accentSecondary: "var(--ui-accent-2)",
    success: "var(--ui-success)",
    warning: "var(--ui-warning)",
    danger: "var(--ui-danger)",
    muted: "var(--ui-muted)",
    border: "var(--ui-border)"
  },
  space: {
    0: "var(--space-0)",
    1: "var(--space-1)",
    2: "var(--space-2)",
    3: "var(--space-3)",
    4: "var(--space-4)",
    5: "var(--space-5)",
    6: "var(--space-6)",
    7: "var(--space-7)",
    8: "var(--space-8)",
    9: "var(--space-9)",
    10: "var(--space-10)"
  },
  radius: {
    xs: "var(--radius-xs)",
    sm: "var(--radius-sm)",
    md: "var(--radius-md)",
    lg: "var(--radius-lg)"
  },
  typography: {
    display: "var(--font-display)",
    h1: "var(--font-h1)",
    h2: "var(--font-h2)",
    h3: "var(--font-h3)",
    body: "var(--font-body)",
    bodySm: "var(--font-body-sm)",
    mono: "var(--font-mono-size)"
  },
  motion: {
    fast: "var(--motion-fast)",
    medium: "var(--motion-med)",
    slow: "var(--motion-slow)",
    easeStandard: "var(--ease-standard)",
    easeEmphasized: "var(--ease-emphasized)"
  }
} as const;

export type DensityMode = "comfortable" | "compact";

export function getDensityGap(mode: DensityMode = "comfortable") {
  return mode === "compact" ? "var(--density-gap-compact)" : "var(--density-gap-comfortable)";
}
