type RangeDescriptor = {
  value: string;
  description?: string;
};

export function DecisionRangePanel({
  primary,
  momentum,
  comparison,
  snapshot
}: {
  primary: RangeDescriptor;
  momentum: RangeDescriptor;
  comparison: RangeDescriptor;
  snapshot: RangeDescriptor;
}) {
  const items = [
    { title: "Primary range", ...primary },
    { title: "Momentum range", ...momentum },
    { title: "Comparison range", ...comparison },
    { title: "Latest snapshot", ...snapshot }
  ];

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-300">
      <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Decision range</div>
      <p className="text-sm text-zinc-400">All metrics and recommendations reference these windows unless noted.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{item.title}</p>
            <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
            {item.description ? <p className="text-xs text-zinc-400">{item.description}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
