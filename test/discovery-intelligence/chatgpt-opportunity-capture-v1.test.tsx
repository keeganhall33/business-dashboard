import assert from "node:assert/strict";
import test from "node:test";
import {
  CHATGPT_OPPORTUNITY_CAPTURE_VERSION,
  compileChatGPTOpportunityCaptureV1,
  type ChatGPTOpportunityCaptureInputV1
} from "../../src/lib/discovery-intelligence/chatgpt-opportunity-capture-v1";

function baseInput(overrides: Partial<ChatGPTOpportunityCaptureInputV1> = {}): ChatGPTOpportunityCaptureInputV1 {
  return {
    conversationRef: "chat:conv-42",
    messageRef: "message:108",
    origin: "USER_EXPLICIT",
    intent: "SAVE_QUALIFIED",
    intentEvidenceRefs: ["chat:message:108:user-directive"],
    candidate: {
      sourceCandidateKey: "chat-opportunity:arena-club-2026",
      title: {
        state: "KNOWN",
        value: "Arena Club card-art collaboration",
        evidenceRefs: ["chat:message:108:title"]
      },
      truthState: "KNOWN",
      evidenceRefs: ["chat:message:108:opportunity-facts"],
      organizationRefs: ["org:arena-club"],
      summary: {
        state: "KNOWN",
        value: "Explicitly discussed collaboration scope.",
        evidenceRefs: ["chat:message:108:summary"]
      }
    },
    ...overrides
  };
}

test("explicit user save compiles into the canonical ChatGPT opportunity handoff when evidence is known", () => {
  const result = compileChatGPTOpportunityCaptureV1(baseInput());

  assert.equal(result.version, CHATGPT_OPPORTUNITY_CAPTURE_VERSION);
  assert.equal(result.requestedQualification, "QUALIFIED");
  assert.equal(result.effectiveQualification, "QUALIFIED");
  assert.equal(result.handoff.source, "CHATGPT");
  assert.equal(result.handoff.sourceInteractionRef, "chat:conv-42#message:108");
  assert.equal(result.handoff.disposition, "READY_FOR_CANONICAL_UPSERT");
  assert.equal(result.handoff.canonicalMatchPolicy, "SOURCE_IDENTITY_ONLY");
  assert.deepEqual(result.handoff.payload.organizationRefs, ["org:arena-club"]);
  assert.ok(result.handoff.payload.evidenceRefs.includes("chat:message:108:user-directive"));
  assert.ok(result.handoff.payload.evidenceRefs.includes("chat:message:108:title"));
  assert.ok(result.handoff.payload.evidenceRefs.includes("chat:message:108:opportunity-facts"));
});

test("assistant suggestions cannot self-qualify an opportunity", () => {
  const result = compileChatGPTOpportunityCaptureV1(
    baseInput({
      origin: "ASSISTANT_SUGGESTED",
      intent: "SAVE_QUALIFIED"
    })
  );

  assert.equal(result.requestedQualification, "QUALIFIED");
  assert.equal(result.effectiveQualification, "CANDIDATE");
  assert.equal(result.handoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("ASSISTANT_SUGGESTION_CANNOT_SELF_QUALIFY_OPPORTUNITY"));
  assert.ok(result.reasonCodes.includes("QUALIFICATION_REQUIRES_EXPLICIT_USER_DIRECTIVE"));
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
});

test("linking to an existing opportunity requires an explicit canonical opportunity ref", () => {
  const missingRef = compileChatGPTOpportunityCaptureV1(baseInput({ intent: "LINK_EXISTING" }));
  assert.equal(missingRef.effectiveQualification, "CANDIDATE");
  assert.equal(missingRef.handoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(missingRef.reasonCodes.includes("LINK_EXISTING_REQUIRES_EXPLICIT_CANONICAL_OPPORTUNITY_REF"));

  const linked = compileChatGPTOpportunityCaptureV1({
    ...baseInput({ intent: "LINK_EXISTING" }),
    candidate: {
      ...baseInput().candidate,
      existingOpportunityRef: "opportunity:arena-club"
    }
  });
  assert.equal(linked.effectiveQualification, "QUALIFIED");
  assert.equal(linked.handoff.disposition, "LINK_TO_EXISTING");
  assert.equal(linked.handoff.payload.existingOpportunityRef, "opportunity:arena-club");
  assert.equal(linked.handoff.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
});

test("unknown or stale source truth stays verification-required even after explicit user save intent", () => {
  for (const truthState of ["UNKNOWN", "STALE", "PARTIAL", "CONFLICTED", "INFERRED"] as const) {
    const result = compileChatGPTOpportunityCaptureV1({
      ...baseInput(),
      candidate: {
        ...baseInput().candidate,
        truthState
      }
    });
    assert.equal(result.effectiveQualification, "QUALIFIED");
    assert.equal(result.handoff.disposition, "NEEDS_VERIFICATION");
    assert.ok(result.handoff.reasonCodes.includes(`TRUTH_${truthState}_REQUIRES_VERIFICATION`));
  }
});

test("uncertain planning windows are preserved as uncertain and block canonical upsert", () => {
  const result = compileChatGPTOpportunityCaptureV1({
    ...baseInput(),
    candidate: {
      ...baseInput().candidate,
      planningWindow: {
        state: "INFERRED",
        value: "Q1 2027",
        evidenceRefs: ["chat:message:108:planning-window-inference"]
      }
    }
  });

  assert.equal(result.handoff.disposition, "NEEDS_VERIFICATION");
  assert.equal(result.handoff.payload.planningWindow?.state, "INFERRED");
  assert.equal(result.handoff.payload.planningWindow?.value, "Q1 2027");
  assert.ok(result.handoff.reasonCodes.includes("FIELD_INFERRED_REQUIRES_VERIFICATION"));
  assert.equal(result.inferredTiming, false);
});

test("a qualified capture needs a canonical entity anchor instead of a name-only guess", () => {
  const candidate = { ...baseInput().candidate, organizationRefs: [], personRefs: [] };
  const result = compileChatGPTOpportunityCaptureV1({ ...baseInput(), candidate });

  assert.equal(result.handoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.handoff.reasonCodes.includes("CANONICAL_ENTITY_ANCHOR_REQUIRED"));
  assert.equal(result.inferredContactInfo, false);
  assert.equal(result.inferredRelationship, false);
  assert.equal(result.inferredSponsorship, false);
});

test("watch and candidate intents never gain canonical-upsert authority", () => {
  const watch = compileChatGPTOpportunityCaptureV1(baseInput({ intent: "WATCH" }));
  assert.equal(watch.effectiveQualification, "WATCH");
  assert.equal(watch.handoff.disposition, "WATCH_ONLY");

  const candidate = compileChatGPTOpportunityCaptureV1(baseInput({ intent: "TRACK_CANDIDATE" }));
  assert.equal(candidate.effectiveQualification, "CANDIDATE");
  assert.equal(candidate.handoff.disposition, "NEEDS_VERIFICATION");
});

test("qualified capture requires independently evidenced known title context", () => {
  const result = compileChatGPTOpportunityCaptureV1({
    ...baseInput(),
    candidate: {
      ...baseInput().candidate,
      title: {
        state: "INFERRED",
        value: "Possible Arena Club activation",
        evidenceRefs: ["chat:message:108:inferred-title"]
      }
    }
  });

  assert.equal(result.requestedQualification, "QUALIFIED");
  assert.equal(result.effectiveQualification, "CANDIDATE");
  assert.equal(result.handoff.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("QUALIFICATION_REQUIRES_KNOWN_TITLE_EVIDENCE"));
});

test("intent evidence and opportunity evidence are independently required", () => {
  assert.throws(
    () => compileChatGPTOpportunityCaptureV1(baseInput({ intentEvidenceRefs: [] })),
    /intentEvidenceRefs must be a non-empty array/
  );

  assert.throws(
    () =>
      compileChatGPTOpportunityCaptureV1({
        ...baseInput(),
        candidate: { ...baseInput().candidate, evidenceRefs: [] }
      }),
    /candidate\.evidenceRefs must be a non-empty array/
  );
});

test("capture is deterministic, immutable, and performs no writes or external actions", () => {
  const input = baseInput();
  const first = compileChatGPTOpportunityCaptureV1(input);
  const second = compileChatGPTOpportunityCaptureV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.handoff.idempotencyKey, second.handoff.idempotencyKey);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.handoff), true);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
  assert.equal(first.handoff.crmMutationPerformed, false);
  assert.equal(first.handoff.externalActionPerformed, false);
  assert.equal(first.handoff.writeAuthorityGranted, false);
});

test("unsupported fields are rejected instead of silently becoming opportunity facts", () => {
  assert.throws(
    () =>
      compileChatGPTOpportunityCaptureV1({
        ...baseInput(),
        candidate: {
          ...baseInput().candidate,
          // @ts-expect-error deliberate contract violation
          inferredEmail: "someone@example.com"
        }
      }),
    /candidate contains unsupported key inferredEmail/
  );
});
