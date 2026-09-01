import { ActionWorkspacePanel } from "@/components/action-workspace/ActionWorkspacePanel";
import { ACTION_WORKSPACE_FIXTURE_V1 } from "@/lib/action-workspace/fixtures";

export default function ActionWorkspacePage() {
  return <ActionWorkspacePanel workspace={ACTION_WORKSPACE_FIXTURE_V1} />;
}
