import { IONOS_MAILBOX_ROLES_V1, type IonosMailboxRoleV1 } from "../email/ionos-mailbox-config-v1";
import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffEvidenceFieldV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportHandoffResultV1
} from "../relationships-crm/opportunity-import-handoff-v1";

export const IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION = "IONOS_EMAIL_OPPORTUNITY_CAPTURE_V1" as const;

export type IonosEmailCommunicationClassV1 =
  | "DIRECT_HUMAN"
  | "MARKETING_AUTOMATION"
  | "SYSTEM_TRANSACTIONAL"
  | "UNKNOWN";

export type IonosEmailDirectionV1 = "INBOUND" | "OUTBOUND" | "UNKNOWN";
export type IonosEmailEvidenceIntegrityV1 = "SUPPORTED" | "PARTIAL" | "CONFLICTED";
export type IonosEmailOpportunitySignalClassV1 =
  | "BUSINESS_DISCUSSION"
  | "INBOUND_INTEREST"
  | "EXPLICIT_FOLLOW_UP"
  | "PARTNERSHIP"
  | "COMMISSION"
  | "LICENSING"
  | "SPONSORSHIP"
  | "COLLABORATION"
  | "CHARITY"
  | "EVENT"
  | "MEDIA"
  | "COLLECTIBLES"
  | "PURCHASE"
  | "WARM_INTRODUCTION"
  | "OTHER_BUSINESS";

export type IonosEmailOpportunityCaptureDispositionV1 =
  | "CANDIDATE_CAPTURED"
  | "LINK_TO_EXISTING"
  | "NEEDS_VERIFICATION"
  | "SUPPRESSED_NON_HUMAN";

export type IonosEmailOpportunityCaptureCandidateV1 = {
  sourceCandidateKey: string;
  signalClass: IonosEmailOpportunitySignalClassV1;
  title: OpportunityHandoffEvidenceFieldV1;
  truthState: OpportunityHandoffTruthStateV1;
  evidenceRefs: readonly string[];
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
  summary?: OpportunityHandoffEvidenceFieldV1 | null;
  whyNow?: OpportunityHandoffEvidenceFieldV1 | null;
  recommendedNextAction?: OpportunityHandoffEvidenceFieldV1 | null;
  planningWindow?: OpportunityHandoffEvidenceFieldV1 | null;
};

export type IonosEmailOpportunityCaptureInputV1 = {
  mailboxRole: IonosMailboxRoleV1;
  canonicalMessageRef: string;
  canonicalThreadRef: string;
  observedAt: string;
  evaluatedAt: string;
  communicationClass: IonosEmailCommunicationClassV1;
  direction: IonosEmailDirectionV1;
  evidenceIntegrity: IonosEmailEvidenceIntegrityV1;
  requiresVerification: boolean;
  candidate: IonosEmailOpportunityCaptureCandidateV1;
};

export type IonosEmailOpportunityCaptureResultV1 = Readonly<{
  version: typeof IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION;
  mailboxRole: IonosMailboxRoleV1;
  canonicalMessageRef: string;
  canonicalThreadRef: string;
  observedAt: string;
  evaluatedAt: string;
  communicationClass: IonosEmailCommunicationClassV1;
  direction: IonosEmailDirectionV1;
  signalClass: IonosEmailOpportunitySignalClassV1;
  disposition: IonosEmailOpportunityCaptureDispositionV1;
  reasonCodes: readonly string[];
  handoff: OpportunityImportHandoffResultV1 | null;
  inferredContactInfo: false;
  inferredRelationship: false;
  inferredSponsorship: false;
  inferredTiming: false;
  inferredInterest: false;
  inferredAuthority: false;
  inferredEconomics: false;
  bodyContentConsumed: false;
  attachmentContentConsumed: false;
  mailboxMutationPerformed: false;
  smtpSendPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAILBOX_ROLES = new Set<string>(IONOS_MAILBOX_ROLES_V1);
const COMMUNICATION_CLASSES = new Set<IonosEmailCommunicationClassV1>([
  "DIRECT_HUMAN",
  "MARKETING_AUTOMATION",
  "SYSTEM_TRANSACTIONAL",
  "UNKNOWN"
]);
const DIRECTIONS = new Set<IonosEmailDirectionV1>(["INBOUND", "OUTBOUND", "UNKNOWN"]);
const INTEGRITY_STATES = new Set<IonosEmailEvidenceIntegrityV1>(["SUPPORTED", "PARTIAL", "CONFLICTED"]);
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
const FIELD_KEYS = new Set(["state", "value", "evidenceRefs"]);
const INPUT_KEYS = new Set([
  "mailboxRole",
  "canonicalMessageRef",
  "canonicalThreadRef",
  "observedAt",
  "evaluatedAt",
  "communicationClass",
  "direction",
  "evidenceIntegrity",
  "requiresVerification",
  "candidate"
]);
const CANDIDATE_KEYS = new Set([
  "sourceCandidateKey",
  "signalClass",
  "title",
  "truthState",
  "evidenceRefs",
  "personRefs",
  "organizationRefs",
  "existingOpportunityRef",
  "summary",
  "whyNow",
  "recommendedNextAction",
  "planningWindow"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value: unknown, allowed: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function refs(value: unknown, label: string, required = false): readonly string[] {
  if (value == null) {
    if (required) throw new Error(`${label} must be a non-empty array`);
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (required && normalized.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(normalized);
}

function normalizeField(
  value: unknown,
  label: string,
  required = false
): Readonly<OpportunityHandoffEvidenceFieldV1> | null {
  if (value == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  assertKeys(value, FIELD_KEYS, label);
  if (typeof value.state !== "string" || !TRUTH_STATES.has(value.state as OpportunityHandoffTruthStateV1)) {
    throw new Error(`${label}.state is unsupported`);
  }
  const state = value.state as OpportunityHandoffTruthStateV1;
  const normalizedValue = value.value == null ? null : requiredText(value.value, `${label}.value`);
  const evidenceRefs = refs(value.evidenceRefs, `${label}.evidenceRefs`, true);
  if (state === "KNOWN" && normalizedValue == null) throw new Error(`${label}.value is required when state is KNOWN`);
  return freezeDeep({ state, value: normalizedValue, evidenceRefs: [...evidenceRefs] });
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
}

function result(input: Omit<IonosEmailOpportunityCaptureResultV1, "version" | "inferredContactInfo" | "inferredRelationship" | "inferredSponsorship" | "inferredTiming" | "inferredInterest" | "inferredAuthority" | "inferredEconomics" | "bodyContentConsumed" | "attachmentContentConsumed" | "mailboxMutationPerformed" | "smtpSendPerformed" | "crmMutationPerformed" | "externalActionPerformed" | "writeAuthorityGranted">): IonosEmailOpportunityCaptureResultV1 {
  return freezeDeep({
    version: IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION,
    ...input,
    reasonCodes: [...unique(input.reasonCodes)],
    inferredContactInfo: false as const,
    inferredRelationship: false as const,
    inferredSponsorship: false as const,
    inferredTiming: false as const,
    inferredInterest: false as const,
    inferredAuthority: false as const,
    inferredEconomics: false as const,
    bodyContentConsumed: false as const,
    attachmentContentConsumed: false as const,
    mailboxMutationPerformed: false as const,
    smtpSendPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}

/**
 * Converts already-canonical, already-extracted IONOS evidence into the shared
 * opportunity handoff. This boundary never reads email content, discovers
 * contacts, infers relationships, or promotes a new email signal directly to a
 * canonical qualified opportunity.
 */
export function compileIonosEmailOpportunityCaptureV1(
  input: IonosEmailOpportunityCaptureInputV1
): IonosEmailOpportunityCaptureResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  if (typeof input.mailboxRole !== "string" || !MAILBOX_ROLES.has(input.mailboxRole)) {
    throw new Error("mailboxRole is unsupported");
  }
  const mailboxRole = input.mailboxRole as IonosMailboxRoleV1;
  const canonicalMessageRef = requiredText(input.canonicalMessageRef, "canonicalMessageRef");
  const canonicalThreadRef = requiredText(input.canonicalThreadRef, "canonicalThreadRef");
  const observedAt = timestamp(input.observedAt, "observedAt");
  const evaluatedAt = timestamp(input.evaluatedAt, "evaluatedAt");

  if (
    typeof input.communicationClass !== "string" ||
    !COMMUNICATION_CLASSES.has(input.communicationClass as IonosEmailCommunicationClassV1)
  ) throw new Error("communicationClass is unsupported");
  if (typeof input.direction !== "string" || !DIRECTIONS.has(input.direction as IonosEmailDirectionV1)) {
    throw new Error("direction is unsupported");
  }
  if (
    typeof input.evidenceIntegrity !== "string" ||
    !INTEGRITY_STATES.has(input.evidenceIntegrity as IonosEmailEvidenceIntegrityV1)
  ) throw new Error("evidenceIntegrity is unsupported");
  if (typeof input.requiresVerification !== "boolean") throw new Error("requiresVerification must be boolean");

  const communicationClass = input.communicationClass as IonosEmailCommunicationClassV1;
  const direction = input.direction as IonosEmailDirectionV1;
  const evidenceIntegrity = input.evidenceIntegrity as IonosEmailEvidenceIntegrityV1;

  assertKeys(input.candidate, CANDIDATE_KEYS, "candidate");
  const sourceCandidateKey = requiredText(input.candidate.sourceCandidateKey, "candidate.sourceCandidateKey");
  if (typeof input.candidate.signalClass !== "string" || !SIGNAL_CLASSES.has(input.candidate.signalClass as IonosEmailOpportunitySignalClassV1)) {
    throw new Error("candidate.signalClass is unsupported");
  }
  const signalClass = input.candidate.signalClass as IonosEmailOpportunitySignalClassV1;
  const title = normalizeField(input.candidate.title, "candidate.title", true);
  if (!title || title.value == null) throw new Error("candidate.title.value is required");
  if (typeof input.candidate.truthState !== "string" || !TRUTH_STATES.has(input.candidate.truthState as OpportunityHandoffTruthStateV1)) {
    throw new Error("candidate.truthState is unsupported");
  }
  const truthState = input.candidate.truthState as OpportunityHandoffTruthStateV1;
  const candidateEvidenceRefs = refs(input.candidate.evidenceRefs, "candidate.evidenceRefs", true);
  const personRefs = refs(input.candidate.personRefs, "candidate.personRefs");
  const organizationRefs = refs(input.candidate.organizationRefs, "candidate.organizationRefs");
  const existingOpportunityRef = optionalText(input.candidate.existingOpportunityRef, "candidate.existingOpportunityRef");
  const summary = normalizeField(input.candidate.summary, "candidate.summary");
  const whyNow = normalizeField(input.candidate.whyNow, "candidate.whyNow");
  const recommendedNextAction = normalizeField(input.candidate.recommendedNextAction, "candidate.recommendedNextAction");
  const planningWindow = normalizeField(input.candidate.planningWindow, "candidate.planningWindow");
  const base = {
    mailboxRole,
    canonicalMessageRef,
    canonicalThreadRef,
    observedAt,
    evaluatedAt,
    communicationClass,
    direction,
    signalClass
  } as const;

  if (Date.parse(observedAt) > Date.parse(evaluatedAt)) {
    return result({
      ...base,
      disposition: "NEEDS_VERIFICATION",
      reasonCodes: ["EMAIL_EVIDENCE_FUTURE_DATED"],
      handoff: null
    });
  }

  if (communicationClass === "MARKETING_AUTOMATION" || communicationClass === "SYSTEM_TRANSACTIONAL") {
    return result({
      ...base,
      disposition: "SUPPRESSED_NON_HUMAN",
      reasonCodes: [communicationClass === "MARKETING_AUTOMATION" ? "MARKETING_AUTOMATION_NOT_PERSONAL_OPPORTUNITY_EVIDENCE" : "SYSTEM_TRANSACTION_NOT_PERSONAL_OPPORTUNITY_EVIDENCE"],
      handoff: null
    });
  }

  if (communicationClass === "UNKNOWN") {
    return result({
      ...base,
      disposition: "NEEDS_VERIFICATION",
      reasonCodes: ["COMMUNICATION_CLASS_UNKNOWN"],
      handoff: null
    });
  }

  const reasons: string[] = [];
  const hasEntityAnchor = personRefs.length > 0 || organizationRefs.length > 0 || existingOpportunityRef != null;
  const canLinkExisting =
    existingOpportunityRef != null &&
    evidenceIntegrity === "SUPPORTED" &&
    input.requiresVerification === false &&
    truthState === "KNOWN" &&
    title.state === "KNOWN";

  if (!hasEntityAnchor) reasons.push("CANONICAL_ENTITY_ANCHOR_MISSING");
  if (direction === "UNKNOWN") reasons.push("EMAIL_DIRECTION_UNKNOWN");
  if (evidenceIntegrity === "PARTIAL") reasons.push("EMAIL_EVIDENCE_PARTIAL");
  if (evidenceIntegrity === "CONFLICTED") reasons.push("EMAIL_EVIDENCE_CONFLICTED");
  if (input.requiresVerification) reasons.push("UPSTREAM_EMAIL_EVIDENCE_REQUIRES_VERIFICATION");
  if (truthState !== "KNOWN") reasons.push(`TRUTH_${truthState}_REQUIRES_VERIFICATION`);
  if (title.state !== "KNOWN") reasons.push(`TITLE_${title.state}_REQUIRES_VERIFICATION`);
  if (existingOpportunityRef != null && !canLinkExisting) reasons.push("EXISTING_OPPORTUNITY_LINK_REQUIRES_SUPPORTED_KNOWN_EVIDENCE");
  if (existingOpportunityRef == null) reasons.push("EMAIL_SIGNAL_CANNOT_SELF_QUALIFY_NEW_OPPORTUNITY");

  const evidenceRefs = refs(
    [...candidateEvidenceRefs, ...title.evidenceRefs],
    "combinedEvidenceRefs",
    true
  );
  const handoff = compileOpportunityImportHandoffV1({
    source: "IONOS",
    sourceInteractionRef: `${canonicalThreadRef}#${canonicalMessageRef}`,
    candidate: {
      sourceCandidateKey,
      title: title.value,
      qualification: canLinkExisting ? "QUALIFIED" : "CANDIDATE",
      truthState,
      evidenceRefs,
      personRefs,
      organizationRefs,
      existingOpportunityRef,
      summary,
      whyNow,
      recommendedNextAction,
      planningWindow
    }
  });
  reasons.push(...handoff.reasonCodes);

  if (canLinkExisting && handoff.disposition === "LINK_TO_EXISTING") {
    return result({ ...base, disposition: "LINK_TO_EXISTING", reasonCodes: reasons, handoff });
  }

  const verificationRequired =
    evidenceIntegrity !== "SUPPORTED" ||
    input.requiresVerification ||
    truthState !== "KNOWN" ||
    title.state !== "KNOWN" ||
    direction === "UNKNOWN" ||
    !hasEntityAnchor ||
    existingOpportunityRef != null;

  return result({
    ...base,
    disposition: verificationRequired ? "NEEDS_VERIFICATION" : "CANDIDATE_CAPTURED",
    reasonCodes: reasons,
    handoff
  });
}
