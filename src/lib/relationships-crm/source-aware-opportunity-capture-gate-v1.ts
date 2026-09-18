import {
  qualifyOpportunityHandoffEvidenceV1,
  type OpportunityEvidenceQualificationResultV1,
  type OpportunityQualificationEvidencePackV1
} from "./opportunity-evidence-qualification-v1";
import {
  compileCanonicalOpportunityUpsertPlanV1,
  type CanonicalOpportunitySnapshotV1,
  type CanonicalOpportunityUpsertPlanV1
} from "./canonical-opportunity-upsert-plan-v1";
import type {
  OpportunityHandoffSourceV1,
  OpportunityImportHandoffResultV1
} from "./opportunity-import-handoff-v1";

export const SOURCE_AWARE_OPPORTUNITY_CAPTURE_GATE_VERSION =
  "SOURCE_AWARE_OPPORTUNITY_CAPTURE_GATE_V1" as const;

export type SourceAwareOpportunityCaptureDispositionV1 =
  | "CANONICAL_PLAN_READY"
  | "NO_CHANGE"
  | "WATCH_ONLY"
  | "NOT_SUPPORTED"
  | "NEEDS_RESEARCH"
  | "NEEDS_VERIFICATION"
  | "EXPLICIT_USER_QUALIFICATION_REQUIRED";

export type SourceAwareOpportunityCaptureCandidateV1 = Readonly<{
  handoff: OpportunityImportHandoffResultV1;
  evidence: OpportunityQualificationEvidencePackV1;
}>;

export type SourceAwareOpportunityCaptureDecisionV1 = Readonly<{
  handoffId: string;
  source: OpportunityHandoffSourceV1;
  sourceCandidateKey: string;
  disposition: SourceAwareOpportunityCaptureDispositionV1;
  reasonCodes: readonly string[];
  qualification: OpportunityEvidenceQualificationResultV1 | null;
  canonicalPlan: CanonicalOpportunityUpsertPlanV1 | null;
}>;

export type SourceAwareOpportunityCaptureGateInputV1 = Readonly<{
  candidates: readonly SourceAwareOpportunityCaptureCandidateV1[];
  existingOpportunities: readonly CanonicalOpportunitySnapshotV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
}>;

export type SourceAwareOpportunityCaptureGateResultV1 = Readonly<{
  version: typeof SOURCE_AWARE_OPPORTUNITY_CAPTURE_GATE_VERSION;
  generatedAt: string;
  decisions: readonly SourceAwareOpportunityCaptureDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    canonicalPlanReady: number;
    noChange: number;
    watchOnly: number;
    notSupported: number;
    needsResearch: number;
    needsVerification: number;
    explicitUserQualificationRequired: number;
  }>;
  crossSourceMergeInferred: false;
  contactInfoInferred: false;
  relationshipInferred: false;
  sponsorshipInferred: false;
  timingInferred: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAX_CANDIDATES = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function asDate(value: string | Date, label: string): Date {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function uniqueReasons(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function mapQualifiedPlanDisposition(
  plan: CanonicalOpportunityUpsertPlanV1
): SourceAwareOpportunityCaptureDispositionV1 {
  if (plan.disposition === "CREATE" || plan.disposition === "UPDATE") return "CANONICAL_PLAN_READY";
  if (plan.disposition === "NO_CHANGE") return "NO_CHANGE";
  if (plan.disposition === "SUPPRESS") return "WATCH_ONLY";
  return "NEEDS_VERIFICATION";
}

function mapQualificationDisposition(
  qualification: OpportunityEvidenceQualificationResultV1
): SourceAwareOpportunityCaptureDispositionV1 {
  if (qualification.status === "WATCH_ONLY") return "WATCH_ONLY";
  if (qualification.status === "NOT_SUPPORTED") return "NOT_SUPPORTED";
  if (qualification.status === "NEEDS_RESEARCH") return "NEEDS_RESEARCH";
  return "NEEDS_VERIFICATION";
}

function explicitUserQualificationRequired(
  candidate: SourceAwareOpportunityCaptureCandidateV1
): boolean {
  return candidate.handoff.source === "CHATGPT" && candidate.handoff.payload.qualification === "CANDIDATE";
}

function validateSafeHandoff(handoff: OpportunityImportHandoffResultV1): void {
  if (!isPlainObject(handoff)) throw new Error("candidate.handoff must be a plain object");
  requiredText(handoff.handoffId, "candidate.handoff.handoffId");
  requiredText(handoff.idempotencyKey, "candidate.handoff.idempotencyKey");
  requiredText(handoff.sourceInteractionRef, "candidate.handoff.sourceInteractionRef");
  requiredText(handoff.payload?.sourceCandidateKey, "candidate.handoff.payload.sourceCandidateKey");
  if (
    handoff.crmMutationPerformed !== false ||
    handoff.externalActionPerformed !== false ||
    handoff.writeAuthorityGranted !== false
  ) {
    throw new Error("candidate.handoff violates the governed non-mutating intake boundary");
  }
}

function compileCandidate(
  candidate: SourceAwareOpportunityCaptureCandidateV1,
  existingOpportunities: readonly CanonicalOpportunitySnapshotV1[],
  now: string,
  maximumEvidenceAgeDays: number | undefined
): SourceAwareOpportunityCaptureDecisionV1 {
  validateSafeHandoff(candidate.handoff);

  if (explicitUserQualificationRequired(candidate)) {
    return freezeDeep({
      handoffId: candidate.handoff.handoffId,
      source: candidate.handoff.source,
      sourceCandidateKey: candidate.handoff.payload.sourceCandidateKey,
      disposition: "EXPLICIT_USER_QUALIFICATION_REQUIRED" as const,
      reasonCodes: [
        "CHATGPT_CANDIDATE_CANNOT_BE_PROMOTED_BY_RESEARCH_ALONE",
        "EXPLICIT_USER_QUALIFICATION_REQUIRED"
      ],
      qualification: null,
      canonicalPlan: null
    });
  }

  const qualification = qualifyOpportunityHandoffEvidenceV1({
    handoff: candidate.handoff,
    evidence: candidate.evidence,
    now,
    maximumEvidenceAgeDays
  });

  if (qualification.status !== "QUALIFIED" && qualification.status !== "ALREADY_QUALIFIED") {
    return freezeDeep({
      handoffId: candidate.handoff.handoffId,
      source: candidate.handoff.source,
      sourceCandidateKey: candidate.handoff.payload.sourceCandidateKey,
      disposition: mapQualificationDisposition(qualification),
      reasonCodes: [...uniqueReasons(qualification.reasonCodes)],
      qualification,
      canonicalPlan: null
    });
  }

  const canonicalPlan = compileCanonicalOpportunityUpsertPlanV1({
    handoff: qualification.qualifiedHandoff,
    existingOpportunities
  });

  return freezeDeep({
    handoffId: candidate.handoff.handoffId,
    source: candidate.handoff.source,
    sourceCandidateKey: candidate.handoff.payload.sourceCandidateKey,
    disposition: mapQualifiedPlanDisposition(canonicalPlan),
    reasonCodes: [...uniqueReasons([...qualification.reasonCodes, ...canonicalPlan.reasonCodes])],
    qualification,
    canonicalPlan
  });
}

/**
 * Source-aware, non-mutating bridge from opportunity capture into the canonical
 * evidence qualification and upsert-plan boundaries.
 *
 * Different sources are never merged by title, organization overlap, wording,
 * or model judgment. A cross-source link must already exist as an explicit
 * canonical opportunity reference or canonical source identity. ChatGPT
 * candidates also retain their user-approval boundary: research evidence can
 * inform them, but cannot silently turn a tracked/suggested candidate into a
 * canonical qualified opportunity.
 */
export function compileSourceAwareOpportunityCaptureGateV1(
  input: SourceAwareOpportunityCaptureGateInputV1
): SourceAwareOpportunityCaptureGateResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > MAX_CANDIDATES) throw new Error(`candidates exceeds ${MAX_CANDIDATES}`);
  if (!Array.isArray(input.existingOpportunities)) throw new Error("existingOpportunities must be an array");

  const now = asDate(input.now, "now").toISOString();
  if (
    input.maximumEvidenceAgeDays != null &&
    (!Number.isInteger(input.maximumEvidenceAgeDays) || input.maximumEvidenceAgeDays < 1 || input.maximumEvidenceAgeDays > 3650)
  ) {
    throw new Error("maximumEvidenceAgeDays must be an integer between 1 and 3650");
  }

  const seenHandoffIds = new Set<string>();
  const normalized = input.candidates.map((candidate, index) => {
    if (!isPlainObject(candidate)) throw new Error(`candidates[${index}] must be a plain object`);
    validateSafeHandoff(candidate.handoff);
    if (!isPlainObject(candidate.evidence)) throw new Error(`candidates[${index}].evidence must be a plain object`);
    if (seenHandoffIds.has(candidate.handoff.handoffId)) {
      throw new Error(`duplicate handoffId ${candidate.handoff.handoffId}`);
    }
    seenHandoffIds.add(candidate.handoff.handoffId);
    return candidate;
  });

  const decisions = [...normalized]
    .sort((left, right) => left.handoff.handoffId.localeCompare(right.handoff.handoffId))
    .map((candidate) =>
      compileCandidate(candidate, input.existingOpportunities, now, input.maximumEvidenceAgeDays)
    );

  const count = (disposition: SourceAwareOpportunityCaptureDispositionV1) =>
    decisions.filter((decision) => decision.disposition === disposition).length;

  return freezeDeep({
    version: SOURCE_AWARE_OPPORTUNITY_CAPTURE_GATE_VERSION,
    generatedAt: now,
    decisions,
    counts: {
      reviewed: decisions.length,
      canonicalPlanReady: count("CANONICAL_PLAN_READY"),
      noChange: count("NO_CHANGE"),
      watchOnly: count("WATCH_ONLY"),
      notSupported: count("NOT_SUPPORTED"),
      needsResearch: count("NEEDS_RESEARCH"),
      needsVerification: count("NEEDS_VERIFICATION"),
      explicitUserQualificationRequired: count("EXPLICIT_USER_QUALIFICATION_REQUIRED")
    },
    crossSourceMergeInferred: false as const,
    contactInfoInferred: false as const,
    relationshipInferred: false as const,
    sponsorshipInferred: false as const,
    timingInferred: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
