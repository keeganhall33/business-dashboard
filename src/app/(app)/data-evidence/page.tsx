import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { getExecutiveWorkspaceByHrefV1 } from "@/lib/executive-workspace/ia";

export default function DataEvidencePage() {
  return <ExecutiveWorkspacePage model={getExecutiveWorkspaceByHrefV1("/data-evidence")} />;
}
