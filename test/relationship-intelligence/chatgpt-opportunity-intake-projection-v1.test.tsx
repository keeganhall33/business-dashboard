import assert from "node:assert/strict";
import test from "node:test";

import {
  projectChatGptOpportunityIntoIntakeV1,
  type ChatGptOpportunitySignalContextV1
} from "../../src/lib/relationship-intelligence/chatgpt-opportunity-intake-projection-v1";
import {
  compileOpportunityImportHandoffV1,
  type OpportunityImportCandidateV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";

function candidate(overrides: Partial<OpportunityImportCandidateV1> = {}): OpportunityImportCandidateV1 {
  return {
    sourceCandidateKey: "chatgpt:sponsor-1",
    title: "Evidence-backed sponsor opportunity",
    qualification: "QUALIFIED",
    truthState: "KNOWN",
    evidenceRefs: ["evidence:chatgpt:1", "evidence:chatgpt:2"],
    organizationRefs: ["org:sponsor"],
    summary: {
      state: "KNOWN",
      value: "Structured supported summary.",
      evidenceRefs: ["evidence:chatgpt:1"]
    },
    ...overrides
  };
}

function handoff(overrides: Partial<OpportunityImportCandidateV1> = {}, source: "CHATGPT" | "OPPORTUNITY_RADAR" = "CHATGPT") {
  return compileOpportunityImportHandoffV1({
    source,
    sourceInteractionRef: `${source.toLocaleLowerCase("en-US")}:conversation-1`,
    candidate: candidate(overrides)
  });
}

function context(overrides: Partial<ChatGptOpportunitySignalContextV1> = {}): ChatGptOpportunitySignalContextV1 {
  return {
    signalType: "SPONSORSHIP_OPPORTUNITY",
    signalEvidenceRefs: ["evidence:chatgpt:1"],
    observedAt: "2026-09-18T18:00:00.000Z",
    ...overrides
  };
}

function project(
  compiledHandoff = handoff(),
  signalContext = context()
) {
  return projectChatGptOpportunityIntoIntakeV1({
    handoff: compiledHandoff,
    context: signalContext,
    evaluatedAt: "2026-09-18T19:00:00.000Z"
  });
}

test("projects an explicitly classified evidence-backed ChatGPT handoff into canonical intake", () => {
  const result = project();

  assert.equal(result.disposition, "EMITTED");
  assert.deepEqual(result.reasonCodes, ["CHATGPT_HANDOFF_READY"]);
  assert.equal(result.observation?.sourceKind, "CHATGPT");
  assert.equal(result.observation?.sourceRef, "chatgpt:conversation-1");
  assert.equal(result.observation?.signalType, "SPONSORSHIP_OPPORTUNITY");
  assert.equal(result.observation?.organizationRef, "org:sponsor");
  assert.equal(result.observation?.personRef, null);
  assert.equal(result.observation?.opportunityRef, null);
  assert.deepEqual(result.observation?.evidenceRefs, ["evidence:chatgpt:1"]);
  assert.equal(result.observation?.planningWindow, null);
  assert.equal(result.observation?.decisionMakerClaim, null);
  assert.equal(result.observation?.sponsorshipRelationshipClaim, null);
  assert.equal(result.observation?.warmAccessClaim, null);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.relationshipMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});

test("preserves only an explicit existing opportunity link", () => {
  const result = project(handoff({ existingOpportunityRef: "opportunity:arena-club", organizationRefs: [] }));

  assert.equal(result.disposition, "EMITTED");
  assert.deepEqual(result.reasonCodes, ["EXPLICIT_EXISTING_OPPORTUNITY_LINK"]);
  assert.equal(result.observation?.opportunityRef, "opportunity:arena-club");
});

test("refuses to turn a verification-required ChatGPT candidate into an intake observation", () => {
  const result = project(handoff({ qualification: "CANDIDATE" }));

  assert.equal(result.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(result.reasonCodes, ["HANDOFF_REQUIRES_VERIFICATION"]);
  assert.equal(result.observation, null);
});

test("suppresses watch-only handoffs instead of promoting them", () => {
  const result = project(handoff({ qualification: "WATCH" }));

  assert.equal(result.disposition, "SUPPRESSED");
  assert.deepEqual(result.reasonCodes, ["HANDOFF_WATCH_ONLY"]);
  assert.equal(result.observation, null);
});

test("withholds forged ready handoffs whose qualification or truth state cannot support emission", () => {
  const compiled = handoff();
  const payloadPatches = [
    { qualification: "CANDIDATE" },
    { qualification: "WATCH" },
    { truthState: "STALE" },
    { truthState: "PARTIAL" },
    { truthState: "CONFLICTED" }
  ] as const;

  for (const payloadPatch of payloadPatches) {
    const forged = {
      ...compiled,
      disposition: "READY_FOR_CANONICAL_UPSERT",
      payload: { ...compiled.payload, ...payloadPatch }
    } as unknown as typeof compiled;
    const result = project(forged);

    assert.equal(result.disposition, "VERIFY_REQUIRED");
    assert.deepEqual(result.reasonCodes, ["HANDOFF_SEMANTICS_INCONSISTENT"]);
    assert.equal(result.observation, null);
  }
});

test("withholds forged ready handoffs with conflicted field evidence or no canonical entity anchor", () => {
  const compiled = handoff();
  const conflictedField = {
    ...compiled,
    disposition: "READY_FOR_CANONICAL_UPSERT",
    payload: {
      ...compiled.payload,
      summary: compiled.payload.summary == null
        ? null
        : { ...compiled.payload.summary, state: "CONFLICTED" as const }
    }
  } as unknown as typeof compiled;
  const noAnchor = {
    ...compiled,
    disposition: "READY_FOR_CANONICAL_UPSERT",
    payload: {
      ...compiled.payload,
      organizationRefs: [],
      personRefs: [],
      existingOpportunityRef: null
    }
  } as unknown as typeof compiled;

  for (const forged of [conflictedField, noAnchor]) {
    const result = project(forged);
    assert.equal(result.disposition, "VERIFY_REQUIRED");
    assert.deepEqual(result.reasonCodes, ["HANDOFF_SEMANTICS_INCONSISTENT"]);
    assert.equal(result.observation, null);
  }
});

test("requires a non-empty exact existing opportunity ref for link dispositions", () => {
  const compiled = handoff({ existingOpportunityRef: "opportunity:arena-club", organizationRefs: [] });

  for (const existingOpportunityRef of [null, "   "] as const) {
    const forged = {
      ...compiled,
      disposition: "LINK_TO_EXISTING",
      payload: { ...compiled.payload, existingOpportunityRef }
    } as unknown as typeof compiled;
    const result = project(forged);

    assert.equal(result.disposition, "VERIFY_REQUIRED");
    assert.deepEqual(result.reasonCodes, ["HANDOFF_SEMANTICS_INCONSISTENT"]);
    assert.equal(result.observation, null);
  }
});

test("requires emission disposition to agree with canonical match policy", () => {
  const ready = handoff();
  const linked = handoff({ existingOpportunityRef: "opportunity:arena-club", organizationRefs: [] });
  const forgedReady = {
    ...ready,
    canonicalMatchPolicy: "EXPLICIT_EXISTING_REF_ONLY"
  } as unknown as typeof ready;
  const forgedLink = {
    ...linked,
    canonicalMatchPolicy: "SOURCE_IDENTITY_ONLY"
  } as unknown as typeof linked;

  for (const forged of [forgedReady, forgedLink]) {
    const result = project(forged);
    assert.equal(result.disposition, "VERIFY_REQUIRED");
    assert.deepEqual(result.reasonCodes, ["HANDOFF_SEMANTICS_INCONSISTENT"]);
    assert.equal(result.observation, null);
  }
});

test("requires exact unambiguous canonical entity anchors", () => {
  const organizations = project(handoff({ organizationRefs: ["org:a", "org:b"] }));
  assert.equal(organizations.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(organizations.reasonCodes, ["AMBIGUOUS_CANONICAL_ORGANIZATION"]);
  assert.equal(organizations.observation, null);

  const people = project(handoff({ organizationRefs: [], personRefs: ["person:a", "person:b"] }));
  assert.equal(people.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(people.reasonCodes, ["AMBIGUOUS_CANONICAL_PERSON"]);
  assert.equal(people.observation, null);
});

test("rejects non-ChatGPT handoffs rather than relabeling another provider as ChatGPT", () => {
  assert.throws(() => project(handoff({}, "OPPORTUNITY_RADAR")), /handoff.source must be CHATGPT/);
});

test("requires signal classification evidence to be inside the handoff lineage", () => {
  assert.throws(
    () => project(handoff(), context({ signalEvidenceRefs: ["evidence:not-in-handoff"] })),
    /must be contained in handoff evidence lineage/
  );
});

test("requires explicit signal classification and never infers it from prose", () => {
  assert.throws(
    () => project(handoff({ title: "This title sounds like a warm intro" }), context({ signalType: "NONE" as never })),
    /context.signalType is unsupported/
  );
});

test("fails closed on future observations", () => {
  assert.throws(
    () => project(handoff(), context({ observedAt: "2026-09-18T20:00:00.000Z" })),
    /must not be future-dated/
  );
});

test("returns a deeply immutable side-effect-free projection", () => {
  const result = project();

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasonCodes), true);
  assert.equal(Object.isFrozen(result.observation), true);
  assert.equal(Object.isFrozen(result.observation?.evidenceRefs), true);
  assert.equal(Object.isFrozen(result.authority), true);
});
