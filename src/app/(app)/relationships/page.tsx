import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { getExecutiveWorkspaceByHrefV1 } from "@/lib/executive-workspace/ia";

export default function RelationshipsPage() {
  return <ExecutiveWorkspacePage model={getExecutiveWorkspaceByHrefV1("/relationships")} />;
}
