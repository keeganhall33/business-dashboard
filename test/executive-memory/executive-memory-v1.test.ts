import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionPrecedentV1 } from "@/lib/executive-memory/contracts";
import {
  CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1,
  DECISION_PRECEDENT_FIXTURES_V1
} from "@/lib/executive-memory/fixtures";
import {
  DECISION_PRECEDENT_RETRIEVAL_FIXTURE_V1,
  matchDecisionPrecedentV1,
  precedentEvidenceIntegrityV1,
  retrieveDecisionPrecedentsV1
} from "@/lib/executive-memory/retrieval";

test("DecisionPrecedentV1 fixtures cover success, failure, materially different, and low-attribution outcomes", () => {
  assert.equal(DECISION_PRECEDENT_FIXTURES_V1.length, 4);
  assert.ok(DECISION_PRECEDENT_FIXTURES_V1.every((precedent) => precedent.contract_version === "decision_precedent_v1.0"));

  const outcomes = new Set(DECISION_PRECEDENT_FIXTURES_V1.map((precedent) => precedent.OUTCOME.status));
  assert.ok(outcomes.has("SUCCESSFUL"));
  assert.ok(outcomes.has("FAILED"));
  assert.ok(outcomes.has("UNKNOWN"));

  const signalClasses = new Set(DECISION_PRECEDENT_FIXTURES_V1.map((precedent) => precedent.PREFERENCE_SIGNAL_CLASS));
  assert.ok(signalClasses.has("SUCCESSFUL_PATTERN"));
  assert.ok(signalClasses.has("FAILED_PATTERN"));
  assert.ok(signalClasses.has("CURRENT_CONTEXT_DIFFERENCE"));
  assert.ok(signalClasses.has("WEAK_SIGNAL_ONLY"));
});

test("retrieval orders precedents by deterministic relevance without exposing an opaque score", () => {
  const retrieval = DECISION_PRECEDENT_RETRIEVAL_FIXTURE_V1;

  assert.equal(retrieval.retrieval_version, "decision_precedent_retrieval_v1.0");
  assert.equal(retrieval.source_mode, "DETERMINISTIC_FIXTURE");
  assert.equal(retrieval.current_decision_id, CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1.decision_id);
  assert.deepEqual(
    retrieval.matches.map((match) => match.precedent.DECISION_ID),
    [
      "precedent-private-preview-qualified-access-success",
      "precedent-studio-focus-superficial-match",
      "precedent-public-volume-drop-failed",
      "precedent-meta-adjustment-low-attribution"
    ]
  );
  assert.equal(retrieval.dashboard_summary.top_precedent_id, "precedent-private-preview-qualified-access-success");
  assert.equal(retrieval.dashboard_summary.strongest_relevance, "HIGH");
  assert.equal(retrieval.dashboard_summary.evidence_verification_count, 2);
  assert.equal("score" in retrieval.matches[0], false);
});

test("successful precedent can inform but cannot become a permanent preference rule", () => {
  const retrieval = retrieveDecisionPrecedentsV1();
  const top = retrieval.matches[0];

  assert.equal(top.precedent.PREFERENCE_SIGNAL_CLASS, "SUCCESSFUL_PATTERN");
  assert.equal(top.PRECEDENT_RELEVANCE, "HIGH");
  assert.equal(top.dashboard_flags.can_inform_current_decision, true);
  assert.equal(top.dashboard_flags.can_become_preference_rule, false);
  assert.equal(top.dashboard_flags.evidence_integrity_state, "SUPPORTED");
  assert.equal(top.dashboard_flags.requires_evidence_verification, false);
  assert.ok(top.SIMILARITY_FACTORS.shared_context_tags.includes("premium-positioning"));
  assert.ok(top.SIMILARITY_FACTORS.shared_option_tags.includes("private-room-proof"));
  assert.match(top.precedent.LESSON, /bounded private validation/i);
});

test("inferred-only failed pattern stays visible but is downgraded and requires verification", () => {
  const failed = DECISION_PRECEDENT_FIXTURES_V1.find((precedent) => precedent.DECISION_ID === "precedent-public-volume-drop-failed");
  assert.ok(failed);

  const match = matchDecisionPrecedentV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, failed);

  assert.equal(match.precedent.OUTCOME.status, "FAILED");
  assert.equal(match.precedent.PREFERENCE_SIGNAL_CLASS, "FAILED_PATTERN");
  assert.equal(match.PRECEDENT_RELEVANCE, "LOW");
  assert.equal(match.dashboard_flags.can_inform_current_decision, true);
  assert.equal(match.dashboard_flags.can_become_preference_rule, false);
  assert.equal(match.dashboard_flags.evidence_integrity_state, "INFERRED_ONLY");
  assert.equal(match.dashboard_flags.requires_evidence_verification, true);
  assert.ok(match.WHAT_DIFFERS_NOW.includes("Current-only context tag: scarcity-safe."));
  assert.ok(match.WHAT_DIFFERS_NOW.includes("Precedent-only context tag: public-attention."));
});

test("context-difference precedent reports only supplied structural differences instead of invented current-state narrative", () => {
  const precedent = DECISION_PRECEDENT_FIXTURES_V1.find((item) => item.DECISION_ID === "precedent-studio-focus-superficial-match");
  assert.ok(precedent);

  const match = matchDecisionPrecedentV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, precedent);
  const differences = match.WHAT_DIFFERS_NOW.join(" ");

  assert.equal(match.precedent.PREFERENCE_SIGNAL_CLASS, "CURRENT_CONTEXT_DIFFERENCE");
  assert.equal(match.PRECEDENT_RELEVANCE, "LOW");
  assert.equal(match.dashboard_flags.superficially_similar_only, true);
  assert.match(differences, /Current-only context tag: private-validation/);
  assert.match(differences, /Precedent-only context tag: studio-capacity/);
  assert.match(differences, /specific differences require evidence/i);
  assert.doesNotMatch(differences, /current decision is scarcity-safe private validation/i);
  assert.doesNotMatch(differences, /prior context had fixed delivery pressure/i);
});

test("low-attribution and conflicted outcomes cannot dominate recommendations or policy learning", () => {
  const retrieval = retrieveDecisionPrecedentsV1();
  const lowAttribution = retrieval.matches.find((match) => match.precedent.DECISION_ID === "precedent-meta-adjustment-low-attribution");
  assert.ok(lowAttribution);

  assert.equal(lowAttribution.precedent.ATTRIBUTION_CONFIDENCE, "LOW");
  assert.equal(lowAttribution.precedent.OUTCOME.status, "UNKNOWN");
  assert.equal(lowAttribution.PRECEDENT_RELEVANCE, "DO_NOT_USE");
  assert.equal(lowAttribution.dashboard_flags.can_inform_current_decision, false);
  assert.equal(lowAttribution.dashboard_flags.low_attribution_cannot_dominate, true);
  assert.equal(lowAttribution.dashboard_flags.evidence_integrity_state, "CONFLICTED");
  assert.equal(lowAttribution.dashboard_flags.requires_evidence_verification, true);
  assert.equal(retrieval.matches.at(-1)?.precedent.DECISION_ID, lowAttribution.precedent.DECISION_ID);
  assert.equal(retrieval.dashboard_summary.blocked_low_attribution_count, 1);
});

test("conflicted evidence fails closed even when attribution is labeled HIGH", () => {
  const supported = DECISION_PRECEDENT_FIXTURES_V1.find((item) => item.DECISION_ID === "precedent-private-preview-qualified-access-success");
  assert.ok(supported);

  const conflicted: DecisionPrecedentV1 = {
    ...supported,
    DECISION_ID: "precedent-conflicted-high-attribution",
    ATTRIBUTION_CONFIDENCE: "HIGH",
    KEY_EVIDENCE: supported.KEY_EVIDENCE.map((evidence, index) => (
      index === 0 ? { ...evidence, truth_state: "CONFLICTED" as const } : { ...evidence }
    ))
  };
  const match = matchDecisionPrecedentV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, conflicted);

  assert.equal(precedentEvidenceIntegrityV1(conflicted), "CONFLICTED");
  assert.equal(match.PRECEDENT_RELEVANCE, "DO_NOT_USE");
  assert.equal(match.dashboard_flags.can_inform_current_decision, false);
  assert.equal(match.dashboard_flags.requires_evidence_verification, true);
});

test("caller-supplied retrieval is labeled as caller supplied and cannot mix with fixtures", () => {
  const supported = DECISION_PRECEDENT_FIXTURES_V1.find((item) => item.DECISION_ID === "precedent-private-preview-qualified-access-success");
  assert.ok(supported);

  const retrieval = retrieveDecisionPrecedentsV1(
    CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1,
    [supported],
    "2026-09-18T07:00:00.000Z"
  );

  assert.equal(retrieval.source_mode, "CALLER_SUPPLIED");
  assert.equal(retrieval.matches.length, 1);
  assert.throws(
    () => retrieveDecisionPrecedentsV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1),
    /fixture and caller data cannot be mixed/i
  );
  assert.throws(
    () => retrieveDecisionPrecedentsV1(undefined, [supported]),
    /fixture and caller data cannot be mixed/i
  );
});

test("retrieval fails closed on self-precedent, duplicate ids, oversized input, and non-canonical generation time", () => {
  const supported = DECISION_PRECEDENT_FIXTURES_V1.find((item) => item.DECISION_ID === "precedent-private-preview-qualified-access-success");
  assert.ok(supported);

  const selfPrecedent: DecisionPrecedentV1 = {
    ...supported,
    DECISION_ID: CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1.decision_id
  };
  assert.throws(
    () => retrieveDecisionPrecedentsV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, [selfPrecedent]),
    /cannot be used as its own precedent/i
  );
  assert.throws(
    () => retrieveDecisionPrecedentsV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, [supported, supported]),
    /duplicate precedent DECISION_ID/i
  );

  const oversized = Array.from({ length: 101 }, (_, index): DecisionPrecedentV1 => ({
    ...supported,
    DECISION_ID: `precedent-bounded-${index}`
  }));
  assert.throws(
    () => retrieveDecisionPrecedentsV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, oversized),
    /bounded to 100 records/i
  );
  assert.throws(
    () => retrieveDecisionPrecedentsV1(CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1, [supported], "2026-09-18"),
    /canonical ISO timestamp/i
  );
});

test("absence of evidence for a material difference stays explicit instead of becoming a fabricated difference", () => {
  const supported = DECISION_PRECEDENT_FIXTURES_V1.find((item) => item.DECISION_ID === "precedent-private-preview-qualified-access-success");
  assert.ok(supported);

  const query = {
    ...CURRENT_DECISION_MEMORY_QUERY_FIXTURE_V1,
    context_tags: [...supported.CONTEXT_TAGS]
  };
  const match = matchDecisionPrecedentV1(query, supported);

  assert.deepEqual(match.SIMILARITY_FACTORS.material_differences, []);
  assert.deepEqual(match.WHAT_DIFFERS_NOW, ["No material difference is established by the supplied structured evidence."]);
});

test("retrieval output is dashboard and Decision Room consumable", () => {
  const retrieval = retrieveDecisionPrecedentsV1();
  const [top] = retrieval.matches;

  assert.ok(top);
  assert.equal(typeof top.precedent.CHOSEN_ACTION, "string");
  assert.ok(top.precedent.OPTIONS_CONSIDERED.length >= 2);
  assert.ok(top.precedent.KEY_EVIDENCE.length > 0);
  assert.ok(top.precedent.KEY_ASSUMPTIONS.length > 0);
  assert.ok(top.WHAT_DIFFERS_NOW.length > 0);
  assert.equal(retrieval.keegan_action_required, "NO");
});