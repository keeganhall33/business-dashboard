import {
  IONOS_INTELLIGENT_INBOX_WORKSPACE_FIXTURE_V1,
  IonosIntelligentInboxV1
} from "@/components/email/IonosIntelligentInboxV1";
import { ExecutiveWorkspacePage } from "@/components/executive-workspace/ExecutiveWorkspacePage";
import { getExecutiveWorkspaceByHrefV1 } from "@/lib/executive-workspace/ia";

export default function RelationshipsPage() {
  return (
    <>
      <ExecutiveWorkspacePage model={getExecutiveWorkspaceByHrefV1("/relationships")} />
      <IonosIntelligentInboxV1 inbox={IONOS_INTELLIGENT_INBOX_WORKSPACE_FIXTURE_V1} />
    </>
  );
}
