import Link from "next/link";
import { ReactNode } from "react";

const NAV_ITEMS: Array<{ href: string; label: string; description: string }> = [
  { href: "/dashboard", label: "Dashboard", description: "What happened + what matters" },
  { href: "/explain", label: "Explain", description: "Why it happened (read-only)" },
  { href: "/recommend", label: "Recommend", description: "What to do next (read-only)" },
  { href: "/act", label: "Act", description: "Prepare actions + approvals (no execution)" },
  { href: "/learn", label: "Learn", description: "Outcomes + feedback" },
  { href: "/data", label: "Data & Integrations", description: "Coverage, freshness, limitations" }
];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-black text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex flex-col">
            <div className="text-sm font-semibold tracking-wide">Operator Command</div>
            <div className="text-[11px] text-zinc-400">Executive BI • read-first • approval-gated actions</div>
          </div>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-6 md:hidden">
          <div className="grid grid-cols-3 gap-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center text-[11px] font-semibold text-zinc-200 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6">{children}</main>

      <footer className="border-t border-white/10 bg-black/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-[11px] text-zinc-500 sm:px-6">
          Data is source-limited. Email + matchback + identity resolution not yet connected.
        </div>
      </footer>
    </div>
  );
}
