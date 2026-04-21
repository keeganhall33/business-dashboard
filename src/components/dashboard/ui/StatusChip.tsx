type Props = {
  label: string;
  tone?: "zinc" | "emerald" | "amber" | "rose" | "sky";
  className?: string;
};

export function StatusChip({ label, tone = "zinc", className = "" }: Props) {
  const styles =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : tone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : tone === "rose"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
      : tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
      : "border-zinc-700/60 bg-zinc-900/40 text-zinc-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${styles} ${className}`}
    >
      {label}
    </span>
  );
}

