import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveHomeShell } from "@/components/executive-home/ExecutiveHomeShell";
import {
  EXECUTIVE_HOME_FIXTURE_V1,
  type ExecutiveHomeFixtureV1,
  type ExecutiveIntelligenceCardV1
} from "@/lib/executive-home/fixtures";
import {
  buildDecisionLearningSnapshot,
  decisionLearningFixturesV1,
  toDecisionLearningRecordCard,
  validateDecisionGovernance,
  type DecisionLearningRecordInputV1
} from "@/lib/learning-engine/decision-record-v1";

function fixtureRecord(id: string): DecisionLearningRecordInputV1 {
  const base = decisionLearningFixturesV1[0];
  assert.ok(base, "decision-learning fixture must exist");
  return {
    ...base,
    id,
    recommendation_id: `${base.recommendation_id}-${id}`,
    PREDICTED_OUTCOME_RANGE: {
      ...base.PREDICTED_OUTCOME_RANGE,
      rationale: [...base.PREDICTED_OUTCOME_RANGE.rationale]
    },
    KEY_ASSUMPTIONS: [...base.KEY_ASSUMPTIONS],
    SUCCESS_CRITERIA: [...base.SUCCESS_CRITERIA],
    EVALUATION_WINDOW: { ...base.EVALUATION_WINDOW },
    OBSERVED_OUTCOME: {
      ...base.OBSERVED_OUTCOME,
      evidence_refs: [...base.OBSERVED_OUTCOME.evidence_refs]
    },
    DECISION_GOVERNANCE: undefined
  };
}

function withDecisionTruthStates(): ExecutiveHomeFixtureV1 {
  const base = EXECUTIVE_HOME_FIXTURE_V1.cards[0];
  assert.ok(base, "Executive Home card fixture must exist");
  const stale: ExecutiveIntelligenceCardV1 = {
    ...base,
    id: "quality-stale",
    title: "Stale evidence remains visible",
    state: "STALE",
    freshness: "STALE",
    confidence: "LOW"
  };
  const conflicted: ExecutiveIntelligenceCardV1 = {
    ...base,
    id: "quality-conflicted",
    title: "Conflicting evidence remains visible",
    state: "CONFLICTED",
    freshness: "UNKNOWN",
    confidence: "UNKNOWN"
  };
  return {
    ...EXECUTIVE_HOME_FIXTURE_V1,
    cards: [...EXECUTIVE_HOME_FIXTURE_V1.cards, stale, conflicted]
  };
}

test("missing executive values remain UNKNOWN rather than silently becoming zero or false", () => {
  const unknownKpi = EXECUTIVE_HOME_FIXTURE_V1.command_center.kpis.find((item) => item.truth_state === "UNKNOWN");
  assert.ok(unknownKpi, "expected an UNKNOWN KPI fixture");
  assert.equal(unknownKpi.value, "UNKNOWN economics");
  assert.equal(unknownKpi.last_updated, null);
  assert.equal(unknownKpi.trend.every((value) => value === null), true);
  assert.equal(unknownKpi.trend.includes(0), false);

  const unknownSystemState = EXECUTIVE_HOME_FIXTURE_V1.command_center.system_glance.find(
    (item) => item.truth_state === "UNKNOWN"
  );
  assert.ok(unknownSystemState, "expected an UNKNOWN system-glance fixture");
  assert.equal(unknownSystemState.value, "UNKNOWN");
});

test("STALE and CONFLICTED evidence remain explicit on the decision-facing Executive Home surface", () => {
  const html = renderToString(<ExecutiveHomeShell data={withDecisionTruthStates()} />);
  assert.match(html, /Stale evidence remains visible/);
  assert.match(html, /Conflicting evidence remains visible/);
  assert.match(html, />STALE</);
  assert.match(html, />CONFLICTED</);
});

test("low-attribution outcomes cannot become strong causal learning or policy updates", () => {
  const input = fixtureRecord("quality-low-attribution");
  input.ATTRIBUTION_CONFIDENCE = "LOW";
  input.RESULT_VS_PREDICTION = "WITHIN_RANGE";
  input.POLICY_UPDATE_CANDIDATE = "Promote this rule";

  const card = toDecisionLearningRecordCard(input);
  assert.equal(card.dashboard_flags.learning_strength, "WEAK_SIGNAL_ONLY");
  assert.equal(card.dashboard_flags.can_update_policy, false);
  assert.equal(card.POLICY_UPDATE_CANDIDATE, null);
});

test("duplicate decision evidence references fail closed instead of inflating evidentiary weight", () => {
  const input = fixtureRecord("quality-duplicate-evidence");
  input.DECISION_GOVERNANCE = {
    rationale: "Keep the decision tied to unique evidence.",
    alternatives: ["Alternative path"],
    decision_actor: "SYSTEM",
    decision_at: "2026-09-08T10:00:00.000Z",
    approval_authority: "KEEGAN",
    review_state: "APPROVED",
    supporting_evidence_refs: ["evidence-1", "evidence-1"],
    contradicting_evidence_refs: [],
    valid_until: null,
    evidence_fingerprint: null,
    revisit_on_evidence_change: false,
    superseded_by_id: null
  };

  assert.throws(
    () => validateDecisionGovernance(input),
    /DECISION_GOVERNANCE\.supporting_evidence_refs contains duplicate reference evidence-1/
  );
});

test("decision revision preserves prior rationale and historical state after supersession", () => {
  const prior = fixtureRecord("quality-decision-prior");
  prior.DECISION_GOVERNANCE = {
    rationale: "Original rationale remains auditable after revision.",
    alternatives: ["Do nothing", "Run a smaller test"],
    decision_actor: "SYSTEM",
    decision_at: "2026-09-07T10:00:00.000Z",
    approval_authority: "KEEGAN",
    review_state: "APPROVED",
    supporting_evidence_refs: ["evidence-original"],
    contradicting_evidence_refs: [],
    valid_until: null,
    evidence_fingerprint: "fingerprint-original",
    revisit_on_evidence_change: true,
    superseded_by_id: "quality-decision-current"
  };

  const current = fixtureRecord("quality-decision-current");
  current.DECISION_GOVERNANCE = {
    rationale: "Revised rationale reflects newer evidence.",
    alternatives: ["Retain prior decision"],
    decision_actor: "SYSTEM",
    decision_at: "2026-09-08T10:00:00.000Z",
    approval_authority: "KEEGAN",
    review_state: "APPROVED",
    supporting_evidence_refs: ["evidence-current"],
    contradicting_evidence_refs: ["evidence-original"],
    valid_until: null,
    evidence_fingerprint: "fingerprint-current",
    revisit_on_evidence_change: true,
    superseded_by_id: null
  };

  const snapshot = buildDecisionLearningSnapshot(
    [prior, current],
    "2026-09-08T12:00:00.000Z",
    { current_evidence_fingerprint: "fingerprint-current" }
  );
  const priorCard = snapshot.cards.find((card) => card.id === prior.id);
  const currentCard = snapshot.cards.find((card) => card.id === current.id);
  assert.ok(priorCard);
  assert.ok(currentCard);
  assert.equal(priorCard.DECISION_GOVERNANCE?.rationale, "Original rationale remains auditable after revision.");
  assert.equal(priorCard.decision_review?.state, "SUPERSEDED");
  assert.equal(currentCard.DECISION_GOVERNANCE?.rationale, "Revised rationale reflects newer evidence.");
  assert.equal(currentCard.decision_review?.state, "CURRENT");
  assert.equal(snapshot.summary.superseded_decisions, 1);
});

test("decision-facing fixtures retain a next move, material caveat, evidence, and deterministic output", () => {
  const opportunity = EXECUTIVE_HOME_FIXTURE_V1.cards.find((card) => card.id === "top-opportunity-elite-network");
  assert.ok(opportunity, "expected the top opportunity fixture");
  assert.ok(opportunity.next_action.trim().length > 0, "decision-facing opportunity must have an actionable next move");
  assert.ok(opportunity.why.trim().length > 0, "decision-facing opportunity must explain why it matters");
  assert.ok(opportunity.evidence.length > 0, "decision-facing opportunity must retain evidence");
  assert.match(opportunity.summary, /UNKNOWN/, "strongest material economics caveat must remain explicit");

  const first = renderToString(<ExecutiveHomeShell data={withDecisionTruthStates()} />);
  const second = renderToString(<ExecutiveHomeShell data={withDecisionTruthStates()} />);
  assert.equal(first, second, "Executive Home output must be deterministic for the same evidence fixture");

  const record = fixtureRecord("quality-deterministic-record");
  assert.deepEqual(toDecisionLearningRecordCard(record), toDecisionLearningRecordCard(record));
});
