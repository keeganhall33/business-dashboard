import { Suspense } from "react";
import { headers } from "next/headers";

import { ExecutiveOpportunityPortfolioV1 } from "@/components/opportunity-intelligence/ExecutiveOpportunityPortfolioV1";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { buildExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function OpportunitiesActionsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<OpportunityPortfolioLoadingV1 />}>
      <LiveOpportunitiesActionsPage searchParams={searchParams} />
    </Suspense>
  );
}

async function LiveOpportunitiesActionsPage({ searchParams }: PageProps) {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const cookie = hdrs.get("cookie");
  const baseUrl = (() => {
    if (!host) return "";
    if (!/^[A-Za-z0-9.:-]+$/.test(host)) return "";
    if (proto !== "http" && proto !== "https") return "";
    return `${proto}://${host}`;
  })();

  const resolvedParams = (await searchParams) ?? {};
  const preset = typeof resolvedParams.range === "string" ? resolvedParams.range : undefined;
  const start = typeof resolvedParams.start === "string" ? resolvedParams.start : undefined;
  const end = typeof resolvedParams.end === "string" ? resolvedParams.end : undefined;

  const overview = await getDashboardOverview(
    { preset, startDate: start, endDate: end },
    { baseUrl, cookie }
  );
  const portfolio = sanitizeDashboardPayloadForHtml(
    buildExecutiveOpportunityPortfolioV1(overview.opportunityRadar?.topOpportunities ?? [])
  );

  return <ExecutiveOpportunityPortfolioV1 portfolio={portfolio} />;
}

function OpportunityPortfolioLoadingV1() {
  return (
    <main
      className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 lg:px-8"
      data-visual-mode="light"
      aria-label="Opportunities loading shell"
    >
      <div className="mx-auto max-w-[1600px]">
        <header className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-5 shadow-sm md:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Mission Control · Opportunities</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Opportunities</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Choose the right work before the window closes.</p>
        </header>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-3">
            <p className="text-sm font-semibold text-stone-950">Loading canonical opportunity evidence</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">Current opportunity records are being resolved from the dashboard overview. No planning fixtures are substituted.</p>
            <details className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-stone-800">Evidence loading detail</summary>
              <p className="mt-2 text-sm leading-6 text-stone-600">UNKNOWN, STALE, and CONFLICTED evidence will remain explicit when the live portfolio loads.</p>
            </details>
          </section>
        </div>
      </div>
    </main>
  );
}
