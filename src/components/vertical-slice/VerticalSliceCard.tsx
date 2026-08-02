import { ReactNode } from "react";

export function VerticalSliceCard({ title, subtitle, children }: { title: string; subtitle?: string | null; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <header className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-400">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function Pill({ tone = "zinc", children }: { tone?: "zinc" | "emerald" | "amber" | "rose" | "sky"; children: ReactNode }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : tone === "amber"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : tone === "rose"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
          : tone === "sky"
            ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
            : "border-white/10 bg-white/5 text-zinc-200";

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function DefinitionRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-2 last:border-b-0">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200 text-right max-w-[65%]">{value}</div>
    </div>
  );
}
