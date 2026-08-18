import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import { DECISION_ROOM_CHALLENGE_FIXTURE_V1, DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
import { toDecisionRoomViewModelV1 } from "@/lib/decision-room/shell-adapter";
import { INTELLIGENCE_UX_SHELL_FIXTURE_V1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";

test("Decision Room V1 assembles compact recommendation, alternatives, evidence, unknowns, and next action", () => {
  const room = DECISION_ROOM_FIXTURE_V1;

  assert.equal(room.contract_version, "decision_room_view_model_v1");
  assert.equal(room.source_mode, "DETERMINISTIC_FIXTURE");
  assert.equal(room.current_recommendation.recommendation_id, "rec-private-collector-room-access-validation");
  assert.equal(room.confidence, "likely");
  assert.equal(room.approval_class, "L1_RECOMMENDATION");
  assert.ok(room.evidence_refs.some((item) => item.provenance === "STRATEGY_FIXTURE"));
  assert.ok(room.evidence_refs.some((item) => item.provenance === "EVIDENCE_TRUST_FIXTURE" && item.truth_state === "CONFLICTED"));
  assert.ok(room.evidence_refs.some((item) => item.provenance === "LEARNING_FIXTURE" && item.truth_state === "UNKNOWN"));
  assert.ok(room.evidence_refs.some((item) => item.provenance === "FINANCIAL_FIXTURE" && item.truth_state === "UNKNOWN"));
  assert.equal(room.alternatives.length, 2);
  assert.match(room.opportunity_cost_note, /graphite-led work/);
  assert.match(room.strongest_argument_against, /no verified buyer/);
  assert.equal(room.weakest_assumption.truth_state, "UNKNOWN");
  assert.ok(room.WHAT_WOULD_CHANGE_MY_MIND.some((item) => item.includes("Direct costs")));
  assert.match(room.next_action, /smallest access validation/);
});

test("challenge fixture cannot silently overwrite recommendation and keeps disagreement visible", () => {
  const baseline = DECISION_ROOM_FIXTURE_V1;
  const challenged = DECISION_ROOM_CHALLENGE_FIXTURE_V1;

  assert.equal(challenged.challenge.active, true);
  assert.equal(challenged.challenge.recommendation_overwritten, false);
  assert.equal(challenged.challenge.disagreement_visible, true);
  assert.deepEqual(challenged.current_recommendation, baseline.current_recommendation);
  assert.ok(challenged.specialist_disagreement.some((item) => item.specialist === "LEARNING" && item.stance === "CHALLENGES"));
  assert.ok(challenged.specialist_disagreement.every((item) => item.visible_in_dashboard));
});

test("Decision Room adapter preserves existing #553 shell contract while adding V1 dashboard fields", () => {
  const legacyRoom = INTELLIGENCE_UX_SHELL_FIXTURE_V1.decision_rooms[0];
  const adapted = toDecisionRoomViewModelV1(legacyRoom);

  assert.equal(adapted.decision_id, legacyRoom.decision_id);
  assert.equal(adapted.current_recommendation.summary, legacyRoom.recommendation_summary);
  assert.equal(adapted.next_action, legacyRoom.primary_action);
  assert.ok(adapted.evidence_refs.some((item) => item.provenance === "MANUAL_FIXTURE"));
  assert.ok(adapted.assumptions_unknowns.some((item) => item.label === "Direct economics" && item.truth_state === "UNKNOWN"));
});

test("contradiction, disagreement, and UNKNOWN survive rendering", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_CHALLENGE_FIXTURE_V1} />);

  assert.match(html, /Red-team challenge/);
  assert.match(html, /Recommendation overwritten:/);
  assert.match(html, /false/);
  assert.match(html, /FINANCIAL/);
  assert.match(html, /CHALLENGES/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /Direct event economics/);
  assert.match(html, /UNKNOWN direct economics must not be treated as zero cost or proven upside/);
  assert.match(html, /What would change my mind/);
});
