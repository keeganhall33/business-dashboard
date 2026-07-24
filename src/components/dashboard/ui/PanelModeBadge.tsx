import clsx from "clsx";

export type PanelDataMode =
  | "LIVE"
  | "SNAPSHOT"
  | "MANUAL"
  | "SEED"
  | "PARTIAL"
  | "FALLBACK"
  | "BROKEN"
  | "FRESH"
  | "STALE"
  | "DATA_LIGHT"
  | "MANUAL_ONLY"
  | "READ_ONLY"
  | "MISSING";

const MODE_STYLES: Record<PanelDataMode, { label: string; bg: string; text: string }> = {
  LIVE: { label: "Live", bg: "bg-emerald-500/15", text: "text-emerald-300" },
  SNAPSHOT: { label: "Snapshot", bg: "bg-sky-500/15", text: "text-sky-200" },
  MANUAL: { label: "Manual", bg: "bg-amber-500/15", text: "text-amber-200" },
  SEED: { label: "Seed", bg: "bg-purple-500/15", text: "text-purple-200" },
  PARTIAL: { label: "Partial", bg: "bg-amber-500/15", text: "text-amber-200" },
  FALLBACK: { label: "Fallback", bg: "bg-blue-500/10", text: "text-blue-200" },
  BROKEN: { label: "On Hold", bg: "bg-red-500/15", text: "text-red-200" },
  FRESH: { label: "Fresh", bg: "bg-emerald-500/15", text: "text-emerald-200" },
  STALE: { label: "Stale", bg: "bg-amber-500/15", text: "text-amber-100" },
  DATA_LIGHT: { label: "Data light", bg: "bg-sky-500/15", text: "text-sky-100" },
  MANUAL_ONLY: { label: "Manual only", bg: "bg-zinc-500/20", text: "text-zinc-100" },
  READ_ONLY: { label: "Read-only", bg: "bg-indigo-500/15", text: "text-indigo-100" },
  MISSING: { label: "Missing metric", bg: "bg-rose-500/15", text: "text-rose-100" }
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
