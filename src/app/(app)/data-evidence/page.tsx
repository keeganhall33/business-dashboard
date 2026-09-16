import { ExecutiveDataEvidenceWorkspaceV1 } from "@/components/data-evidence/ExecutiveDataEvidenceWorkspaceV1";
import { buildUnavailableDataEvidenceViewV1 } from "@/lib/data-evidence/executive-data-evidence-v1";
import { loadExecutiveDataEvidenceViewV1 } from "@/lib/data-evidence/load-data-evidence-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DataEvidencePage() {
  let view;
  try {
    view = await loadExecutiveDataEvidenceViewV1();
  } catch {
    view = buildUnavailableDataEvidenceViewV1();
  }
  return <ExecutiveDataEvidenceWorkspaceV1 view={view} />;
}
