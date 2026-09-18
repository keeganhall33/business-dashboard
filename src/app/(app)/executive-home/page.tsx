import { redirect } from "next/navigation";

import {
  buildCanonicalExecutiveHomeHrefV1,
  type ExecutiveHomeLegacySearchParamsV1
} from "@/lib/executive-home/canonical-route-v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<ExecutiveHomeLegacySearchParamsV1>;
};

/**
 * `/dashboard` is the only authoritative Executive Home surface.
 *
 * Keep this legacy route as a compatibility alias so bookmarks cannot land on
 * the retired dashboard-overview projection, which bypassed canonical V3 truth
 * guards and rendered a hard-coded unavailable IONOS attention card.
 */
export default async function ExecutiveHomePage({ searchParams }: PageProps) {
  const resolvedParams = (await searchParams) ?? {};
  redirect(buildCanonicalExecutiveHomeHrefV1(resolvedParams));
}
