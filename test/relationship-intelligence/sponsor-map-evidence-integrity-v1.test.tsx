import assert from "node:assert/strict";
import test from "node:test";

import {
  qualifySponsorMapCandidatesV1,
  type SponsorMapCandidateV1,
  type SponsorMapEvidenceFieldV1,
  type SponsorMapTruthStateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";

const NOW = "2026-09-18T12:30:00.000Z";

function field<T>(
  value: T | null,
  state: SponsorMapTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:field"]
): SponsorMapEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function candidate(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "sponsor-buyer-1",
    sourceRef: "source:official-company-bio",
    observedAt: "2026-09-18T10:00:00.000Z",
    evidenceRefs: ["evidence:record"],
    canonicalOrganizationRef: "org:sponsor-brand",
    canonicalPersonRef: "person:sports-marketing-lead",
    duplicateKey: "sponsor-brand:sports-marketing",
    ecosystemRole: field("SPONSOR_SIDE"),
    decisionFunction: field("SPORTS_MARKETING"),
    authorityClass: field("DECISION_MAKER"),
    accessPath: field("WARM"),
    contactRoute: field("PUBLIC_PROFESSIONAL"),
    planningWindow: field("Annual activation planning begins 6-9 months before season."),
    eventOrSeasonDate: field("2027 season"),
    ...overrides
  };
}

function decisionFor(input: SponsorMapCandidateV1) {
  return qualifySponsorMapCandidatesV1({ candidates: [input], now: NOW }).decisions[0];
}

test("keeps an evidence-complete sponsor map candidate decision-grade", () => {
  const decision = decisionFor(candidate());

  assert.equal(decision.disposition, "QUALIFIED_FOR_GRAPH");
  assert.deepEqual(decision.coverageGaps, []);
});

test("fails closed when a KNOWN asserted sponsor field has no field-level evidence", () => {
  const decision = decisionFor(
    candidate({
      decisionFunction: field("SPORTS_MARKETING", "KNOWN", [])
    })
  );

  assert.equal(decision.disposition, "NEEDS_VERIFICATION");
  assert.ok(decision.coverageGaps.includes("MISSING_FIELD_EVIDENCE"));
  assert.notEqual(decision.disposition, "QUALIFIED_FOR_GRAPH");
});

test("does not let UNKNOWN truth carry asserted decision authority into the graph", () => {
  const decision = decisionFor(
    candidate({
      authorityClass: field("DECISION_MAKER", "UNKNOWN", ["evidence:unresolved-authority"])
    })
  );

  assert.equal(decision.disposition, "NEEDS_VERIFICATION");
  assert.ok(decision.coverageGaps.includes("TRUTH_VALUE_CONFLICT"));
  assert.equal(decision.authorityClass.state, "UNKNOWN");
  assert.equal(decision.authorityClass.value, "DECISION_MAKER");
});

test("treats an asserted planning window marked UNKNOWN as a truth-value conflict", () => {
  const decision = decisionFor(
    candidate({
      planningWindow: field("Q4 budget planning", "UNKNOWN", ["evidence:planning-window-unresolved"])
    })
  );

  assert.equal(decision.disposition, "NEEDS_VERIFICATION");
  assert.ok(decision.coverageGaps.includes("PLANNING_WINDOW_UNKNOWN"));
  assert.ok(decision.coverageGaps.includes("TRUTH_VALUE_CONFLICT"));
});

test("optional event timing cannot smuggle an asserted value through UNKNOWN truth", () => {
  const decision = decisionFor(
    candidate({
      eventOrSeasonDate: field("2027 championship weekend", "UNKNOWN", ["evidence:event-date-unresolved"])
    })
  );

  assert.equal(decision.disposition, "NEEDS_VERIFICATION");
  assert.ok(decision.coverageGaps.includes("TRUTH_VALUE_CONFLICT"));
});

test("preserves zero external authority while surfacing evidence-integrity verification work", () => {
  const result = qualifySponsorMapCandidatesV1({
    candidates: [candidate({ accessPath: field("WARM", "KNOWN", []) })],
    now: NOW
  });

  assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
  assert.equal(result.externalResearchPerformed, false);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.decisions[0]), true);
});
