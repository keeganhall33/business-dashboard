import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { getDashboardOverview } from "@/lib/api/dashboard";
import { sanitizeDashboardPayloadForHtml } from "@/lib/dashboard/sanitize-html";
import { buildExecutiveHomeFromDashboardOverviewV1 } from "@/lib/executive-home/live-adapter";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExecutiveHomePage({ searchParams }: PageProps) {
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
  const overview = await getDashboardOverview({ preset, startDate: start, endDate: end }, { baseUrl, cookie });
  const executiveHome = buildExecutiveHomeFromDashboardOverviewV1(overview);

  return (
    <ExecutiveHomeShell
      data={sanitizeDashboardPayloadForHtml(executiveHome.home)}
      decisionRoom={sanitizeDashboardPayloadForHtml(executiveHome.decisionRoom)}
    />
  );
}
