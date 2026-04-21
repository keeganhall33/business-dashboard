type Props = {
  title: string;
  detail?: string;
};

export function EmptyState({ title, detail }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-600">{title}</div>
      {detail ? <p className="mt-2 text-sm text-zinc-400">{detail}</p> : null}
    </div>
  );
}

