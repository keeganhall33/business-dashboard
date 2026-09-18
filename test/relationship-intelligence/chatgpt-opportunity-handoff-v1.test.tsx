import assert from "node:assert/strict";
import test from "node:test";

import {
  compileChatGptOpportunityHandoffV1,
  type ChatGptOpportunityHandoffInputV1,
} from "@/lib/relationship-intelligence/chatgpt-opportunity-handoff-v1";

function baseInput(): ChatGptOpportunityHandoffInputV1 {
  return {
    handoffId: "conversation-20260918-001",
    interactionRef: "chatgpt:conversation:conversation-20260918-001",
    observedAt: "2026-09-18T18:00:00.000Z",
    evaluatedAt: "2026-09-18T19:00:00.000Z",
    maximumSignalAgeDays: 14,
    evidenceRefs: ["evidence:owner-confirmed-opportunity-1", "evidence:canonical-org-1"],
    truthState: "KNOWN",
    signalType: "PARTNERSHIP_OPPORTUNITY",
    organizationRef: "organization:arena-club",
    opportunityRef: "opportunity:arena-club-chase",
  };
}

test("compiles a structured ChatGPT handoff into the canonical opportunity intake without granting write authority", () => {
  const result = compileChatGptOpportunityHandoffV1(baseInput());

  assert.equal(result.version, "CHATGPT_OPPORTUNITY_HANDOFF_V1");
  assert.equal(result.idempotencyKey, "CHATGPT:conversation-20260918-001");
  assert.equal(result.observation.sourceKind, "CHATGPT");
  assert.equal(result.observation.sourceEventKey, "external-expert-handoff:conversation-20260918-001");
  assert.equal(result.decision.canonicalOrganizationRef, "organization:arena-club");
  assert.equal(result.decision.canonicalOpportunityRef, "opportunity:arena-club-chase");
  assert.equal(result.decision.disposition, "CAPTURED_FOR_REVIEW");
  assert.equal(result.handoffState, "READY_FOR_INTERNAL_REVIEW");
  assert.equal(result.decision.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.decision.budgetAvailability, "NOT_ESTABLISHED");
  assert.equal(result.decision.dealLikelihood, "NOT_ESTABLISHED");
  assert.equal(result.authority.canonicalImportAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("is deterministic and provides a stable idempotency key for replay of the same structured handoff", () => {
  const first = compileChatGptOpportunityHandoffV1(baseInput());
  const second = compileChatGptOpportunityHandoffV1(baseInput());

  assert.deepEqual(second, first);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.decision.candidateId, second.decision.candidateId);
});

test("rejects raw transcript or other undeclared provider payload instead of persisting it through the handoff", () => {
  const unsafe = {
    ...baseInput(),
    transcript: "private raw conversation body",
  } as ChatGptOpportunityHandoffInputV1;

  assert.throws(
    () => compileChatGptOpportunityHandoffV1(unsafe),
    /input contains unsupported field: transcript/,
  );
});

test("requires opaque privacy-safe references rather than query strings, fragments, or free text", () => {
  assert.throws(
    () => compileChatGptOpportunityHandoffV1({
      ...baseInput(),
      interactionRef: "https://chatgpt.example/conversation?id=secret",
    }),
    /interactionRef must be an opaque reference/,
  );
  assert.throws(
    () => compileChatGptOpportunityHandoffV1({
      ...baseInput(),
      evidenceRefs: ["this is free text evidence"],
    }),
    /evidenceRefs\[0\] must be an opaque reference/,
  );
});

test("fails closed to research when no canonical entity anchor has been established", () => {
  const result = compileChatGptOpportunityHandoffV1({
    ...baseInput(),
    organizationRef: null,
    opportunityRef: null,
  });

  assert.equal(result.decision.disposition, "RESEARCH_REQUIRED");
  assert.equal(result.handoffState, "RESEARCH_REQUIRED");
  assert.ok(result.decision.reasonCodes.includes("NO_CANONICAL_ENTITY_ANCHOR"));
  assert.equal(result.decision.canonicalOrganizationRef, null);
  assert.equal(result.decision.canonicalOpportunityRef, null);
});

test("passes only evidence-lineage-backed planning, decision-maker, sponsorship, and warm-access claims", () => {
  const result = compileChatGptOpportunityHandoffV1({
    ...baseInput(),
    personRef: "person:verified-contact-1",
    evidenceRefs: [
      "evidence:owner-confirmed-opportunity-1",
      "evidence:canonical-org-1",
      "evidence:planning-window-1",
      "evidence:authority-1",
      "evidence:sponsorship-1",
      "evidence:warm-access-1",
    ],
    planningWindow: {
      startAt: "2026-10-01T00:00:00.000Z",
      endAt: "2026-11-01T00:00:00.000Z",
      rationale: "Explicit planning-window evidence is recorded in the canonical evidence reference.",
      evidenceRefs: ["evidence:planning-window-1"],
    },
    decisionMakerClaim: {
      authorityClass: "DECISION_MAKER",
      evidenceRefs: ["evidence:authority-1"],
    },
    sponsorshipRelationshipClaim: {
      state: "SUPPORTED",
      evidenceRefs: ["evidence:sponsorship-1"],
    },
    warmAccessClaim: {
      state: "SUPPORTED",
      evidenceRefs: ["evidence:warm-access-1"],
    },
  });

  assert.equal(result.decision.disposition, "CAPTURED_FOR_REVIEW");
  assert.equal(result.decision.planningWindow.state, "SUPPORTED");
  assert.equal(result.decision.decisionMakerAuthority.state, "SUPPORTED");
  assert.equal(result.decision.sponsorshipRelationship.state, "SUPPORTED");
  assert.equal(result.decision.warmAccess.state, "SUPPORTED");
  assert.equal(result.decision.sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(result.decision.opportunityCertainty, "NOT_ESTABLISHED");
});

test("routes a claim with evidence outside the handoff lineage to verification instead of accepting it", () => {
  const result = compileChatGptOpportunityHandoffV1({
    ...baseInput(),
    personRef: "person:verified-contact-1",
    decisionMakerClaim: {
      authorityClass: "DECISION_MAKER",
      evidenceRefs: ["evidence:not-in-handoff-lineage"],
    },
  });

  assert.equal(result.decision.disposition, "VERIFY_REQUIRED");
  assert.equal(result.handoffState, "VERIFY_REQUIRED");
  assert.ok(result.decision.reasonCodes.includes("DECISION_MAKER_CLAIM_EVIDENCE_NOT_IN_OBSERVATION_LINEAGE"));
});

test("requires an explicit bounded freshness policy and preserves stale truth from canonical intake", () => {
  assert.throws(
    () => compileChatGptOpportunityHandoffV1({
      ...baseInput(),
      maximumSignalAgeDays: Number.POSITIVE_INFINITY,
    }),
    /maximumSignalAgeDays must be an integer between 1 and 365/,
  );

  const stale = compileChatGptOpportunityHandoffV1({
    ...baseInput(),
    observedAt: "2026-08-01T18:00:00.000Z",
    truthState: "STALE",
    maximumSignalAgeDays: 14,
  });
  assert.equal(stale.decision.disposition, "RESEARCH_REQUIRED");
  assert.ok(stale.decision.reasonCodes.includes("SOURCE_TRUTH_STALE"));
  assert.ok(stale.decision.reasonCodes.includes("SOURCE_OBSERVATION_STALE"));
});

test("does not mutate the caller payload", () => {
  const input = baseInput();
  const before = JSON.stringify(input);

  compileChatGptOpportunityHandoffV1(input);

  assert.equal(JSON.stringify(input), before);
});
