type Props = {
  label: string;
  tone?: "zinc" | "emerald" | "amber" | "rose" | "sky";
  className?: string;
};

export function StatusChip({ label, tone = "zinc", className = "" }: Props) {
  const styles =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : tone === "amber"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
      : tone === "rose"
      ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
      : tone === "sky"
      ? "border-[var(--ui-accent)]/30 bg-sky-500/10 text-sky-100"
      : "border-white/12 bg-white/[0.03] text-zinc-100";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] backdrop-blur ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
