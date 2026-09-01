import Link from "next/link";
import { ReactNode } from "react";
import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";

const NAV_ITEMS = EXECUTIVE_WORKSPACE_NAV_V1;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#f8f4ec] text-stone-950">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col">
            <Link href="/dashboard" className="text-sm font-semibold tracking-wide">Mission Control</Link>
            <div className="text-[11px] text-stone-500">Executive intelligence • evidence-aware • approval-gated actions</div>
          </div>
          <nav className="hidden items-center gap-2 overflow-x-auto lg:flex" aria-label="Primary workspaces">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.summary}
                className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
              >
                {item.short_label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-3 sm:px-6 lg:hidden lg:px-8">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.summary}
                className="whitespace-nowrap rounded-xl border border-stone-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
              >
                {item.short_label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>

      <footer className="border-t border-stone-200 bg-[#fffdf8]">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 text-[11px] text-stone-500 sm:px-6 lg:px-8">
          Intelligence is source-limited. Unknown, stale, and conflicted evidence should remain explicit.
        </div>
      </footer>
    </div>
  );
}
