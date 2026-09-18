import { createHash } from "node:crypto";

import type {
  SponsorOpportunityReadinessDecisionV1,
  SponsorOpportunityReadinessResultV1,
  SponsorOpportunityReadinessStatusV1
} from "@/lib/relationship-intelligence/sponsor-opportunity-readiness-v1";
import type {
  RelationshipSignalDeltaDecisionV1,
  RelationshipSignalDeltaResultV1,
  RelationshipSignalTypeV1
} from "@/lib/relationship-intelligence/relationship-signal-delta-v1";

export const SPONSOR_OPPORTUNITY_EARLY_WARNING_VERSION_V1 = "SPONSOR_OPPORTUNITY_EARLY_WARNING_V1" as const;

export type SponsorOpportunityAttentionClassV1 =
  | "VERIFY_BEFORE_ACTION"
  | "PREPARE_NOW"
  | "PLAN_AHEAD"
  | "RESOLVE_ACCESS"
  | "RECOVER_NEXT_CYCLE"
  | "RESEARCH_GAPS";

export type SponsorOpportunityContextSignalClassV1 =
  | "DECISION_MAKER_ROLE_CHANGE"
  | "SPONSORSHIP_CHANGE"
  | "RELATIONSHIP_CHANGE";

export type SponsorOpportunityAnchorMatchV1 =
  | "ORGANIZATION"
  | "PERSON"
  | "ORGANIZATION_AND_PERSON";

export type SponsorOpportunityRadarNextInternalActionV1 =
  | "VERIFY_DECISION_MAKER_ROLE_CHANGE"
  | "PREPARE_APPROVAL_READY_OUTREACH"
  | "PREPARE_EARLY_ACTIVATION_BRIEF"
  | "RESOLVE_ACCESS_BLOCKER"
  | "RESEARCH_NEXT_CYCLE"
  | "RESEARCH_EVIDENCE_GAPS"
  | "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING";

export type SponsorOpportunityContextSignalV1 = Readonly<{
  deltaId: string;
  signalId: string;
  signalType: RelationshipSignalTypeV1;
  disposition: RelationshipSignalDeltaDecisionV1["disposition"];
  observedAt: string;
  anchorMatch: SponsorOpportunityAnchorMatchV1;
  contextClass: SponsorOpportunityContextSignalClassV1;
  subjectEntityRef: string | null;
  objectEntityRef: string | null;
  relationshipKind: RelationshipSignalDeltaDecisionV1["relationshipKind"];
  relationshipStatus: RelationshipSignalDeltaDecisionV1["relationshipStatus"];
  evidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  opportunityImpact: "NOT_ESTABLISHED";
}>;

export type SponsorOpportunityEarlyWarningAlertV1 = Readonly<{
  alertId: string;
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalPersonRef: string | null;
  readinessStatus: SponsorOpportunityReadinessStatusV1;
  attentionClass: SponsorOpportunityAttentionClassV1;
  nextInternalAction: SponsorOpportunityRadarNextInternalActionV1;
  idealOutreachDateRange: SponsorOpportunityReadinessDecisionV1["idealOutreachDateRange"];
  timingRationale: string | null;
  evidenceRefs: readonly string[];
  gaps: readonly string[];
  reasonCodes: readonly string[];
  contextSignals: readonly SponsorOpportunityContextSignalV1[];
  opportunityImpactFromContextSignals: "NOT_ESTABLISHED";
  sponsorInterest: "NOT_ESTABLISHED";
  budgetAvailability: "NOT_ESTABLISHED";
  dealLikelihood: "NOT_ESTABLISHED";
}>;

export type SponsorOpportunityEarlyWarningInputV1 = Readonly<{
  evaluatedAt: string | Date;
  readiness: SponsorOpportunityReadinessResultV1;
  relationshipSignals: RelationshipSignalDeltaResultV1;
  maximumProjectionAgeMinutes?: number;
}>;

export type SponsorOpportunityEarlyWarningResultV1 = Readonly<{
  version: typeof SPONSOR_OPPORTUNITY_EARLY_WARNING_VERSION_V1;
  generatedAt: string;
  status: "READY" | "BLOCKED";
  issues: readonly string[];
  alerts: readonly SponsorOpportunityEarlyWarningAlertV1[];
  counts: Readonly<Record<SponsorOpportunityAttentionClassV1, number>>;
  limitations: readonly string[];
  matchingPolicy: "EXACT_CANONICAL_SPONSOR_OR_PERSON_ANCHOR_ONLY";
  authority: Readonly<{
    analysisOnly: true;
    internalPreparationAllowed: true;
    crmMutationAuthorized: false;
    contactDiscoveryAuthorized: false;
    outreachAuthorized: false;
    spendAuthorized: false;
    contractAuthorized: false;
    externalActionAuthorized: false;
  }>;
}>;

const DEFAULT_MAX_PROJECTION_AGE_MINUTES = 60;
const MAX_PROJECTION_AGE_MINUTES = 1_440;
const MINUTE_MS = 60_000;

const LIMITATIONS = Object.freeze([
  "The radar combines existing sponsor-readiness projections with normalized relationship-signal deltas; it does not create relationship, sponsorship, contact, opportunity, timing, budget, or intent facts.",
  "Context signals are attached only by exact canonical organization or person anchors. A matched signal does not establish that the signal changes the opportunity, proves sponsor interest, or predicts a deal.",
  "A decision-maker role-change signal matched to the exact canonical person fails closed to verification before preparation. Other relationship signals remain review context and cannot upgrade readiness.",
  "All actions are internal preparation or research only. Outreach, contact discovery, CRM mutation, spend, contracts, publishing, and other external actions remain separately governed."
] as const);

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  internalPreparationAllowed: true as const,
  crmMutationAuthorized: false as const,
  contactDiscoveryAuthorized: false as const,
  outreachAuthorized: false as const,
  spendAuthorized: false as const,
  contractAuthorized: false as const,
  externalActionAuthorized: false as const
});

const ATTENTION_ORDER: Readonly<Record<SponsorOpportunityAttentionClassV1, number>> = Object.freeze({
  VERIFY_BEFORE_ACTION: 0,
  PREPARE_NOW: 1,
  PLAN_AHEAD: 2,
  RESOLVE_ACCESS: 3,
  RECOVER_NEXT_CYCLE: 4,
  RESEARCH_GAPS: 5
});

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: string | Date, label: string): string {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return candidate;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))]
      .sort((a, b) => a.localeCompare(b))
  );
}

function projectionIssue(
  generatedAt: string,
  label: string,
  evaluatedAtMs: number,
  maximumProjectionAgeMinutes: number
): string | null {
  const generatedAtMs = Date.parse(generatedAt);
  if (!Number.isFinite(generatedAtMs)) return `${label}_GENERATED_AT_INVALID`;
  if (generatedAtMs > evaluatedAtMs) return `${label}_GENERATED_IN_FUTURE`;
  if (evaluatedAtMs - generatedAtMs > maximumProjectionAgeMinutes * MINUTE_MS) return `${label}_PROJECTION_STALE`;
  return null;
}

function stableAlertId(candidateId: string, generatedAt: string): string {
  return `sponsor-radar:${createHash("sha256").update(`${candidateId}\u0000${generatedAt}`).digest("hex").slice(0, 20)}`;
}

function emptyCounts(): Record<SponsorOpportunityAttentionClassV1, number> {
  return {
    VERIFY_BEFORE_ACTION: 0,
    PREPARE_NOW: 0,
    PLAN_AHEAD: 0,
    RESOLVE_ACCESS: 0,
    RECOVER_NEXT_CYCLE: 0,
    RESEARCH_GAPS: 0
  };
}

function baseAttention(status: SponsorOpportunityReadinessStatusV1): SponsorOpportunityAttentionClassV1 | null {
  switch (status) {
    case "READY_TO_PREPARE":
      return "PREPARE_NOW";
    case "PLAN_AHEAD":
      return "PLAN_AHEAD";
    case "ACCESS_BLOCKED":
      return "RESOLVE_ACCESS";
    case "MISSED_WINDOW":
      return "RECOVER_NEXT_CYCLE";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_GAPS";
    case "VERIFY_REQUIRED":
      return "VERIFY_BEFORE_ACTION";
    case "SUPPRESS":
      return null;
  }
}

function baseNextAction(status: SponsorOpportunityReadinessStatusV1): SponsorOpportunityRadarNextInternalActionV1 | null {
  switch (status) {
    case "READY_TO_PREPARE":
      return "PREPARE_APPROVAL_READY_OUTREACH";
    case "PLAN_AHEAD":
      return "PREPARE_EARLY_ACTIVATION_BRIEF";
    case "ACCESS_BLOCKED":
      return "RESOLVE_ACCESS_BLOCKER";
    case "MISSED_WINDOW":
      return "RESEARCH_NEXT_CYCLE";
    case "RESEARCH_REQUIRED":
      return "RESEARCH_EVIDENCE_GAPS";
    case "VERIFY_REQUIRED":
      return "VERIFY_IDENTITY_ROLE_ACCESS_OR_TIMING";
    case "SUPPRESS":
      return null;
  }
}

function contextClass(signalType: RelationshipSignalTypeV1): SponsorOpportunityContextSignalClassV1 {
  if (signalType === "EXECUTIVE_ROLE_CHANGE") return "DECISION_MAKER_ROLE_CHANGE";
  if (signalType === "SPONSORSHIP_ANNOUNCEMENT" || signalType === "SPONSORSHIP_RENEWAL" || signalType === "SPONSORSHIP_END") {
    return "SPONSORSHIP_CHANGE";
  }
  return "RELATIONSHIP_CHANGE";
}

function exactAnchorMatch(
  decision: SponsorOpportunityReadinessDecisionV1,
  signal: RelationshipSignalDeltaDecisionV1
): SponsorOpportunityAnchorMatchV1 | null {
  const org = decision.canonicalOrganizationRef;
  const person = decision.canonicalPersonRef;
  const refs = [signal.subjectEntityRef, signal.objectEntityRef];
  const matchesOrg = Boolean(org && refs.includes(org));
  const matchesPerson = Boolean(person && refs.includes(person));
  if (matchesOrg && matchesPerson) return "ORGANIZATION_AND_PERSON";
  if (matchesPerson) return "PERSON";
  if (matchesOrg) return "ORGANIZATION";
  return null;
}

function eligibleContextSignal(signal: RelationshipSignalDeltaDecisionV1): boolean {
  if (signal.disposition === "NO_MATERIAL_CHANGE" || signal.disposition === "SUPPRESS") return false;
  return signal.evidenceRefs.length > 0;
}

function toContextSignal(
  decision: SponsorOpportunityReadinessDecisionV1,
  signal: RelationshipSignalDeltaDecisionV1
): SponsorOpportunityContextSignalV1 | null {
  if (!eligibleContextSignal(signal)) return null;
  const anchorMatch = exactAnchorMatch(decision, signal);
  if (!anchorMatch) return null;

  return freezeDeep({
    deltaId: requiredText(signal.deltaId, "signal.deltaId"),
    signalId: requiredText(signal.signalId, "signal.signalId"),
    signalType: signal.signalType,
    disposition: signal.disposition,
    observedAt: timestamp(signal.observedAt, "signal.observedAt"),
    anchorMatch,
    contextClass: contextClass(signal.signalType),
    subjectEntityRef: signal.subjectEntityRef,
    objectEntityRef: signal.objectEntityRef,
    relationshipKind: signal.relationshipKind,
    relationshipStatus: signal.relationshipStatus,
    evidenceRefs: uniqueSorted([...signal.evidenceRefs, ...signal.matchedRelationshipEvidenceRefs]),
    reasonCodes: uniqueSorted(signal.reasonCodes),
    opportunityImpact: "NOT_ESTABLISHED" as const
  });
}

function roleChangeRequiresVerification(
  decision: SponsorOpportunityReadinessDecisionV1,
  signal: SponsorOpportunityContextSignalV1
): boolean {
  if (!decision.canonicalPersonRef || signal.contextClass !== "DECISION_MAKER_ROLE_CHANGE") return false;
  return signal.anchorMatch === "PERSON" || signal.anchorMatch === "ORGANIZATION_AND_PERSON";
}

function buildAlert(
  decision: SponsorOpportunityReadinessDecisionV1,
  signals: readonly RelationshipSignalDeltaDecisionV1[],
  generatedAt: string
): SponsorOpportunityEarlyWarningAlertV1 | null {
  const base = baseAttention(decision.status);
  const defaultAction = baseNextAction(decision.status);
  if (!base || !defaultAction) return null;

  const contextSignals = signals
    .map((signal) => toContextSignal(decision, signal))
    .filter((signal): signal is SponsorOpportunityContextSignalV1 => signal != null)
    .sort((left, right) => {
      const observedDelta = Date.parse(right.observedAt) - Date.parse(left.observedAt);
      return observedDelta !== 0 ? observedDelta : left.deltaId.localeCompare(right.deltaId);
    });

  const exactRoleChange = contextSignals.some((signal) => roleChangeRequiresVerification(decision, signal));
  const attentionClass: SponsorOpportunityAttentionClassV1 = exactRoleChange ? "VERIFY_BEFORE_ACTION" : base;
  const nextInternalAction: SponsorOpportunityRadarNextInternalActionV1 = exactRoleChange
    ? "VERIFY_DECISION_MAKER_ROLE_CHANGE"
    : defaultAction;

  const reasonCodes = new Set(decision.reasonCodes);
  if (exactRoleChange) reasonCodes.add("EXACT_DECISION_MAKER_ROLE_CHANGE_SIGNAL_REQUIRES_REVALIDATION");
  if (contextSignals.length > 0) reasonCodes.add("EXACT_CANONICAL_ANCHOR_HAS_NEW_RELATIONSHIP_CONTEXT");

  return freezeDeep({
    alertId: stableAlertId(decision.candidateId, generatedAt),
    candidateId: decision.candidateId,
    canonicalOrganizationRef: decision.canonicalOrganizationRef,
    canonicalPersonRef: decision.canonicalPersonRef,
    readinessStatus: decision.status,
    attentionClass,
    nextInternalAction,
    idealOutreachDateRange: decision.idealOutreachDateRange ? { ...decision.idealOutreachDateRange } : null,
    timingRationale: decision.timingRationale,
    evidenceRefs: uniqueSorted([
      ...decision.evidenceRefs,
      ...contextSignals.flatMap((signal) => signal.evidenceRefs)
    ]),
    gaps: uniqueSorted(decision.gaps),
    reasonCodes: uniqueSorted([...reasonCodes]),
    contextSignals,
    opportunityImpactFromContextSignals: "NOT_ESTABLISHED" as const,
    sponsorInterest: "NOT_ESTABLISHED" as const,
    budgetAvailability: "NOT_ESTABLISHED" as const,
    dealLikelihood: "NOT_ESTABLISHED" as const
  });
}

/**
 * Builds a read-only early-warning radar from already-governed sponsor readiness
 * and relationship-signal projections. Exact canonical anchors are the only
 * cross-source join. Relationship signals never create or upgrade opportunity
 * readiness, and exact decision-maker role changes force re-verification before
 * internal preparation can proceed.
 */
export function buildSponsorOpportunityEarlyWarningV1(
  input: SponsorOpportunityEarlyWarningInputV1
): SponsorOpportunityEarlyWarningResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");

  const generatedAt = timestamp(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(generatedAt);
  const maximumProjectionAgeMinutes = boundedInteger(
    input.maximumProjectionAgeMinutes,
    DEFAULT_MAX_PROJECTION_AGE_MINUTES,
    1,
    MAX_PROJECTION_AGE_MINUTES,
    "maximumProjectionAgeMinutes"
  );

  const issues = new Set<string>();
  const readinessProjectionIssue = projectionIssue(
    input.readiness.generatedAt,
    "SPONSOR_READINESS",
    evaluatedAtMs,
    maximumProjectionAgeMinutes
  );
  const relationshipSignalProjectionIssue = projectionIssue(
    input.relationshipSignals.generatedAt,
    "RELATIONSHIP_SIGNALS",
    evaluatedAtMs,
    maximumProjectionAgeMinutes
  );
  if (readinessProjectionIssue) issues.add(readinessProjectionIssue);
  if (relationshipSignalProjectionIssue) issues.add(relationshipSignalProjectionIssue);
  if (input.readiness.status !== "READY") {
    issues.add("SPONSOR_READINESS_BLOCKED");
    for (const issue of input.readiness.issues) issues.add(`SPONSOR_READINESS:${requiredText(issue, "readiness.issue")}`);
  }

  if (issues.size > 0) {
    return freezeDeep({
      version: SPONSOR_OPPORTUNITY_EARLY_WARNING_VERSION_V1,
      generatedAt,
      status: "BLOCKED" as const,
      issues: uniqueSorted([...issues]),
      alerts: [],
      counts: emptyCounts(),
      limitations: [...LIMITATIONS],
      matchingPolicy: "EXACT_CANONICAL_SPONSOR_OR_PERSON_ANCHOR_ONLY" as const,
      authority: AUTHORITY
    });
  }

  const candidateIds = new Set<string>();
  for (const decision of input.readiness.decisions) {
    if (candidateIds.has(decision.candidateId)) throw new Error(`readiness.decisions contains duplicate candidateId ${decision.candidateId}`);
    candidateIds.add(decision.candidateId);
  }

  const deltaIds = new Set<string>();
  for (const signal of input.relationshipSignals.decisions) {
    if (deltaIds.has(signal.deltaId)) throw new Error(`relationshipSignals.decisions contains duplicate deltaId ${signal.deltaId}`);
    deltaIds.add(signal.deltaId);
  }

  const alerts = input.readiness.decisions
    .map((decision) => buildAlert(decision, input.relationshipSignals.decisions, generatedAt))
    .filter((alert): alert is SponsorOpportunityEarlyWarningAlertV1 => alert != null)
    .sort((left, right) => {
      const attentionDelta = ATTENTION_ORDER[left.attentionClass] - ATTENTION_ORDER[right.attentionClass];
      if (attentionDelta !== 0) return attentionDelta;
      return left.candidateId.localeCompare(right.candidateId);
    });

  const counts = emptyCounts();
  for (const alert of alerts) counts[alert.attentionClass] += 1;

  return freezeDeep({
    version: SPONSOR_OPPORTUNITY_EARLY_WARNING_VERSION_V1,
    generatedAt,
    status: "READY" as const,
    issues: [],
    alerts,
    counts,
    limitations: [...LIMITATIONS],
    matchingPolicy: "EXACT_CANONICAL_SPONSOR_OR_PERSON_ANCHOR_ONLY" as const,
    authority: AUTHORITY
  });
}
