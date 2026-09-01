import { reviseRecommendationVersionV1 } from "@/lib/decision-intelligence/revision/adapter";
import type {
  RecommendationRevisionInputV1,
  RecommendationRevisionVersionV1,
  RevisionInputClassificationV1,
  RevisionProvenanceV1
} from "@/lib/decision-intelligence/revision/contracts";
import type {
  CanonicalConversationRevisionPayloadV1,
  ConversationRevisionPreviewV1
} from "./contracts";
import { PROVENANCE_KIND_BY_CLASSIFICATION_V1 } from "./contracts";

const nonFactClassifications = new Set<RevisionInputClassificationV1>(["HYPOTHETICAL", "QUESTION_ONLY"]);
const factCandidateClassifications = new Set<RevisionInputClassificationV1>([
  "HUMAN_REPORTED_FACT",
  "HUMAN_JUDGMENT",
  "CORRECTION",
  "DECISION",
  "DECISION_COMMITMENT"
]);

function normalizeUtterance(payload: CanonicalConversationRevisionPayloadV1): string {
  const utterance = payload.payload_kind === "VOICE_TRANSCRIPT" ? payload.transcript : payload.text;
  const normalized = utterance?.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new Error(`Conversation revision payload ${payload.payload_id} is missing ${payload.payload_kind === "VOICE_TRANSCRIPT" ? "transcript" : "text"}.`);
  }

  return normalized;
}

function allowsFactMemoryCandidate(classification: RevisionInputClassificationV1): boolean {
  return factCandidateClassifications.has(classification) && !nonFactClassifications.has(classification);
}

function buildProvenance(payload: CanonicalConversationRevisionPayloadV1): RevisionProvenanceV1 {
  const factMemoryCandidate = allowsFactMemoryCandidate(payload.classification);

  return {
    source_id: payload.payload_id,
    source_label: payload.source_label,
    kind: PROVENANCE_KIND_BY_CLASSIFICATION_V1[payload.classification],
    captured_at: payload.captured_at,
    actor: payload.actor,
    notes: `${payload.classification} captured from ${payload.payload_kind}.`,
    memory_write_allowed: factMemoryCandidate
  };
}

export function buildRecommendationRevisionInputFromConversationV1(
  payload: CanonicalConversationRevisionPayloadV1
): RecommendationRevisionInputV1 {
  const provenance = buildProvenance(payload);
  const proposed = payload.proposed_changes;

  return {
    input_id: payload.payload_id,
    recommendation_id: payload.recommendation_id,
    classification: payload.classification,
    utterance: normalizeUtterance(payload),
    interpreted_claim: payload.interpreted_claim ?? null,
    provenance,
    proposed_changes: proposed
      ? {
          recommendation_summary: proposed.recommendation_summary,
          recommended_action: proposed.recommended_action,
          urgency: proposed.urgency,
          approval_level: proposed.approval_level,
          confidence: proposed.confidence,
          unknowns: proposed.unknowns,
          conflicts: proposed.conflicts,
          evidence_to_add: proposed.evidence_to_add?.map((item) => ({ ...item, provenance })),
          changed_assumptions: proposed.changed_assumptions?.map((item) => ({ ...item, evidence_refs: [...item.evidence_refs] })),
          why_changed: proposed.why_changed
        }
      : undefined
  };
}

export function previewConversationRecommendationRevisionV1(input: {
  payload: CanonicalConversationRevisionPayloadV1;
  current: RecommendationRevisionVersionV1;
  priorVersions?: RecommendationRevisionVersionV1[];
}): ConversationRevisionPreviewV1 {
  const revisionInput = buildRecommendationRevisionInputFromConversationV1(input.payload);
  const revisionResult = reviseRecommendationVersionV1({
    current: input.current,
    priorVersions: input.priorVersions,
    revisionInput
  });

  const proposedEvidence = revisionInput.proposed_changes?.evidence_to_add ?? [];
  const proposedAssumptions = revisionInput.proposed_changes?.changed_assumptions ?? [];
  const diff = revisionResult.diff;

  return {
    contract_version: "conversation_revision_preview_v1",
    payload_id: input.payload.payload_id,
    payload_kind: input.payload.payload_kind,
    classification: input.payload.classification,
    normalized_utterance: revisionInput.utterance,
    proposed_evidence_additions: proposedEvidence,
    proposed_assumption_changes: proposedAssumptions,
    recommendation_version_diff: diff,
    confidence_delta: diff?.confidence_delta ?? null,
    urgency_delta: diff?.urgency_delta ?? null,
    approval_delta: diff?.approval_class_delta ?? null,
    why_changed: diff?.why_changed ?? [],
    fact_memory_mutation_candidate: allowsFactMemoryCandidate(input.payload.classification) && revisionResult.facts_mutated,
    no_durable_persistence: true,
    revision_result: revisionResult,
    keegan_action_required: "NO"
  };
}
