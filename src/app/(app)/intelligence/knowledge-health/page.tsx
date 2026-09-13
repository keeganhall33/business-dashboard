import { KnowledgeHealthPanelV1 } from "@/components/intelligence/KnowledgeHealthPanelV1";
import { buildKnowledgeHealthViewV1 } from "@/lib/intelligence/knowledge-compilation/knowledge-health-view-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function KnowledgeHealthPage() {
  const view = buildKnowledgeHealthViewV1({
    findings: null,
    unresolved_references: null,
    learning_items: null
  });

  return <KnowledgeHealthPanelV1 view={view} />;
}
