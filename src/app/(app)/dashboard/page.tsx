import { AutonomousGrowthBriefingV1 } from "@/components/executive-home/AutonomousGrowthBriefingV1";
import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { loadAutonomousGrowthLiveBriefingV1 } from "@/lib/executive-home/autonomous-growth-live-briefing-loader-v1";
import { loadExecutiveHomeV3 } from "@/lib/executive-home/executive-home-v3-loader";
import { buildExecutiveHomeFromDashboardOverviewV1 } from "@/lib/executive-home/live-adapter";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const EXECUTIVE_HOME_PORTFOLIO_MAX_AGE_MS = 36 * 60 * 60 * 1_000;

export default async function DashboardPage({ searchParams }: PageProps) {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const cookie = hdrs.get("cookie");

  // Derive origin from the incoming request for same-deployment SSR fetches.
  // Avoid using NEXT_PUBLIC_APP_URL here because it may be protected in preview.
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
  const now = new Date().toISOString();
  const [overview, chiefOfStaffBriefing] = await Promise.all([
    getDashboardOverview({ preset, startDate: start, endDate: end }, { baseUrl, cookie }),
    loadAutonomousGrowthLiveBriefingV1({
      now,
      maxAgeMs: EXECUTIVE_HOME_PORTFOLIO_MAX_AGE_MS,
      historyLimit: 6,
    }),
  ]);
  const executiveHome = await loadExecutiveHomeV3({
    overview,
    baseBuilder: buildExecutiveHomeFromDashboardOverviewV1
  });

  // Avoid leaking forbidden strings or raw timestamps into the HTML/RSC payload.
  const sanitizedHome = sanitizeDashboardPayloadForHtml(executiveHome.home);
  const sanitizedDecisionRoom = sanitizeDashboardPayloadForHtml(executiveHome.decisionRoom);
  const sanitizedChiefOfStaffBriefing = sanitizeDashboardPayloadForHtml(chiefOfStaffBriefing);

  return (
    <>
      <AutonomousGrowthBriefingV1 briefing={sanitizedChiefOfStaffBriefing} />
      <ExecutiveHomeShell data={sanitizedHome} decisionRoom={sanitizedDecisionRoom} reportingRange={overview.range} />
    </>
  );
}
