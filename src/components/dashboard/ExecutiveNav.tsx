type NavItem = { id: string; label: string };

export function ExecutiveNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="sticky top-2 z-20 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 backdrop-blur">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-300">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 hover:bg-white/[0.06]"
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
