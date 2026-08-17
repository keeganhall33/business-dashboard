import type { EvidenceReference } from "@/lib/external-intelligence/contracts/evidence-reference";

export type TrustSnapshotSourceClass =
  | "FIRST_PARTY_COMMERCE"
  | "FIRST_PARTY_ANALYTICS"
  | "PAID_MEDIA_PLATFORM"
  | "EXTERNAL_MARKET_RESEARCH"
  | "MANUAL_RESEARCH"
  | "SCHEDULER_TELEMETRY";

export type TrustSnapshotConnectionStatus = "CONNECTED" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";
export type TrustSnapshotFreshnessState = "FRESH" | "STALE" | "UNKNOWN";
export type TrustSnapshotEvidenceQuality = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "CONFLICTED";
export type TrustSnapshotCoverageState = "COMPLETE" | "PARTIAL" | "GAP" | "UNKNOWN" | "CONFLICTED";
export type TrustSnapshotTruthState = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "NEEDS_RESEARCH";

export type TrustSnapshotInput = {
  sourceId: string;
  sourceClass: TrustSnapshotSourceClass;
  connectionStatus: TrustSnapshotConnectionStatus;
  freshnessState: TrustSnapshotFreshnessState;
  lastUpdated: string | null;
  evidenceQuality: TrustSnapshotEvidenceQuality;
  coverageState: TrustSnapshotCoverageState;
  truthState: TrustSnapshotTruthState;
  coverageGap: string | null;
  nextBestSourceOrResearchAction: string;
  provenanceClass: EvidenceReference["access_classification"] | "first_party" | "manual_fixture";
  evidenceReferenceIds: string[];
  notes: string[];
};

export type TrustSnapshotCardItem = {
  SOURCE_ID: string;
  SOURCE_CLASS: TrustSnapshotSourceClass;
  CONNECTION_STATUS: TrustSnapshotConnectionStatus;
  FRESHNESS_STATE: TrustSnapshotFreshnessState;
  LAST_UPDATED: string | null;
  EVIDENCE_QUALITY: TrustSnapshotEvidenceQuality;
  COVERAGE_STATE: TrustSnapshotCoverageState;
  TRUTH_STATE: TrustSnapshotTruthState;
  COVERAGE_GAP: string | null;
  NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: string;
  provenance: {
    provenanceClass: TrustSnapshotInput["provenanceClass"];
    evidenceReferenceIds: string[];
  };
  dashboardSeverity: "OK" | "WATCH" | "BLOCKED";
  displayFlags: {
    isKnown: boolean;
    isInferred: boolean;
    isUnknown: boolean;
    isStale: boolean;
    isConflicted: boolean;
    needsResearch: boolean;
  };
  notes: string[];
};

export type TrustSnapshotViewModel = {
  generatedAt: string;
  dataMode: "FIXTURE_BASELINE";
  summary: {
    totalSources: number;
    healthyCount: number;
    staleCount: number;
    unavailableCount: number;
    conflictedCount: number;
    unknownCount: number;
    topCoverageGaps: string[];
  };
  items: TrustSnapshotCardItem[];
};
