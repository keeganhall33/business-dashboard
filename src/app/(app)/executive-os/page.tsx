import { ResponsiveExecutiveShell } from "@/components/intelligence-ux/ResponsiveExecutiveShell";
import { INTELLIGENCE_UX_SHELL_FIXTURE_V1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

export default function ExecutiveOsPage() {
  return <ResponsiveExecutiveShell data={INTELLIGENCE_UX_SHELL_FIXTURE_V1} />;
}
