import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { DecisionRoom } from "@/components/intelligence-ux/DecisionRoom";
import { DECISION_ROOM_CHALLENGE_FIXTURE_V1, DECISION_ROOM_CONVERSATION_REVISION_FIXTURE_V1, DECISION_ROOM_FIXTURE_V1 } from "@/lib/decision-room/fixtures";
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

test("Decision Room renders compact option comparison with explicit truth states", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_FIXTURE_V1} />);

  assert.match(html, /data-testid="decision-option-comparison"/);
  assert.match(html, /Competing paths at a glance/);
  assert.match(html, /Build the full private collector room concept now/);
  assert.match(html, /Ignore the event path and keep studio focus only/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /INFERRED/);
  assert.match(html, /FINANCIAL_FIXTURE/);
  assert.match(html, /STRATEGY_FIXTURE/);
  assert.match(html, /data-testid="decision-option-detail"/);
});

test("Decision Room option comparison preserves mobile and light-mode layout without fake zero values", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_FIXTURE_V1} />);
  const comparisonStart = html.indexOf('data-testid="decision-option-comparison"');
  const comparisonEnd = html.indexOf("Strongest argument against");
  const comparisonHtml = html.slice(comparisonStart, comparisonEnd);

  assert.ok(comparisonStart >= 0);
  assert.match(comparisonHtml, /bg-stone-50/);
  assert.match(comparisonHtml, /bg-white/);
  assert.match(comparisonHtml, /sm:grid-cols-2/);
  assert.match(comparisonHtml, /border-dashed/);
  assert.doesNotMatch(comparisonHtml, /0%|\$0|score[^<]*0/i);
});

test("Decision Room renders compact evidence summary with explicit risk states and source drill-down", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_CHALLENGE_FIXTURE_V1} />);
  const evidenceStart = html.indexOf('data-testid="decision-evidence-summary"');
  const evidenceEnd = html.indexOf("Specialist disagreement");
  const evidenceHtml = html.slice(evidenceStart, evidenceEnd);

  assert.ok(evidenceStart >= 0);
  assert.match(evidenceHtml, /Evidence/);
  assert.match(evidenceHtml, /sources/);
  assert.match(evidenceHtml, /KNOWN[\s\S]*0/);
  assert.match(evidenceHtml, /UNKNOWN[\s\S]*2/);
  assert.match(evidenceHtml, /CONFLICTED[\s\S]*1/);
  assert.match(evidenceHtml, /data-testid="decision-evidence-risk-strip"/);
  assert.match(evidenceHtml, /data-testid="decision-evidence-source-drilldown"/);
  assert.match(evidenceHtml, /FINANCIAL_FIXTURE/);
  assert.match(evidenceHtml, /EVIDENCE_TRUST_FIXTURE/);
  assert.match(evidenceHtml, /Direct event economics/);
  assert.match(evidenceHtml, /Data\/evidence trust/);
});

test("Decision Room evidence summary preserves mobile and light-mode density without hiding truth states", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_FIXTURE_V1} />);
  const evidenceStart = html.indexOf('data-testid="decision-evidence-summary"');
  const evidenceEnd = html.indexOf("Specialist disagreement");
  const evidenceHtml = html.slice(evidenceStart, evidenceEnd);

  assert.ok(evidenceStart >= 0);
  assert.match(evidenceHtml, /bg-stone-50/);
  assert.match(evidenceHtml, /bg-white/);
  assert.match(evidenceHtml, /sm:grid-cols-2/);
  assert.match(evidenceHtml, /Source drill-down/);
  assert.match(evidenceHtml, /UNKNOWN/);
  assert.match(evidenceHtml, /CONFLICTED/);
  assert.doesNotMatch(evidenceHtml, /^<details[^>]*open/);
  assert.doesNotMatch(evidenceHtml, /0%|\$0|score[^<]*0/i);
});

test("Decision Room integrates conversation panel and recommendation revision history", () => {
  const room = DECISION_ROOM_CONVERSATION_REVISION_FIXTURE_V1;
  const html = renderToString(<DecisionRoom decision={room} />);

  assert.ok(room.conversation_revision);
  assert.equal(room.conversation_revision.conversation.input.mode, "VOICE_TRANSCRIPT");
  assert.equal(room.conversation_revision.new_information_preview.input.mode, "VOICE_TRANSCRIPT");
  assert.equal(room.conversation_revision.recommendation_revision.old_recommendation.version, 1);
  assert.equal(room.conversation_revision.recommendation_revision.active_recommendation.version, 2);
  assert.equal(room.conversation_revision.recommendation_revision.memory_mutated, false);
  assert.match(html, /Conversational Decision Panel/);
  assert.match(html, /Fixture-backed new information preview/);
  assert.match(html, /HUMAN_REPORTED_FACT[\s\S]*VOICE_TRANSCRIPT/);
  assert.match(html, /Recommendation[\s\S]*1[\s\S]*to[\s\S]*2/);
  assert.match(html, /Before v[\s\S]*1/);
  assert.match(html, /After v[\s\S]*2/);
  assert.match(html, /Old recommendation remains inspectable as v[\s\S]*1/);
  assert.match(html, /WHY_CHANGED/);
  assert.match(html, /Confidence[\s\S]*possible[\s\S]*to[\s\S]*likely[\s\S]*UP/);
  assert.match(html, /Added evidence:[\s\S]*ev-human-confirmed-host-intro/);
  assert.match(html, /Changed assumptions:[\s\S]*as-access-can-be-tested/);
  assert.match(html, /Memory mutated:[\s\S]*false/);
  assert.match(html, /UNKNOWN explicit:[\s\S]*true/);
});

test("hypothetical revision result remains preview-only and cannot appear as fact", () => {
  const html = renderToString(<DecisionRoom decision={DECISION_ROOM_CONVERSATION_REVISION_FIXTURE_V1} />);

  assert.match(html, /read_only_fixture=[\s\S]*true/);
  assert.doesNotMatch(html, /Hypothetical sponsor fee coverage.*KNOWN/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /CONFLICTED/);
});
