import assert from "node:assert/strict";
import test from "node:test";
import {
  IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION,
  compileIonosEmailOpportunityCaptureV1,
  type IonosEmailOpportunityCaptureInputV1
} from "../../src/lib/discovery-intelligence/ionos-email-opportunity-capture-v1";

function baseInput(overrides: Partial<IonosEmailOpportunityCaptureInputV1> = {}): IonosEmailOpportunityCaptureInputV1 {
  return {
    mailboxRole: "PERSONAL_HIGH_VALUE_RELATIONSHIP",
    canonicalMessageRef: "email:message:42",
    canonicalThreadRef: "email:thread:arena-club",
    observedAt: "2026-09-18T18:00:00.000Z",
    evaluatedAt: "2026-09-19T05:00:00.000Z",
    communicationClass: "DIRECT_HUMAN",
    direction: "INBOUND",
    evidenceIntegrity: "SUPPORTED",
    requiresVerification: false,
    candidate: {
      sourceCandidateKey: "ionos:thread:arena-club:card-art",
      signalClass: "COLLABORATION",
      title: {
        state: "KNOWN",
        value: "Arena Club card-art collaboration",
        evidenceRefs: ["evidence:email:42:title"]
      },
      truthState: "KNOWN",
      evidenceRefs: ["evidence:email:42:business-signal"],
      personRefs: ["person:arena-club-partnerships"],
      organizationRefs: ["org:arena-club"],
      summary: {
        state: "KNOWN",
        value: "Canonical extraction records an explicit collaboration discussion.",
        evidenceRefs: ["evidence:email:42:summary"]
      }
    },
    ...overrides
  };
}

test("supported direct-human email becomes a candidate handoff without self-qualifying a new opportunity", () => {
  const result = compileIonosEmailOpportunityCaptureV1(baseInput());

  assert.equal(result.version, IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION);
  assert.equal(result.disposition, "CANDIDATE_CAPTURED");
  assert.equal(result.handoff?.source, "IONOS");
  assert.equal(result.handoff?.sourceInteractionRef, "email:thread:arena-club#email:message:42");
  assert.equal(result.handoff?.payload.qualification, "CANDIDATE");
  assert.equal(result.handoff?.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("EMAIL_SIGNAL_CANNOT_SELF_QUALIFY_NEW_OPPORTUNITY"));
  assert.ok(result.reasonCodes.includes("SOURCE_NOT_YET_QUALIFIED"));
  assert.deepEqual(result.handoff?.payload.personRefs, ["person:arena-club-partnerships"]);
  assert.deepEqual(result.handoff?.payload.organizationRefs, ["org:arena-club"]);
});

test("exact existing-opportunity evidence can link but cannot create a second opportunity", () => {
  const result = compileIonosEmailOpportunityCaptureV1({
    ...baseInput(),
    candidate: {
      ...baseInput().candidate,
      existingOpportunityRef: "opportunity:arena-club"
    }
  });

  assert.equal(result.disposition, "LINK_TO_EXISTING");
  assert.equal(result.handoff?.payload.qualification, "QUALIFIED");
  assert.equal(result.handoff?.disposition, "LINK_TO_EXISTING");
  assert.equal(result.handoff?.canonicalMatchPolicy, "EXPLICIT_EXISTING_REF_ONLY");
  assert.equal(result.handoff?.payload.existingOpportunityRef, "opportunity:arena-club");
});

test("marketing automation and system transactions cannot masquerade as personal opportunity evidence", () => {
  for (const communicationClass of ["MARKETING_AUTOMATION", "SYSTEM_TRANSACTIONAL"] as const) {
    const result = compileIonosEmailOpportunityCaptureV1(baseInput({ communicationClass }));
    assert.equal(result.disposition, "SUPPRESSED_NON_HUMAN");
    assert.equal(result.handoff, null);
    assert.equal(result.inferredInterest, false);
    assert.equal(result.inferredRelationship, false);
  }
});

test("unknown communication class fails closed before an opportunity handoff is created", () => {
  const result = compileIonosEmailOpportunityCaptureV1(baseInput({ communicationClass: "UNKNOWN" }));

  assert.equal(result.disposition, "NEEDS_VERIFICATION");
  assert.equal(result.handoff, null);
  assert.deepEqual(result.reasonCodes, ["COMMUNICATION_CLASS_UNKNOWN"]);
});

test("partial, conflicted, or verification-required evidence cannot link an existing opportunity", () => {
  for (const evidenceIntegrity of ["PARTIAL", "CONFLICTED"] as const) {
    const result = compileIonosEmailOpportunityCaptureV1({
      ...baseInput({ evidenceIntegrity }),
      candidate: {
        ...baseInput().candidate,
        existingOpportunityRef: "opportunity:arena-club"
      }
    });
    assert.equal(result.disposition, "NEEDS_VERIFICATION");
    assert.equal(result.handoff?.payload.qualification, "CANDIDATE");
    assert.equal(result.handoff?.disposition, "NEEDS_VERIFICATION");
    assert.ok(result.reasonCodes.includes(`EMAIL_EVIDENCE_${evidenceIntegrity}`));
    assert.ok(result.reasonCodes.includes("EXISTING_OPPORTUNITY_LINK_REQUIRES_SUPPORTED_KNOWN_EVIDENCE"));
  }

  const verification = compileIonosEmailOpportunityCaptureV1({
    ...baseInput({ requiresVerification: true }),
    candidate: {
      ...baseInput().candidate,
      existingOpportunityRef: "opportunity:arena-club"
    }
  });
  assert.equal(verification.disposition, "NEEDS_VERIFICATION");
  assert.ok(verification.reasonCodes.includes("UPSTREAM_EMAIL_EVIDENCE_REQUIRES_VERIFICATION"));
});

test("future-dated canonical evidence is withheld rather than becoming opportunity truth", () => {
  const result = compileIonosEmailOpportunityCaptureV1(
    baseInput({
      observedAt: "2026-09-20T05:00:00.000Z",
      evaluatedAt: "2026-09-19T05:00:00.000Z"
    })
  );

  assert.equal(result.disposition, "NEEDS_VERIFICATION");
  assert.equal(result.handoff, null);
  assert.deepEqual(result.reasonCodes, ["EMAIL_EVIDENCE_FUTURE_DATED"]);
});

test("unknown identity anchors and direction remain explicit review requirements", () => {
  const result = compileIonosEmailOpportunityCaptureV1({
    ...baseInput({ direction: "UNKNOWN" }),
    candidate: {
      ...baseInput().candidate,
      personRefs: [],
      organizationRefs: []
    }
  });

  assert.equal(result.disposition, "NEEDS_VERIFICATION");
  assert.ok(result.reasonCodes.includes("CANONICAL_ENTITY_ANCHOR_MISSING"));
  assert.ok(result.reasonCodes.includes("EMAIL_DIRECTION_UNKNOWN"));
  assert.equal(result.inferredContactInfo, false);
  assert.equal(result.inferredAuthority, false);
});

test("uncertain timing is preserved as uncertain and never inferred by the capture boundary", () => {
  const result = compileIonosEmailOpportunityCaptureV1({
    ...baseInput(),
    candidate: {
      ...baseInput().candidate,
      planningWindow: {
        state: "INFERRED",
        value: "Early 2027",
        evidenceRefs: ["evidence:email:42:timing-hypothesis"]
      }
    }
  });

  assert.equal(result.handoff?.payload.planningWindow?.state, "INFERRED");
  assert.equal(result.handoff?.payload.planningWindow?.value, "Early 2027");
  assert.equal(result.inferredTiming, false);
});

test("historical evidence age alone does not erase an otherwise supported candidate", () => {
  const result = compileIonosEmailOpportunityCaptureV1(
    baseInput({
      observedAt: "2022-04-01T12:00:00.000Z",
      evaluatedAt: "2026-09-19T05:00:00.000Z"
    })
  );

  assert.equal(result.disposition, "CANDIDATE_CAPTURED");
  assert.equal(result.handoff?.payload.qualification, "CANDIDATE");
  assert.ok(result.reasonCodes.includes("EMAIL_SIGNAL_CANNOT_SELF_QUALIFY_NEW_OPPORTUNITY"));
});

test("capture is deterministic, immutable, body-free, attachment-free, and side-effect free", () => {
  const input = baseInput();
  const first = compileIonosEmailOpportunityCaptureV1(input);
  const second = compileIonosEmailOpportunityCaptureV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.handoff?.idempotencyKey, second.handoff?.idempotencyKey);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.handoff), true);
  assert.equal(first.bodyContentConsumed, false);
  assert.equal(first.attachmentContentConsumed, false);
  assert.equal(first.mailboxMutationPerformed, false);
  assert.equal(first.smtpSendPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(first.writeAuthorityGranted, false);
  assert.equal(first.inferredSponsorship, false);
  assert.equal(first.inferredEconomics, false);
});

test("raw private email fields are rejected instead of silently entering opportunity evidence", () => {
  assert.throws(
    () =>
      compileIonosEmailOpportunityCaptureV1({
        ...baseInput(),
        candidate: {
          ...baseInput().candidate,
          // @ts-expect-error deliberate privacy-boundary violation
          rawBody: "private message body"
        }
      }),
    /candidate contains unsupported key rawBody/
  );

  assert.throws(
    () =>
      compileIonosEmailOpportunityCaptureV1({
        ...baseInput(),
        // @ts-expect-error deliberate privacy-boundary violation
        senderEmail: "person@example.com"
      }),
    /input contains unsupported key senderEmail/
  );
});
