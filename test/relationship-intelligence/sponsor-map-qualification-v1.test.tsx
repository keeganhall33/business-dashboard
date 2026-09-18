import assert from "node:assert/strict";
import test from "node:test";

import {
  qualifySponsorMapCandidatesV1,
  type SponsorMapCandidateV1,
  type SponsorMapEvidenceFieldV1,
  type SponsorMapTruthStateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";

const NOW = "2026-09-18T05:00:00.000Z";

function field<T>(value: T | null, state: SponsorMapTruthStateV1 = "KNOWN", evidenceRefs: readonly string[] = ["evidence:field"]): SponsorMapEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function candidate(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "sponsor-buyer-1",
    sourceRef: "source:official-company-bio",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:primary", "evidence:primary"],
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

function qualify(candidates: readonly SponsorMapCandidateV1[]) {
  return qualifySponsorMapCandidatesV1({ candidates, now: NOW });
}

test("qualifies an evidence-complete sponsor-side sports marketing buyer", () => {
  const result = qualify([candidate()]);
  const decision = result.decisions[0];

  assert.equal(decision.disposition, "QUALIFIED_FOR_GRAPH");
  assert.equal(decision.ecosystemRole.value, "SPONSOR_SIDE");
  assert.equal(decision.decisionFunction.value, "SPORTS_MARKETING");
  assert.equal(decision.authorityClass.value, "DECISION_MAKER");
  assert.deepEqual(decision.coverageGaps, []);
  assert.deepEqual(decision.evidenceRefs, ["evidence:primary"]);
});

test("distinguishes property-side sponsorship sales from sponsor-side activation", () => {
  const property = candidate({
    candidateId: "property-seller",
    duplicateKey: "property-seller",
    canonicalOrganizationRef: "org:athletics-property",
    ecosystemRole: field("PROPERTY_SIDE"),
    decisionFunction: field("SPONSORSHIP_SALES"),
    authorityClass: field("SALES_OWNER")
  });
  const sponsor = candidate({
    candidateId: "sponsor-activation",
    duplicateKey: "sponsor-activation",
    ecosystemRole: field("SPONSOR_SIDE"),
    decisionFunction: field("SPONSORSHIP_ACTIVATION"),
    authorityClass: field("BUDGET_OWNER")
  });
  const result = qualify([property, sponsor]);

  assert.equal(result.decisions.find((item) => item.candidateId === "property-seller")?.ecosystemRole.value, "PROPERTY_SIDE");
  assert.equal(result.decisions.find((item) => item.candidateId === "property-seller")?.decisionFunction.value, "SPONSORSHIP_SALES");
  assert.equal(result.decisions.find((item) => item.candidateId === "sponsor-activation")?.ecosystemRole.value, "SPONSOR_SIDE");
  assert.equal(result.decisions.find((item) => item.candidateId === "sponsor-activation")?.decisionFunction.value, "SPONSORSHIP_ACTIVATION");
});

test("represents agency and rightsholder intermediaries without inventing sponsor-side authority", () => {
  const result = qualify([
    candidate({
      candidateId: "rights-agency",
      duplicateKey: "rights-agency",
      canonicalOrganizationRef: "org:rightsholder-agency",
      ecosystemRole: field("AGENCY_OR_RIGHTSHOLDER"),
      decisionFunction: field("BRAND_PARTNERSHIPS"),
      authorityClass: field("GATEKEEPER")
    })
  ]);

  assert.equal(result.decisions[0].ecosystemRole.value, "AGENCY_OR_RIGHTSHOLDER");
  assert.equal(result.decisions[0].authorityClass.value, "GATEKEEPER");
  assert.equal(result.decisions[0].disposition, "QUALIFIED_FOR_GRAPH");
});

test("does not treat a public contact route as evidence of decision authority", () => {
  const result = qualify([
    candidate({
      authorityClass: field("UNKNOWN"),
      contactRoute: field("PUBLIC_PROFESSIONAL")
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.contactRoute.value, "PUBLIC_PROFESSIONAL");
  assert.equal(decision.authorityClass.value, "UNKNOWN");
  assert.equal(decision.disposition, "NEEDS_RESEARCH");
  assert.deepEqual(decision.coverageGaps, ["AUTHORITY_UNKNOWN"]);
});

test("keeps planning windows separate from event or season dates", () => {
  const result = qualify([
    candidate({
      planningWindow: field("Sponsor packages are shaped in Q4 2026."),
      eventOrSeasonDate: field("2027 football season")
    })
  ]);
  const decision = result.decisions[0];

  assert.equal(decision.planningWindow.value, "Sponsor packages are shaped in Q4 2026.");
  assert.equal(decision.eventOrSeasonDate?.value, "2027 football season");
  assert.notEqual(decision.planningWindow.value, decision.eventOrSeasonDate?.value);
});

test("never substitutes an event date for a missing planning window", () => {
  const result = qualify([
    candidate({
      planningWindow: field(null, "UNKNOWN"),
      eventOrSeasonDate: field("2027 championship")
    })
  ]);

  assert.equal(result.decisions[0].disposition, "NEEDS_RESEARCH");
  assert.ok(result.decisions[0].coverageGaps.includes("PLANNING_WINDOW_UNKNOWN"));
});

test("routes inferred, stale, and conflicted evidence to verification", () => {
  const variants: readonly [SponsorMapTruthStateV1, string][] = [
    ["INFERRED", "EVIDENCE_INFERRED_OR_PARTIAL"],
    ["PARTIAL", "EVIDENCE_INFERRED_OR_PARTIAL"],
    ["STALE", "EVIDENCE_STALE"],
    ["CONFLICTED", "EVIDENCE_CONFLICTED"]
  ];

  for (const [state, expectedGap] of variants) {
    const result = qualify([
      candidate({
        candidateId: `state-${state}`,
        duplicateKey: `state-${state}`,
        planningWindow: field("Evidence-supplied planning window.", state)
      })
    ]);
    assert.equal(result.decisions[0].disposition, "NEEDS_VERIFICATION");
    assert.ok(result.decisions[0].coverageGaps.includes(expectedGap as never));
  }
});

test("suppresses records without a canonical organization or source evidence", () => {
  const missingOrg = candidate({ candidateId: "missing-org", duplicateKey: "missing-org", canonicalOrganizationRef: null });
  const missingEvidence = candidate({ candidateId: "missing-evidence", duplicateKey: "missing-evidence", evidenceRefs: [] });
  const result = qualify([missingOrg, missingEvidence]);

  assert.equal(result.decisions.find((item) => item.candidateId === "missing-org")?.disposition, "SUPPRESS");
  assert.ok(result.decisions.find((item) => item.candidateId === "missing-org")?.coverageGaps.includes("MISSING_CANONICAL_ORGANIZATION"));
  assert.equal(result.decisions.find((item) => item.candidateId === "missing-evidence")?.disposition, "SUPPRESS");
  assert.ok(result.decisions.find((item) => item.candidateId === "missing-evidence")?.coverageGaps.includes("MISSING_EVIDENCE"));
});

test("suppresses an older duplicate source copy without multiplying confidence", () => {
  const result = qualify([
    candidate({ candidateId: "older", observedAt: "2026-09-16T18:00:00Z" }),
    candidate({ candidateId: "newer", observedAt: "2026-09-17T18:00:00Z" })
  ]);
  const older = result.decisions.find((item) => item.candidateId === "older");
  const newer = result.decisions.find((item) => item.candidateId === "newer");

  assert.equal(older?.disposition, "SUPPRESS");
  assert.equal(older?.duplicateOfCandidateId, "newer");
  assert.deepEqual(older?.reasonCodes, ["DUPLICATE_SOURCE_COPY"]);
  assert.equal(newer?.disposition, "QUALIFIED_FOR_GRAPH");
});

test("returns deterministic coverage gaps so research can target the missing fact", () => {
  const result = qualify([
    candidate({
      ecosystemRole: field("UNKNOWN"),
      decisionFunction: field("UNKNOWN"),
      authorityClass: field("UNKNOWN"),
      accessPath: field("UNKNOWN"),
      contactRoute: field("UNKNOWN"),
      planningWindow: field(null, "UNKNOWN")
    })
  ]);

  assert.deepEqual(result.decisions[0].coverageGaps, [
    "ECOSYSTEM_ROLE_UNKNOWN",
    "DECISION_FUNCTION_UNKNOWN",
    "AUTHORITY_UNKNOWN",
    "ACCESS_PATH_UNKNOWN",
    "CONTACT_ROUTE_UNKNOWN",
    "PLANNING_WINDOW_UNKNOWN"
  ]);
  assert.equal(result.decisions[0].disposition, "NEEDS_RESEARCH");
});

test("is deterministic, deeply immutable, and performs zero external side effects", () => {
  const input = { candidates: [candidate()], now: NOW } as const;
  const first = qualifySponsorMapCandidatesV1(input);
  const second = qualifySponsorMapCandidatesV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.decisions), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(Object.isFrozen(first.decisions[0].coverageGaps), true);
});
