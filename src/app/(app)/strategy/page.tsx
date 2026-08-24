import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { getExecutiveWorkspaceByHrefV1 } from "@/lib/executive-workspace/ia";

export default function StrategyPage() {
  return <ExecutiveWorkspacePage model={getExecutiveWorkspaceByHrefV1("/strategy")} />;
}
