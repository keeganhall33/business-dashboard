import { retrieveDecisionPrecedentsV1 } from "@/lib/executive-memory/retrieval";
import {
  FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VERSION_V1,
  FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_VERSION_V1,
  type FirstPartyBusinessHistoryInputV1,
  type FirstPartyBusinessMemoryEvidenceRecordV1,
  type FirstPartyBusinessMemoryEvidenceViewModelV1
} from "./contracts";

function evidenceIdFor(input: FirstPartyBusinessHistoryInputV1): string {
  return `first_party_memory:${input.source_type.toLowerCase()}:${input.source_record_id}`;
}

export function buildFirstPartyBusinessMemoryEvidenceRecordsV1(
  inputs: FirstPartyBusinessHistoryInputV1[]
): FirstPartyBusinessMemoryEvidenceRecordV1[] {
  const idBySourceRecord = new Map(inputs.map((input) => [input.source_record_id, evidenceIdFor(input)]));
  const supersededBy = new Map<string, string>();

  for (const input of inputs) {
    const correctionEvidenceId = evidenceIdFor(input);
    for (const supersededSourceRecordId of input.supersedes_record_ids) {
      const supersededEvidenceId = idBySourceRecord.get(supersededSourceRecordId);
      if (supersededEvidenceId) supersededBy.set(supersededEvidenceId, correctionEvidenceId);
    }
  }

  return inputs
    .map((input) => {
      const evidence_id = evidenceIdFor(input);
      const supersedes_evidence_ids = input.supersedes_record_ids
        .map((sourceRecordId) => idBySourceRecord.get(sourceRecordId))
        .filter((item): item is string => Boolean(item))
        .sort();
      const lifecycle =
        input.source_type === "DECISION_PRECEDENT"
          ? "PRECEDENT_ONLY"
          : supersededBy.has(evidence_id)
            ? "SUPERSEDED"
            : input.supersedes_record_ids.length > 0
              ? "ACTIVE"
              : "HISTORICAL";

      return {
        contract_version: FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VERSION_V1,
        evidence_id,
        source_record_id: input.source_record_id,
        source_type: input.source_type,
        source_label: input.source_label,
        source_timestamp: input.source_timestamp,
        effective_timestamp: input.effective_timestamp,
        entity_links: [...input.entity_links].sort(),
        project_links: [...input.project_links].sort(),
        decision_links: [...input.decision_links].sort(),
        summary: input.summary,
        observed_value: input.observed_value,
        truth_state: input.truth_state,
        freshness_state: input.freshness_state,
        evidence_quality: input.evidence_quality,
        provenance: { ...input.provenance },
        lifecycle,
        supersedes_evidence_ids,
        superseded_by_evidence_id: supersededBy.get(evidence_id) ?? null,
        correction_reason: input.correction_reason
      } satisfies FirstPartyBusinessMemoryEvidenceRecordV1;
    })
    .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

function stateFor(row: FirstPartyBusinessMemoryEvidenceRecordV1): FirstPartyBusinessMemoryEvidenceViewModelV1["decision_room_packet"]["evidence_rows"][number]["state"] {
  if (row.truth_state === "CONFLICTED" || row.evidence_quality === "CONFLICTED") return "CONFLICTED";
  if (row.truth_state === "STALE" || row.freshness_state === "STALE") return "STALE";
  if (row.truth_state === "UNKNOWN" || row.evidence_quality === "UNKNOWN") return "UNKNOWN";
  return row.truth_state;
}

export function buildFirstPartyBusinessMemoryEvidenceViewModelV1(input: {
  records: FirstPartyBusinessMemoryEvidenceRecordV1[];
  decisionId: string;
  generatedAt?: string;
}): FirstPartyBusinessMemoryEvidenceViewModelV1 {
  const retrieval = retrieveDecisionPrecedentsV1();
  const topPrecedent = retrieval.matches.find((match) => match.PRECEDENT_RELEVANCE !== "DO_NOT_USE") ?? null;
  const recordsForDecision = input.records.filter((record) => record.decision_links.includes(input.decisionId));
  const correctedEvidenceIds = input.records.filter((record) => record.superseded_by_evidence_id).map((record) => record.evidence_id).sort();
  const activeCorrectionIds = input.records.filter((record) => record.supersedes_evidence_ids.length > 0).map((record) => record.evidence_id).sort();
  const visibleStates = new Set(input.records.flatMap((record) => [record.truth_state, record.freshness_state, record.evidence_quality]));

  return {
    view_version: FIRST_PARTY_BUSINESS_MEMORY_EVIDENCE_VIEW_VERSION_V1,
    generated_at: input.generatedAt ?? "2026-08-23T00:00:00.000Z",
    source_mode: "DETERMINISTIC_FIXTURE",
    records: [...input.records].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)),
    decision_room_packet: {
      decision_id: input.decisionId,
      evidence_rows: recordsForDecision.map((record) => ({
        evidence_id: record.evidence_id,
        label: record.source_label,
        source_type: record.source_type,
        state: stateFor(record),
        detail: record.summary,
        provenance_kind: record.provenance.kind,
        source_timestamp: record.source_timestamp,
        effective_timestamp: record.effective_timestamp
      })).sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)),
      prior_decision_precedent: topPrecedent
        ? {
            precedent_id: topPrecedent.precedent.DECISION_ID,
            relevance: topPrecedent.PRECEDENT_RELEVANCE,
            lesson: topPrecedent.precedent.LESSON,
            can_inform_current_decision: topPrecedent.dashboard_flags.can_inform_current_decision,
            can_become_binding_rule: topPrecedent.dashboard_flags.can_become_preference_rule
          }
        : null
    },
    supersession: {
      corrected_evidence_ids: correctedEvidenceIds,
      active_correction_ids: activeCorrectionIds,
      prior_history_preserved: correctedEvidenceIds.length > 0 && correctedEvidenceIds.every((id) => input.records.some((record) => record.evidence_id === id))
    },
    dashboard_flags: {
      unknown_stale_conflicted_visible: visibleStates.has("UNKNOWN") && visibleStates.has("STALE") && visibleStates.has("CONFLICTED"),
      unknown_cannot_be_zero_or_false: true,
      correction_preserves_history: correctedEvidenceIds.length > 0 && activeCorrectionIds.length > 0,
      no_private_source_connection: true,
      no_durable_write: true,
      keegan_action_required: "NO"
    }
  };
}
