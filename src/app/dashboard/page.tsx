import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDashboardOverview } from "@/lib/api/dashboard";

export default async function DashboardPage() {
  const data = await getDashboardOverview();
  return <DashboardShell data={data} />;
}

