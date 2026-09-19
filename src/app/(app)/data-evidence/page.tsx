import { ExecutiveDataEvidenceWorkspaceV1 } from "@/components/data-evidence/ExecutiveDataEvidenceWorkspaceV1";
import { buildUnavailableDataEvidenceViewV1 } from "@/lib/data-evidence/executive-data-evidence-v1";
import { loadExecutiveDataEvidenceViewV1 } from "@/lib/data-evidence/load-data-evidence-v1";
import {
  buildUnavailableSocialConnectorHealthSurfaceV1,
  loadSocialConnectorHealthSurfaceV1
} from "@/lib/social-intelligence/load-social-connector-health-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DataEvidencePage() {
  const [viewResult, socialResult] = await Promise.allSettled([
    loadExecutiveDataEvidenceViewV1(),
    loadSocialConnectorHealthSurfaceV1()
  ]);
  const view = viewResult.status === "fulfilled" ? viewResult.value : buildUnavailableDataEvidenceViewV1();
  const socialConnectorHealth = socialResult.status === "fulfilled"
    ? socialResult.value
    : buildUnavailableSocialConnectorHealthSurfaceV1();
  return <ExecutiveDataEvidenceWorkspaceV1 view={view} socialConnectorHealth={socialConnectorHealth} />;
}
