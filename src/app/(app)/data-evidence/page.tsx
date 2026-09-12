import { ExecutiveDataEvidenceWorkspaceV1 } from "@/components/data-evidence/ExecutiveDataEvidenceWorkspaceV1";
import { getDashboardOverview } from "@/lib/api/dashboard";
import {
  buildExecutiveDataEvidenceViewV1,
  buildUnavailableDataEvidenceViewV1
} from "@/lib/data-evidence/executive-data-evidence-v1";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DataEvidencePage() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const cookie = hdrs.get("cookie");
  const baseUrl = (() => {
    if (!host) return "";
    if (!/^[A-Za-z0-9.:-]+$/.test(host)) return "";
    if (proto !== "http" && proto !== "https") return "";
    return `${proto}://${host}`;
  })();

  try {
    const overview = await getDashboardOverview({}, { baseUrl, cookie });
    return <ExecutiveDataEvidenceWorkspaceV1 view={buildExecutiveDataEvidenceViewV1(overview)} />;
  } catch {
    return <ExecutiveDataEvidenceWorkspaceV1 view={buildUnavailableDataEvidenceViewV1()} />;
  }
}
