import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { ExecutiveOpportunityDetailV1 } from "@/components/opportunity-intelligence/ExecutiveOpportunityDetailV1";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import type { ExecutiveCommandCenterOpportunityV1 } from "@/lib/executive-home/fixtures";
import { buildExecutiveOpportunityPortfolioV1 } from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExecutiveOpportunityDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const opportunityId = id?.trim();
  if (!opportunityId) notFound();

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
  const portfolio = buildExecutiveOpportunityPortfolioV1(overview.opportunityRadar?.topOpportunities ?? []);
  const item = portfolio.items.find((candidate) => candidate.id === opportunityId);

  if (!item) notFound();

  const opportunity: ExecutiveCommandCenterOpportunityV1 = {
    id: item.id,
    title: item.title,
    upside: item.supportedValue ?? "UNKNOWN",
    fit: item.prestigeScore ? `${item.prestigeScore} prestige fit` : "UNKNOWN",
    timing: item.timing ?? "UNKNOWN",
    effort: item.effortSignal === "NEXT_STEP_KNOWN" ? "Next step known" : "UNKNOWN",
    evidence: item.evidenceState,
    next_move: item.nextMove,
    detail_href: item.detailHref
  };

  const sanitizedOpportunity = sanitizeDashboardPayloadForHtml(opportunity);

  return <ExecutiveOpportunityDetailV1 opportunity={sanitizedOpportunity} generatedAt={overview.timestamp} />;
}
