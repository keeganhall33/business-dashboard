import { DashboardShell } from "@/components/dashboard/DashboardShell";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

// Visual smoke page for dashboard components.
// Safe to keep in repo; not linked from nav.

export const dynamic = "force-dynamic";

export default async function DevUiPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/overview`, { cache: "no-store" });
  const data = (await res.json()) as DashboardOverviewResponse;

  return (
    <main className="min-h-dvh bg-black px-4 py-10 text-white md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-500">Dev</div>
          <h1 className="mt-2 text-2xl font-semibold">Dashboard visual smoke</h1>
          <p className="mt-2 text-sm text-zinc-400">Pulls live /api/dashboard/overview and renders the full shell.</p>
        </div>

        <DashboardShell data={data} />
      </div>
    </main>
  );
}
