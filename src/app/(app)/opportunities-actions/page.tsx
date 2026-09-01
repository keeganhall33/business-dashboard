import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { getExecutiveWorkspaceByHrefV1 } from "@/lib/executive-workspace/ia";

export default function OpportunitiesActionsPage() {
  return <ExecutiveWorkspacePage model={getExecutiveWorkspaceByHrefV1("/opportunities-actions")} />;
}
