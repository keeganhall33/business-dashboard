import { CreativeDirectionWorkspace } from "@/components/creative-direction/CreativeDirectionWorkspace";
import { CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1 } from "@/lib/creative-direction/dashboard-refresh-fixtures";

export default function CreativeDirectionPage() {
  return <CreativeDirectionWorkspace data={CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1} />;
}
