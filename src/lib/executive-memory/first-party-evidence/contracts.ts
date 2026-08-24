import type {
  TrustSnapshotEvidenceQuality,
  TrustSnapshotFreshnessState,
  TrustSnapshotTruthState
} from "@/lib/data-evidence-trust-snapshot/contracts";
import type { DecisionPrecedentMatchV1 } from "@/lib/executive-memory/contracts";

export const FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VERSION_V1 = "first_party_business_memory_evidence_v1.0" as const;
export const FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_VERSION_V1 = "first_party_business_memory_evidence_view_v1.0" as const;

export type FirstPartyBusinessHistorySourceTypeV1 = "COMMUNICATION" | "EVENT" | "NOTE" | "ORDER" | "PROJECT" | "DECISION_PRECEDENT";
export type FirstPartyBusinessMemoryProvenanceKindV1 = "SYSTEM_OBSERVED" | "HUMAN_REPORTED" | "HUMAN_CORRECTION" | "FIXTURE_IMPORT";
export type FirstPartyBusinessMemoryLifecycleV1 = "ACTIVE" | "SUPERSEDED" | "HISTORICAL" | "PRECEDENT_ONLY";

export type FirstPartyBusinessHistoryInputV1 = {
  source_record_id: string;
  source_type: FirstPartyBusinessHistorySourceTypeV1;
  source_label: string;
  source_timestamp: string;
  effective_timestamp: string;
  entity_links: string[];
  project_links: string[];
  decision_links: string[];
  summary: string;
  observed_value: string | null;
  truth_state: TrustSnapshotTruthState;
  freshness_state: TrustSnapshotFreshnessState;
  evidence_quality: TrustSnapshotEvidenceQuality;
  provenance: {
    kind: FirstPartyBusinessMemoryProvenanceKindV1;
    actor: "SYSTEM" | "KEEGAN" | "JEEVES_FIXTURE";
    source_label: string;
    authorized_read_only: true;
    private_source_connected: false;
    durable_write_allowed: false;
  };
  supersedes_record_ids: string[];
  correction_reason: string | null;
};

export type FirstPartyBusinessMemoryEvidenceRecordV1 = {
  contract_version: typeof FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VERSION_V1;
  evidence_id: string;
  source_record_id: string;
  source_type: FirstPartyBusinessHistorySourceTypeV1;
  source_label: string;
  source_timestamp: string;
  effective_timestamp: string;
  entity_links: string[];
  project_links: string[];
  decision_links: string[];
  summary: string;
  observed_value: string | null;
  truth_state: TrustSnapshotTruthState;
  freshness_state: TrustSnapshotFreshnessState;
  evidence_quality: TrustSnapshotEvidenceQuality;
  provenance: FirstPartyBusinessHistoryInputV1["provenance"];
  lifecycle: FirstPartyBusinessMemoryLifecycleV1;
  supersedes_evidence_ids: string[];
  superseded_by_evidence_id: string | null;
  correction_reason: string | null;
};

export type FirstPartyBusinessMemoryEvidenceViewModelV1 = {
  view_version: typeof FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_VERSION_V1;
  generated_at: string;
  source_mode: "DETERMINISTIC_FIXTURE";
  records: FirstPartyBusinessMemoryEvidenceRecordV1[];
  decision_room_packet: {
    decision_id: string;
    evidence_rows: Array<{
      evidence_id: string;
      label: string;
      source_type: FirstPartyBusinessHistorySourceTypeV1;
      state: TrustSnapshotTruthState | TrustSnapshotFreshnessState | TrustSnapshotEvidenceQuality;
      detail: string;
      provenance_kind: FirstPartyBusinessMemoryProvenanceKindV1;
      source_timestamp: string;
      effective_timestamp: string;
    }>;
    prior_decision_precedent: {
      precedent_id: string;
      relevance: DecisionPrecedentMatchV1["PRECEDENT_RELEVANCE"];
      lesson: string;
      can_inform_current_decision: boolean;
      can_become_binding_rule: false;
    } | null;
  };
  supersession: {
    corrected_evidence_ids: string[];
    active_correction_ids: string[];
    prior_history_preserved: boolean;
  };
  dashboard_flags: {
    unknown_stale_conflicted_visible: boolean;
    unknown_cannot_be_zero_or_false: true;
    correction_preserves_history: boolean;
    no_private_source_connection: true;
    no_durable_write: true;
    keegan_action_required: "NO";
  };
};
