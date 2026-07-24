type Props = {
  label: string;
  description?: string;
};

export function RangeBadge({ label, description }: Props) {
  return (
    <div className="inline-flex flex-col rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.35em] text-zinc-400">
      <span className="text-white/90">{label}</span>
      {description ? <span className="text-[10px] normal-case tracking-tight text-zinc-500">{description}</span> : null}
    </div>
  );
}
