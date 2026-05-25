type Props = {
  values: Array<number | null | undefined>;
  width?: number;
  height?: number;
  /**
   * Semantic tone used when custom stroke/fill classes are not provided.
   * Uses CSS variables in globals.css (e.g. --ui-success).
   */
  tone?: "accent" | "success" | "warning" | "danger" | "muted";
  strokeClassName?: string;
  fillClassName?: string;
};

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function Sparkline({
  values,
  width = 160,
  height = 44,
  tone = "accent",
  strokeClassName,
  fillClassName
}: Props) {
  const numeric = values
    .map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null))
    .filter((v): v is number => v !== null);

  if (numeric.length < 2) {
    return (
      <div
        aria-hidden
        className="h-[44px] w-full rounded-lg border border-zinc-800 bg-zinc-900/40"
      />
    );
  }

  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = Math.max(1e-9, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
      const yNorm = typeof v === "number" && Number.isFinite(v) ? (v - min) / range : null;
      const y = yNorm == null ? null : (1 - clamp01(yNorm)) * (height - 2) + 1;
      return { x, y };
    })
    .filter((p): p is { x: number; y: number } => typeof p.y === "number");

  if (points.length < 2) {
    return (
      <div
        aria-hidden
        className="h-[44px] w-full rounded-lg border border-zinc-800 bg-zinc-900/40"
      />
    );
  }

  const d = points
    .map((p, idx) => {
      const cmd = idx === 0 ? "M" : "L";
      return `${cmd}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");

  const area = `${d} L${points[points.length - 1].x.toFixed(2)},${(height - 1).toFixed(2)} L${points[0].x.toFixed(2)},${(height - 1).toFixed(2)} Z`;

  const toneStroke = toneToCssVar(tone);
  const useSemanticTone = !strokeClassName && !fillClassName;

  return (
    <svg
      role="img"
      aria-label="Trend sparkline"
      viewBox={`0 0 ${width} ${height}`}
      className="h-[44px] w-full"
      preserveAspectRatio="none"
    >
      {useSemanticTone ? (
        <path d={area} fill={toneStroke} fillOpacity={0.16} />
      ) : (
        <path d={area} className={fillClassName} />
      )}
      {useSemanticTone ? (
        <path
          d={d}
          fill="none"
          stroke={toneStroke}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ) : (
        <path d={d} className={`${strokeClassName} fill-none`} strokeWidth={2} strokeLinejoin="round" />
      )}
    </svg>
  );
}

function toneToCssVar(tone: NonNullable<Props["tone"]>) {
  switch (tone) {
    case "success":
      return "var(--ui-success)";
    case "warning":
      return "var(--ui-warning)";
    case "danger":
      return "var(--ui-danger)";
    case "muted":
      return "rgba(247, 251, 255, 0.38)";
    case "accent":
    default:
      return "var(--ui-accent)";
  }
}
