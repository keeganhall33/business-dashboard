import clsx from "clsx";

export type PanelDataMode = "LIVE" | "SNAPSHOT" | "MANUAL" | "SEED" | "FALLBACK" | "BROKEN";

const MODE_STYLES: Record<PanelDataMode, { label: string; bg: string; text: string }> = {
  LIVE: { label: "Live", bg: "bg-emerald-500/15", text: "text-emerald-300" },
  SNAPSHOT: { label: "Snapshot", bg: "bg-sky-500/15", text: "text-sky-200" },
  MANUAL: { label: "Manual", bg: "bg-amber-500/15", text: "text-amber-200" },
  SEED: { label: "Seed", bg: "bg-purple-500/15", text: "text-purple-200" },
  FALLBACK: { label: "Fallback", bg: "bg-blue-500/10", text: "text-blue-200" },
  BROKEN: { label: "On Hold", bg: "bg-red-500/15", text: "text-red-200" }
};

type Props = {
  mode: PanelDataMode;
};

export function PanelModeBadge({ mode }: Props) {
  const style = MODE_STYLES[mode];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        style.bg,
        style.text,
        "border border-white/5"
      )}
    >
      {style.label}
    </span>
  );
}
