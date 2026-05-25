import { formatMetricValue } from "@/lib/utils/format";

type Props = {
  current: number;
  target: number;
  unit: string | null;
  label?: string;
  tone?: "accent" | "success" | "warning" | "danger";
};

function safeRatio(current: number, target: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
  if (target <= 0) return 0;
  return Math.max(0, current / target);
}

export function TargetProgress({ current, target, unit, label = "Progress", tone = "accent" }: Props) {
  const ratio = safeRatio(current, target);
  const pct = Math.min(150, Math.round(ratio * 100));
  const fillPct = Math.min(100, Math.round(ratio * 100));
  const over = ratio > 1;

  const toneColor = toneToCssVar(tone);

  return (
    <div className="rounded-xl border border-[var(--ui-border)] bg-[rgba(255,255,255,0.03)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div className={`text-xs ${over ? "text-emerald-300" : "text-zinc-400"}`}>{pct}%</div>
      </div>

      <div className="mt-2 h-2 w-full rounded-full bg-black/30 ring-1 ring-white/5">
        <div
          className={
            over
              ? "h-2 rounded-full bg-emerald-400"
              : "h-2 rounded-full"
          }
          style={
            over
              ? { width: `${fillPct}%` }
              : {
                  width: `${fillPct}%`,
                  background: `linear-gradient(90deg, ${toneColor}, var(--ui-accent-2))`
                }
          }
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-xs text-zinc-200">{formatMetricValue(current, unit)}</div>
        <div className="text-[11px] text-zinc-500">Target {formatMetricValue(target, unit)}</div>
      </div>
    </div>
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
    case "accent":
    default:
      return "var(--ui-accent)";
  }
}
