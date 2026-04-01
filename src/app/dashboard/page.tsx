import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getAgentDashboard, getDashboardOverview } from "@/lib/api/dashboard";
import { agentKeys } from "@/lib/types/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const preset = typeof searchParams?.range === "string" ? searchParams.range : undefined;
  const start = typeof searchParams?.start === "string" ? searchParams.start : undefined;
  const end = typeof searchParams?.end === "string" ? searchParams.end : undefined;
  const [overview, agents] = await Promise.all([
    getDashboardOverview({ preset, startDate: start, endDate: end }),
    Promise.all(agentKeys.map((key) => getAgentDashboard(key)))
  ]);
  return <DashboardShell data={overview} agents={agents} />;
}
