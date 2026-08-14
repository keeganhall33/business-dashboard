import "@/lib/server-only";

import type { WebsiteSnapshotV1 } from "@/lib/website-intelligence/public-read/contracts";
import { crawlWebsitePublicReadV1, type PublicReadFetchV1 } from "@/lib/website-intelligence/public-read/public-crawler-v1";

import type { WebsiteSnapshotReadonlyFixtureV1 } from "@/lib/dashboard/website-snapshot-readonly-fixture";
import type { WebsiteIntelligenceSummaryFixtureV1 } from "@/lib/dashboard/website-intelligence-summary-fixture";

export type DashboardWebsiteIntelV1 = {
  rootUrl: string | null;
  snapshot: WebsiteSnapshotV1 | null;
  snapshotCard: WebsiteSnapshotReadonlyFixtureV1;
  summary: WebsiteIntelligenceSummaryFixtureV1;
  availability: "AVAILABLE" | "UNAVAILABLE";
};

function configuredRootUrl(): string | null {
  // Repo/deployment configuration must provide the public site root URL.
  // We intentionally do NOT fall back to any authenticated/WordPress admin URL.
  const raw =
    process.env.PUBLIC_WEBSITE_ROOT_URL?.trim() ||
    process.env.NEXT_PUBLIC_WEBSITE_ROOT_URL?.trim() ||
    null;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // Force trailing slash determinism.
    if (!u.pathname) u.pathname = "/";
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

function emptyModel(rootUrl: string | null): DashboardWebsiteIntelV1 {
  return {
    rootUrl,
    snapshot: null,
    availability: "UNAVAILABLE",
    snapshotCard: {
      capturedAt: null,
      pageCount: null,
      changedPageCount: null,
      brokenLinkCount: null,
      missingAltCount: null,
      state: "UNKNOWN",
      readOnly: true,
      mutationDisabled: true
    },
    summary: {
      capturedAt: null,
      pageCount: null,
      brokenLinkCount: null,
      missingAltCount: null,
      state: "UNKNOWN",
      readOnly: true,
      mutationDisabled: true,
      topOpportunities: []
    }
  };
}

export async function getDashboardWebsiteIntelV1(input?: {
  fetchFn?: PublicReadFetchV1;
  nowFn?: () => number;
}): Promise<DashboardWebsiteIntelV1> {
  const rootUrl = configuredRootUrl();
  if (!rootUrl) return emptyModel(null);

  try {
    const snapshot = await crawlWebsitePublicReadV1({
      rootUrl,
      maxPages: 10,
      maxDepth: 1,
      maxConcurrency: 3,
      timeoutMs: 15_000,
      linkCheckMaxPerPage: 4,
      fetchFn: input?.fetchFn,
      nowFn: input?.nowFn
    });

    const state = snapshot.state ?? "UNKNOWN";

    return {
      rootUrl,
      snapshot,
      availability: "AVAILABLE",
      snapshotCard: {
        capturedAt: snapshot.capturedAt,
        pageCount: snapshot.totals?.pageCount ?? null,
        changedPageCount: snapshot.totals?.changedPageCount ?? null,
        brokenLinkCount: snapshot.totals?.brokenLinkCount ?? null,
        missingAltCount: snapshot.totals?.missingAltCount ?? null,
        state,
        readOnly: true,
        mutationDisabled: true
      },
      summary: {
        capturedAt: snapshot.capturedAt,
        pageCount: snapshot.totals?.pageCount ?? null,
        brokenLinkCount: snapshot.totals?.brokenLinkCount ?? null,
        missingAltCount: snapshot.totals?.missingAltCount ?? null,
        state,
        readOnly: true,
        mutationDisabled: true,
        // IMPORTANT: no fabricated opportunities in this slice.
        topOpportunities: []
      }
    };
  } catch {
    // Explicit UNKNOWN/UNAVAILABLE.
    return emptyModel(rootUrl);
  }
}

