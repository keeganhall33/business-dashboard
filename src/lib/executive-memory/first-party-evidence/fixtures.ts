import { buildFirstPartyBusinessMemoryEvidenceRecordsV1, buildFirstPartyBusinessMemoryEvidenceViewModelV1 } from "./adapter";
import type { FirstPartyBusinessHistoryInputV1 } from "./contracts";

function provenance(input: {
  kind: FirstPartyBusinessHistoryInputV1["provenance"]["kind"];
  actor: FirstPartyBusinessHistoryInputV1["provenance"]["actor"];
  source_label: string;
}): FirstPartyBusinessHistoryInputV1["provenance"] {
  return {
    ...input,
    authorized_read_only: true,
    private_source_connected: false,
    durable_write_allowed: false
  };
}

const FIRST_PARTY_BUSINESS_HISTORY_INPUTS_UNSORTED_V1 = [
  {
    source_record_id: "note-collector-intent-2026-07-12",
    source_type: "NOTE",
    source_label: "Collector preview note",
    source_timestamp: "2026-07-12T18:00:00.000Z",
    effective_timestamp: "2026-07-12T18:00:00.000Z",
    entity_links: ["collector-segment-premium-sports"],
    project_links: ["private-collector-room"],
    decision_links: ["decision-private-collector-room"],
    summary: "Qualified collector feedback favored scarce graphite-led work and private validation.",
    observed_value: "Private validation produced useful buyer signal.",
    truth_state: "KNOWN",
    freshness_state: "FRESH",
    evidence_quality: "HIGH",
    provenance: provenance({ kind: "SYSTEM_OBSERVED", actor: "JEEVES_FIXTURE", source_label: "Read-only fixture note import" }),
    supersedes_record_ids: [],
    correction_reason: null
  },
  {
    source_record_id: "event-access-route-2026-06-01",
    source_type: "EVENT",
    source_label: "Old event access assumption",
    source_timestamp: "2026-06-01T12:00:00.000Z",
    effective_timestamp: "2026-06-01T12:00:00.000Z",
    entity_links: ["event-host-unknown"],
    project_links: ["private-collector-room"],
    decision_links: ["decision-private-collector-room"],
    summary: "Older event note suggested a host route might exist, but the route has not been revalidated.",
    observed_value: null,
    truth_state: "STALE",
    freshness_state: "STALE",
    evidence_quality: "LOW",
    provenance: provenance({ kind: "FIXTURE_IMPORT", actor: "JEEVES_FIXTURE", source_label: "Read-only historical event fixture" }),
    supersedes_record_ids: [],
    correction_reason: null
  },
  {
    source_record_id: "project-economics-unknown-2026-08-01",
    source_type: "PROJECT",
    source_label: "Private room economics gap",
    source_timestamp: "2026-08-01T09:00:00.000Z",
    effective_timestamp: "2026-08-01T09:00:00.000Z",
    entity_links: ["venue-cost", "sponsor-coverage"],
    project_links: ["private-collector-room"],
    decision_links: ["decision-private-collector-room"],
    summary: "Venue, sponsor, travel, and conversion economics are not known from available fixture records.",
    observed_value: null,
    truth_state: "UNKNOWN",
    freshness_state: "UNKNOWN",
    evidence_quality: "UNKNOWN",
    provenance: provenance({ kind: "SYSTEM_OBSERVED", actor: "JEEVES_FIXTURE", source_label: "Read-only project fixture" }),
    supersedes_record_ids: [],
    correction_reason: null
  },
  {
    source_record_id: "communication-host-intro-2026-08-20",
    source_type: "COMMUNICATION",
    source_label: "Host intro reported",
    source_timestamp: "2026-08-20T12:00:00.000Z",
    effective_timestamp: "2026-08-20T12:00:00.000Z",
    entity_links: ["collector-intro", "event-host"],
    project_links: ["private-collector-room"],
    decision_links: ["decision-private-collector-room"],
    summary: "Keegan reported a confirmed warm intro to the host through a collector.",
    observed_value: "Warm intro reported as host access.",
    truth_state: "KNOWN",
    freshness_state: "FRESH",
    evidence_quality: "MEDIUM",
    provenance: provenance({ kind: "HUMAN_REPORTED", actor: "KEEGAN", source_label: "Human-reported fixture input" }),
    supersedes_record_ids: [],
    correction_reason: null
  },
  {
    source_record_id: "communication-host-intro-correction-2026-08-21",
    source_type: "COMMUNICATION",
    source_label: "Host intro correction",
    source_timestamp: "2026-08-21T12:00:00.000Z",
    effective_timestamp: "2026-08-20T12:00:00.000Z",
    entity_links: ["collector-intro", "event-staff"],
    project_links: ["private-collector-room"],
    decision_links: ["decision-private-collector-room"],
    summary: "Correction: the intro reaches staff, not the host or sponsor decision-maker.",
    observed_value: "Decision-maker access is conflicted.",
    truth_state: "CONFLICTED",
    freshness_state: "FRESH",
    evidence_quality: "CONFLICTED",
    provenance: provenance({ kind: "HUMAN_CORRECTION", actor: "KEEGAN", source_label: "Human correction fixture input" }),
    supersedes_record_ids: ["communication-host-intro-2026-08-20"],
    correction_reason: "Newer correction narrows the access claim and marks decision-maker reach conflicted."
  },
  {
    source_record_id: "precedent-private-preview-qualified-access-success",
    source_type: "DECISION_PRECEDENT",
    source_label: "Prior private preview precedent",
    source_timestamp: "2026-07-12T00:00:00.000Z",
    effective_timestamp: "2026-07-12T00:00:00.000Z",
    entity_links: ["collector-segment-premium-sports"],
    project_links: ["private-preview"],
    decision_links: ["decision-private-collector-room"],
    summary: "A prior bounded private validation can inform this decision but cannot become a binding rule.",
    observed_value: "Successful prior pattern, context-dependent.",
    truth_state: "INFERRED",
    freshness_state: "FRESH",
    evidence_quality: "HIGH",
    provenance: provenance({ kind: "FIXTURE_IMPORT", actor: "JEEVES_FIXTURE", source_label: "Executive memory precedent fixture" }),
    supersedes_record_ids: [],
    correction_reason: null
  }
] satisfies FirstPartyBusinessHistoryInputV1[];

export const FIRST_PARTY_BUSINESS_HISTORY_INPUT_FIXTURES_V1: FirstPartyBusinessHistoryInputV1[] =
  [...FIRST_PARTY_BUSINESS_HISTORY_INPUTS_UNSORTED_V1].sort((a, b) => a.source_record_id.localeCompare(b.source_record_id));

export const FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1 =
  buildFirstPartyBusinessMemoryEvidenceRecordsV1(FIRST_PARTY_BUSINESS_HISTORY_INPUT_FIXTURES_V1);

export const FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_MODEL_FIXTURE_V1 =
  buildFirstPartyBusinessMemoryEvidenceViewModelV1({
    records: FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_RECORD_FIXTURES_V1,
    decisionId: "decision-private-collector-room"
  });
