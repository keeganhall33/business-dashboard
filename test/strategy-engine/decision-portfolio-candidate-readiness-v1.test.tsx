import assert from "node:assert/strict";
import test from "node:test";

import {
  assessDecisionPortfolioCandidateReadinessV1,
  DecisionCandidateReadinessError,
  type DecisionCandidateDraftV1,
  type DecisionCandidateFieldEvidenceV1,
  type DecisionCandidateScoringFieldV1,
} from "../../src/lib/strategy-engine/decision-portfolio-candidate-readiness-v1";

const now = "2026-09-19T08:00:00.000Z";
const observedAt = "2026-09-19T07:00:00.000Z";
const maxAgeMs = 6 * 60 * 60 * 1_000;

function evidence(field: string, overrides: Partial<DecisionCandidateFieldEvidenceV1> = {}): DecisionCandidateFieldEvidenceV1 {
  return {
    truthState: "KNOWN",
    observedAt,
    evidenceRefs: [`evidence:${field}`],
    sourceRefs: [`source:${field}`],
    ...overrides,
  };
}

function fieldEvidence(): Record<DecisionCandidateScoringFieldV1, DecisionCandidateFieldEvidenceV1> {
  return {
    strategicFit: evidence("strategicFit"),
    compoundingAdvantage: evidence("compoundingAdvantage"),
    relationshipAccess: evidence("relationshipAccess"),
    futureOptions: evidence("futureOptions"),
    learningValue: evidence("learningValue"),
    urgency: evidence("urgency"),
    reversibility: evidence("reversibility"),
    execution: evidence("execution"),
    reputation: evidence("reputation"),
    rights: evidence("rights"),
    keeganHours: evidence("keeganHours"),
    ioanaHours: evidence("ioanaHours"),
    jeevesHours: evidence("jeevesHours"),
    cashCents: evidence("cashCents"),
  };
}

function draft(overrides: Partial<DecisionCandidateDraftV1> = {}): DecisionCandidateDraftV1 {
  return {
    id: "opportunity:arena-club",
    title: "Arena Club next activation",
    candidateType: "OPPORTUNITY",
    owner: "JEEVES",
    approvalClass: "REVIEW",
    evidenceState: "KNOWN",
    evidenceRefs: ["evidence:canonical-opportunity"],
    sourceRefs: ["source:crm-opportunity"],
    monetaryCase: null,
    monetaryCaseState: "NOT_ESTABLISHED",
    monetaryCaseEvidence: null,
    value: {
      strategicFit: 82,
      compoundingAdvantage: 70,
      relationshipAccess: 75,
      futureOptions: 78,
      learningValue: 66,
      urgency: 58,
      reversibility: 85,
    },
    risk: { execution: 22, reputation: 18, rights: 30 },
    resources: { keeganHours: 1, ioanaHours: 0, jeevesHours: 2, cashCents: 0 },
    fieldEvidence: fieldEvidence(),
    dependencyIds: [],
    conflictKeys: [],
    blockers: [],
    informationGainAction: null,
    safeNextStep: "Prepare an internal activation brief for review.",
    successMetric: "Keegan reviews a grounded activation option.",
    evaluationWindow: { start: "2026-09-19T08:00:00.000Z", end: "2026-10-19T08:00:00.000Z" },
    ...overrides,
  };
}

test("emits a canonical candidate only when every allocation dimension has fresh KNOWN evidence", () => {
  const result = assessDecisionPortfolioCandidateReadinessV1({ draft: draft(), evaluatedAt: now, maxAgeMs });

  assert.equal(result.state, "READY");
  assert.ok(result.candidate);
  assert.equal(result.candidate?.evidenceState, "KNOWN");
  assert.equal(result.candidate?.value.relationshipAccess, 75);
  assert.equal(result.candidate?.risk.rights, 30);
  assert.equal(result.candidate?.resources.jeevesHours, 2);
  assert.equal(result.candidate?.monetaryCase, null);
  assert.equal(result.monetaryCaseState, "NOT_ESTABLISHED");
  assert.ok(result.evidenceRefs.includes("evidence:relationshipAccess"));
  assert.ok(result.sourceRefs.includes("source:rights"));
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.verificationReasons, []);
  assert.deepEqual(result.authority, {
    persistPortfolio: false,
    selectWork: false,
    execute: false,
    externalAction: false,
    spend: false,
    changePrice: false,
    publish: false,
    outreach: false,
    approvalBypass: false,
  });
});

test("does not convert an absent scoring value into fake zero precision", () => {
  const input = draft({ value: { ...draft().value, relationshipAccess: null } });
  const result = assessDecisionPortfolioCandidateReadinessV1({ draft: input, evaluatedAt: now, maxAgeMs });

  assert.equal(result.state, "NEEDS_EVIDENCE");
  assert.equal(result.candidate, null);
  assert.deepEqual(result.missingFields, ["relationshipAccess"]);
});

test("requires field-level evidence even when a numeric value is present", () => {
  const evidenceMap = fieldEvidence();
  delete (evidenceMap as Partial<typeof evidenceMap>).futureOptions;
  const result = assessDecisionPortfolioCandidateReadinessV1({
    draft: draft({ fieldEvidence: evidenceMap }),
    evaluatedAt: now,
    maxAgeMs,
  });

  assert.equal(result.state, "NEEDS_EVIDENCE");
  assert.equal(result.candidate, null);
  assert.deepEqual(result.missingFields, ["futureOptions.evidence"]);
});

test("fails closed on inferred, stale, conflicted, or future allocation evidence", () => {
  const cases: Array<[string, DecisionCandidateFieldEvidenceV1, string]> = [
    ["inferred", evidence("urgency", { truthState: "INFERRED" }), "urgency_INFERRED"],
    ["conflicted", evidence("urgency", { truthState: "CONFLICTED" }), "urgency_CONFLICTED"],
    ["stale", evidence("urgency", { observedAt: "2026-09-18T00:00:00.000Z" }), "urgency_OUTSIDE_FRESHNESS_BOUND"],
    ["future", evidence("urgency", { observedAt: "2026-09-19T09:00:00.000Z" }), "urgency_FROM_FUTURE"],
  ];

  for (const [, field, reason] of cases) {
    const evidenceMap = fieldEvidence();
    evidenceMap.urgency = field;
    const result = assessDecisionPortfolioCandidateReadinessV1({
      draft: draft({ fieldEvidence: evidenceMap }),
      evaluatedAt: now,
      maxAgeMs,
    });
    assert.equal(result.state, "VERIFY_REQUIRED");
    assert.equal(result.candidate, null);
    assert.ok(result.verificationReasons.includes(reason));
  }
});

test("keeps unsupported monetary value explicitly not established", () => {
  const noMoney = assessDecisionPortfolioCandidateReadinessV1({ draft: draft(), evaluatedAt: now, maxAgeMs });
  assert.equal(noMoney.state, "READY");
  assert.equal(noMoney.candidate?.monetaryCase, null);

  const inconsistent = assessDecisionPortfolioCandidateReadinessV1({
    draft: draft({
      monetaryCaseState: "NOT_ESTABLISHED",
      monetaryCase: {
        currency: "USD",
        downsideCents: 0,
        baseCents: 100_000,
        upsideCents: 200_000,
        probabilityLow: 0.2,
        probabilityBase: 0.5,
        probabilityHigh: 0.8,
        calibrationClass: "REFERENCE_CLASS",
      },
    }),
    evaluatedAt: now,
    maxAgeMs,
  });
  assert.equal(inconsistent.state, "VERIFY_REQUIRED");
  assert.equal(inconsistent.candidate, null);
  assert.ok(inconsistent.verificationReasons.includes("MONETARY_CASE_PRESENT_WHILE_NOT_ESTABLISHED"));
});

test("requires direct evidence before a supported monetary case can enter the candidate", () => {
  const monetaryCase = {
    currency: "USD" as const,
    downsideCents: 0,
    baseCents: 100_000,
    upsideCents: 200_000,
    probabilityLow: 0.2,
    probabilityBase: 0.5,
    probabilityHigh: 0.8,
    calibrationClass: "REFERENCE_CLASS" as const,
  };

  const missing = assessDecisionPortfolioCandidateReadinessV1({
    draft: draft({ monetaryCaseState: "SUPPORTED", monetaryCase, monetaryCaseEvidence: null }),
    evaluatedAt: now,
    maxAgeMs,
  });
  assert.equal(missing.state, "NEEDS_EVIDENCE");
  assert.equal(missing.candidate, null);
  assert.ok(missing.missingFields.includes("monetaryCase.evidence"));

  const supported = assessDecisionPortfolioCandidateReadinessV1({
    draft: draft({
      monetaryCaseState: "SUPPORTED",
      monetaryCase,
      monetaryCaseEvidence: evidence("monetaryCase"),
    }),
    evaluatedAt: now,
    maxAgeMs,
  });
  assert.equal(supported.state, "READY");
  assert.equal(supported.candidate?.monetaryCase?.baseCents, 100_000);
  assert.ok(supported.evidenceRefs.includes("evidence:monetaryCase"));
});

test("does not let downstream allocator invent Keegan time for a Keegan-gated decision", () => {
  const result = assessDecisionPortfolioCandidateReadinessV1({
    draft: draft({
      owner: "KEEGAN",
      approvalClass: "KEEGAN",
      resources: { keeganHours: 0, ioanaHours: 0, jeevesHours: 0, cashCents: 0 },
    }),
    evaluatedAt: now,
    maxAgeMs,
  });

  assert.equal(result.state, "VERIFY_REQUIRED");
  assert.equal(result.candidate, null);
  assert.ok(result.verificationReasons.includes("KEEGAN_APPROVAL_REQUIRES_EXPLICIT_KEEGAN_TIME"));
});

test("preserves caller input and deep-freezes the readiness output", () => {
  const input = draft();
  const snapshot = structuredClone(input);
  const result = assessDecisionPortfolioCandidateReadinessV1({ draft: input, evaluatedAt: now, maxAgeMs });

  assert.deepEqual(input, snapshot);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.authority));
  assert.ok(Object.isFrozen(result.candidate));
  assert.ok(Object.isFrozen(result.candidate?.value));
});

test("rejects invalid freshness and fake supported monetary ranges", () => {
  assert.throws(
    () => assessDecisionPortfolioCandidateReadinessV1({ draft: draft(), evaluatedAt: now, maxAgeMs: Number.POSITIVE_INFINITY }),
    (error: unknown) => error instanceof DecisionCandidateReadinessError && error.code === "INVALID_FRESHNESS_POLICY",
  );

  assert.throws(
    () =>
      assessDecisionPortfolioCandidateReadinessV1({
        draft: draft({
          monetaryCaseState: "SUPPORTED",
          monetaryCaseEvidence: evidence("monetaryCase"),
          monetaryCase: {
            currency: "USD",
            downsideCents: 0,
            baseCents: 200_000,
            upsideCents: 100_000,
            probabilityLow: 0.2,
            probabilityBase: 0.5,
            probabilityHigh: 0.8,
            calibrationClass: "REFERENCE_CLASS",
          },
        }),
        evaluatedAt: now,
        maxAgeMs,
      }),
    (error: unknown) => error instanceof DecisionCandidateReadinessError && error.code === "INVALID_RANGE",
  );
});
