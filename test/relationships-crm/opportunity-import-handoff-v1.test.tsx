import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffEvidenceFieldV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportCandidateV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";

function field(
  value: string | null,
  state: OpportunityHandoffTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:field"]
): OpportunityHandoffEvidenceFieldV1 {
  return { state, value, evidenceRefs };
}

function candidate(overrides: Partial<OpportunityImportCandidateV1> = {}): OpportunityImportCandidateV1 {
  return {
    sourceCandidateKey: "opportunity-1",
    title: "Sponsor-led college athletics activation",
    qualification: "QUALIFIED",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:2", "evidence:1", "evidence:1"],
    organizationRefs: ["org:sponsor"],
    summary: field("Evidence-backed opportunity summary."),
    whyNow: field("Planning work is active before the next season."),
    recommendedNextAction: field("Research the verified sponsorship planning owner."),
    planningWindow: field("Six to nine months."),
    ...overrides
  };
}

function compile(candidateInput: OpportunityImportCandidateV1, source: "CHATGPT" | "OPPORTUNITY_RADAR" = "CHATGPT") {
  return compileOpportunityImportHandoffV1({
    source,
    sourceInteractionRef: `${source.toLocaleLowerCase("en-US")}:interaction-1`,
    candidate: candidateInput
  });
}

test("compiles a qualified ChatGPT opportunity into an import-ready canonical handoff", () => {
  const result = compile(candidate());

  assert.equal(result.disposition, "READY_FOR_CANONICAL_UPSERT");
  assert.equal(result.canonicalMatchPolicy, "SOURCE_IDENTITY_ONLY");
  assert.deepEqual(result.reasonCodes, ["QUALIFIED_EVIDENCE_AND_ENTITY_ANCHOR"]);
  assert.deepEqual(result.payload.evidenceRefs, ["evidence:1", "evidence:2"]);
  assert.deepEqual(result.payload.organizationRefs, ["org:sponsor"]);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
});

test("links Opportunity Radar evidence only when an explicit canonical opportunity ref is supplied", () => {
  const result = compile(
    candidate({ existingOpportunityRef: "opportunity:arena-club", organizationRefs: [] }),
    "OPPORTUNITY_RADAR"
  );

  assert.equal(result.disposition, "LINK_TO_EXISTING");
  assert.equal(result.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
  assert.equal(result.payload.existingOpportunityRef, "opportunity:arena-club");
  assert.deepEqual(result.reasonCodes, ["EXPLICIT_EXISTING_OPPORTUNITY_REF"]);
});

test("preserves WATCH and CANDIDATE source states without silently promoting them", () => {
  const watch = compile(candidate({ qualification: "WATCH" }));
  const candidateState = compile(candidate({ qualification: "CANDIDATE" }));

  assert.equal(watch.disposition, "WATCH_ONLY");
  assert.deepEqual(watch.reasonCodes, ["SOURCE_CLASSIFIED_WATCH"]);
  assert.equal(candidateState.disposition, "NEEDS_VERIFICATION");
  assert.deepEqual(candidateState.reasonCodes, ["SOURCE_NOT_YET_QUALIFIED"]);
});

test("preserves non-KNOWN candidate truth states as verification-required", () => {
  const states: OpportunityHandoffTruthStateV1[] = ["INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"];

  for (const truthState of states) {
    const result = compile(candidate({ truthState }));
    assert.equal(result.disposition, "NEEDS_VERIFICATION");
    assert.equal(result.payload.truthState, truthState);
    assert.ok(result.reasonCodes.includes(`TRUTH_${truthState}_REQUIRES_VERIFICATION`));
  }
});

test("preserves non-KNOWN optional evidence fields instead of laundering them into canonical truth", () => {
  const states: OpportunityHandoffTruthStateV1[] = ["INFERRED", "UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"];

  for (const state of states) {
    const result = compile(candidate({ whyNow: field("Evidence needs review.", state) }));
    assert.equal(result.disposition, "NEEDS_VERIFICATION");
    assert.equal(result.payload.whyNow?.state, state);
    assert.ok(result.reasonCodes.includes(`FIELD_${state}_REQUIRES_VERIFICATION`));
  }
});

test("requires a canonical entity anchor before a new opportunity can be import-ready", () => {
  const result = compile(candidate({ personRefs: [], organizationRefs: [], existingOpportunityRef: null }));

  assert.equal(result.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("CANONICAL_ENTITY_ANCHOR_REQUIRED"));
});

test("uses stable source identity for idempotency rather than mutable prose", () => {
  const first = compileOpportunityImportHandoffV1({
    source: "CHATGPT",
    sourceInteractionRef: "chatgpt:interaction-a",
    candidate: candidate({ title: "First title" })
  });
  const retry = compileOpportunityImportHandoffV1({
    source: "CHATGPT",
    sourceInteractionRef: "chatgpt:interaction-b",
    candidate: candidate({ title: "Updated title", summary: field("Updated supported summary.") })
  });

  assert.equal(first.idempotencyKey, retry.idempotencyKey);
  assert.equal(first.handoffId, retry.handoffId);
});

test("does not merge unrelated opportunities merely because their titles match", () => {
  const first = compile(candidate({ sourceCandidateKey: "radar:a", title: "Same title" }), "OPPORTUNITY_RADAR");
  const second = compile(candidate({ sourceCandidateKey: "radar:b", title: "Same title" }), "OPPORTUNITY_RADAR");

  assert.notEqual(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.canonicalMatchPolicy, "SOURCE_IDENTITY_ONLY");
  assert.equal(second.canonicalMatchPolicy, "SOURCE_IDENTITY_ONLY");
});

test("rejects unsupported fields that could smuggle unverified business facts into the handoff", () => {
  for (const unsupported of ["contactEmail", "budget", "dealValue", "commitment"] as const) {
    const unsafeCandidate = { ...candidate(), [unsupported]: "unsupported" };
    assert.throws(
      () => compileOpportunityImportHandoffV1({
        source: "CHATGPT",
        sourceInteractionRef: "chatgpt:unsafe",
        candidate: unsafeCandidate as OpportunityImportCandidateV1
      }),
      /unsupported key/
    );
  }
});

test("requires evidence and returns a deeply immutable side-effect-free artifact", () => {
  assert.throws(() => compile(candidate({ evidenceRefs: [] })), /must be a non-empty array/);

  const result = compile(candidate());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
  assert.equal(Object.isFrozen(result.payload), true);
  assert.equal(Object.isFrozen(result.payload.evidenceRefs), true);
  assert.equal(Object.isFrozen(result.payload.summary), true);
});
