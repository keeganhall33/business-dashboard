import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDashboardOverview } from "@/lib/api/dashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const preset = typeof searchParams?.range === "string" ? searchParams.range : undefined;
  const start = typeof searchParams?.start === "string" ? searchParams.start : undefined;
  const end = typeof searchParams?.end === "string" ? searchParams.end : undefined;
  const data = await getDashboardOverview({ preset, startDate: start, endDate: end });
  return <DashboardShell data={data} />;
}
