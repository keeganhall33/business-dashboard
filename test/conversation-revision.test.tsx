import assert from "node:assert/strict";
import test from "node:test";
import { previewConversationRecommendationRevisionV1 } from "@/lib/decision-intelligence/conversation-revision/adapter";
import {
  CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1,
  CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1,
  CONVERSATION_REVISION_TRANSCRIPT_FACT_PAYLOAD_V1
} from "@/lib/decision-intelligence/conversation-revision/fixtures";
import { RECOMMENDATION_REVISION_BASE_VERSION_V1 } from "@/lib/decision-intelligence/revision/fixtures";

test("text and transcript inputs yield the same revision-preview semantics", () => {
  const textPreview = previewConversationRecommendationRevisionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    payload: CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1
  });
  const transcriptPreview = previewConversationRecommendationRevisionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    payload: CONVERSATION_REVISION_TRANSCRIPT_FACT_PAYLOAD_V1
  });

  assert.equal(textPreview.normalized_utterance, transcriptPreview.normalized_utterance);
  assert.equal(textPreview.classification, transcriptPreview.classification);
  assert.deepEqual(textPreview.recommendation_version_diff?.after, transcriptPreview.recommendation_version_diff?.after);
  assert.deepEqual(textPreview.proposed_assumption_changes, transcriptPreview.proposed_assumption_changes);
  assert.deepEqual(
    textPreview.proposed_evidence_additions.map((item) => ({
      ...item,
      provenance: { ...item.provenance, source_id: "normalized", source_label: "normalized", notes: "normalized" }
    })),
    transcriptPreview.proposed_evidence_additions.map((item) => ({
      ...item,
      provenance: { ...item.provenance, source_id: "normalized", source_label: "normalized", notes: "normalized" }
    }))
  );
});

test("all required classifications are handled with explicit provenance and preview-only persistence", () => {
  const previews = CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1.map((payload) =>
    previewConversationRecommendationRevisionV1({
      current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
      payload
    })
  );

  assert.deepEqual(previews.map((preview) => preview.classification), [
    "QUESTION_ONLY",
    "HYPOTHETICAL",
    "HUMAN_REPORTED_FACT",
    "HUMAN_JUDGMENT",
    "CORRECTION",
    "DECISION"
  ]);
  assert.ok(previews.every((preview) => preview.no_durable_persistence));
  assert.ok(previews.every((preview) => preview.revision_result.memory_mutated === preview.fact_memory_mutation_candidate));
  assert.ok(previews.every((preview) => preview.keegan_action_required === "NO"));
});

test("human-reported fact carries provenance, classification, deltas, evidence, assumptions, and WHY_CHANGED", () => {
  const preview = previewConversationRecommendationRevisionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    payload: CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1
  });

  assert.equal(preview.classification, "HUMAN_REPORTED_FACT");
  assert.equal(preview.proposed_evidence_additions[0]?.provenance.kind, "HUMAN_REPORTED_FACT");
  assert.equal(preview.proposed_evidence_additions[0]?.provenance.memory_write_allowed, true);
  assert.equal(preview.fact_memory_mutation_candidate, true);
  assert.equal(preview.confidence_delta?.direction, "UP");
  assert.equal(preview.urgency_delta, "CHANGED");
  assert.equal(preview.approval_delta, "UNCHANGED");
  assert.deepEqual(preview.recommendation_version_diff?.added_evidence_ids, ["ev-human-confirmed-host-intro"]);
  assert.deepEqual(preview.recommendation_version_diff?.changed_assumption_ids, ["as-access-can-be-tested"]);
  assert.deepEqual(preview.why_changed, ["Human-reported fact resolves the access-route unknown.", "Prior recommendation version is preserved for audit."]);
});

test("correction preserves old version and keeps conflicted evidence explicit instead of overwriting", () => {
  const humanFactPreview = previewConversationRecommendationRevisionV1({
    current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
    payload: CONVERSATION_REVISION_TEXT_FACT_PAYLOAD_V1
  });
  const correctionPayload = CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1.find((payload) => payload.classification === "CORRECTION");
  assert.ok(correctionPayload);

  const correctionPreview = previewConversationRecommendationRevisionV1({
    current: humanFactPreview.revision_result.active_recommendation,
    priorVersions: humanFactPreview.revision_result.preserved_versions,
    payload: correctionPayload
  });

  assert.equal(correctionPreview.revision_result.old_recommendation.version, 2);
  assert.equal(correctionPreview.revision_result.active_recommendation.version, 3);
  assert.deepEqual(
    correctionPreview.revision_result.preserved_versions.map((version) => version.version),
    [1, 2]
  );
  assert.ok(correctionPreview.revision_result.active_recommendation.evidence_refs.some((item) => item.evidence_id === "ev-human-confirmed-host-intro"));
  assert.ok(correctionPreview.revision_result.active_recommendation.evidence_refs.some((item) => item.truth_state === "CONFLICTED"));
  assert.equal(correctionPreview.revision_result.conflicted_evidence_explicit, true);
  assert.equal(correctionPreview.confidence_delta?.direction, "DOWN");
});

test("hypothetical and question-only cannot create fact-memory mutation candidates", () => {
  const nonFactPayloads = CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1.filter((payload) =>
    payload.classification === "HYPOTHETICAL" || payload.classification === "QUESTION_ONLY"
  );

  for (const payload of nonFactPayloads) {
    const preview = previewConversationRecommendationRevisionV1({
      current: RECOMMENDATION_REVISION_BASE_VERSION_V1,
      payload
    });

    assert.equal(preview.fact_memory_mutation_candidate, false);
    assert.equal(preview.revision_result.facts_mutated, false);
    assert.equal(preview.revision_result.memory_mutated, false);
    assert.equal(preview.revision_result.diff, null);
  }
});
