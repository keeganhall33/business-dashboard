import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewCompanyBrainAssumptionLineageV1,
  type CompanyBrainAssumptionTransitionEvidenceV1,
} from "../../../src/lib/intelligence/organizational-learning/company-brain-assumption-lineage-review-v1";
import type {
  DecisionAssumptionV1,
  DecisionMemoryRecordV1,
} from "../../../src/lib/intelligence/organizational-learning/decision-memory-v1";

const NOW = "2026-09-19T19:30:00.000Z";
const MAX_AGE = 24 * 60 * 60 * 1000;

function assumption(
  assumptionId: string,
  statement = `Statement ${assumptionId}`,
  material = true,
): DecisionAssumptionV1 {
  return {
    assumptionId,
    statement: {
      state: "KNOWN",
      value: statement,
      evidenceRefs: [`evidence:${assumptionId}`],
    },
    material,
    revisitTrigger: material ? `Revisit ${assumptionId}` : null,
  };
}

function record(overrides: Partial<DecisionMemoryRecordV1> = {}): DecisionMemoryRecordV1 {
  return {
    contractVersion: "DecisionMemoryV1",
    policyVersion: "decision_memory_v1.0.0",
    recordId: "record:1",
    decisionId: "decision:strategy-1",
    decisionClass: "STRATEGY",
    decidedAt: "2026-09-19T17:00:00.000Z",
    actorRef: "person:keegan",
    context: {
      state: "KNOWN",
      value: "Strategy context",
      evidenceRefs: ["evidence:context"],
    },
    selectedAlternativeId: "alternative:1",
    alternatives: [{
      alternativeId: "alternative:1",
      label: "Selected path",
      description: {
        state: "KNOWN",
        value: "Selected path",
        evidenceRefs: ["evidence:alternative"],
      },
    }],
    rationale: {
      state: "KNOWN",
      value: "Recorded rationale",
      evidenceRefs: ["evidence:rationale"],
    },
    assumptions: [assumption("assumption:a")],
    confidence: {
      state: "KNOWN",
      value: "MEDIUM",
      evidenceRefs: ["evidence:confidence"],
    },
    expectedOutcomes: [],
    successCriteria: [],
    failureCriteria: [],
    revisitTriggers: [],
    validUntil: null,
    approval: {
      authorityClass: "KEEGAN_BUSINESS_JUDGMENT",
      approvalState: "APPROVED",
      approvedByRef: "person:keegan",
      approvedAt: "2026-09-19T17:05:00.000Z",
      evidenceRefs: ["evidence:approval"],
    },
    actionState: "PLANNED",
    actionEvidenceRefs: ["evidence:action"],
    supersedesDecisionId: null,
    sourceRefs: ["source:strategy-1"],
    integrityFlags: [],
    outcomeObservation: null,
    priorRecordId: null,
    actionAuthority: {
      analysisOnly: true,
      persistenceAuthorized: false,
      externalActionAuthorized: false,
      pricingChangeAuthorized: false,
      negotiationAuthorized: false,
      spendAuthorized: false,
      publishAuthorized: false,
    },
    ...overrides,
  };
}

function transition(
  overrides: Partial<CompanyBrainAssumptionTransitionEvidenceV1> = {},
): CompanyBrainAssumptionTransitionEvidenceV1 {
  return {
    transitionId: "transition:a-to-b",
    decisionId: "decision:strategy-1",
    fromRecordId: "record:1",
    toRecordId: "record:2",
    assumptionId: "assumption:a",
    kind: "REPLACED",
    replacementAssumptionId: "assumption:b",
    observedAt: "2026-09-19T18:10:00.000Z",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:transition:a-to-b"],
    sourceRefs: ["source:decision-note"],
    ...overrides,
  };
}

function review(
  records: readonly DecisionMemoryRecordV1[],
  transitions: readonly CompanyBrainAssumptionTransitionEvidenceV1[] = [],
  overrides: Partial<{
    evaluatedAt: string;
    maximumSourceAgeMs: number;
  }> = {},
) {
  return reviewCompanyBrainAssumptionLineageV1({
    records,
    transitions,
    evaluatedAt: overrides.evaluatedAt ?? NOW,
    maximumSourceAgeMs: overrides.maximumSourceAgeMs ?? MAX_AGE,
  });
}

test("preserves a current evidence-backed assumption without inventing business meaning", () => {
  const result = review([record()]);

  assert.equal(result.state, "READY");
  assert.deepEqual(result.currentAssumptionIds, ["assumption:a"]);
  assert.equal(result.assumptions[0]?.state, "CURRENT");
  assert.equal(result.assumptions[0]?.causality, "NOT_ESTABLISHED");
  assert.equal(result.assumptions[0]?.confidence, "NOT_ESTABLISHED");
  assert.equal(result.monetaryValue, null);
  assert.equal(result.inferredOutcome, null);
  assert.equal(result.recommendedReplacement, null);
  assert.equal(result.authority.persistenceAuthorized, false);
  assert.equal(result.authority.assumptionMutationAuthorized, false);
  assert.equal(result.authority.policyPromotionAuthorized, false);
  assert.equal(result.authority.pricingChangeAuthorized, false);
  assert.equal(result.authority.negotiationActionAuthorized, false);
  assert.equal(result.authority.reallocationAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
  assert.equal(result.authority.approvalBypassAuthorized, false);
});

test("preserves explicit retirement and replacement across exact record lineage", () => {
  const first = record({
    assumptions: [assumption("assumption:a"), assumption("assumption:c")],
  });
  const second = record({
    recordId: "record:2",
    decidedAt: "2026-09-19T18:00:00.000Z",
    priorRecordId: "record:1",
    assumptions: [assumption("assumption:b")],
  });
  const result = review([second, first], [
    transition(),
    transition({
      transitionId: "transition:retire-c",
      assumptionId: "assumption:c",
      kind: "RETIRED",
      replacementAssumptionId: null,
      evidenceRefs: ["evidence:transition:retire-c"],
    }),
  ]);

  assert.equal(result.state, "READY");
  assert.deepEqual(result.sourceRecordIds, ["record:1", "record:2"]);
  assert.deepEqual(result.currentAssumptionIds, ["assumption:b"]);
  assert.deepEqual(result.explicitlyReplacedAssumptionIds, ["assumption:a"]);
  assert.deepEqual(result.explicitlyRetiredAssumptionIds, ["assumption:c"]);
  assert.equal(
    result.assumptions.find((item) => item.assumptionId === "assumption:a")?.replacementAssumptionId,
    "assumption:b",
  );
  assert.deepEqual(result.unresolvedRemovedAssumptionIds, []);
});

test("fails closed when a removed assumption has no explicit transition evidence", () => {
  const result = review([
    record(),
    record({
      recordId: "record:2",
      decidedAt: "2026-09-19T18:00:00.000Z",
      priorRecordId: "record:1",
      assumptions: [assumption("assumption:b")],
    }),
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("REMOVAL_WITHOUT_EXPLICIT_TRANSITION"));
  assert.deepEqual(result.unresolvedRemovedAssumptionIds, ["assumption:a"]);
  assert.equal(
    result.assumptions.find((item) => item.assumptionId === "assumption:a")?.state,
    "UNRESOLVED_REMOVAL",
  );
});

test("rejects assumption identity drift under a retained assumption id", () => {
  const result = review([
    record(),
    record({
      recordId: "record:2",
      decidedAt: "2026-09-19T18:00:00.000Z",
      priorRecordId: "record:1",
      assumptions: [assumption("assumption:a", "Materially different statement")],
    }),
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("ASSUMPTION_IDENTITY_DRIFT"));
});

test("rejects forked or disconnected record lineage instead of choosing a branch", () => {
  const first = record();
  const second = record({
    recordId: "record:2",
    decidedAt: "2026-09-19T18:00:00.000Z",
    priorRecordId: "record:1",
  });
  const third = record({
    recordId: "record:3",
    decidedAt: "2026-09-19T18:05:00.000Z",
    priorRecordId: "record:1",
  });
  const result = review([first, second, third]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("LINEAGE_FORK"));
  assert.ok(result.reasonCodes.includes("LINEAGE_CYCLE_OR_DISCONNECTED"));
});

test("rejects stale, future-dated, or non-KNOWN transition evidence", () => {
  const first = record();
  const second = record({
    recordId: "record:2",
    decidedAt: "2026-09-19T18:00:00.000Z",
    priorRecordId: "record:1",
    assumptions: [assumption("assumption:b")],
  });

  const stale = review([first, second], [transition({ observedAt: "2026-09-17T18:10:00.000Z" })]);
  assert.equal(stale.state, "VERIFY_SOURCE");
  assert.ok(stale.reasonCodes.includes("TRANSITION_STALE"));

  const future = review([first, second], [transition({ observedAt: "2026-09-20T18:10:00.000Z" })]);
  assert.equal(future.state, "VERIFY_SOURCE");
  assert.ok(future.reasonCodes.includes("TRANSITION_FUTURE_DATED"));

  const inferred = review([first, second], [transition({ truthState: "INFERRED" })]);
  assert.equal(inferred.state, "VERIFY_SOURCE");
  assert.ok(inferred.reasonCodes.includes("TRANSITION_NOT_KNOWN"));
});

test("rejects malformed replacement semantics and transition provenance gaps", () => {
  const first = record();
  const second = record({
    recordId: "record:2",
    decidedAt: "2026-09-19T18:00:00.000Z",
    priorRecordId: "record:1",
    assumptions: [assumption("assumption:b")],
  });

  const wrongTarget = review([first, second], [transition({ replacementAssumptionId: "assumption:missing" })]);
  assert.equal(wrongTarget.state, "VERIFY_SOURCE");
  assert.ok(wrongTarget.reasonCodes.includes("REPLACEMENT_TARGET_NOT_ADDED"));

  const missingEvidence = review([first, second], [transition({ evidenceRefs: [] })]);
  assert.equal(missingEvidence.state, "VERIFY_SOURCE");
  assert.ok(missingEvidence.reasonCodes.includes("TRANSITION_EVIDENCE_MISSING"));

  const missingSource = review([first, second], [transition({ sourceRefs: [] })]);
  assert.equal(missingSource.state, "VERIFY_SOURCE");
  assert.ok(missingSource.reasonCodes.includes("TRANSITION_SOURCE_MISSING"));
});

test("detects replacement cycles and retired assumption resurrection", () => {
  const first = record({ assumptions: [assumption("assumption:a")] });
  const second = record({
    recordId: "record:2",
    decidedAt: "2026-09-19T17:45:00.000Z",
    priorRecordId: "record:1",
    assumptions: [assumption("assumption:b")],
  });
  const third = record({
    recordId: "record:3",
    decidedAt: "2026-09-19T18:15:00.000Z",
    priorRecordId: "record:2",
    assumptions: [assumption("assumption:a")],
  });
  const result = review([first, second, third], [
    transition({
      toRecordId: "record:2",
      assumptionId: "assumption:a",
      replacementAssumptionId: "assumption:b",
      observedAt: "2026-09-19T17:50:00.000Z",
    }),
    transition({
      transitionId: "transition:b-to-a",
      fromRecordId: "record:2",
      toRecordId: "record:3",
      assumptionId: "assumption:b",
      replacementAssumptionId: "assumption:a",
      observedAt: "2026-09-19T18:20:00.000Z",
      evidenceRefs: ["evidence:transition:b-to-a"],
    }),
  ]);

  assert.equal(result.state, "VERIFY_SOURCE");
  assert.ok(result.reasonCodes.includes("REPLACEMENT_CYCLE"));
  assert.ok(result.reasonCodes.includes("RETIRED_ASSUMPTION_REINTRODUCED"));
});

test("rejects widened source authority and unresolved source integrity", () => {
  const widened = record({
    actionAuthority: {
      ...record().actionAuthority,
      externalActionAuthorized: true,
    } as DecisionMemoryRecordV1["actionAuthority"],
  });
  const unresolved = record({
    recordId: "record:unresolved",
    integrityFlags: ["MATERIAL_ASSUMPTION_UNRESOLVED"],
  });

  const widenedResult = review([widened]);
  assert.equal(widenedResult.state, "VERIFY_SOURCE");
  assert.ok(widenedResult.reasonCodes.includes("SOURCE_AUTHORITY_WIDENED"));

  const unresolvedResult = review([unresolved]);
  assert.equal(unresolvedResult.state, "VERIFY_SOURCE");
  assert.ok(unresolvedResult.reasonCodes.includes("SOURCE_INTEGRITY_UNRESOLVED"));
});

test("is deterministic, deeply immutable, and does not mutate inputs", () => {
  const inputRecord = record();
  const before = structuredClone(inputRecord);
  const first = review([inputRecord]);
  const second = review([inputRecord]);

  assert.equal(first.reviewId, second.reviewId);
  assert.deepEqual(inputRecord, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.assumptions), true);
  assert.equal(Object.isFrozen(first.assumptions[0]), true);
});
