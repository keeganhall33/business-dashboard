import {
  OPPORTUNITY_IMPORT_HANDOFF_VERSION,
  compileOpportunityImportHandoffV1,
  type OpportunityImportHandoffResultV1
} from "@/lib/relationships-crm/opportunity-import-handoff-v1";
import {
  OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1,
  type OpportunitySignalTypeV1,
  type OpportunitySourceObservationV1
} from "@/lib/relationship-intelligence/opportunity-signal-intake-v1";

export const EMAIL_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1 =
  "EMAIL_OPPORTUNITY_INTAKE_PROJECTION_V1" as const;

export type EmailOpportunityIntakeProjectionDispositionV1 =
  | "EMITTED"
  | "VERIFY_REQUIRED"
  | "SUPPRESSED";

export type EmailOpportunityIntakeProjectionReasonV1 =
  | "IONOS_HANDOFF_READY"
  | "EXPLICIT_EXISTING_OPPORTUNITY_LINK"
  | "HANDOFF_REQUIRES_VERIFICATION"
  | "HANDOFF_WATCH_ONLY"
  | "AMBIGUOUS_CANONICAL_ORGANIZATION"
  | "AMBIGUOUS_CANONICAL_PERSON";

export type EmailOpportunitySignalContextV1 = Readonly<{
  signalType: Exclude<OpportunitySignalTypeV1, "NONE">;
  signalEvidenceRefs: readonly string[];
  observedAt: string | Date;
}>;

export type EmailOpportunityIntakeProjectionInputV1 = Readonly<{
  handoff: OpportunityImportHandoffResultV1;
  context: EmailOpportunitySignalContextV1;
  evaluatedAt: string | Date;
}>;

export type EmailOpportunityIntakeProjectionResultV1 = Readonly<{
  version: typeof EMAIL_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1;
  sourceHandoffVersion: typeof OPPORTUNITY_IMPORT_HANDOFF_VERSION;
  targetIntakeVersion: typeof OPPORTUNITY_SIGNAL_INTAKE_VERSION_V1;
  generatedAt: string;
  disposition: EmailOpportunityIntakeProjectionDispositionV1;
  reasonCodes: readonly EmailOpportunityIntakeProjectionReasonV1[];
  observation: OpportunitySourceObservationV1 | null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    mailboxMutationAuthorized: false;
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
  "This projection accepts only an already-compiled IONOS opportunity handoff plus explicit structured signal classification; it never parses or infers opportunity facts from raw email text.",
  "Email correspondence, age, reply history, or source count never establishes sponsor interest, authority, warm access, a planning window, budget, deal value, certainty, likelihood, or intent by itself.",
  "Planning-window text carried by the generic handoff is not parsed into a dated planning-window claim here; a later evidence-specific contract must establish structured timing.",
  "An emitted observation is eligible only for downstream evidence review. It is not a qualified opportunity, CRM or relationship write, outreach recommendation, mailbox mutation, or external-action authorization."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  mailboxMutationAuthorized: false as const,
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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])
  );
}

function assertCanonicalHandoff(handoff: OpportunityImportHandoffResultV1): void {
  if (handoff.version !== OPPORTUNITY_IMPORT_HANDOFF_VERSION) throw new Error("handoff.version is unsupported");
  if (handoff.source !== "IONOS") throw new Error("handoff.source must be IONOS");
  if (handoff.crmMutationPerformed || handoff.externalActionPerformed || handoff.writeAuthorityGranted) {
    throw new Error("handoff must remain side-effect-free and grant no write authority");
  }

  const recomputed = compileOpportunityImportHandoffV1({
    source: handoff.source,
    sourceInteractionRef: handoff.sourceInteractionRef,
    candidate: {
      sourceCandidateKey: handoff.payload.sourceCandidateKey,
      title: handoff.payload.title,
      qualification: handoff.payload.qualification,
      truthState: handoff.payload.truthState,
      evidenceRefs: handoff.payload.evidenceRefs,
      personRefs: handoff.payload.personRefs,
      organizationRefs: handoff.payload.organizationRefs,
      existingOpportunityRef: handoff.payload.existingOpportunityRef,
      summary: handoff.payload.summary,
      whyNow: handoff.payload.whyNow,
      recommendedNextAction: handoff.payload.recommendedNextAction,
      planningWindow: handoff.payload.planningWindow
    }
  });

  if (JSON.stringify(canonicalize(handoff)) !== JSON.stringify(canonicalize(recomputed))) {
    throw new Error("handoff is not semantically consistent with the canonical opportunity handoff compiler");
  }
}

function baseResult(
  generatedAt: string,
  disposition: EmailOpportunityIntakeProjectionDispositionV1,
  reasonCodes: readonly EmailOpportunityIntakeProjectionReasonV1[],
  observation: OpportunitySourceObservationV1 | null
): EmailOpportunityIntakeProjectionResultV1 {
  return freezeDeep({
    version: EMAIL_OPPORTUNITY_INTAKE_PROJECTION_VERSION_V1,
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

export function projectEmailOpportunityIntoIntakeV1(
  input: EmailOpportunityIntakeProjectionInputV1
): EmailOpportunityIntakeProjectionResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!input.handoff || typeof input.handoff !== "object" || Array.isArray(input.handoff)) throw new Error("handoff must be an object");
  if (!input.context || typeof input.context !== "object" || Array.isArray(input.context)) throw new Error("context must be an object");

  assertCanonicalHandoff(input.handoff);

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
    sourceKind: "EMAIL",
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
    [opportunityRef ? "EXPLICIT_EXISTING_OPPORTUNITY_LINK" : "IONOS_HANDOFF_READY"],
    observation
  );
}
