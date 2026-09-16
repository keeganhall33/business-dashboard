import Link from "next/link";
import Image from "next/image";
import { ReactNode, Suspense } from "react";
import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";
import { RangeAwareLink } from "@/components/navigation/RangeAwareLink";

const NAV_ITEMS = EXECUTIVE_WORKSPACE_NAV_V1;
const PRIMARY_NAV_IDS = new Set(["EXECUTIVE_HOME", "ASK_JEEVES", "OPPORTUNITIES_ACTIONS", "RELATIONSHIPS_CRM"]);
const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => PRIMARY_NAV_IDS.has(item.id));
const DATA_STATUS_ITEM = NAV_ITEMS.find((item) => item.id === "DATA_EVIDENCE");

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" aria-label="Keegan Hall dashboard" className="shrink-0">
            <Image
              src="/keegan-hall-signature-v3.png"
              alt="Keegan Hall"
              width={176}
              height={56}
              priority
              unoptimized
              className="h-10 w-auto sm:h-11"
            />
          </Link>
          <nav className="hidden items-center gap-2 overflow-x-auto lg:flex" aria-label="Primary workspaces">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Suspense key={item.href} fallback={<Link href={item.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">{item.short_label}</Link>}>
                <RangeAwareLink href={item.href} title={item.summary} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                  {item.short_label}
                </RangeAwareLink>
              </Suspense>
            ))}
            {DATA_STATUS_ITEM ? <Suspense fallback={<Link href={DATA_STATUS_ITEM.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">Data status</Link>}><RangeAwareLink href={DATA_STATUS_ITEM.href} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50">Data status</RangeAwareLink></Suspense> : null}
          </nav>
        </div>
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-3 sm:px-6 lg:hidden lg:px-8">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Suspense key={item.href} fallback={<Link href={item.href} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm">{item.short_label}</Link>}>
                <RangeAwareLink href={item.href} title={item.summary} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                  {item.short_label}
                </RangeAwareLink>
              </Suspense>
            ))}
            {DATA_STATUS_ITEM ? <Suspense fallback={<Link href={DATA_STATUS_ITEM.href} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm">Data status</Link>}><RangeAwareLink href={DATA_STATUS_ITEM.href} className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50">Data status</RangeAwareLink></Suspense> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">{children}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 text-[11px] text-slate-500 sm:px-6 lg:px-8">
          Intelligence is source-limited. Unknown, stale, and conflicted evidence should remain explicit.
        </div>
      </footer>
    </div>
  );
}
