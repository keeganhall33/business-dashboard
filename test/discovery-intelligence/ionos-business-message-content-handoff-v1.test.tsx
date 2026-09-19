import assert from "node:assert/strict";
import test from "node:test";

import {
  compileIonosBusinessMessageContentHandoffV1,
  type IonosBusinessMessageClaimKindV1,
  type IonosBusinessMessageClaimV1,
  type IonosBusinessMessageContentHandoffInputV1
} from "../../src/lib/discovery-intelligence/ionos-business-message-content-handoff-v1";
import type { IonosEmailOpportunitySignalClassV1 } from "../../src/lib/discovery-intelligence/ionos-email-opportunity-capture-v1";
import type { OpportunityHandoffTruthStateV1 } from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";

const BODY = "Brian proposed a sponsorship project for next season. He asked us to follow up next month about timing. private-marker-987654";

function claim(
  claimId: string,
  kind: IonosBusinessMessageClaimKindV1,
  phrase: string,
  evidenceRef: string,
  overrides: Partial<IonosBusinessMessageClaimV1> = {}
): IonosBusinessMessageClaimV1 {
  const startOffset = BODY.indexOf(phrase);
  assert.notEqual(startOffset, -1, `test phrase missing: ${phrase}`);
  return {
    claimId,
    kind,
    state: "KNOWN",
    evidenceRef,
    startOffset,
    endOffset: startOffset + phrase.length,
    ...overrides
  };
}

function baseClaims(
  signalState: OpportunityHandoffTruthStateV1 = "KNOWN",
  signalClass: IonosEmailOpportunitySignalClassV1 = "SPONSORSHIP"
): readonly IonosBusinessMessageClaimV1[] {
  return [
    claim("claim:signal", "OPPORTUNITY_SIGNAL", "sponsorship project", "evidence:signal", {
      state: signalState,
      signalClass
    }),
    claim("claim:proposal", "PROPOSAL", "proposed a sponsorship project for next season", "evidence:proposal"),
    claim("claim:next", "NEXT_STEP", "follow up next month", "evidence:next"),
    claim("claim:timing", "TIMING", "next month about timing", "evidence:timing")
  ];
}

function input(overrides: Partial<IonosBusinessMessageContentHandoffInputV1> = {}): IonosBusinessMessageContentHandoffInputV1 {
  return {
    mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    canonicalMessageRef: "ionos:message:42",
    canonicalThreadRef: "ionos:thread:9",
    observedAt: "2026-09-18T20:00:00.000Z",
    evaluatedAt: "2026-09-19T14:00:00.000Z",
    communicationClass: "DIRECT_HUMAN",
    direction: "INBOUND",
    contentPolicy: "AUTHORIZED_TEXT_ONLY",
    attachmentPolicy: "NONE",
    rawText: BODY,
    extractionRef: "extract:ionos:42:v1",
    extractionRequiresVerification: false,
    claims: baseClaims(),
    candidate: {
      sourceCandidateKey: "ionos:message:42:sponsorship",
      signalClass: "SPONSORSHIP",
      truthState: "KNOWN",
      evidenceRefs: ["evidence:signal", "evidence:proposal", "evidence:next", "evidence:timing"],
      title: {
        state: "KNOWN",
        value: "Evidence-backed sponsorship discussion",
        evidenceRefs: ["evidence:signal", "evidence:proposal"]
      },
      summary: {
        state: "KNOWN",
        value: "A sponsorship project was proposed for a future season.",
        evidenceRefs: ["evidence:proposal"]
      },
      whyNow: {
        state: "KNOWN",
        value: "The message contains an explicit follow-up timing reference.",
        evidenceRefs: ["evidence:timing"]
      },
      recommendedNextAction: {
        state: "KNOWN",
        value: "Review the documented follow-up before any response.",
        evidenceRefs: ["evidence:next"]
      },
      planningWindow: {
        state: "KNOWN",
        value: "Follow-up timing is referenced as next month in the source message.",
        evidenceRefs: ["evidence:timing"]
      },
      organizationRefs: ["org:brand-42"]
    },
    ...overrides
  };
}

test("validates exact text spans and feeds a new business signal into the canonical IONOS candidate path", () => {
  const result = compileIonosBusinessMessageContentHandoffV1(input());

  assert.equal(result.disposition, "CANDIDATE_CAPTURED");
  assert.equal(result.evidenceIntegrity, "SUPPORTED");
  assert.equal(result.effectiveTruthState, "KNOWN");
  assert.equal(result.capture.disposition, "CANDIDATE_CAPTURED");
  assert.equal(result.capture.handoff?.payload.qualification, "CANDIDATE");
  assert.equal(result.capture.handoff?.payload.existingOpportunityRef, null);
  assert.deepEqual(result.capture.handoff?.payload.organizationRefs, ["org:brand-42"]);
  assert.equal(result.capture.inferredSponsorship, false);
  assert.equal(result.capture.inferredTiming, false);
});

test("links only to an explicitly supplied existing canonical opportunity under fully supported known evidence", () => {
  const source = input();
  const result = compileIonosBusinessMessageContentHandoffV1({
    ...source,
    candidate: {
      ...source.candidate,
      existingOpportunityRef: "opportunity:existing-7"
    }
  });

  assert.equal(result.disposition, "LINK_TO_EXISTING");
  assert.equal(result.capture.handoff?.payload.existingOpportunityRef, "opportunity:existing-7");
  assert.equal(result.capture.handoff?.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
});

test("downgrades a KNOWN candidate when its directly supporting claim is partial", () => {
  const result = compileIonosBusinessMessageContentHandoffV1(input({ claims: baseClaims("PARTIAL") }));

  assert.equal(result.evidenceIntegrity, "PARTIAL");
  assert.equal(result.effectiveTruthState, "PARTIAL");
  assert.equal(result.disposition, "NEEDS_VERIFICATION");
  assert.equal(result.capture.handoff?.payload.truthState, "PARTIAL");
});

test("requires every candidate evidence reference to resolve to a bounded source-text claim", () => {
  const source = input();
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1({
      ...source,
      candidate: {
        ...source.candidate,
        evidenceRefs: [...source.candidate.evidenceRefs, "evidence:invented"]
      }
    }),
    /unsupported claim evidence evidence:invented/
  );
});

test("requires the declared opportunity signal class to have exact supporting signal evidence", () => {
  const source = input();
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1({
      ...source,
      candidate: { ...source.candidate, signalClass: "LICENSING" }
    }),
    /requires exact OPPORTUNITY_SIGNAL claim evidence/
  );
});

test("requires planning-window content to be backed by a TIMING claim", () => {
  const source = input();
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1({
      ...source,
      candidate: {
        ...source.candidate,
        planningWindow: {
          state: "KNOWN",
          value: "A planning window was discussed.",
          evidenceRefs: ["evidence:proposal"]
        }
      }
    }),
    /planningWindow requires directly supporting TIMING claim evidence/
  );
});

test("rejects an extraction span that does not point into the authorized message body", () => {
  const claims = [...baseClaims()];
  claims[0] = { ...claims[0], endOffset: BODY.length + 1 };
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1(input({ claims })),
    /span is outside rawText bounds/
  );
});

test("suppresses marketing automation instead of treating it as a personal opportunity", () => {
  const result = compileIonosBusinessMessageContentHandoffV1(input({ communicationClass: "MARKETING_AUTOMATION" }));

  assert.equal(result.disposition, "SUPPRESSED_NON_HUMAN");
  assert.equal(result.capture.handoff, null);
  assert.equal(result.inferredRelationship, false);
  assert.equal(result.externalActionPerformed, false);
});

test("never returns or retains the raw message body and grants no mutation or outreach authority", () => {
  const result = compileIonosBusinessMessageContentHandoffV1(input());
  const serialized = JSON.stringify(result);

  assert.equal(result.bodyContentConsumed, true);
  assert.equal(result.rawBodyRetained, false);
  assert.equal(result.rawBodyReturned, false);
  assert.equal(result.attachmentContentConsumed, false);
  assert.equal(result.semanticExtractionPerformedByThisContract, false);
  assert.equal(result.mailboxMutationPerformed, false);
  assert.equal(result.smtpSendPerformed, false);
  assert.equal(result.crmMutationPerformed, false);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.writeAuthorityGranted, false);
  assert.equal(serialized.includes("private-marker-987654"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "rawText"), false);
});

test("rejects attachment access and secret-like provenance refs at the content boundary", () => {
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1({ ...input(), attachmentPolicy: "FULL" as "NONE" }),
    /attachmentPolicy must be NONE/
  );
  assert.throws(
    () => compileIonosBusinessMessageContentHandoffV1({ ...input(), extractionRef: "op:\/\/vault\/item\/secret" }),
    /extractionRef is unsafe/
  );
});

test("is deterministic, deeply immutable, and does not mutate the extraction input", () => {
  const source = input();
  const snapshot = JSON.parse(JSON.stringify(source));
  const first = compileIonosBusinessMessageContentHandoffV1(source);
  const second = compileIonosBusinessMessageContentHandoffV1(source);

  assert.deepEqual(first, second);
  assert.deepEqual(source, snapshot);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.claimEvidence), true);
  assert.equal(Object.isFrozen(first.capture), true);
  assert.equal(Object.isFrozen(first.capture.handoff), true);
});
