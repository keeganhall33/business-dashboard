import {
  normalizeOpportunitySignalsV1,
  type EvidenceBackedBinaryClaimV1,
  type EvidenceBackedDecisionMakerClaimV1,
  type EvidenceBackedPlanningWindowV1,
  type OpportunitySignalIntakeDecisionV1,
  type OpportunitySignalIntakeResultV1,
  type OpportunitySignalTruthStateV1,
  type OpportunitySignalTypeV1,
  type OpportunitySourceObservationV1,
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const CHATGPT_OPPORTUNITY_HANDOFF_VERSION_V1 = "CHATGPT_OPPORTUNITY_HANDOFF_V1" as const;

export type ChatGptOpportunityHandoffInputV1 = Readonly<{
  handoffId: string;
  /** Opaque authorized-interaction reference. Never a raw prompt, transcript, or response body. */
  interactionRef: string;
  observedAt: string | Date;
  evaluatedAt: string | Date;
  maximumSignalAgeDays: number;
  evidenceRefs: readonly string[];
  truthState: OpportunitySignalTruthStateV1;
  signalType: OpportunitySignalTypeV1;
  organizationRef?: string | null;
  personRef?: string | null;
  opportunityRef?: string | null;
  planningWindow?: EvidenceBackedPlanningWindowV1 | null;
  decisionMakerClaim?: EvidenceBackedDecisionMakerClaimV1 | null;
  sponsorshipRelationshipClaim?: EvidenceBackedBinaryClaimV1 | null;
  warmAccessClaim?: EvidenceBackedBinaryClaimV1 | null;
}>;

export type ChatGptOpportunityHandoffResultV1 = Readonly<{
  version: typeof CHATGPT_OPPORTUNITY_HANDOFF_VERSION_V1;
  handoffId: string;
  idempotencyKey: string;
  observation: OpportunitySourceObservationV1;
  intake: OpportunitySignalIntakeResultV1;
  decision: OpportunitySignalIntakeDecisionV1;
  handoffState: "READY_FOR_INTERNAL_REVIEW" | "RESEARCH_REQUIRED" | "VERIFY_REQUIRED" | "SUPPRESSED";
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    canonicalImportAuthorized: false;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const MAX_REF_LENGTH = 240;
const MAX_RATIONALE_LENGTH = 800;
const MAX_EVIDENCE_REFS = 100;
const MAX_SIGNAL_AGE_DAYS = 365;
const REF_PATTERN = /^[A-Za-z0-9._:/-]+$/;
const ROOT_KEYS = new Set([
  "handoffId",
  "interactionRef",
  "observedAt",
  "evaluatedAt",
  "maximumSignalAgeDays",
  "evidenceRefs",
  "truthState",
  "signalType",
  "organizationRef",
  "personRef",
  "opportunityRef",
  "planningWindow",
  "decisionMakerClaim",
  "sponsorshipRelationshipClaim",
  "warmAccessClaim",
]);
const PLANNING_KEYS = new Set(["startAt", "endAt", "rationale", "evidenceRefs"]);
const DECISION_MAKER_KEYS = new Set(["authorityClass", "evidenceRefs"]);
const BINARY_CLAIM_KEYS = new Set(["state", "evidenceRefs"]);

const LIMITATIONS = Object.freeze([
  "This boundary accepts only a deliberately structured handoff from an authorized interaction. It does not read ChatGPT Pro history or imply programmatic access to a personal ChatGPT session.",
  "Raw prompts, transcripts, response bodies, names for fuzzy resolution, and hidden provider payloads are not accepted. Canonical entity and evidence references must already be established upstream.",
  "The compiled artifact is an internal review handoff only. It does not itself write CRM state, establish a relationship, qualify an opportunity, contact anyone, or authorize external action.",
  "Evidence count, model output, or a ChatGPT source never establishes sponsor interest, budget, decision authority, warm access, deal likelihood, monetary value, causality, or outcome by itself.",
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  canonicalImportAuthorized: false as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const,
});

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  const object = objectRecord(value, label);
  const unexpected = Object.keys(object).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) throw new Error(`${label} contains unsupported field: ${unexpected.sort()[0]}`);
}

function opaqueRef(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_REF_LENGTH || !REF_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an opaque reference without spaces, query strings, fragments, or free text`);
  }
  return normalized;
}

function optionalOpaqueRef(value: unknown, label: string): string | null {
  if (value == null) return null;
  return opaqueRef(value, label);
}

function evidenceRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_EVIDENCE_REFS) {
    throw new Error(`${label} must contain between 1 and ${MAX_EVIDENCE_REFS} references`);
  }
  return Object.freeze([...new Set(value.map((item, index) => opaqueRef(item, `${label}[${index}]`)))].sort());
}

function instantIso(value: unknown, label: string): string {
  if (!(typeof value === "string" || value instanceof Date)) throw new Error(`${label} must be a valid timestamp`);
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(timestamp).toISOString();
}

function boundedRationale(value: unknown): string {
  if (typeof value !== "string") throw new Error("planningWindow.rationale must be a string");
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_RATIONALE_LENGTH) {
    throw new Error(`planningWindow.rationale must be between 1 and ${MAX_RATIONALE_LENGTH} characters`);
  }
  return normalized;
}

function normalizePlanningWindow(value: unknown): EvidenceBackedPlanningWindowV1 | null {
  if (value == null) return null;
  exactKeys(value, PLANNING_KEYS, "planningWindow");
  const object = objectRecord(value, "planningWindow");
  return Object.freeze({
    startAt: instantIso(object.startAt, "planningWindow.startAt"),
    endAt: instantIso(object.endAt, "planningWindow.endAt"),
    rationale: boundedRationale(object.rationale),
    evidenceRefs: evidenceRefs(object.evidenceRefs, "planningWindow.evidenceRefs"),
  });
}

function normalizeDecisionMakerClaim(value: unknown): EvidenceBackedDecisionMakerClaimV1 | null {
  if (value == null) return null;
  exactKeys(value, DECISION_MAKER_KEYS, "decisionMakerClaim");
  const object = objectRecord(value, "decisionMakerClaim");
  if (object.authorityClass !== "DECISION_MAKER" && object.authorityClass !== "INFLUENCER") {
    throw new Error("decisionMakerClaim.authorityClass is unsupported");
  }
  return Object.freeze({
    authorityClass: object.authorityClass,
    evidenceRefs: evidenceRefs(object.evidenceRefs, "decisionMakerClaim.evidenceRefs"),
  });
}

function normalizeBinaryClaim(value: unknown, label: string): EvidenceBackedBinaryClaimV1 | null {
  if (value == null) return null;
  exactKeys(value, BINARY_CLAIM_KEYS, label);
  const object = objectRecord(value, label);
  if (object.state !== "SUPPORTED") throw new Error(`${label}.state must be SUPPORTED`);
  return Object.freeze({
    state: "SUPPORTED" as const,
    evidenceRefs: evidenceRefs(object.evidenceRefs, `${label}.evidenceRefs`),
  });
}

function handoffState(decision: OpportunitySignalIntakeDecisionV1): ChatGptOpportunityHandoffResultV1["handoffState"] {
  switch (decision.disposition) {
    case "CAPTURED_FOR_REVIEW":
      return "READY_FOR_INTERNAL_REVIEW";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_REQUIRED";
    case "VERIFY_REQUIRED":
      return "VERIFY_REQUIRED";
    case "SUPPRESS":
      return "SUPPRESSED";
  }
}

/**
 * Compiles an explicitly structured external ChatGPT handoff into the canonical
 * opportunity-signal intake contract. This is intentionally not a ChatGPT
 * connector and not a CRM write path.
 */
export function compileChatGptOpportunityHandoffV1(input: ChatGptOpportunityHandoffInputV1): ChatGptOpportunityHandoffResultV1 {
  exactKeys(input, ROOT_KEYS, "input");

  const handoffId = opaqueRef(input.handoffId, "handoffId");
  const interactionRef = opaqueRef(input.interactionRef, "interactionRef");
  const normalizedEvidenceRefs = evidenceRefs(input.evidenceRefs, "evidenceRefs");
  const observedAt = instantIso(input.observedAt, "observedAt");
  const evaluatedAt = instantIso(input.evaluatedAt, "evaluatedAt");

  if (!Number.isInteger(input.maximumSignalAgeDays) || input.maximumSignalAgeDays < 1 || input.maximumSignalAgeDays > MAX_SIGNAL_AGE_DAYS) {
    throw new Error(`maximumSignalAgeDays must be an integer between 1 and ${MAX_SIGNAL_AGE_DAYS}`);
  }

  const observation: OpportunitySourceObservationV1 = Object.freeze({
    captureId: `chatgpt-handoff:${handoffId}`,
    sourceKind: "CHATGPT",
    sourceEventKey: `external-expert-handoff:${handoffId}`,
    sourceRef: interactionRef,
    observedAt,
    evidenceRefs: normalizedEvidenceRefs,
    truthState: input.truthState,
    signalType: input.signalType,
    organizationRef: optionalOpaqueRef(input.organizationRef, "organizationRef"),
    personRef: optionalOpaqueRef(input.personRef, "personRef"),
    opportunityRef: optionalOpaqueRef(input.opportunityRef, "opportunityRef"),
    planningWindow: normalizePlanningWindow(input.planningWindow),
    decisionMakerClaim: normalizeDecisionMakerClaim(input.decisionMakerClaim),
    sponsorshipRelationshipClaim: normalizeBinaryClaim(input.sponsorshipRelationshipClaim, "sponsorshipRelationshipClaim"),
    warmAccessClaim: normalizeBinaryClaim(input.warmAccessClaim, "warmAccessClaim"),
  });

  const intake = normalizeOpportunitySignalsV1({
    observations: [observation],
    evaluatedAt,
    maximumSignalAgeDays: input.maximumSignalAgeDays,
  });
  const decision = intake.decisions[0];
  if (!decision || intake.decisions.length !== 1) throw new Error("structured handoff must compile to exactly one canonical intake decision");

  return Object.freeze({
    version: CHATGPT_OPPORTUNITY_HANDOFF_VERSION_V1,
    handoffId,
    idempotencyKey: `CHATGPT:${handoffId}`,
    observation,
    intake,
    decision,
    handoffState: handoffState(decision),
    limitations: LIMITATIONS,
    authority: AUTHORITY,
  });
}
