type Props = {
  value: number;
  size?: number;
  stroke?: number;
  tone?: "emerald" | "amber" | "rose" | "sky" | "zinc";
  label?: string;
};

export function ProgressDial({ value, size = 44, stroke = 5, tone = "sky", label }: Props) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const color =
    tone === "emerald"
      ? "stroke-emerald-500"
      : tone === "amber"
      ? "stroke-amber-500"
      : tone === "rose"
      ? "stroke-rose-500"
      : tone === "zinc"
      ? "stroke-zinc-400"
      : "stroke-sky-500";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          className="stroke-zinc-800"
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`${color}`}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-xs font-semibold text-zinc-100">{Math.round(pct)}%</div>
        {label ? <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div> : null}
      </div>
    </div>
  );
}

