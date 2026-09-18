import {
  OPPORTUNITY_IMPORT_HANDOFF_VERSION,
  type OpportunityImportHandoffResultV1
} from "@/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
  type OpportunitySignalTypeV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const CHATGPT_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1 =
  "CHATGPT_OPPORTUNITY_INTAKE_PROJECTION_V1" as const;

export type ChatGptOpportunityIntakeProjectionDispositionV1 =
  | "EMITTED"
  | "VERIFY_REQUIRED"
  | "SUPPRESSED";

export type ChatGptOpportunityIntakeProjectionReasonV1 =
  | "CHATGPT_HANDOFF_READY"
  | "EXPLICIT_EXISTING_OPPORTUNITY_LINK"
  | "HANDOFF_REQUIRES_VERIFICATION"
  | "HANDOFF_WATCH_ONLY"
  | "AMBIGUOUS_CANONICAL_ORGANIZATION"
  | "AMBIGUOUS_CANONICAL_PERSON";

export type ChatGptOpportunitySignalContextV1 = Readonly<{
  signalType: Exclude<OpportunitySignalTypeV1, "NONE">;
  signalEvidenceRefs: readonly string[];
  observedAt: string | Date;
}>;

export type ChatGptOpportunityIntakeProjectionInputV1 = Readonly<{
  handoff: OpportunityImportHandoffResultV1;
  context: ChatGptOpportunitySignalContextV1;
  evaluatedAt: string | Date;
}>;

export type ChatGptOpportunityIntakeProjectionResultV1 = Readonly<{
  version: typeof CHATGPT_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1;
  sourceHandoffVersion: typeof OPPORTUNITY_IMPORT_HANDOFF_VERSION;
  targetIntakeVersion: typeof OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1;
  generatedAt: string;
  disposition: ChatGptOpportunityIntakeProjectionDispositionV1;
  reasonCodes: readonly ChatGptOpportunityIntakeProjectionReasonV1[];
  observation: OpportunitySourceObservationV1 | null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    crmMutationAuthorized: false;
    relationshipMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const SIGNAL_TYPES = new Set<Exclude<OpportunitySignalTypeV1, "NONE">>([
  "SPONSORSHIP_OPPORTUNITY",
  "PARTNERSHIP_OPPORTUNITY",
  "PLANNING_WINDOW",
  "DECISION_MAKER_CHANGE",
  "WARM_INTRO",
  "COMMERCIAL_INTEREST",
  "OTHER_BUSINESS_OPPORTUNITY"
]);

const LIMITATIONS = Object.freeze([
  "This projection accepts only an already-compiled CHATGPT opportunity handoff and explicit structured signal classification; it never parses or infers from raw conversation text.",
  "Planning windows, decision-maker authority, sponsorship relationships, warm access, contact coordinates, budgets, deal value, certainty, and likelihood are not projected unless a later evidence-specific contract establishes them.",
  "An emitted observation is eligible only for downstream evidence review. It is not a qualified opportunity, CRM write, outreach recommendation, or external-action authorization."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  crmMutationAuthorized: false as const,
  relationshipMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  externalActionAuthorized: false as const
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function refs(value: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function oneOrNull(values: readonly string[]): string | null | "AMBIGUOUS" {
  const normalized = [...new Set(values.map((value) => requiredText(value, "canonicalRef")))];
  if (normalized.length === 0) return null;
  if (normalized.length > 1) return "AMBIGUOUS";
  return normalized[0];
}

function baseResult(
  generatedAt: string,
  disposition: ChatGptOpportunityIntakeProjectionDispositionV1,
  reasonCodes: readonly ChatGptOpportunityIntakeProjectionReasonV1[],
  observation: OpportunitySourceObservationV1 | null
): ChatGptOpportunityIntakeProjectionResultV1 {
  return freezeDeep({
    version: CHATGPT_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1,
    sourceHandoffVersion: OPPORTUNITY_IMPORT_HANDOFF_VERSION,
    targetIntakeVersion: OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
    generatedAt,
    disposition,
    reasonCodes: [...reasonCodes],
    observation,
    limitations: [...LIMITATIONS],
    authority: { ...AUTHORITY }
  });
}

export function projectChatGptOpportunityIntoIntakeV1(
  input: ChatGptOpportunityIntakeProjectionInputV1
): ChatGptOpportunityIntakeProjectionResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.handoff || typeof input.handoff !== "object" || Array.isArray(input.handoff)) throw new Error("handoff must be an object");
  if (!input.context || typeof input.context !== "object" || Array.isArray(input.context)) throw new Error("context must be an object");
  if (input.handoff.version !== OPPORTUNITY_IMPORT_HANDOFF_VERSION) throw new Error("handoff.version is unsupported");
  if (input.handoff.source !== "CHATGPT") throw new Error("handoff.source must be CHATGPT");
  if (input.handoff.crmMutationPerformed || input.handoff.externalActionPerformed || input.handoff.writeAuthorityGranted) {
    throw new Error("handoff must remain side-effect-free and grant no write authority");
  }

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const observedAt = timestamp(input.context.observedAt, "context.observedAt");
  if (Date.parse(observedAt) > Date.parse(generatedAt)) throw new Error("context.observedAt must not be future-dated");

  if (!SIGNAL_TYPES.has(input.context.signalType)) throw new Error("context.signalType is unsupported");
  const signalEvidenceRefs = refs(input.context.signalEvidenceRefs, "context.signalEvidenceRefs");
  const lineage = new Set(input.handoff.payload.evidenceRefs);
  if (signalEvidenceRefs.some((ref) => !lineage.has(ref))) {
    throw new Error("context.signalEvidenceRefs must be contained in handoff evidence lineage");
  }

  if (input.handoff.disposition === "WATCH_ONLY") {
    return baseResult(generatedAt, "SUPPRESSED", ["HANDOFF_WATCH_ONLY"], null);
  }
  if (input.handoff.disposition === "NEEDS_VERIFICATION") {
    return baseResult(generatedAt, "VERIFY_REQUIRED", ["HANDOFF_REQUIRES_VERIFICATION"], null);
  }

  const organizationRef = oneOrNull(input.handoff.payload.organizationRefs);
  if (organizationRef === "AMBIGUOUS") {
    return baseResult(generatedAt, "VERIFY_REQUIRED", ["AMBIGUOUS_CANONICAL_ORGANIZATION"], null);
  }
  const personRef = oneOrNull(input.handoff.payload.personRefs);
  if (personRef === "AMBIGUOUS") {
    return baseResult(generatedAt, "VERIFY_REQUIRED", ["AMBIGUOUS_CANONICAL_PERSON"], null);
  }

  const opportunityRef = input.handoff.payload.existingOpportunityRef == null
    ? null
    : requiredText(input.handoff.payload.existingOpportunityRef, "handoff.payload.existingOpportunityRef");

  const observation: OpportunitySourceObservationV1 = {
    captureId: requiredText(input.handoff.handoffId, "handoff.handoffId"),
    sourceKind: "CHATGPT",
    sourceEventKey: requiredText(input.handoff.idempotencyKey, "handoff.idempotencyKey"),
    sourceRef: requiredText(input.handoff.sourceInteractionRef, "handoff.sourceInteractionRef"),
    observedAt,
    evidenceRefs: signalEvidenceRefs,
    truthState: "KNOWN",
    signalType: input.context.signalType,
    organizationRef,
    personRef,
    opportunityRef,
    planningWindow: null,
    decisionMakerClaim: null,
    sponsorshipRelationshipClaim: null,
    warmAccessClaim: null
  };

  return baseResult(
    generatedAt,
    "EMITTED",
    [opportunityRef ? "EXPLICIT_EXISTING_OPPORTUNITY_LINK" : "CHATGPT_HANDOFF_READY"],
    observation
  );
}
