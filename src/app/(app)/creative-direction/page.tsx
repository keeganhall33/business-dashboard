import { CreativeDirectionWorkspace } from "@/components/creative-direction/CreativeDirectionWorkspace";
import { CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1 } from "@/lib/creative-direction/dashboard-refresh-fixtures";
import { CREATIVE_CONCEPT_COMPARISON_FIXTURE_V1, CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1 } from "@/lib/creative-direction/visualization-fixtures";

export default function CreativeDirectionPage() {
  return (
    <CreativeDirectionWorkspace
      data={CREATIVE_DIRECTION_WORKSPACE_FIXTURE_V1}
      visualization={{
        request: CREATIVE_VISUALIZATION_REQUEST_FIXTURE_V1,
        comparison: CREATIVE_CONCEPT_COMPARISON_FIXTURE_V1
      }}
    />
  );
}
