import { trustSnapshotFixtures } from "./fixtures";
import type { TrustSnapshotCardItem, TrustSnapshotInput, TrustSnapshotViewModel } from "./contracts";

function severityFor(input: TrustSnapshotInput): TrustSnapshotCardItem["dashboardSeverity"] {
  if (input.truthState === "CONFLICTED" || input.connectionStatus === "UNAVAILABLE") return "BLOCKED";
  if (
    input.truthState === "UNKNOWN" ||
    input.truthState === "STALE" ||
    input.truthState === "NEEDS_RESEARCH" ||
    input.connectionStatus === "DEGRADED" ||
    input.connectionStatus === "NOT_CONFIGURED"
  ) {
    return "WATCH";
  }
  return "OK";
}

export function toTrustSnapshotCardItem(input: TrustSnapshotInput): TrustSnapshotCardItem {
  return {
    SOURCE_ID: input.sourceId,
    SOURCE_CLASS: input.sourceClass,
    CONNECTION_STATUS: input.connectionStatus,
    FRESHNESS_STATE: input.freshnessState,
    LAST_UPDATED: input.lastUpdated,
    EVIDENCE_QUALITY: input.evidenceQuality,
    COVERAGE_STATE: input.coverageState,
    TRUTH_STATE: input.truthState,
    COVERAGE_GAP: input.coverageGap,
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: input.nextBestSourceOrResearchAction,
    provenance: {
      provenanceClass: input.provenanceClass,
      evidenceReferenceIds: input.evidenceReferenceIds
    },
    dashboardSeverity: severityFor(input),
    displayFlags: {
      isKnown: input.truthState === "KNOWN",
      isInferred: input.truthState === "INFERRED",
      isUnknown: input.truthState === "UNKNOWN",
      isStale: input.truthState === "STALE",
      isConflicted: input.truthState === "CONFLICTED",
      needsResearch: input.truthState === "NEEDS_RESEARCH" || input.coverageState === "GAP"
    },
    notes: input.notes
  };
}

export function buildTrustSnapshotViewModel(
  inputs: TrustSnapshotInput[] = trustSnapshotFixtures,
  generatedAt = "2026-08-17T17:00:00.000Z"
): TrustSnapshotViewModel {
  const items = inputs.map(toTrustSnapshotCardItem);
  const topCoverageGaps = items
    .filter((item) => item.COVERAGE_GAP)
    .map((item) => `${item.SOURCE_ID}: ${item.COVERAGE_GAP}`)
    .slice(0, 5);

  return {
    generatedAt,
    dataMode: "FIXTURE_BASELINE",
    summary: {
      totalSources: items.length,
      healthyCount: items.filter((item) => item.dashboardSeverity === "OK").length,
      staleCount: items.filter((item) => item.TRUTH_STATE === "STALE" || item.FRESHNESS_STATE === "STALE").length,
      unavailableCount: items.filter((item) => item.CONNECTION_STATUS === "UNAVAILABLE" || item.CONNECTION_STATUS === "NOT_CONFIGURED").length,
      conflictedCount: items.filter((item) => item.TRUTH_STATE === "CONFLICTED").length,
      unknownCount: items.filter((item) => item.TRUTH_STATE === "UNKNOWN" || item.EVIDENCE_QUALITY === "UNKNOWN").length,
      topCoverageGaps
    },
    items
  };
}
