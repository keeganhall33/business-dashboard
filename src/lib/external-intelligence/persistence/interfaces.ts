import type {
  EvidenceReferenceRecord,
  EvidenceReferenceVersionRecord,
  ClaimRecord,
  ClaimVersionRecord,
  ExternalSignalRecord,
  ExternalSignalVersionRecord,
  ProvenanceEdgeRecord,
  LifecycleTransitionRecord,
  CorrectionRecord,
  SourceContributionRecord,
  ProcessingRunRecord
} from "@/lib/external-intelligence/persistence/records";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

export type EvidenceReferenceRepository = {
  upsertStable: (row: EvidenceReferenceRecord) => Promise<void>;
  upsertVersion: (row: EvidenceReferenceVersionRecord) => Promise<void>;
  fetchVersion: (ref: VersionRef) => Promise<EvidenceReferenceVersionRecord>;
  listVersions: (evidence_reference_id: string) => Promise<EvidenceReferenceVersionRecord[]>;
};

export type ClaimRepository = {
  upsertStable: (row: ClaimRecord) => Promise<void>;
  upsertVersion: (row: ClaimVersionRecord) => Promise<void>;
  fetchVersion: (ref: VersionRef) => Promise<ClaimVersionRecord>;
  listVersions: (claim_id: string) => Promise<ClaimVersionRecord[]>;
};

export type ExternalSignalRepository = {
  upsertStable: (row: ExternalSignalRecord) => Promise<void>;
  upsertVersion: (row: ExternalSignalVersionRecord) => Promise<void>;
  fetchVersion: (ref: VersionRef) => Promise<ExternalSignalVersionRecord>;
  listVersions: (signal_id: string) => Promise<ExternalSignalVersionRecord[]>;
};

export type ProvenanceRepository = {
  upsertEdge: (row: ProvenanceEdgeRecord) => Promise<void>;
  listEdgesFrom: (from_ref: VersionRef) => Promise<ProvenanceEdgeRecord[]>;
  listEdgesTo: (to_ref: VersionRef) => Promise<ProvenanceEdgeRecord[]>;
};

export type LifecycleRepository = {
  recordTransition: (row: LifecycleTransitionRecord) => Promise<void>;
  listTransitions: (object_ref: VersionRef) => Promise<LifecycleTransitionRecord[]>;
};

export type CorrectionRepository = {
  recordCorrection: (row: CorrectionRecord) => Promise<void>;
  listCorrections: (object_ref: VersionRef) => Promise<CorrectionRecord[]>;
};

export type SourceContributionRepository = {
  recordContribution: (row: SourceContributionRecord) => Promise<void>;
  listContributions: (target_ref: VersionRef) => Promise<SourceContributionRecord[]>;
};

export type ProcessingRunRepository = {
  upsertRun: (row: ProcessingRunRecord) => Promise<void>;
  fetchRun: (run_id: string) => Promise<ProcessingRunRecord>;
};

export type ExternalIntelligenceStore = {
  evidence: EvidenceReferenceRepository;
  claims: ClaimRepository;
  signals: ExternalSignalRepository;
  provenance: ProvenanceRepository;
  lifecycle: LifecycleRepository;
  corrections: CorrectionRepository;
  source_contributions: SourceContributionRepository;
  runs: ProcessingRunRepository;

  /**
   * Completeness invariant: verify that a write set is complete before it is exposed to downstream consumers.
   */
  verifyWriteSetComplete: (input: {
    expected_version_refs: VersionRef[];
    /** when provided, required provenance edges must exist (pins exact versions) */
    required_edges?: Array<{ from_ref: VersionRef; to_ref: VersionRef; relation: string; policy_version: string }>;
  }) => Promise<void>;
};
