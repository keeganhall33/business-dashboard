import { IONOS_MAILBOX_ROLES_V1, type IonosMailboxRoleV1 } from "../email/ionos-mailbox-config-v1";
import {
  compileIonosEmailOpportunityCaptureV1,
  type IonosEmailCommunicationClassV1,
  type IonosEmailDirectionV1,
  type IonosEmailEvidenceIntegrityV1,
  type IonosEmailOpportunityCaptureResultV1,
  type IonosEmailOpportunitySignalClassV1
} from "./ionos-email-opportunity-capture-v1";
import type {
  OpportunityHandoffEvidenceFieldV1,
  OpportunityHandoffTruthStateV1
} from "../relationships-crm/opportunity-import-handoff-v1";

export const IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_VERSION =
  "IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_V1" as const;

export type IonosBusinessMessageClaimKindV1 =
  | "DISCUSSION"
  | "PROPOSAL"
  | "INTRODUCTION"
  | "COMMITMENT"
  | "NEXT_STEP"
  | "PROJECT_IDEA"
  | "TIMING"
  | "OPPORTUNITY_SIGNAL";

export type IonosBusinessMessageClaimV1 = Readonly<{
  claimId: string;
  kind: IonosBusinessMessageClaimKindV1;
  state: OpportunityHandoffTruthStateV1;
  evidenceRef: string;
  startOffset: number;
  endOffset: number;
  signalClass?: IonosEmailOpportunitySignalClassV1 | null;
}>;

export type IonosBusinessMessageEvidenceFieldV1 = Readonly<{
  state: OpportunityHandoffTruthStateV1;
  value: string | null;
  evidenceRefs: readonly string[];
}>;

export type IonosBusinessMessageCandidateV1 = Readonly<{
  sourceCandidateKey: string;
  signalClass: IonosEmailOpportunitySignalClassV1;
  truthState: OpportunityHandoffTruthStateV1;
  evidenceRefs: readonly string[];
  title: IonosBusinessMessageEvidenceFieldV1;
  summary?: IonosBusinessMessageEvidenceFieldV1 | null;
  whyNow?: IonosBusinessMessageEvidenceFieldV1 | null;
  recommendedNextAction?: IonosBusinessMessageEvidenceFieldV1 | null;
  planningWindow?: IonosBusinessMessageEvidenceFieldV1 | null;
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
}>;

export type IonosBusinessMessageContentHandoffInputV1 = Readonly<{
  mailboxRole: IonosMailboxRoleV1;
  canonicalMessageRef: string;
  canonicalThreadRef: string;
  observedAt: string;
  evaluatedAt: string;
  communicationClass: IonosEmailCommunicationClassV1;
  direction: IonosEmailDirectionV1;
  contentPolicy: "AUTHORIZED_TEXT_ONLY";
  attachmentPolicy: "NONE";
  rawText: string;
  extractionRef: string;
  extractionRequiresVerification: boolean;
  claims: readonly IonosBusinessMessageClaimV1[];
  candidate: IonosBusinessMessageCandidateV1;
}>;

export type IonosBusinessMessageContentHandoffResultV1 = Readonly<{
  version: typeof IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_VERSION;
  generatedAt: string;
  mailboxRole: IonosMailboxRoleV1;
  canonicalMessageRef: string;
  canonicalThreadRef: string;
  extractionRef: string;
  disposition: "CANDIDATE_CAPTURED" | "LINK_TO_EXISTING" | "NEEDS_VERIFICATION" | "SUPPRESSED_NON_HUMAN";
  claimEvidence: readonly Readonly<{
    claimId: string;
    kind: IonosBusinessMessageClaimKindV1;
    state: OpportunityHandoffTruthStateV1;
    evidenceRef: string;
    startOffset: number;
    endOffset: number;
    signalClass: IonosEmailOpportunitySignalClassV1 | null;
  }>[];
  evidenceIntegrity: IonosEmailEvidenceIntegrityV1;
  effectiveTruthState: OpportunityHandoffTruthStateV1;
  capture: IonosEmailOpportunityCaptureResultV1;
  bodyContentConsumed: true;
  rawBodyRetained: false;
  rawBodyReturned: false;
  attachmentContentConsumed: false;
  semanticExtractionPerformedByThisContract: false;
  providedExtractionValidated: true;
  inferredContactInfo: false;
  inferredRelationship: false;
  inferredSponsorship: false;
  inferredTiming: false;
  inferredOpportunityCertainty: false;
  inferredDecisionAuthority: false;
  inferredEconomics: false;
  mailboxMutationPerformed: false;
  smtpSendPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAX_BODY_CHARS = 200_000;
const MAX_CLAIMS = 64;
const MAX_FIELD_CHARS = 2_000;
const MAX_REFS = 128;
const MAILBOX_ROLES = new Set<string>(IONOS_MAILBOX_ROLES_V1);
const COMMUNICATION_CLASSES = new Set<IonosEmailCommunicationClassV1>([
  "DIRECT_HUMAN",
  "MARKETING_AUTOMATION",
  "SYSTEM_TRANSACTIONAL",
  "UNKNOWN"
]);
const DIRECTIONS = new Set<IonosEmailDirectionV1>(["INBOUND", "OUTBOUND", "UNKNOWN"]);
const CLAIM_KINDS = new Set<IonosBusinessMessageClaimKindV1>([
  "DISCUSSION",
  "PROPOSAL",
  "INTRODUCTION",
  "COMMITMENT",
  "NEXT_STEP",
  "PROJECT_IDEA",
  "TIMING",
  "OPPORTUNITY_SIGNAL"
]);
const SIGNAL_CLASSES = new Set<IonosEmailOpportunitySignalClassV1>([
  "BUSINESS_DISCUSSION",
  "INBOUND_INTEREST",
  "EXPLICIT_FOLLOW_UP",
  "PARTNERSHIP",
  "COMMISSION",
  "LICENSING",
  "SPONSORSHIP",
  "COLLABORATION",
  "CHARITY",
  "EVENT",
  "MEDIA",
  "COLLECTIBLES",
  "PURCHASE",
  "WARM_INTRODUCTION",
  "OTHER_BUSINESS"
]);
const TRUTH_STATES = new Set<OpportunityHandoffTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const TRUTH_ORDER: readonly OpportunityHandoffTruthStateV1[] = [
  "CONFLICTED",
  "UNKNOWN",
  "STALE",
  "PARTIAL",
  "INFERRED",
  "KNOWN"
];
const UNSAFE_REF = /(?:op:\/\/|mailto:|tel:|begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|token|api[_-]?key)\s*[=:])/i;
const SECRET_TEXT = /(?:begin\s+(?:rsa\s+)?private\s+key|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[=:]\s*\S+)/i;

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string, maximum = MAX_FIELD_CHARS): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} exceeds ${maximum} characters`);
  return normalized;
}

function safeRef(value: unknown, label: string): string {
  const ref = requiredText(value, label, 512);
  if (/\s/.test(ref) || UNSAFE_REF.test(ref)) throw new Error(`${label} is unsafe`);
  return ref;
}

function refs(value: unknown, label: string, required = false): readonly string[] {
  if (value == null) {
    if (required) throw new Error(`${label} must be a non-empty array`);
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length > MAX_REFS) throw new Error(`${label} must be an array with at most ${MAX_REFS} entries`);
  const normalized = [...new Set(value.map((item, index) => safeRef(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b));
  if (required && normalized.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(normalized);
}

function timestamp(value: unknown, label: string): string {
  const normalized = requiredText(value, label, 128);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function truthState(value: unknown, label: string): OpportunityHandoffTruthStateV1 {
  if (typeof value !== "string" || !TRUTH_STATES.has(value as OpportunityHandoffTruthStateV1)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as OpportunityHandoffTruthStateV1;
}

function worstTruth(states: readonly OpportunityHandoffTruthStateV1[]): OpportunityHandoffTruthStateV1 {
  return TRUTH_ORDER.find((state) => states.includes(state)) ?? "UNKNOWN";
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value;
}

function normalizeClaims(rawText: string, claims: readonly IonosBusinessMessageClaimV1[]): readonly IonosBusinessMessageClaimV1[] {
  if (!Array.isArray(claims) || claims.length === 0 || claims.length > MAX_CLAIMS) {
    throw new Error(`claims must contain between 1 and ${MAX_CLAIMS} entries`);
  }
  const seenIds = new Set<string>();
  const seenEvidenceRefs = new Set<string>();
  const normalized = claims.map((claim, index) => {
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) throw new Error(`claims[${index}] must be an object`);
    const claimId = safeRef(claim.claimId, `claims[${index}].claimId`);
    if (seenIds.has(claimId)) throw new Error(`duplicate claimId ${claimId}`);
    seenIds.add(claimId);
    if (typeof claim.kind !== "string" || !CLAIM_KINDS.has(claim.kind as IonosBusinessMessageClaimKindV1)) {
      throw new Error(`claims[${index}].kind is unsupported`);
    }
    const kind = claim.kind as IonosBusinessMessageClaimKindV1;
    const state = truthState(claim.state, `claims[${index}].state`);
    const evidenceRef = safeRef(claim.evidenceRef, `claims[${index}].evidenceRef`);
    if (seenEvidenceRefs.has(evidenceRef)) throw new Error(`duplicate claim evidenceRef ${evidenceRef}`);
    seenEvidenceRefs.add(evidenceRef);
    const startOffset = integer(claim.startOffset, `claims[${index}].startOffset`);
    const endOffset = integer(claim.endOffset, `claims[${index}].endOffset`);
    if (startOffset < 0 || endOffset <= startOffset || endOffset > rawText.length) {
      throw new Error(`claims[${index}] span is outside rawText bounds`);
    }
    if (rawText.slice(startOffset, endOffset).trim().length === 0) throw new Error(`claims[${index}] span must contain source text`);

    const signalClass = claim.signalClass == null ? null : claim.signalClass;
    if (kind === "OPPORTUNITY_SIGNAL") {
      if (typeof signalClass !== "string" || !SIGNAL_CLASSES.has(signalClass as IonosEmailOpportunitySignalClassV1)) {
        throw new Error(`claims[${index}].signalClass is required for OPPORTUNITY_SIGNAL`);
      }
    } else if (signalClass != null) {
      throw new Error(`claims[${index}].signalClass is only allowed for OPPORTUNITY_SIGNAL`);
    }

    return freezeDeep({
      claimId,
      kind,
      state,
      evidenceRef,
      startOffset,
      endOffset,
      signalClass: signalClass as IonosEmailOpportunitySignalClassV1 | null
    });
  });
  return Object.freeze(normalized);
}

function normalizeField(
  field: IonosBusinessMessageEvidenceFieldV1 | null | undefined,
  label: string,
  claimByEvidenceRef: ReadonlyMap<string, IonosBusinessMessageClaimV1>,
  required = false
): Readonly<OpportunityHandoffEvidenceFieldV1> | null {
  if (field == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);
  const declaredState = truthState(field.state, `${label}.state`);
  const evidenceRefs = refs(field.evidenceRefs, `${label}.evidenceRefs`, true);
  const supportingClaims = evidenceRefs.map((ref) => {
    const claim = claimByEvidenceRef.get(ref);
    if (!claim) throw new Error(`${label}.evidenceRefs contains unsupported claim evidence ${ref}`);
    return claim;
  });
  let value: string | null = null;
  if (field.value != null) {
    value = requiredText(field.value, `${label}.value`);
    if (SECRET_TEXT.test(value)) throw new Error(`${label}.value appears to contain secret material`);
  }
  const effectiveState = worstTruth([declaredState, ...supportingClaims.map((claim) => claim.state)]);
  if (effectiveState === "KNOWN" && value == null) throw new Error(`${label}.value is required when effective state is KNOWN`);
  return freezeDeep({ state: effectiveState, value, evidenceRefs: [...evidenceRefs] });
}

function requiresClaimKind(
  field: Readonly<OpportunityHandoffEvidenceFieldV1> | null,
  claimByEvidenceRef: ReadonlyMap<string, IonosBusinessMessageClaimV1>,
  kinds: ReadonlySet<IonosBusinessMessageClaimKindV1>,
  label: string
): void {
  if (!field) return;
  if (!field.evidenceRefs.some((ref) => kinds.has(claimByEvidenceRef.get(ref)!.kind))) {
    throw new Error(`${label} requires directly supporting ${[...kinds].join(" or ")} claim evidence`);
  }
}

function integrityFrom(states: readonly OpportunityHandoffTruthStateV1[]): IonosEmailEvidenceIntegrityV1 {
  if (states.includes("CONFLICTED")) return "CONFLICTED";
  return states.every((state) => state === "KNOWN") ? "SUPPORTED" : "PARTIAL";
}

/**
 * Validates a privacy-minimized, already-produced semantic extraction against the
 * exact authorized plain-text message spans that support it, then hands the
 * structured evidence to the existing governed IONOS opportunity-capture path.
 *
 * This contract deliberately does not perform semantic extraction itself. Raw
 * body text is used only to validate bounded support spans and is never returned,
 * retained, logged, persisted, or copied into the canonical handoff.
 */
export function compileIonosBusinessMessageContentHandoffV1(
  input: IonosBusinessMessageContentHandoffInputV1
): IonosBusinessMessageContentHandoffResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (typeof input.mailboxRole !== "string" || !MAILBOX_ROLES.has(input.mailboxRole)) throw new Error("mailboxRole is unsupported");
  if (typeof input.communicationClass !== "string" || !COMMUNICATION_CLASSES.has(input.communicationClass)) {
    throw new Error("communicationClass is unsupported");
  }
  if (typeof input.direction !== "string" || !DIRECTIONS.has(input.direction)) throw new Error("direction is unsupported");
  if (input.contentPolicy !== "AUTHORIZED_TEXT_ONLY") throw new Error("contentPolicy must be AUTHORIZED_TEXT_ONLY");
  if (input.attachmentPolicy !== "NONE") throw new Error("attachmentPolicy must be NONE");
  if (typeof input.extractionRequiresVerification !== "boolean") throw new Error("extractionRequiresVerification must be boolean");
  if (typeof input.rawText !== "string" || input.rawText.trim().length === 0) throw new Error("rawText must contain authorized text content");
  if (input.rawText.length > MAX_BODY_CHARS) throw new Error(`rawText exceeds ${MAX_BODY_CHARS} characters`);

  const mailboxRole = input.mailboxRole as IonosMailboxRoleV1;
  const canonicalMessageRef = safeRef(input.canonicalMessageRef, "canonicalMessageRef");
  const canonicalThreadRef = safeRef(input.canonicalThreadRef, "canonicalThreadRef");
  const extractionRef = safeRef(input.extractionRef, "extractionRef");
  const observedAt = timestamp(input.observedAt, "observedAt");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const claims = normalizeClaims(input.rawText, input.claims);
  const claimByEvidenceRef = new Map(claims.map((claim) => [claim.evidenceRef, claim] as const));

  if (!input.candidate || typeof input.candidate !== "object" || Array.isArray(input.candidate)) {
    throw new Error("candidate must be an object");
  }
  const sourceCandidateKey = safeRef(input.candidate.sourceCandidateKey, "candidate.sourceCandidateKey");
  if (typeof input.candidate.signalClass !== "string" || !SIGNAL_CLASSES.has(input.candidate.signalClass)) {
    throw new Error("candidate.signalClass is unsupported");
  }
  const signalClass = input.candidate.signalClass as IonosEmailOpportunitySignalClassV1;
  const declaredTruthState = truthState(input.candidate.truthState, "candidate.truthState");
  const candidateEvidenceRefs = refs(input.candidate.evidenceRefs, "candidate.evidenceRefs", true);
  for (const ref of candidateEvidenceRefs) {
    if (!claimByEvidenceRef.has(ref)) throw new Error(`candidate.evidenceRefs contains unsupported claim evidence ${ref}`);
  }

  const exactSignalClaims = claims.filter((claim) =>
    claim.kind === "OPPORTUNITY_SIGNAL" &&
    claim.signalClass === signalClass &&
    candidateEvidenceRefs.includes(claim.evidenceRef)
  );
  if (exactSignalClaims.length === 0) {
    throw new Error("candidate.signalClass requires exact OPPORTUNITY_SIGNAL claim evidence");
  }

  const title = normalizeField(input.candidate.title, "candidate.title", claimByEvidenceRef, true)!;
  const summary = normalizeField(input.candidate.summary, "candidate.summary", claimByEvidenceRef);
  const whyNow = normalizeField(input.candidate.whyNow, "candidate.whyNow", claimByEvidenceRef);
  const recommendedNextAction = normalizeField(
    input.candidate.recommendedNextAction,
    "candidate.recommendedNextAction",
    claimByEvidenceRef
  );
  const planningWindow = normalizeField(input.candidate.planningWindow, "candidate.planningWindow", claimByEvidenceRef);

  for (const field of [title, summary, whyNow, recommendedNextAction, planningWindow]) {
    if (!field) continue;
    for (const ref of field.evidenceRefs) {
      if (!candidateEvidenceRefs.includes(ref)) throw new Error("candidate field evidence must be included in candidate.evidenceRefs");
    }
  }
  requiresClaimKind(planningWindow, claimByEvidenceRef, new Set(["TIMING"]), "candidate.planningWindow");
  requiresClaimKind(
    recommendedNextAction,
    claimByEvidenceRef,
    new Set(["NEXT_STEP", "COMMITMENT"]),
    "candidate.recommendedNextAction"
  );
  requiresClaimKind(whyNow, claimByEvidenceRef, new Set(["TIMING", "NEXT_STEP", "COMMITMENT"]), "candidate.whyNow");

  const personRefs = refs(input.candidate.personRefs, "candidate.personRefs");
  const organizationRefs = refs(input.candidate.organizationRefs, "candidate.organizationRefs");
  const existingOpportunityRef = input.candidate.existingOpportunityRef == null
    ? null
    : safeRef(input.candidate.existingOpportunityRef, "candidate.existingOpportunityRef");

  const relevantClaimStates = candidateEvidenceRefs.map((ref) => claimByEvidenceRef.get(ref)!.state);
  const fieldStates = [title, summary, whyNow, recommendedNextAction, planningWindow]
    .filter((field): field is Readonly<OpportunityHandoffEvidenceFieldV1> => field != null)
    .map((field) => field.state);
  const effectiveTruthState = worstTruth([declaredTruthState, ...relevantClaimStates, ...fieldStates]);
  const evidenceIntegrity = integrityFrom([...relevantClaimStates, ...fieldStates, effectiveTruthState]);
  const extractionRequiresVerification = input.extractionRequiresVerification || evidenceIntegrity !== "SUPPORTED";

  const capture = compileIonosEmailOpportunityCaptureV1({
    mailboxRole,
    canonicalMessageRef,
    canonicalThreadRef,
    observedAt,
    evaluatedAt,
    communicationClass: input.communicationClass,
    direction: input.direction,
    evidenceIntegrity,
    requiresVerification: extractionRequiresVerification,
    candidate: {
      sourceCandidateKey,
      signalClass,
      title,
      truthState: effectiveTruthState,
      evidenceRefs: candidateEvidenceRefs,
      personRefs,
      organizationRefs,
      existingOpportunityRef,
      summary,
      whyNow,
      recommendedNextAction,
      planningWindow
    }
  });

  return freezeDeep({
    version: IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_VERSION,
    generatedAt: evaluatedAt,
    mailboxRole,
    canonicalMessageRef,
    canonicalThreadRef,
    extractionRef,
    disposition: capture.disposition,
    claimEvidence: claims.map((claim) => ({
      claimId: claim.claimId,
      kind: claim.kind,
      state: claim.state,
      evidenceRef: claim.evidenceRef,
      startOffset: claim.startOffset,
      endOffset: claim.endOffset,
      signalClass: claim.signalClass ?? null
    })),
    evidenceIntegrity,
    effectiveTruthState,
    capture,
    bodyContentConsumed: true as const,
    rawBodyRetained: false as const,
    rawBodyReturned: false as const,
    attachmentContentConsumed: false as const,
    semanticExtractionPerformedByThisContract: false as const,
    providedExtractionValidated: true as const,
    inferredContactInfo: false as const,
    inferredRelationship: false as const,
    inferredSponsorship: false as const,
    inferredTiming: false as const,
    inferredOpportunityCertainty: false as const,
    inferredDecisionAuthority: false as const,
    inferredEconomics: false as const,
    mailboxMutationPerformed: false as const,
    smtpSendPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
