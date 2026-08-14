import type { WebsiteSnapshotV1 } from "../public-read/contracts";
import {
  PERFORMANCE_OPPORTUNITY_VERSION_V1,
  type PerformanceOpportunityV1,
  WEBSITE_PERFORMANCE_SNAPSHOT_VERSION_V1,
  type WebsitePerformanceSnapshotV1
} from "./contracts";

function uniqLimit(values: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export function toWebsitePerformanceSnapshotV1(input: WebsiteSnapshotV1): WebsitePerformanceSnapshotV1 {
  const exampleBroken = uniqLimit(
    (input.pages ?? []).flatMap((p) => (p.brokenInternalLinks ?? []).slice(0, 2)),
    6
  );
  const exampleMissingAltPages = uniqLimit(
    (input.pages ?? [])
      .filter((p) => (p.imageRefs ?? []).some((img) => img.missingAlt))
      .map((p) => p.url),
    6
  );

  // Duplicates are only present as totals in WebsiteSnapshotV1; we do not fabricate per-page evidence.
  const state = input.state ?? "UNKNOWN";

  return {
    v: WEBSITE_PERFORMANCE_SNAPSHOT_VERSION_V1,
    capturedAt: input.capturedAt,
    rootUrl: input.rootUrl,
    state,
    signals: {
      brokenInternalLinks: {
        count: typeof input.totals?.brokenLinkCount === "number" ? input.totals.brokenLinkCount : null,
        exampleUrls: exampleBroken
      },
      missingAlt: {
        count: typeof input.totals?.missingAltCount === "number" ? input.totals.missingAltCount : null,
        examplePageUrls: exampleMissingAltPages
      },
      duplicateTitles: {
        count: typeof input.totals?.duplicateTitleCount === "number" ? input.totals.duplicateTitleCount : null,
        examplePageUrls: []
      },
      duplicateMetaDescriptions: {
        count:
          typeof input.totals?.duplicateMetaDescriptionCount === "number"
            ? input.totals.duplicateMetaDescriptionCount
            : null,
        examplePageUrls: []
      }
    }
  };
}

function scoreOpportunity(severity: PerformanceOpportunityV1["severity"], count: number | null): number {
  const sev = severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1;
  const magnitude = typeof count === "number" ? Math.min(1000, count) : 0;
  return sev * 10_000 + magnitude;
}

export function classifyPerformanceOpportunitiesV1(snapshot: WebsitePerformanceSnapshotV1): PerformanceOpportunityV1[] {
  const unknown = snapshot.state !== "OK";

  const candidates: PerformanceOpportunityV1[] = [
    {
      v: PERFORMANCE_OPPORTUNITY_VERSION_V1,
      id: "broken-internal-links",
      kind: "BROKEN_INTERNAL_LINKS",
      title: "Fix broken internal links",
      severity: "HIGH",
      signalState: unknown || snapshot.signals.brokenInternalLinks.count == null ? "UNKNOWN" : "KNOWN",
      count: snapshot.signals.brokenInternalLinks.count,
      details: {
        exampleUrls: snapshot.signals.brokenInternalLinks.exampleUrls,
        notes: ["Read-only snapshot signals only; no live checks were run."]
      }
    },
    {
      v: PERFORMANCE_OPPORTUNITY_VERSION_V1,
      id: "missing-alt-text",
      kind: "MISSING_ALT_TEXT",
      title: "Add missing image alt text",
      severity: "MEDIUM",
      signalState: unknown || snapshot.signals.missingAlt.count == null ? "UNKNOWN" : "KNOWN",
      count: snapshot.signals.missingAlt.count,
      details: {
        exampleUrls: snapshot.signals.missingAlt.examplePageUrls,
        notes: ["Read-only snapshot signals only; no live checks were run."]
      }
    },
    {
      v: PERFORMANCE_OPPORTUNITY_VERSION_V1,
      id: "duplicate-titles",
      kind: "DUPLICATE_TITLES",
      title: "Reduce duplicate page titles",
      severity: "LOW",
      signalState: unknown || snapshot.signals.duplicateTitles.count == null ? "UNKNOWN" : "KNOWN",
      count: snapshot.signals.duplicateTitles.count,
      details: {
        exampleUrls: snapshot.signals.duplicateTitles.examplePageUrls,
        notes: ["Read-only snapshot signals only; no live checks were run."]
      }
    },
    {
      v: PERFORMANCE_OPPORTUNITY_VERSION_V1,
      id: "duplicate-meta-descriptions",
      kind: "DUPLICATE_META_DESCRIPTIONS",
      title: "Reduce duplicate meta descriptions",
      severity: "LOW",
      signalState: unknown || snapshot.signals.duplicateMetaDescriptions.count == null ? "UNKNOWN" : "KNOWN",
      count: snapshot.signals.duplicateMetaDescriptions.count,
      details: {
        exampleUrls: snapshot.signals.duplicateMetaDescriptions.examplePageUrls,
        notes: ["Read-only snapshot signals only; no live checks were run."]
      }
    }
  ];

  // Keep only actionable positives when signals are known; preserve UNKNOWN by keeping unknown entries.
  const filtered = candidates.filter((c) => {
    if (c.signalState === "UNKNOWN") return true;
    return typeof c.count === "number" && c.count > 0;
  });

  filtered.sort((a, b) => scoreOpportunity(b.severity, b.count) - scoreOpportunity(a.severity, a.count));
  return filtered.slice(0, 3);
}

