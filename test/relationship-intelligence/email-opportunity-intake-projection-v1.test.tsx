import assert from "node:assert/strict";
import test from "node:test";

import {
  compileOpportunityImportHandoffV1,
  type OpportunityImportHandoffResultV1
} from "../../src/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  projectEmailOpportunityIntoIntakeV1,
  type EmailOpportunitySignalContextV1
} from "../../src/lib/relationship-intelligence/email-opportunity-intake-projection-v1";

const EVALUATED_AT = "2026-09-18T20:00:00.000Z";
const OBSERVED_AT = "2026-09-18T18:00:00.000Z";
const EVIDENCE_REF = "evidence:ionos-message-1";

function handoff(options: {
  qualification?: "WATCH" | "CANDIDATE" | "QUALIFIED";
  truthState?: "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
  planningWindow?: boolean;
} = {}) {
  return compileOpportunityImportHandoffV1({
    source: "IONOS",
    sourceInteractionRef: "ionos:message:1",
    candidate: {
      sourceCandidateKey: "email-opportunity-1",
      title: "Evidence-backed email opportunity",
      qualification: options.qualification ?? "QUALIFIED",
      truthState: options.truthState ?? "KNOWN",
      evidenceRefs: [EVIDENCE_REF],
      personRefs: options.personRefs ?? ["person:known-1"],
      organizationRefs: options.organizationRefs ?? ["org:known-1"],
      existingOpportunityRef: options.existingOpportunityRef ?? null,
      summary: {
        state: options.truthState ?? "KNOWN",
        value: "Structured upstream summary",
        evidenceRefs: [EVIDENCE_REF]
      },
      whyNow: null,
      recommendedNextAction: null,
      planningWindow: options.planningWindow
        ? {
            state: "KNOWN",
            value: "October planning discussion",
            evidenceRefs: [EVIDENCE_REF]
          }
        : null
    }
  });
}

function context(overrides: Partial<EmailOpportunitySignalContextV1> = {}): EmailOpportunitySignalContextV1 {
  return {
    signalType: "PARTNERSHIP_OPPORTUNITY",
    signalEvidenceRefs: [EVIDENCE_REF],
    observedAt: OBSERVED_AT,
    ...overrides
  };
}

test("projects a canonical qualified IONOS handoff into EMAIL intake without inventing claims", () => {
  const result = projectEmailOpportunityIntoIntakeV1({ handoff: handoff(), context: context(), evaluatedAt: EVALUATED_AT });

  assert.equal(result.disposition, "EMITTED");
  assert.deepEqual(result.reasonCodes, ["IONOS_HANDOFF_READY"]);
  assert.equal(result.observation?.sourceKind, "EMAIL");
  assert.equal(result.observation?.truthState, "KNOWN");
  assert.equal(result.observation?.organizationRef, "org:known-1");
  assert.equal(result.observation?.personRef, "person:known-1");
  assert.equal(result.observation?.opportunityRef, null);
  assert.deepEqual(result.observation?.planningWindow, null);
  assert.deepEqual(result.observation?.decisionMakerClaim, null);
  assert.deepEqual(result.observation?.sponsorshipRelationshipClaim, null);
  assert.deepEqual(result.observation?.warmAccessClaim, null);
  assert.equal(result.authority.mailboxMutationAuthorized, false);
  assert.equal(result.authority.crmMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
  assert.equal(result.authority.externalActionAuthorized, false);
});

test("preserves only an explicit existing opportunity link", () => {
  const result = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ existingOpportunityRef: "opportunity:existing-1" }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(result.disposition, "EMITTED");
  assert.deepEqual(result.reasonCodes, ["EXPLICIT_EXISTING_OPPORTUNITY_LINK"]);
  assert.equal(result.observation?.opportunityRef, "opportunity:existing-1");
});

test("does not parse generic handoff timing text into a planning window", () => {
  const result = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ planningWindow: true }),
    context: context({ signalType: "PLANNING_WINDOW" }),
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(result.disposition, "EMITTED");
  assert.equal(result.observation?.signalType, "PLANNING_WINDOW");
  assert.equal(result.observation?.planningWindow, null);
});

test("withholds candidate and non-known handoffs for verification", () => {
  const candidate = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ qualification: "CANDIDATE" }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });
  const partial = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ truthState: "PARTIAL" }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(candidate.disposition, "VERIFY_REQUIRED");
  assert.equal(candidate.observation, null);
  assert.equal(partial.disposition, "VERIFY_REQUIRED");
  assert.equal(partial.observation, null);
});

test("suppresses watch-only email candidates", () => {
  const result = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ qualification: "WATCH" }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(result.disposition, "SUPPRESSED");
  assert.deepEqual(result.reasonCodes, ["HANDOFF_WATCH_ONLY"]);
  assert.equal(result.observation, null);
});

test("refuses ambiguous canonical organization or person identity instead of guessing", () => {
  const organizationAmbiguous = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ organizationRefs: ["org:a", "org:b"] }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });
  const personAmbiguous = projectEmailOpportunityIntoIntakeV1({
    handoff: handoff({ personRefs: ["person:a", "person:b"] }),
    context: context(),
    evaluatedAt: EVALUATED_AT
  });

  assert.equal(organizationAmbiguous.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(organizationAmbiguous.reasonCodes, ["AMBIGUOUS_CANONICAL_ORGANIZATION"]);
  assert.equal(organizationAmbiguous.observation, null);
  assert.equal(personAmbiguous.disposition, "VERIFY_REQUIRED");
  assert.deepEqual(personAmbiguous.reasonCodes, ["AMBIGUOUS_CANONICAL_PERSON"]);
  assert.equal(personAmbiguous.observation, null);
});

test("requires signal evidence to remain inside the canonical handoff lineage", () => {
  assert.throws(
    () => projectEmailOpportunityIntoIntakeV1({
      handoff: handoff(),
      context: context({ signalEvidenceRefs: ["evidence:not-in-lineage"] }),
      evaluatedAt: EVALUATED_AT
    }),
    /must be contained in handoff evidence lineage/
  );
});

test("rejects future observations and non-IONOS handoffs", () => {
  assert.throws(
    () => projectEmailOpportunityIntoIntakeV1({
      handoff: handoff(),
      context: context({ observedAt: "2026-09-18T21:00:00.000Z" }),
      evaluatedAt: EVALUATED_AT
    }),
    /must not be future-dated/
  );

  const chatGpt = compileOpportunityImportHandoffV1({
    source: "CHATGPT",
    sourceInteractionRef: "chatgpt:thread:1",
    candidate: {
      sourceCandidateKey: "chatgpt-opportunity-1",
      title: "ChatGPT candidate",
      qualification: "QUALIFIED",
      truthState: "KNOWN",
      evidenceRefs: [EVIDENCE_REF],
      personRefs: ["person:known-1"]
    }
  });
  assert.throws(
    () => projectEmailOpportunityIntoIntakeV1({ handoff: chatGpt, context: context(), evaluatedAt: EVALUATED_AT }),
    /handoff.source must be IONOS/
  );
});

test("recompiles the handoff and fails closed on forged semantic consistency", () => {
  const valid = handoff();
  const forged = {
    ...valid,
    payload: { ...valid.payload, truthState: "PARTIAL" as const }
  } as unknown as OpportunityImportHandoffResultV1;

  assert.throws(
    () => projectEmailOpportunityIntoIntakeV1({ handoff: forged, context: context(), evaluatedAt: EVALUATED_AT }),
    /not semantically consistent/
  );
});

test("rejects any widened side-effect authority", () => {
  const forged = {
    ...handoff(),
    crmMutationPerformed: true
  } as unknown as OpportunityImportHandoffResultV1;

  assert.throws(
    () => projectEmailOpportunityIntoIntakeV1({ handoff: forged, context: context(), evaluatedAt: EVALUATED_AT }),
    /side-effect-free/
  );
});

test("is deterministic, deeply immutable, and performs no mutation", () => {
  const input = { handoff: handoff(), context: context(), evaluatedAt: EVALUATED_AT } as const;
  const first = projectEmailOpportunityIntoIntakeV1(input);
  const second = projectEmailOpportunityIntoIntakeV1(input);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.observation), true);
  assert.equal(Object.isFrozen(first.authority), true);
  assert.equal(first.authority.relationshipMutationAuthorized, false);
  assert.equal(first.authority.contactDiscoveryAuthorized, false);
});
