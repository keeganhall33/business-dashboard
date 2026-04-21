type Props = {
  value: number;
  tone?: "emerald" | "amber" | "rose" | "sky" | "zinc";
  className?: string;
};

export function ProgressBar({ value, tone = "sky", className = "" }: Props) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const bar =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
      ? "bg-amber-500"
      : tone === "rose"
      ? "bg-rose-500"
      : tone === "zinc"
      ? "bg-zinc-500"
      : "bg-sky-500";

  return (
    <div className={`h-1.5 w-full rounded-full bg-zinc-900 ${className}`}>
      <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

