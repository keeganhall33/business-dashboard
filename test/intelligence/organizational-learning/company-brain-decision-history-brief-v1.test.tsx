import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCompanyBrainDecisionHistoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/company-brain-decision-history-brief-v1";
import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-brief-v1";

function sourceBrief(
  overrides: Partial<DecisionMemoryBriefV1> = {}
): DecisionMemoryBriefV1 {
  return {
    contractVersion: "DecisionMemoryBriefV1",
    policyVersion: DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
    briefId: "decision-memory-brief:strategy-1",
    generatedAt: "2026-09-19T00:10:00.000Z",
    state: "READY",
    lineageState: "NO_PRIOR",
    freshnessState: "CURRENT",
    decisionId: "decision:strategy-1",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-18T18:00:00.000Z",
    selectedAlternativeId: "alt:focus-a",
    selectedAlternativeLabel: "Focus on the documented priority",
    rationale: {
      state: "KNOWN",
      value: "Use the documented evidence and preserve optionality while the decision remains reversible.",
      evidenceRefs: ["evidence:rationale:strategy-1"]
    },
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence:strategy-1"]
    },
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-18T18:00:00.000Z",
      evidenceRefs: ["evidence:approval:strategy-1"]
    },
    actionState: "TAKEN",
    outcome: {
      state: "OBSERVED",
      observedAt: "2026-09-19T00:00:00.000Z",
      assessment: {
        state: "KNOWN",
        value: "POSITIVE",
        evidenceRefs: ["evidence:outcome:strategy-1"]
      },
      attributionClass: "CORRELATIONAL",
      attributionEvidenceRefs: ["evidence:attribution:strategy-1"],
      confounderCount: 1,
      lessonCandidateReviewRequired: true,
      causalityClaimedByBrief: false
    },
    changesSincePrior: [],
    revisitSignals: [],
    provenanceRefs: [
      "evidence:approval:strategy-1",
      "evidence:attribution:strategy-1",
      "evidence:confidence:strategy-1",
      "evidence:outcome:strategy-1",
      "evidence:rationale:strategy-1",
      "source:strategy:strategy-1"
    ],
    integrityFlags: [],
    limitations: ["Source brief limitation."],
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    },
    ...overrides
  };
}

function compile(briefs: readonly DecisionMemoryBriefV1[]) {
  return compileCompanyBrainDecisionHistoryBriefV1({
    briefs,
    generatedAt: "2026-09-19T00:20:00.000Z",
    maximumSourceAgeMs: 60 * 60 * 1000
  });
}

test("synthesizes canonical decision history into exception-first Company Brain lanes", () => {
  const outcomeReady = sourceBrief();
  const revisit = sourceBrief({
    briefId: "decision-memory-brief:pricing-1",
    decisionId: "decision:pricing-1",
    decisionClass: "PRICING",
    decidedAt: "2026-09-18T17:00:00.000Z",
    state: "REVIEW_REQUIRED",
    freshnessState: "EXPIRED",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    revisitSignals: [
      {
        kind: "MATERIAL_ASSUMPTION",
        ref: "assumption:budget",
        text: "Revisit when documented budget evidence changes.",
        truthState: "KNOWN",
        evidenceRefs: ["evidence:budget"]
      }
    ],
    provenanceRefs: ["evidence:budget", "source:decision:pricing-1"]
  });
  const waiting = sourceBrief({
    briefId: "decision-memory-brief:campaign-1",
    decisionId: "decision:campaign-1",
    decisionClass: "CAMPAIGN",
    decidedAt: "2026-09-18T16:00:00.000Z",
    actionState: "PLANNED",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    provenanceRefs: ["source:decision:campaign-1"]
  });
  const verify = sourceBrief({
    briefId: "decision-memory-brief:relationship-1",
    decisionId: "decision:relationship-1",
    decisionClass: "RELATIONSHIP",
    decidedAt: "2026-09-18T15:00:00.000Z",
    state: "VERIFY_LINEAGE",
    lineageState: "UNPROVEN",
    outcome: {
      state: "NOT_OBSERVED",
      observedAt: null,
      assessment: null,
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    },
    provenanceRefs: ["source:decision:relationship-1"]
  });

  const result = compile([waiting, verify, revisit, outcomeReady]);

  assert.equal(result.state, "READY");
  assert.equal(result.summary.supplied, 4);
  assert.equal(result.summary.accepted, 4);
  assert.equal(result.summary.rejected, 0);
  assert.equal(result.summary.verificationRequired, 1);
  assert.equal(result.summary.revisitRequired, 1);
  assert.equal(result.summary.outcomeReviewReady, 1);
  assert.equal(result.summary.waitingOutcome, 1);
  assert.equal(result.summary.observedOutcomes, 1);
  assert.deepEqual(
    result.timeline.map((item) => item.decisionId),
    [
      "decision:strategy-1",
      "decision:pricing-1",
      "decision:campaign-1",
      "decision:relationship-1"
    ]
  );
  assert.equal(result.outcomeReviewReady[0]?.recordedAttributionClass, "CORRELATIONAL");
  assert.equal(result.outcomeReviewReady[0]?.sourceConfidence.value, "MEDIUM");
  assert.equal(result.revisitRequired[0]?.revisitSignals[0]?.ref, "assumption:budget");
  assert.equal(result.causalInterpretation, "NOT_ESTABLISHED");
  assert.equal(result.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.learningPromotionAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("fails closed on stale, widened-authority, and duplicate source briefs", () => {
  const duplicateA = sourceBrief({
    briefId: "decision-memory-brief:duplicate-a",
    decisionId: "decision:duplicate"
  });
  const duplicateB = sourceBrief({
    briefId: "decision-memory-brief:duplicate-b",
    decisionId: "decision:duplicate"
  });
  const stale = sourceBrief({
    briefId: "decision-memory-brief:stale",
    decisionId: "decision:stale",
    generatedAt: "2026-09-18T20:00:00.000Z"
  });
  const widened = sourceBrief({
    briefId: "decision-memory-brief:widened",
    decisionId: "decision:widened",
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: true,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
      approvalBypassAuthorized: false
    }
  });

  const result = compile([duplicateA, duplicateB, stale, widened]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.equal(result.summary.rejected, 4);
  assert.ok(result.verificationReasons.includes("DUPLICATE_DECISION_ID:decision:duplicate"));
  assert.ok(result.verificationReasons.includes("SOURCE_BRIEF_STALE:decision:stale"));
  assert.ok(result.verificationReasons.includes("SOURCE_AUTHORITY_WIDENED:decision:widened"));
  assert.deepEqual(result.rejectedDecisionIds, [
    "decision:duplicate",
    "decision:stale",
    "decision:widened"
  ]);
  assert.equal(result.timeline.length, 0);
});

test("rejects impossible outcome chronology instead of projecting future outcome truth", () => {
  const futureOutcome = sourceBrief({
    briefId: "decision-memory-brief:future-outcome",
    decisionId: "decision:future-outcome",
    outcome: {
      state: "OBSERVED",
      observedAt: "2026-09-19T00:15:00.000Z",
      assessment: {
        state: "KNOWN",
        value: "POSITIVE",
        evidenceRefs: ["evidence:future-outcome"]
      },
      attributionClass: "UNKNOWN",
      attributionEvidenceRefs: [],
      confounderCount: 0,
      lessonCandidateReviewRequired: false,
      causalityClaimedByBrief: false
    }
  });

  const result = compile([futureOutcome]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.equal(result.summary.accepted, 0);
  assert.ok(
    result.verificationReasons.includes(
      "SOURCE_OUTCOME_CHRONOLOGY_INVALID:decision:future-outcome"
    )
  );
});

test("deep-freezes the projection without mutating caller-owned source data", () => {
  const input = sourceBrief({
    changesSincePrior: [
      {
        field: "RATIONALE",
        priorValue: "Prior documented rationale",
        currentValue: "Current documented rationale",
        evidenceRefs: ["evidence:rationale:change"],
        causality: "NOT_ESTABLISHED"
      }
    ]
  });
  const before = structuredClone(input);
  const result = compile([input]);

  assert.deepEqual(input, before);
  assert.equal(result.summary.lineageChangeEvents, 1);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.timeline), true);
  assert.equal(Object.isFrozen(result.timeline[0]), true);
  assert.equal(Object.isFrozen(result.timeline[0]?.changesSincePrior), true);
  assert.equal(Object.isFrozen(result.timeline[0]?.changesSincePrior[0]), true);
  assert.equal(Object.isFrozen(result.timeline[0]?.rationale), true);
  assert.equal(Object.isFrozen(result.authority), true);
});
