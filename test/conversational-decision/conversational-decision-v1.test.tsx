import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionRoomFromConversationV1 } from "@/lib/conversational-decision/decision-room-adapter";
import { answerConversationalDecisionTurnV1 } from "@/lib/conversational-decision/engine";
import { CONVERSATIONAL_DECISION_FIXTURE_V1 } from "@/lib/conversational-decision/fixtures";

const fixture = CONVERSATIONAL_DECISION_FIXTURE_V1;

test("grounded why-question answers with evidence, assumptions, UNKNOWNs, provenance, and approval class", () => {
  const answer = answerConversationalDecisionTurnV1({ fixture, turn: fixture.turns[0] });

  assert.equal(answer.classification, "QUESTION_ONLY");
  assert.equal(answer.facts_mutated, false);
  assert.equal(answer.revision, null);
  assert.equal(answer.active_recommendation_version.version, 1);
  assert.equal(answer.approval_level, "L1_RECOMMENDATION");
  assert.ok(answer.evidence_refs.some((item) => item.id === "ev-prestige-fit" && item.provenance === "SYSTEM_EVIDENCE"));
  assert.ok(answer.unknowns.includes("Verified host/sponsor route"));
  assert.match(answer.written_answer, /Prestige fit is strong/);
});

test("hypothetical scenario never becomes a fact or recommendation revision", () => {
  const answer = answerConversationalDecisionTurnV1({ fixture, turn: fixture.turns[1] });

  assert.equal(answer.classification, "HYPOTHETICAL");
  assert.equal(answer.facts_mutated, false);
  assert.equal(answer.revision, null);
  assert.equal(answer.active_recommendation_version.version, 1);
  assert.equal(answer.prior_versions.length, 0);
  assert.deepEqual(answer.active_recommendation_version.evidence_refs, fixture.current_version.evidence_refs);
  assert.ok(answer.evidence_refs.some((item) => item.truth_state === "HYPOTHETICAL_ONLY"));
  assert.match(answer.written_answer, /does not create a new recommendation version/);
});

test("human-reported fact creates RecommendationVersion N+1 with BEFORE AFTER and WHY_CHANGED", () => {
  const answer = answerConversationalDecisionTurnV1({ fixture, turn: fixture.turns[2] });

  assert.equal(answer.classification, "HUMAN_REPORTED_FACT");
  assert.equal(answer.facts_mutated, true);
  assert.ok(answer.revision);
  assert.equal(answer.revision.previous_version, 1);
  assert.equal(answer.revision.next_version, 2);
  assert.equal(answer.active_recommendation_version.version, 2);
  assert.equal(answer.prior_versions.length, 1);
  assert.equal(answer.prior_versions[0].version, 1);
  assert.match(answer.revision.before.recommendation_summary, /Validate access before/);
  assert.match(answer.revision.after.recommendation_summary, /confirmed warm host introduction/);
  assert.ok(answer.revision.why_changed.some((item) => item.includes("access-path unknown")));
  assert.ok(answer.revision.preserved_evidence_refs.includes("ev-prestige-fit"));
  assert.deepEqual(answer.revision.added_evidence_refs, ["ev-human-confirmed-host-intro"]);
  assert.ok(!answer.unknowns.includes("Verified host/sponsor route"));
  assert.ok(answer.unknowns.includes("Direct event economics"));
});

test("Decision Room adapter is dashboard-consumable without changing the shell contract", () => {
  const answer = answerConversationalDecisionTurnV1({ fixture, turn: fixture.turns[2] });
  const room = buildDecisionRoomFromConversationV1({ fixture, answer });

  assert.equal(room.decision_id, "decision-private-collector-room");
  assert.equal(room.contextual_ask.scope, "DECISION_CONTEXT");
  assert.deepEqual(room.contextual_ask.supported_classifications, ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"]);
  assert.match(room.written_answer_sections.map((item) => item.heading).join(" "), /WHY_CHANGED/);
  assert.ok(room.evidence.some((item) => item.id === "ev-human-confirmed-host-intro" && item.detail.includes("HUMAN_REPORTED")));
  assert.ok(room.assumptions.some((item) => item.label === "Direct event economics" && item.status === "UNKNOWN"));
});
