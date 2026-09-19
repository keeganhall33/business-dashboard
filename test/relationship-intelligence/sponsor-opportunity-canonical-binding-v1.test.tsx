import assert from "node:assert/strict";
import test from "node:test";

import type {
  SponsorOpportunityReadinessDecisionV1,
  SponsorOpportunityReadinessResultV1,
  SponsorOpportunityReadinessStatusV1
} from "../../src/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";
import {
  bindSponsorOpportunityCanonicalIdentityV1,
  type SponsorOpportunityCanonicalBindingEvidenceV1,
  type SponsorOpportunityCanonicalBindingInputV1
} from "../../src/lib/relationship-intelligence/sponsor-opportunity-canonical-binding-v1";

const GENERATED_AT = "2026-09-19T10:00:00.000Z";
const EVALUATED_AT = "2026-09-19T10:30:00.000Z";
const EVIDENCE = ["evidence:sponsor-readiness-1"] as const;
const BINDING_EVIDENCE = ["evidence:canonical-opportunity-binding-1"] as const;

function field<T>(value: T) {
  return { state: "KNOWN" as const, value, evidenceRefs: EVIDENCE };
}

function decision(
  overrides: Partial<SponsorOpportunityReadinessDecisionV1> = {}
): SponsorOpportunityReadinessDecisionV1 {
  return {
    candidateId: "candidate-1",
    status: "READY_TO_PREPARE",
    canonicalOrganizationRef: "org:sponsor",
    canonicalPersonRef: "person:buyer",
    ecosystemRole: field("SPONSOR_SIDE"),
    decisionFunction: field("SPORTS_MARKETING"),
    authorityClass: field("DECISION_MAKER"),
    accessStatus: "ACCESS_READY",
    planningDisposition: "WINDOW_OPEN",
    roleDisposition: "CURRENT_ROLE_SUPPORTED",
    idealOutreachDateRange: {
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-10-01T00:00:00.000Z"
    },
    timingRationale: "Explicit planning evidence places the current date inside the supported planning window.",
    nextInternalAction: "PREPARE_APPROVAL_READY_OUTREACH",
    evidenceRefs: EVIDENCE,
    gaps: [],
    reasonCodes: ["CURRENT_DECISION_MAKER_ROLE_CONFIRMED"],
    ...overrides
  };
}

function counts(decisions: readonly SponsorOpportunityReadinessDecisionV1[]) {
  const statuses: readonly SponsorOpportunityReadinessStatusV1[] = [
    "READY_TO_PREPARE",
    "PLAN_AHEAD",
    "ACCESS_BLOCKED",
    "MISSED_WINDOW",
    "RESEARCH_REQUIRED",
    "VERIFY_REQUIRED",
    "SUPPRESS"
  ];
  return Object.fromEntries(statuses.map((status) => [
    status,
    decisions.filter((item) => item.status === status).length
  ])) as SponsorOpportunityReadinessResultV1["counts"];
}

function readiness(
  decisions: readonly SponsorOpportunityReadinessDecisionV1[] = [decision()],
  overrides: Partial<SponsorOpportunityReadinessResultV1> = {}
): SponsorOpportunityReadinessResultV1 {
  return {
    version: "SPONSOR_OPPORTUNITY_READINESS_V1",
    generatedAt: GENERATED_AT,
    status: "READY",
    issues: [],
    decisions,
    counts: counts(decisions),
    limitations: ["fixture preserves source authority"],
    authority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    },
    ...overrides
  };
}

function binding(
  overrides: Partial<SponsorOpportunityCanonicalBindingEvidenceV1> = {}
): SponsorOpportunityCanonicalBindingEvidenceV1 {
  return {
    bindingId: "binding-1",
    candidateId: "candidate-1",
    canonicalOpportunityRef: "opportunity:sponsor-activation-2027",
    canonicalOrganizationRef: "org:sponsor",
    canonicalPersonRef: "person:buyer",
    observedAt: "2026-09-19T09:30:00.000Z",
    truthState: "KNOWN",
    basis: "EXPLICIT_CANONICAL_OPPORTUNITY_BINDING",
    evidenceRefs: BINDING_EVIDENCE,
    ...overrides
  };
}

function bind(
  source = readiness(),
  bindings: readonly SponsorOpportunityCanonicalBindingEvidenceV1[] = [binding()],
  overrides: Partial<SponsorOpportunityCanonicalBindingInputV1> = {}
) {
  return bindSponsorOpportunityCanonicalIdentityV1({
    evaluatedAt: EVALUATED_AT,
    readiness: source,
    bindings,
    maximumProjectionAgeMinutes: 60,
    maximumBindingAgeMinutes: 1_440,
    ...overrides
  });
}

test("binds sponsor readiness to an explicit exact canonical opportunity identity", () => {
  const result = bind();

  assert.equal(result.status, "READY");
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].disposition, "BOUND");
  assert.equal(result.records[0].bindingId, "binding-1");
  assert.equal(result.records[0].canonicalOpportunityRef, "opportunity:sponsor-activation-2027");
  assert.equal(result.records[0].readinessStatus, "READY_TO_PREPARE");
  assert.ok(result.records[0].evidenceRefs.includes(BINDING_EVIDENCE[0]));
  assert.equal(result.bindingPolicy, "EXACT_CANDIDATE_TO_EXPLICIT_CANONICAL_OPPORTUNITY_ONLY");
  assert.equal(result.authority.canonicalIdentityProjectionAllowed, true);
  assert.equal(result.authority.opportunityMutationAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("requires research instead of guessing a canonical opportunity when binding evidence is absent", () => {
  const result = bind(readiness(), []);

  assert.equal(result.records[0].disposition, "RESEARCH_REQUIRED");
  assert.equal(result.records[0].canonicalOpportunityRef, null);
  assert.equal(result.records[0].bindingId, null);
  assert.ok(result.records[0].reasonCodes.includes("EXACT_CANONICAL_OPPORTUNITY_BINDING_REQUIRED"));
});

test("fails closed on partial, conflicted, stale, and future binding evidence", () => {
  for (const evidence of [
    binding({ truthState: "PARTIAL" }),
    binding({ truthState: "CONFLICTED" }),
    binding({ observedAt: "2026-09-17T00:00:00.000Z" }),
    binding({ observedAt: "2026-09-19T11:00:00.000Z" })
  ]) {
    const result = bind(readiness(), [evidence]);
    assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
    assert.equal(result.records[0].canonicalOpportunityRef, null);
    assert.equal(result.records[0].bindingId, null);
  }
});

test("fails closed when binding organization or person expectations disagree with readiness", () => {
  const organizationMismatch = bind(readiness(), [binding({ canonicalOrganizationRef: "org:other" })]);
  assert.equal(organizationMismatch.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(organizationMismatch.records[0].reasonCodes.includes("BINDING_ORGANIZATION_MISMATCH"));

  const personMismatch = bind(readiness(), [binding({ canonicalPersonRef: "person:other" })]);
  assert.equal(personMismatch.records[0].disposition, "VERIFY_REQUIRED");
  assert.ok(personMismatch.records[0].reasonCodes.includes("BINDING_PERSON_MISMATCH"));
});

test("requires verification instead of choosing among multiple candidate bindings", () => {
  const result = bind(readiness(), [
    binding(),
    binding({ bindingId: "binding-2", canonicalOpportunityRef: "opportunity:other" })
  ]);

  assert.equal(result.status, "READY");
  assert.equal(result.records[0].disposition, "VERIFY_REQUIRED");
  assert.equal(result.records[0].canonicalOpportunityRef, null);
  assert.ok(result.records[0].reasonCodes.includes("MULTIPLE_BINDINGS_FOR_CANDIDATE"));
});

test("blocks structurally unsafe bindings that reference unknown candidates or duplicate binding identities", () => {
  const unknownCandidate = bind(readiness(), [binding({ candidateId: "candidate-missing" })]);
  assert.equal(unknownCandidate.status, "BLOCKED");
  assert.deepEqual(unknownCandidate.issues, ["BINDING_REFERENCES_UNKNOWN_CANDIDATE"]);
  assert.equal(unknownCandidate.records.length, 0);

  const duplicateId = bind(readiness(), [
    binding(),
    binding({ candidateId: "candidate-2" })
  ]);
  assert.equal(duplicateId.status, "BLOCKED");
  assert.ok(duplicateId.issues.includes("DUPLICATE_BINDING_ID"));
});

test("preserves upstream readiness state and never treats canonical identity as qualification", () => {
  const verifyDecision = decision({
    status: "VERIFY_REQUIRED",
    nextInternalAction: "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING",
    reasonCodes: ["CURRENT_ROLE_OR_EMPLOYMENT_REQUIRES_VERIFICATION"]
  });
  const result = bind(readiness([verifyDecision]));

  assert.equal(result.records[0].disposition, "BOUND");
  assert.equal(result.records[0].readinessStatus, "VERIFY_REQUIRED");
  assert.equal(result.records[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.records[0].opportunityCertainty, "NOT_ESTABLISHED");
  assert.equal(result.records[0].dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.records[0].confidence, "NOT_ESTABLISHED");
  assert.equal(result.records[0].monetaryValue, null);
});

test("never reactivates an upstream-suppressed candidate even when binding evidence exists", () => {
  const suppressed = decision({
    status: "SUPPRESS",
    nextInternalAction: "NONE",
    reasonCodes: ["UPSTREAM_SUPPRESSED"]
  });
  const result = bind(readiness([suppressed]));

  assert.equal(result.records[0].disposition, "SUPPRESS");
  assert.equal(result.records[0].canonicalOpportunityRef, null);
  assert.equal(result.records[0].bindingId, null);
});

test("blocks stale/future/not-ready readiness projections before binding", () => {
  const stale = bind(readiness(), [binding()], {
    evaluatedAt: "2026-09-19T12:00:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["READINESS_PROJECTION_STALE"]);

  const future = bind(readiness(), [binding()], {
    evaluatedAt: "2026-09-19T09:59:00.000Z"
  });
  assert.equal(future.status, "BLOCKED");
  assert.deepEqual(future.issues, ["READINESS_GENERATED_IN_FUTURE"]);

  const notReady = bind(readiness([decision()], { status: "BLOCKED", issues: ["upstream"] }));
  assert.equal(notReady.status, "BLOCKED");
  assert.ok(notReady.issues.includes("READINESS_NOT_READY"));
});

test("blocks widened source authority, count drift, duplicate candidates, and unsafe provenance", () => {
  const source = readiness();
  const widened = {
    ...source,
    authority: { ...source.authority, outreachAuthorized: true }
  } as unknown as SponsorOpportunityReadinessResultV1;
  assert.ok(bind(widened).issues.includes("READINESS_OUTREACH_NOT_ALLOWED"));

  const badCounts = {
    ...source,
    counts: { ...source.counts, READY_TO_PREPARE: 2 }
  } as SponsorOpportunityReadinessResultV1;
  assert.ok(bind(badCounts).issues.includes("READINESS_COUNT_MISMATCH"));

  const duplicate = {
    ...source,
    decisions: [source.decisions[0], source.decisions[0]],
    counts: { ...source.counts, READY_TO_PREPARE: 2 }
  } as SponsorOpportunityReadinessResultV1;
  assert.ok(bind(duplicate).issues.includes("READINESS_DUPLICATE_CANDIDATE_ID"));

  const unsafe = readiness([
    decision({ evidenceRefs: ["op://vault/item/field"] })
  ]);
  assert.ok(bind(unsafe).issues.includes("READINESS_UNSAFE_OR_INVALID_PROVENANCE"));
});

test("rejects credential-like canonical opportunity refs and unsupported binding basis", () => {
  assert.throws(
    () => bind(readiness(), [binding({ canonicalOpportunityRef: "op://vault/item/field" })]),
    /credential material/
  );

  assert.throws(
    () => bind(readiness(), [{ ...binding(), basis: "FUZZY_MATCH" as never }]),
    /basis is unsupported/
  );
});

test("is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const input: SponsorOpportunityCanonicalBindingInputV1 = {
    evaluatedAt: EVALUATED_AT,
    readiness: readiness(),
    bindings: [binding()],
    maximumProjectionAgeMinutes: 60,
    maximumBindingAgeMinutes: 1_440
  };
  const before = JSON.stringify(input);
  const first = bindSponsorOpportunityCanonicalIdentityV1(input);
  const second = bindSponsorOpportunityCanonicalIdentityV1(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.records), true);
  assert.equal(Object.isFrozen(first.records[0]), true);
  assert.equal(Object.isFrozen(first.records[0].evidenceRefs), true);
  assert.equal(Object.isFrozen(first.authority), true);
});
