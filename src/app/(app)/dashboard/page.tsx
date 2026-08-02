import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end }, { baseUrl, cookie });
  const agents: AgentDashboardResponse[] = [];

  // Avoid leaking forbidden strings or raw timestamps into the HTML/RSC payload.
  const sanitizedOverview = sanitizeDashboardPayloadForHtml(overview);
  const sanitizedAgents = agents.map((agent) => sanitizeDashboardPayloadForHtml(agent));

  return <DashboardPageClient initialData={sanitizedOverview} agents={sanitizedAgents} />;
}
