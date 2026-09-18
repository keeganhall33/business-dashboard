import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOpportunityImportHandoffV1,
  type OpportunityImportCandidateV1,
  type OpportunityImportHandoffResultV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  compileCanonicalOpportunityUpsertPlanV1,
  type CanonicalOpportunitySnapshotV1
} from "../../src/lib/relationships-crm/canonical-opportunity-upsert-plan-v1";

function candidate(overrides: Partial<OpportunityImportCandidateV1> = {}): OpportunityImportCandidateV1 {
  return {
    sourceCandidateKey: "boardroom:story-1",
    title: "Sponsor-led college athletics activation",
    qualification: "QUALIFIED",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:story", "evidence:story"],
    organizationRefs: ["org:sponsor"],
    summary: { state: "KNOWN", value: "Qualified sponsor signal.", evidenceRefs: ["evidence:summary"] },
    whyNow: { state: "KNOWN", value: "Planning is active.", evidenceRefs: ["evidence:timing"] },
    recommendedNextAction: {
      state: "KNOWN",
      value: "Research the verified decision function.",
      evidenceRefs: ["evidence:action"]
    },
    planningWindow: { state: "KNOWN", value: "Q1 planning window.", evidenceRefs: ["evidence:window"] },
    ...overrides
  };
}

function handoff(
  overrides: Partial<OpportunityImportCandidateV1> = {},
  source: "BOARDROOM" | "CHATGPT" | "OPPORTUNITY_RADAR" = "BOARDROOM"
): OpportunityImportHandoffResultV1 {
  return compileOpportunityImportHandoffV1({
    source,
    sourceInteractionRef: `${source.toLowerCase()}:interaction-1`,
    candidate: candidate(overrides)
  });
}

function snapshot(overrides: Partial<CanonicalOpportunitySnapshotV1> = {}): CanonicalOpportunitySnapshotV1 {
  const sourceHandoff = handoff();
  return {
    opportunityRef: "opportunity:sponsor-activation",
    active: true,
    lifecycleState: "QUALIFIED",
    truthState: "KNOWN",
    entityRefs: ["org:sponsor"],
    sourceIdentities: [
      {
        source: sourceHandoff.source,
        sourceCandidateKey: sourceHandoff.payload.sourceCandidateKey,
        idempotencyKey: sourceHandoff.idempotencyKey,
        evidenceRefs: ["evidence:story"]
      }
    ],
    evidenceRefs: ["evidence:action", "evidence:story", "evidence:summary", "evidence:timing", "evidence:window"],
    ...overrides
  };
}

test("prepares a new canonical opportunity from a qualified evidence-backed handoff", () => {
  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: []
  });

  assert.equal(result.disposition, "CREATE");
  assert.equal(result.matchBasis, "NONE");
  assert.equal(result.mutation?.kind, "CREATE_CANONICAL_OPPORTUNITY");
  assert.equal(result.mutation?.lifecycleIntent, "CREATE_QUALIFIED");
  assert.deepEqual(result.mutation?.entityRefs, ["org:sponsor"]);
  assert.deepEqual(result.mutation?.evidenceRefs, [
    "evidence:action",
    "evidence:story",
    "evidence:summary",
    "evidence:timing",
    "evidence:window"
  ]);
  assert.equal(result.canonicalPersistenceTarget, "CANONICAL_CRM_OPPORTUNITIES");
  assert.equal(result.legacyOpportunityPipelineAllowed, false);
  assert.equal(result.persistenceMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
});

test("prepares an evidence-only update when an explicit existing opportunity ref is supplied", () => {
  const linked = handoff({ existingOpportunityRef: "opportunity:sponsor-activation" }, "CHATGPT");
  const existing = snapshot({ sourceIdentities: [], evidenceRefs: ["evidence:older"] });

  const result = compileCanonicalOpportunityUpsertPlanV1({ handoff: linked, existingOpportunities: [existing] });

  assert.equal(result.disposition, "UPDATE");
  assert.equal(result.matchedOpportunityRef, "opportunity:sponsor-activation");
  assert.equal(result.matchBasis, "EXPLICIT_EXISTING_REF");
  assert.equal(result.mutation?.kind, "UPDATE_CANONICAL_OPPORTUNITY");
  assert.equal(result.mutation?.lifecycleIntent, "PRESERVE_EXISTING");
});

test("uses exact recorded source identity for idempotency and returns no change when evidence is already present", () => {
  const incoming = handoff();
  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: incoming,
    existingOpportunities: [snapshot()]
  });

  assert.equal(result.disposition, "NO_CHANGE");
  assert.equal(result.matchBasis, "EXACT_SOURCE_IDENTITY");
  assert.equal(result.matchedOpportunityRef, "opportunity:sponsor-activation");
  assert.equal(result.mutation, null);
});

test("prepares an update for the same source identity only when new evidence is present", () => {
  const incoming = handoff({ evidenceRefs: ["evidence:story", "evidence:new"] });
  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: incoming,
    existingOpportunities: [snapshot()]
  });

  assert.equal(result.disposition, "UPDATE");
  assert.equal(result.matchBasis, "EXACT_SOURCE_IDENTITY");
  assert.ok(result.mutation?.evidenceRefs.includes("evidence:new"));
  assert.equal(result.mutation?.lifecycleIntent, "PRESERVE_EXISTING");
});

test("never merges a different source identity merely because the title and entity look similar", () => {
  const incoming = handoff({ sourceCandidateKey: "boardroom:story-2" });
  const unrelated = snapshot();

  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: incoming,
    existingOpportunities: [unrelated]
  });

  assert.equal(result.disposition, "CREATE");
  assert.equal(result.matchedOpportunityRef, null);
  assert.equal(result.matchBasis, "NONE");
});

test("fails closed when one exact source identity appears on multiple canonical opportunities", () => {
  const first = snapshot();
  const second = snapshot({ opportunityRef: "opportunity:duplicate-source" });

  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: [first, second]
  });

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["EXACT_SOURCE_IDENTITY_AMBIGUOUS"]);
  assert.equal(result.mutation, null);
});

test("fails closed when an explicit existing opportunity ref cannot be found", () => {
  const linked = handoff({ existingOpportunityRef: "opportunity:missing" }, "OPPORTUNITY_RADAR");
  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: linked,
    existingOpportunities: [snapshot()]
  });

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["EXPLICIT_EXISTING_OPPORTUNITY_NOT_FOUND"]);
  assert.equal(result.mutation, null);
});

test("fails closed when canonical entity anchors conflict", () => {
  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: [snapshot({ entityRefs: ["org:different-sponsor"] })]
  });

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["CANONICAL_ENTITY_ANCHOR_CONFLICT"]);
  assert.equal(result.mutation, null);
});

test("protects inactive, conflicted, and terminal opportunities from silent updates", () => {
  const inactive = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: [snapshot({ active: false })]
  });
  assert.equal(inactive.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(inactive.reasonCodes, ["CANONICAL_OPPORTUNITY_INACTIVE"]);

  const conflicted = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: [snapshot({ truthState: "CONFLICTED" })]
  });
  assert.equal(conflicted.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(conflicted.reasonCodes, ["CANONICAL_TRUTH_CONFLICTED_REQUIRES_VERIFICATION"]);

  for (const lifecycleState of ["WON", "LOST", "DISMISSED"] as const) {
    const terminal = compileCanonicalOpportunityUpsertPlanV1({
      handoff: handoff(),
      existingOpportunities: [snapshot({ lifecycleState })]
    });
    assert.equal(terminal.disposition, "VERIFY_REQUIRED");
    assert.deepEqual(terminal.reasonCodes, [`TERMINAL_${lifecycleState}_PRESERVED`]);
    assert.equal(terminal.mutation, null);
  }
});

test("keeps WATCH, CANDIDATE, and verification-required source states non-mutating", () => {
  const watch = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff({ qualification: "WATCH" }),
    existingOpportunities: []
  });
  assert.equal(watch.disposition, "SUPPRESS");
  assert.equal(watch.mutation, null);

  const candidateState = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff({ qualification: "CANDIDATE" }),
    existingOpportunities: []
  });
  assert.equal(candidateState.disposition, "VERIFY_REQUIRED");
  assert.equal(candidateState.mutation, null);

  const stale = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff({ truthState: "STALE" }),
    existingOpportunities: []
  });
  assert.equal(stale.disposition, "VERIFY_REQUIRED");
  assert.equal(stale.mutation, null);
});

test("fails closed when an explicit link conflicts with an exact source identity already owned by another record", () => {
  const linked = handoff({ existingOpportunityRef: "opportunity:explicit" });
  const sourceOwner = snapshot({ opportunityRef: "opportunity:source-owner" });
  const explicitTarget = snapshot({ opportunityRef: "opportunity:explicit", sourceIdentities: [] });

  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: linked,
    existingOpportunities: [sourceOwner, explicitTarget]
  });

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["SOURCE_IDENTITY_CROSS_RECORD_CONFLICT"]);
  assert.equal(result.mutation, null);
});

test("fails closed on duplicate canonical refs instead of selecting one", () => {
  const first = snapshot();
  const duplicate = snapshot({ sourceIdentities: [] });

  const result = compileCanonicalOpportunityUpsertPlanV1({
    handoff: handoff(),
    existingOpportunities: [first, duplicate]
  });

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.equal(result.reasonCodes[0], "CANONICAL_SNAPSHOT_DUPLICATE_REF");
  assert.ok(result.reasonCodes.includes("opportunity:sponsor-activation"));
  assert.equal(result.mutation, null);
});

test("returns a deeply immutable plan and never grants execution or external-action authority", () => {
  const result = compileCanonicalOpportunityUpsertPlanV1({ handoff: handoff(), existingOpportunities: [] });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
  assert.equal(Object.isFrozen(result.mutation), true);
  assert.equal(Object.isFrozen(result.mutation?.entityRefs), true);
  assert.equal(Object.isFrozen(result.mutation?.evidenceRefs), true);
  assert.equal(Object.isFrozen(result.mutation?.sourceIdentity), true);
  assert.equal(result.persistenceMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
  assert.equal(result.legacyOpportunityPipelineAllowed, false);
});
