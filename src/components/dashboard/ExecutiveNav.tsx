"use client";

import { useEffect, useMemo, useState } from "react";

type NavItem = { id: string; label: string };

export function ExecutiveNav({ items }: { items: NavItem[] }) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const [activeId, setActiveId] = useState<string>(() => ids[0] ?? "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        const top = visible[0];
        const next = top?.target?.id;
        if (next) setActiveId(next);
      },
      {
        // Favor sections as they approach the top of the viewport.
        root: null,
        rootMargin: "-25% 0px -65% 0px",
        threshold: [0.1, 0.2, 0.4]
      }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav className="sticky top-2 z-20 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? "page" : undefined}
              className={
                "rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.06em] transition " +
                (isActive
                  ? "border-white/20 bg-white/[0.08] text-white"
                  : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]")
              }
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
