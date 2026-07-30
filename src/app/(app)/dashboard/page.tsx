import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const resolvedParams = (await searchParams) ?? {};
  const preset = typeof resolvedParams.range === "string" ? resolvedParams.range : undefined;
  const start = typeof resolvedParams.start === "string" ? resolvedParams.start : undefined;
  const end = typeof resolvedParams.end === "string" ? resolvedParams.end : undefined;
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end });
  const agents = [];

  // Avoid leaking forbidden strings or raw timestamps into the HTML/RSC payload.
  const sanitizedOverview = sanitizeDashboardPayloadForHtml(overview);
  const sanitizedAgents = agents.map((agent) => sanitizeDashboardPayloadForHtml(agent));

  return <DashboardPageClient initialData={sanitizedOverview} agents={sanitizedAgents} />;
}
