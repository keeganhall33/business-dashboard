import assert from "node:assert/strict";
import test from "node:test";

import {
  compileIonosBusinessMessageContentHandoffV1,
  type IonosBusinessMessageClaimV1
} from "../../src/lib/discovery-intelligence/ionos-business-message-content-handoff-v1";
import type {
  IonosEmailCommunicationClassV1,
  IonosEmailDirectionV1,
  IonosEmailOpportunitySignalClassV1
} from "../../src/lib/discovery-intelligence/ionos-email-opportunity-capture-v1";
import type { IonosMailboxRoleV1 } from "../../src/lib/email/ionos-mailbox-config-v1";
import type { OpportunityHandoffTruthStateV1 } from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  prioritizeIonosHighValueHistorySweepV1,
  type IonosHighValueHistorySweepInputV1
} from "../../src/lib/relationship-intelligence/ionos-high-value-history-sweep-v1";

const NOW = "2026-09-19T17:00:00.000Z";
const WINDOW_START = "2024-09-19T00:00:00.000Z";
const DEFAULT_ROLE_ORDER: readonly IonosMailboxRoleV1[] = [
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
];

type RecordOptions = Readonly<{
  messageRef?: string;
  threadRef?: string;
  observedAt?: string;
  mailboxRole?: IonosMailboxRoleV1;
  communicationClass?: IonosEmailCommunicationClassV1;
  direction?: IonosEmailDirectionV1;
  signalClass?: IonosEmailOpportunitySignalClassV1;
  truthState?: OpportunityHandoffTruthStateV1;
  personRef?: string | null;
  organizationRef?: string | null;
  existingOpportunityRef?: string | null;
  proposal?: boolean;
  introduction?: boolean;
  commitment?: boolean;
  nextStep?: boolean;
}>;

function record(options: RecordOptions = {}) {
  const messageRef = options.messageRef ?? "message:1";
  const threadRef = options.threadRef ?? "thread:1";
  const observedAt = options.observedAt ?? "2026-08-15T12:00:00.000Z";
  const mailboxRole = options.mailboxRole ?? "PERSONAL_HIGH_VALUE_RELATIONSHIP";
  const communicationClass = options.communicationClass ?? "DIRECT_HUMAN";
  const direction = options.direction ?? "INBOUND";
  const signalClass = options.signalClass ?? "PARTNERSHIP";
  const truthState = options.truthState ?? "KNOWN";
  const personRef = options.personRef === undefined ? "person:partner" : options.personRef;
  const organizationRef = options.organizationRef === undefined ? "org:partner" : options.organizationRef;
  const existingOpportunityRef = options.existingOpportunityRef ?? null;

  const parts = [
    `Signal ${signalClass}.`,
    options.proposal ? " Proposal discussed." : "",
    options.introduction ? " Introduction documented." : "",
    options.commitment ? " Commitment documented." : "",
    options.nextStep ? " Next step documented." : ""
  ];
  const rawText = parts.join("");
  const prefix = messageRef.replace(/[^a-zA-Z0-9]/g, "-");
  const claims: IonosBusinessMessageClaimV1[] = [];
  const candidateEvidenceRefs: string[] = [];

  function claim(kind: IonosBusinessMessageClaimV1["kind"], needle: string, suffix: string) {
    const startOffset = rawText.indexOf(needle);
    assert.notEqual(startOffset, -1);
    const evidenceRef = `evidence:${prefix}:${suffix}`;
    claims.push({
      claimId: `claim:${prefix}:${suffix}`,
      kind,
      state: truthState,
      evidenceRef,
      startOffset,
      endOffset: startOffset + needle.length,
      signalClass: kind === "OPPORTUNITY_SIGNAL" ? signalClass : null
    });
    candidateEvidenceRefs.push(evidenceRef);
    return evidenceRef;
  }

  const signalEvidenceRef = claim("OPPORTUNITY_SIGNAL", `Signal ${signalClass}.`, "signal");
  if (options.proposal) claim("PROPOSAL", "Proposal discussed.", "proposal");
  if (options.introduction) claim("INTRODUCTION", "Introduction documented.", "introduction");
  if (options.commitment) claim("COMMITMENT", "Commitment documented.", "commitment");
  const nextStepEvidenceRef = options.nextStep ? claim("NEXT_STEP", "Next step documented.", "next-step") : null;

  return compileIonosBusinessMessageContentHandoffV1({
    mailboxRole,
    canonicalMessageRef: messageRef,
    canonicalThreadRef: threadRef,
    observedAt,
    evaluatedAt: NOW,
    communicationClass,
    direction,
    contentPolicy: "AUTHORIZED_TEXT_ONLY",
    attachmentPolicy: "NONE",
    rawText,
    extractionRef: `extraction:${prefix}`,
    extractionRequiresVerification: truthState !== "KNOWN",
    claims,
    candidate: {
      sourceCandidateKey: `candidate:${prefix}`,
      signalClass,
      truthState,
      evidenceRefs: candidateEvidenceRefs,
      title: {
        state: truthState,
        value: `${signalClass} business discussion`,
        evidenceRefs: [signalEvidenceRef]
      },
      recommendedNextAction: nextStepEvidenceRef ? {
        state: truthState,
        value: "Review the documented next step.",
        evidenceRefs: [nextStepEvidenceRef]
      } : null,
      personRefs: personRef ? [personRef] : [],
      organizationRefs: organizationRef ? [organizationRef] : [],
      existingOpportunityRef
    }
  });
}

function sweep(
  records: IonosHighValueHistorySweepInputV1["records"],
  overrides: Partial<Omit<IonosHighValueHistorySweepInputV1, "records">> = {}
) {
  return prioritizeIonosHighValueHistorySweepV1({
    records,
    now: NOW,
    windowStart: WINDOW_START,
    priorityMailboxRoles: DEFAULT_ROLE_ORDER,
    maximumThreads: 50,
    ...overrides
  });
}

test("front-loads exact strategic, existing-opportunity, proposal, and two-way evidence without calling it a reply", () => {
  const result = sweep([
    record({
      messageRef: "message:inbound",
      threadRef: "thread:strategic",
      direction: "INBOUND",
      signalClass: "PARTNERSHIP",
      organizationRef: "org:strategic-brand",
      existingOpportunityRef: "opportunity:canonical-1",
      proposal: true
    }),
    record({
      messageRef: "message:outbound",
      threadRef: "thread:strategic",
      observedAt: "2026-08-16T12:00:00.000Z",
      direction: "OUTBOUND",
      signalClass: "EXPLICIT_FOLLOW_UP",
      organizationRef: "org:strategic-brand",
      existingOpportunityRef: "opportunity:canonical-1",
      nextStep: true
    })
  ], { strategicEntityRefs: ["org:strategic-brand"] });

  assert.equal(result.queue.length, 1);
  const thread = result.queue[0];
  assert.equal(thread.reviewBand, "REVIEW_FIRST");
  assert.equal(thread.twoWayObserved, true);
  assert.equal(thread.replyStateEstablished, false);
  assert.deepEqual(thread.matchedStrategicEntityRefs, ["org:strategic-brand"]);
  assert.deepEqual(thread.opportunityRefs, ["opportunity:canonical-1"]);
  assert.ok(thread.reasonCodes.includes("EXACT_CALLER_STRATEGIC_ENTITY_MATCH"));
  assert.ok(thread.reasonCodes.includes("EXPLICIT_EXISTING_OPPORTUNITY_REFERENCE"));
  assert.ok(thread.reasonCodes.includes("EVIDENCED_FRONTLOAD_CLAIM_PROPOSAL"));
  assert.equal(thread.opportunityQualificationEstablished, false);
  assert.equal(thread.sponsorshipEstablished, false);
});

test("uses only exact canonical strategic-entity matches and never fuzzy name adjacency", () => {
  const result = sweep([
    record({
      messageRef: "message:fuzzy",
      threadRef: "thread:fuzzy",
      signalClass: "OTHER_BUSINESS",
      organizationRef: "org:alpha-inc"
    })
  ], { strategicEntityRefs: ["org:alpha"] });

  assert.equal(result.queue[0].reviewBand, "REVIEW_NEXT");
  assert.deepEqual(result.queue[0].matchedStrategicEntityRefs, []);
  assert.equal(result.queue[0].reasonCodes.includes("EXACT_CALLER_STRATEGIC_ENTITY_MATCH"), false);
});

test("routes partial or conflicted evidence to verification instead of upgrading the opportunity", () => {
  const result = sweep([
    record({
      messageRef: "message:partial",
      threadRef: "thread:partial",
      signalClass: "SPONSORSHIP",
      truthState: "PARTIAL",
      proposal: true
    })
  ]);

  const thread = result.queue[0];
  assert.equal(thread.reviewBand, "VERIFY_BEFORE_REVIEW");
  assert.equal(thread.truthState, "PARTIAL");
  assert.ok(thread.reasonCodes.includes("THREAD_TRUTH_PARTIAL_REQUIRES_VERIFICATION"));
  assert.ok(thread.reasonCodes.includes("UPSTREAM_CAPTURE_REQUIRES_VERIFICATION"));
  assert.equal(thread.confidenceEstablished, false);
  assert.equal(thread.monetaryValueEstablished, false);
});

test("suppresses non-human correspondence and records outside the caller-owned history window", () => {
  const result = sweep([
    record({
      messageRef: "message:automation",
      threadRef: "thread:automation",
      communicationClass: "MARKETING_AUTOMATION",
      signalClass: "OTHER_BUSINESS"
    }),
    record({
      messageRef: "message:old",
      threadRef: "thread:old",
      observedAt: "2024-01-01T00:00:00.000Z",
      signalClass: "PARTNERSHIP"
    })
  ]);

  assert.equal(result.queue.length, 0);
  const reasons = result.suppressed.flatMap((item) => item.reasonCodes);
  assert.ok(reasons.includes("NON_HUMAN_CORRESPONDENCE_SUPPRESSED"));
  assert.ok(reasons.includes("OUTSIDE_CALLER_HISTORY_WINDOW"));
});

test("uses the caller-owned mailbox order rather than assuming an address-to-role mapping", () => {
  const result = sweep([
    record({
      messageRef: "message:personal",
      threadRef: "thread:personal",
      mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
      signalClass: "LICENSING",
      observedAt: "2026-09-01T12:00:00.000Z"
    }),
    record({
      messageRef: "message:assistant",
      threadRef: "thread:assistant",
      mailboxRole: "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
      signalClass: "LICENSING",
      observedAt: "2026-08-01T12:00:00.000Z"
    })
  ], {
    priorityMailboxRoles: [
      "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
      "PERSONAL_HIGH_VALUE_RELATIONSHIP",
      "MARKETING_FUNNELKIT"
    ]
  });

  assert.deepEqual(result.queue.map((item) => item.canonicalThreadRef), ["thread:assistant", "thread:personal"]);
});

test("treats unknown communication or direction state as verification work", () => {
  const result = sweep([
    record({
      messageRef: "message:unknown-class",
      threadRef: "thread:unknown-class",
      communicationClass: "UNKNOWN",
      signalClass: "PARTNERSHIP"
    }),
    record({
      messageRef: "message:unknown-direction",
      threadRef: "thread:unknown-direction",
      direction: "UNKNOWN",
      signalClass: "PARTNERSHIP"
    })
  ]);

  assert.equal(result.queue.length, 2);
  assert.ok(result.queue.every((item) => item.reviewBand === "VERIFY_BEFORE_REVIEW"));
  const reasonCodes = result.queue.flatMap((item) => item.reasonCodes);
  assert.ok(reasonCodes.includes("DIRECT_HUMAN_CLASSIFICATION_NOT_ESTABLISHED"));
  assert.ok(reasonCodes.includes("MESSAGE_DIRECTION_REQUIRES_VERIFICATION"));
});

test("deduplicates exact repeated message evidence but fails closed on duplicate identity disagreement", () => {
  const first = record({ messageRef: "message:dup", threadRef: "thread:dup", signalClass: "PARTNERSHIP" });
  const exactRepeat = record({ messageRef: "message:dup", threadRef: "thread:dup", signalClass: "PARTNERSHIP" });
  const result = sweep([first, exactRepeat]);

  assert.equal(result.queue.length, 1);
  assert.equal(result.queue[0].messageCount, 1);

  const disagreement = record({ messageRef: "message:dup", threadRef: "thread:dup", signalClass: "LICENSING" });
  assert.throws(
    () => sweep([first, disagreement]),
    /duplicate canonical message identity disagrees/
  );
});

test("caps deterministically and preserves zero mutation, authority, and deep immutability", () => {
  const result = sweep([
    record({ messageRef: "message:a", threadRef: "thread:a", signalClass: "PARTNERSHIP", observedAt: "2026-09-01T00:00:00Z" }),
    record({ messageRef: "message:b", threadRef: "thread:b", signalClass: "PARTNERSHIP", observedAt: "2026-08-01T00:00:00Z" })
  ], { maximumThreads: 1 });

  assert.deepEqual(result.queue.map((item) => item.canonicalThreadRef), ["thread:a"]);
  assert.ok(result.suppressed.some((item) => item.reasonCodes.includes("QUEUE_LIMIT_REACHED")));
  assert.equal(result.mailboxMutationPerformed, false);
  assert.equal(result.smtpSendPerformed, false);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.queue), true);
  assert.equal(Object.isFrozen(result.queue[0]), true);
});

test("requires every canonical mailbox role exactly once in the caller-owned priority order", () => {
  assert.throws(
    () => sweep([record()], {
      priorityMailboxRoles: [
        "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        "PERSONAL_HIGH_VALUE_RELATIONSHIP",
        "MARKETING_FUNNELKIT"
      ]
    }),
    /every mailbox role exactly once/
  );
});
