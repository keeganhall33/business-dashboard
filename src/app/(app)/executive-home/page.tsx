import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";

export default function ExecutiveHomePage() {
  return <ExecutiveHomeShell data={EXECUTIVE_HOME_FIXTURE_V1} />;
}
