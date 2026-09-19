import { createHash } from "node:crypto";

import {
  DECISION_MEMORY_BRIEF_POLICY_VERSION_V1,
  type DecisionMemoryBriefV1,
  type DecisionMemoryRevisitSignalV1
} from "./decision-memory-brief-v1";
import type { DecisionMemoryTruthStateV1 } from "./decision-memory-v1";

export const COMPANY_BRAIN_DECISION_REVISIT_REVIEW_VERSION_V1 =
  "CompanyBrainDecisionRevisitReviewV1" as const;
export const COMPANY_BRAIN_DECISION_REVISIT_REVIEW_POLICY_VERSION_V1 =
  "company_brain_decision_revisit_review_v1.0.0" as const;

const MAX_BRIEFS = 500;
const MAX_OBSERVATIONS = 2_000;
const MAX_REFS = 5_000;
const MAX_SIGNALS = 500;

export type DecisionRevisitObservationAssessmentV1 = "MET" | "NOT_MET";

export type DecisionRevisitObservationV1 = Readonly<{
  observationId: string;
  decisionId: string;
  triggerRef: string;
  triggerText: string;
  observedAt: string;
  truthState: DecisionMemoryTruthStateV1;
  assessment: DecisionRevisitObservationAssessmentV1 | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
}>;

export type CompanyBrainDecisionRevisitLaneV1 =
  | "VERIFY_TRIGGER_EVIDENCE"
  | "REVISIT_DECISION"
  | "NO_REVISIT_SIGNAL"
  | "WAIT_FOR_TRIGGER_EVIDENCE";

export type CompanyBrainDecisionRevisitReasonV1 =
  | "TRIGGER_OBSERVATION_MISSING"
  | "DUPLICATE_TRIGGER_OBSERVATIONS"
  | "DUPLICATE_OBSERVATION_ID"
  | "TRIGGER_IDENTITY_MISMATCH"
  | "OBSERVATION_ID_INVALID"
  | "OBSERVATION_TIMESTAMP_INVALID"
  | "OBSERVATION_FUTURE_DATED"
  | "OBSERVATION_STALE"
  | "OBSERVATION_BEFORE_DECISION"
  | "OBSERVATION_TRUTH_STATE_INVALID"
  | "KNOWN_OBSERVATION_ASSESSMENT_REQUIRED"
  | "KNOWN_OBSERVATION_EVIDENCE_REQUIRED"
  | "NON_KNOWN_OBSERVATION_CANNOT_ASSESS"
  | "OBSERVATION_REFERENCES_INVALID"
  | "TRIGGER_MET_EVIDENCE_RECORDED"
  | "TRIGGER_NOT_MET_EVIDENCE_RECORDED";

export type CompanyBrainDecisionRevisitItemV1 = Readonly<{
  itemId: string;
  sourceBriefId: string;
  decisionId: string;
  decisionClass: DecisionMemoryBriefV1["decisionClass"];
  decidedAt: string;
  sourceGeneratedAt: string;
  sourceAgeMs: number;
  sourceFreshnessState: DecisionMemoryBriefV1["freshnessState"];
  triggerRef: string;
  triggerText: string;
  rationale: DecisionMemoryBriefV1["rationale"];
  observationId: string | null;
  observedAt: string | null;
  observationAgeMs: number | null;
  observationTruthState: DecisionMemoryTruthStateV1 | null;
  assessment: DecisionRevisitObservationAssessmentV1 | null;
  lane: CompanyBrainDecisionRevisitLaneV1;
  reasonCodes: readonly CompanyBrainDecisionRevisitReasonV1[];
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
}>;

export type CompanyBrainDecisionRevisitSourceHealthV1 = Readonly<{
  sourceBriefId: string | null;
  decisionId: string | null;
  accepted: boolean;
  reasons: readonly string[];
}>;

export type CompanyBrainDecisionRevisitReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_DECISION_REVISIT_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_DECISION_REVISIT_REVIEW_POLICY_VERSION_V1;
  reviewId: string;
  state: "READY" | "NO_SCOPE" | "VERIFY_SOURCE" | "VERIFY_EVIDENCE";
  generatedAt: string;
  maximumSourceAgeMs: number;
  maximumObservationAgeMs: number;
  sourceHealth: readonly CompanyBrainDecisionRevisitSourceHealthV1[];
  verificationReasons: readonly string[];
  timeline: readonly CompanyBrainDecisionRevisitItemV1[];
  revisitRequired: readonly CompanyBrainDecisionRevisitItemV1[];
  noRevisitSignal: readonly CompanyBrainDecisionRevisitItemV1[];
  waitingEvidence: readonly CompanyBrainDecisionRevisitItemV1[];
  verificationRequired: readonly CompanyBrainDecisionRevisitItemV1[];
  summary: Readonly<{
    suppliedBriefs: number;
    acceptedBriefs: number;
    rejectedBriefs: number;
    explicitTriggers: number;
    suppliedObservations: number;
    revisitRequired: number;
    noRevisitSignal: number;
    waitingEvidence: number;
    verificationRequired: number;
  }>;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  sourceDecisionIds: readonly string[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    rationaleMutationAuthorized: false;
    learningPromotionAuthorized: false;
    policyPromotionAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainDecisionRevisitReviewInputV1 = Readonly<{
  briefs: readonly DecisionMemoryBriefV1[];
  triggerObservations: readonly DecisionRevisitObservationV1[];
  generatedAt: string;
  maximumSourceAgeMs: number;
  maximumObservationAgeMs: number;
}>;

export class CompanyBrainDecisionRevisitReviewError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CompanyBrainDecisionRevisitReviewError";
  }
}

const EXPECTED_SOURCE_AUTHORITY = Object.freeze({
  analysisOnly: true,
  persistenceAuthorized: false,
  externalActionAuthorized: false,
  pricingChangeAuthorized: false,
  negotiationAuthorized: false,
  spendAuthorized: false,
  publishAuthorized: false,
  approvalBypassAuthorized: false
});

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  rationaleMutationAuthorized: false as const,
  learningPromotionAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This review evaluates only explicit revisit-trigger observations supplied against canonical DecisionMemoryBriefV1 records. It never interprets trigger prose into a fact.",
  "MET and NOT_MET are accepted only from fresh KNOWN observations with exact trigger identity, evidence, and provenance. Inferred, unknown, stale, conflicted, duplicate, future-dated, or mismatched observations require verification.",
  "REVISIT_DECISION means only that evidence says a pre-recorded revisit condition was met. It does not reverse, replace, execute, approve, price, allocate, or otherwise mutate the decision.",
  "The recorded rationale is preserved for review context only. This contract does not infer causality, confidence, monetary value, expected outcomes, or a better alternative.",
  "No learning, policy, portfolio, pricing, negotiation, campaign, experiment, persistence, approval bypass, or external-action authority is granted by this review."
] as const);

const TRUTH_STATES = new Set<DecisionMemoryTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED"
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function canonicalTimestamp(value: unknown): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const millis = Date.parse(normalized);
  if (!Number.isFinite(millis)) return null;
  const canonical = new Date(millis).toISOString();
  return canonical === normalized ? normalized : null;
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function boundedUniqueStrings(value: unknown, maximum = MAX_REFS): readonly string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const normalized: string[] = [];
  for (const candidate of value) {
    const item = text(candidate);
    if (!item) return null;
    normalized.push(item);
  }
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function exactSourceAuthority(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
  const expectedKeys = Object.keys(EXPECTED_SOURCE_AUTHORITY).sort((a, b) => a.localeCompare(b));
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) =>
      key === expectedKeys[index]
      && actual[key] === EXPECTED_SOURCE_AUTHORITY[key as keyof typeof EXPECTED_SOURCE_AUTHORITY]
    );
}

function stableId(parts: readonly string[]): string {
  return `company-brain-decision-revisit:${createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex")
    .slice(0, 20)}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function duplicateTextValues(values: readonly (string | null)[]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value));
}

function observationKey(decisionId: string, triggerRef: string): string {
  return `${decisionId}\u0000${triggerRef}`;
}

function itemSort(a: CompanyBrainDecisionRevisitItemV1, b: CompanyBrainDecisionRevisitItemV1): number {
  const decision = a.decisionId.localeCompare(b.decisionId);
  if (decision !== 0) return decision;
  return a.triggerRef.localeCompare(b.triggerRef);
}

function explicitTriggers(brief: DecisionMemoryBriefV1): readonly DecisionMemoryRevisitSignalV1[] {
  return brief.revisitSignals.filter((signal) => signal.kind === "EXPLICIT_TRIGGER");
}

type NormalizedObservation = Readonly<{
  observationId: string | null;
  decisionId: string | null;
  triggerRef: string | null;
  triggerText: string | null;
  observedAt: string | null;
  truthState: DecisionMemoryTruthStateV1 | null;
  assessment: DecisionRevisitObservationAssessmentV1 | null;
  evidenceRefs: readonly string[];
  sourceRefs: readonly string[];
  reasons: readonly CompanyBrainDecisionRevisitReasonV1[];
}>;

function normalizeObservation(
  raw: DecisionRevisitObservationV1,
  generatedAtMs: number,
  maximumObservationAgeMs: number
): NormalizedObservation {
  const reasons = new Set<CompanyBrainDecisionRevisitReasonV1>();
  const observationId = text(raw?.observationId);
  const decisionId = text(raw?.decisionId);
  const triggerRef = text(raw?.triggerRef);
  const triggerText = text(raw?.triggerText);
  const observedAt = canonicalTimestamp(raw?.observedAt);
  const truthState = TRUTH_STATES.has(raw?.truthState) ? raw.truthState : null;
  const assessment = raw?.assessment === "MET" || raw?.assessment === "NOT_MET"
    ? raw.assessment
    : null;
  const evidenceRefs = boundedUniqueStrings(raw?.evidenceRefs);
  const sourceRefs = boundedUniqueStrings(raw?.sourceRefs);

  if (!observationId || !decisionId || !triggerRef || !triggerText) reasons.add("OBSERVATION_ID_INVALID");
  if (!observedAt) {
    reasons.add("OBSERVATION_TIMESTAMP_INVALID");
  } else {
    const observedAtMs = Date.parse(observedAt);
    if (observedAtMs > generatedAtMs) reasons.add("OBSERVATION_FUTURE_DATED");
    if (generatedAtMs - observedAtMs > maximumObservationAgeMs) reasons.add("OBSERVATION_STALE");
  }
  if (!truthState) reasons.add("OBSERVATION_TRUTH_STATE_INVALID");
  if (!evidenceRefs || !sourceRefs) reasons.add("OBSERVATION_REFERENCES_INVALID");

  if (truthState === "KNOWN") {
    if (!assessment) reasons.add("KNOWN_OBSERVATION_ASSESSMENT_REQUIRED");
    if (!evidenceRefs || evidenceRefs.length === 0 || !sourceRefs || sourceRefs.length === 0) {
      reasons.add("KNOWN_OBSERVATION_EVIDENCE_REQUIRED");
    }
  } else if (assessment !== null) {
    reasons.add("NON_KNOWN_OBSERVATION_CANNOT_ASSESS");
  }

  return deepFreeze({
    observationId,
    decisionId,
    triggerRef,
    triggerText,
    observedAt,
    truthState,
    assessment,
    evidenceRefs: evidenceRefs ?? Object.freeze([]),
    sourceRefs: sourceRefs ?? Object.freeze([]),
    reasons: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)))
  });
}

type ValidSource = Readonly<{
  sourceBriefId: string;
  decisionId: string;
  decisionClass: DecisionMemoryBriefV1["decisionClass"];
  decidedAt: string;
  sourceGeneratedAt: string;
  sourceAgeMs: number;
  sourceFreshnessState: DecisionMemoryBriefV1["freshnessState"];
  rationale: DecisionMemoryBriefV1["rationale"];
  provenanceRefs: readonly string[];
  triggers: readonly DecisionMemoryRevisitSignalV1[];
}>;

function validateSource(
  brief: DecisionMemoryBriefV1,
  generatedAtMs: number,
  maximumSourceAgeMs: number,
  duplicateBriefIds: ReadonlySet<string>,
  duplicateDecisionIds: ReadonlySet<string>
): { health: CompanyBrainDecisionRevisitSourceHealthV1; source: ValidSource | null } {
  const reasons = new Set<string>();
  const sourceBriefId = text(brief?.briefId);
  const decisionId = text(brief?.decisionId);

  if (!sourceBriefId) reasons.add("SOURCE_BRIEF_ID_INVALID");
  if (!decisionId) reasons.add("SOURCE_DECISION_ID_INVALID");
  if (sourceBriefId && duplicateBriefIds.has(sourceBriefId)) reasons.add("SOURCE_BRIEF_ID_DUPLICATE");
  if (decisionId && duplicateDecisionIds.has(decisionId)) reasons.add("SOURCE_DECISION_ID_DUPLICATE");
  if (brief?.contractVersion !== "DecisionMemoryBriefV1") reasons.add("SOURCE_CONTRACT_INVALID");
  if (brief?.policyVersion !== DECISION_MEMORY_BRIEF_POLICY_VERSION_V1) reasons.add("SOURCE_POLICY_INVALID");
  if (!exactSourceAuthority(brief?.actionAuthority)) reasons.add("SOURCE_AUTHORITY_WIDENED");
  if (brief?.outcome?.causalityClaimedByBrief !== false) reasons.add("SOURCE_CAUSALITY_INVARIANT_FAILED");
  if (brief?.state === "VERIFY_INTEGRITY" || brief?.state === "VERIFY_LINEAGE") reasons.add("SOURCE_REQUIRES_VERIFICATION");
  if (!Array.isArray(brief?.integrityFlags) || brief.integrityFlags.length > MAX_SIGNALS) {
    reasons.add("SOURCE_INTEGRITY_FLAGS_INVALID");
  } else if (brief.integrityFlags.length > 0) {
    reasons.add("SOURCE_INTEGRITY_FLAGGED");
  }
  if (brief?.freshnessState === "FUTURE_RECORD") reasons.add("SOURCE_FUTURE_RECORD");
  if (brief?.freshnessState === "EXPIRED") reasons.add("SOURCE_DECISION_EXPIRED_REVIEW_REQUIRED");

  const sourceGeneratedAt = canonicalTimestamp(brief?.generatedAt);
  const decidedAt = canonicalTimestamp(brief?.decidedAt);
  let sourceAgeMs: number | null = null;
  if (!sourceGeneratedAt || !decidedAt) {
    reasons.add("SOURCE_TIMESTAMP_INVALID");
  } else {
    const sourceGeneratedAtMs = Date.parse(sourceGeneratedAt);
    const decidedAtMs = Date.parse(decidedAt);
    if (sourceGeneratedAtMs > generatedAtMs || decidedAtMs > sourceGeneratedAtMs) {
      reasons.add("SOURCE_CHRONOLOGY_INVALID");
    }
    sourceAgeMs = generatedAtMs - sourceGeneratedAtMs;
    if (sourceAgeMs > maximumSourceAgeMs) reasons.add("SOURCE_BRIEF_STALE");
  }

  const provenanceRefs = boundedUniqueStrings(brief?.provenanceRefs);
  if (!provenanceRefs || provenanceRefs.length === 0) reasons.add("SOURCE_PROVENANCE_INVALID");
  if (!Array.isArray(brief?.revisitSignals) || brief.revisitSignals.length > MAX_SIGNALS) {
    reasons.add("SOURCE_REVISIT_SIGNALS_INVALID");
  }

  const rationaleState = brief?.rationale?.state;
  const rationaleValue = text(brief?.rationale?.value);
  const rationaleEvidenceRefs = boundedUniqueStrings(brief?.rationale?.evidenceRefs);
  if (!TRUTH_STATES.has(rationaleState) || !rationaleEvidenceRefs) {
    reasons.add("SOURCE_RATIONALE_INVALID");
  } else if (
    (rationaleState === "KNOWN" || rationaleState === "INFERRED")
    && (!rationaleValue || rationaleEvidenceRefs.length === 0)
  ) {
    reasons.add("SOURCE_RATIONALE_INVALID");
  } else if (
    rationaleState !== "KNOWN"
    && rationaleState !== "INFERRED"
    && brief.rationale.value !== null
  ) {
    reasons.add("SOURCE_RATIONALE_INVALID");
  }

  const triggers = Array.isArray(brief?.revisitSignals) ? explicitTriggers(brief) : [];
  const triggerRefs = new Set<string>();
  for (const trigger of triggers) {
    const triggerRef = text(trigger.ref);
    const triggerText = text(trigger.text);
    const triggerEvidenceRefs = boundedUniqueStrings(trigger.evidenceRefs, MAX_REFS);
    if (
      !triggerRef
      || !triggerText
      || triggerRefs.has(triggerRef)
      || trigger.truthState !== "NOT_APPLICABLE"
      || !triggerEvidenceRefs
      || triggerEvidenceRefs.length !== 0
    ) {
      reasons.add("SOURCE_EXPLICIT_TRIGGER_INVALID");
      continue;
    }
    triggerRefs.add(triggerRef);
  }

  const sortedReasons = Object.freeze([...reasons].sort((a, b) => a.localeCompare(b)));
  const health = deepFreeze({
    sourceBriefId,
    decisionId,
    accepted: sortedReasons.length === 0,
    reasons: sortedReasons
  });
  if (
    sortedReasons.length > 0
    || !sourceBriefId
    || !decisionId
    || !sourceGeneratedAt
    || !decidedAt
    || sourceAgeMs === null
    || !provenanceRefs
    || !rationaleEvidenceRefs
    || !TRUTH_STATES.has(rationaleState)
  ) {
    return { health, source: null };
  }

  const rationale: DecisionMemoryBriefV1["rationale"] = {
    state: rationaleState,
    value: brief.rationale.value,
    evidenceRefs: Object.freeze([...rationaleEvidenceRefs])
  };
  const clonedTriggers = Object.freeze(triggers.map((trigger) => Object.freeze({
    ...trigger,
    evidenceRefs: Object.freeze([...trigger.evidenceRefs])
  })));

  return {
    health,
    source: Object.freeze({
      sourceBriefId,
      decisionId,
      decisionClass: brief.decisionClass,
      decidedAt,
      sourceGeneratedAt,
      sourceAgeMs,
      sourceFreshnessState: brief.freshnessState,
      rationale: Object.freeze(rationale),
      provenanceRefs: Object.freeze([...provenanceRefs]),
      triggers: clonedTriggers
    })
  };
}

function projectItem(args: Readonly<{
  source: ValidSource;
  trigger: DecisionMemoryRevisitSignalV1;
  observations: readonly NormalizedObservation[];
  duplicateObservationIds: ReadonlySet<string>;
  generatedAtMs: number;
}>): CompanyBrainDecisionRevisitItemV1 {
  const { source, trigger, observations, duplicateObservationIds, generatedAtMs } = args;
  const triggerRef = String(trigger.ref).trim();
  const triggerText = String(trigger.text).trim();
  const reasons = new Set<CompanyBrainDecisionRevisitReasonV1>();
  let lane: CompanyBrainDecisionRevisitLaneV1;
  let observation: NormalizedObservation | null = null;

  if (observations.length === 0) {
    lane = "WAIT_FOR_TRIGGER_EVIDENCE";
    reasons.add("TRIGGER_OBSERVATION_MISSING");
  } else if (observations.length > 1) {
    lane = "VERIFY_TRIGGER_EVIDENCE";
    reasons.add("DUPLICATE_TRIGGER_OBSERVATIONS");
  } else {
    observation = observations[0];
    for (const reason of observation.reasons) reasons.add(reason);
    if (observation.observationId && duplicateObservationIds.has(observation.observationId)) {
      reasons.add("DUPLICATE_OBSERVATION_ID");
    }
    if (observation.triggerText !== triggerText) reasons.add("TRIGGER_IDENTITY_MISMATCH");
    if (observation.observedAt && Date.parse(observation.observedAt) < Date.parse(source.decidedAt)) {
      reasons.add("OBSERVATION_BEFORE_DECISION");
    }

    if (reasons.size > 0) {
      lane = "VERIFY_TRIGGER_EVIDENCE";
    } else if (observation.truthState === "KNOWN" && observation.assessment === "MET") {
      lane = "REVISIT_DECISION";
      reasons.add("TRIGGER_MET_EVIDENCE_RECORDED");
    } else if (observation.truthState === "KNOWN" && observation.assessment === "NOT_MET") {
      lane = "NO_REVISIT_SIGNAL";
      reasons.add("TRIGGER_NOT_MET_EVIDENCE_RECORDED");
    } else {
      lane = "VERIFY_TRIGGER_EVIDENCE";
      reasons.add("OBSERVATION_TRUTH_STATE_INVALID");
    }
  }

  const evidenceRefs = Object.freeze([...(observation?.evidenceRefs ?? [])]);
  const sourceRefs = Object.freeze([
    ...new Set([
      ...source.provenanceRefs,
      ...(observation?.sourceRefs ?? [])
    ])
  ].sort((a, b) => a.localeCompare(b)));
  const observedAt = observation?.observedAt ?? null;
  const rationale: DecisionMemoryBriefV1["rationale"] = Object.freeze({
    state: source.rationale.state,
    value: source.rationale.value,
    evidenceRefs: Object.freeze([...source.rationale.evidenceRefs])
  });

  return deepFreeze({
    itemId: stableId([source.sourceBriefId, source.decisionId, triggerRef]),
    sourceBriefId: source.sourceBriefId,
    decisionId: source.decisionId,
    decisionClass: source.decisionClass,
    decidedAt: source.decidedAt,
    sourceGeneratedAt: source.sourceGeneratedAt,
    sourceAgeMs: source.sourceAgeMs,
    sourceFreshnessState: source.sourceFreshnessState,
    triggerRef,
    triggerText,
    rationale,
    observationId: observation?.observationId ?? null,
    observedAt,
    observationAgeMs: observedAt ? generatedAtMs - Date.parse(observedAt) : null,
    observationTruthState: observation?.truthState ?? null,
    assessment: observation?.assessment ?? null,
    lane,
    reasonCodes: Object.freeze([...reasons].sort((a, b) => a.localeCompare(b))),
    evidenceRefs,
    sourceRefs,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null
  });
}

export function compileCompanyBrainDecisionRevisitReviewV1(
  input: CompanyBrainDecisionRevisitReviewInputV1
): CompanyBrainDecisionRevisitReviewV1 {
  if (!input || !Array.isArray(input.briefs) || input.briefs.length > MAX_BRIEFS) {
    throw new CompanyBrainDecisionRevisitReviewError(
      "INVALID_BRIEFS",
      `briefs must be an array with at most ${MAX_BRIEFS} entries`
    );
  }
  if (!Array.isArray(input.triggerObservations) || input.triggerObservations.length > MAX_OBSERVATIONS) {
    throw new CompanyBrainDecisionRevisitReviewError(
      "INVALID_OBSERVATIONS",
      `triggerObservations must be an array with at most ${MAX_OBSERVATIONS} entries`
    );
  }
  const generatedAt = canonicalTimestamp(input.generatedAt);
  const maximumSourceAgeMs = positiveFinite(input.maximumSourceAgeMs);
  const maximumObservationAgeMs = positiveFinite(input.maximumObservationAgeMs);
  if (!generatedAt || !maximumSourceAgeMs || !maximumObservationAgeMs) {
    throw new CompanyBrainDecisionRevisitReviewError(
      "INVALID_REVIEW_WINDOW",
      "generatedAt must be canonical ISO and freshness windows must be positive finite milliseconds"
    );
  }
  const generatedAtMs = Date.parse(generatedAt);

  const briefIds = input.briefs.map((brief) => text(brief?.briefId));
  const decisionIds = input.briefs.map((brief) => text(brief?.decisionId));
  const duplicateBriefIds = duplicateTextValues(briefIds);
  const duplicateDecisionIds = duplicateTextValues(decisionIds);

  const sourceHealth: CompanyBrainDecisionRevisitSourceHealthV1[] = [];
  const validSources: ValidSource[] = [];
  const verificationReasons = new Set<string>();
  for (const brief of input.briefs) {
    const validation = validateSource(
      brief,
      generatedAtMs,
      maximumSourceAgeMs,
      duplicateBriefIds,
      duplicateDecisionIds
    );
    sourceHealth.push(validation.health);
    if (validation.source) {
      validSources.push(validation.source);
    } else {
      for (const reason of validation.health.reasons) {
        verificationReasons.add(`${reason}:${validation.health.decisionId ?? validation.health.sourceBriefId ?? "UNKNOWN"}`);
      }
    }
  }

  const normalizedObservations = input.triggerObservations.map((observation) =>
    normalizeObservation(observation, generatedAtMs, maximumObservationAgeMs)
  );
  const duplicateObservationIds = duplicateTextValues(normalizedObservations.map((item) => item.observationId));
  for (const observationId of duplicateObservationIds) {
    verificationReasons.add(`OBSERVATION_ID_DUPLICATE:${observationId}`);
  }

  const observationsByKey = new Map<string, NormalizedObservation[]>();
  for (const observation of normalizedObservations) {
    if (!observation.decisionId || !observation.triggerRef) {
      verificationReasons.add(`OBSERVATION_UNBOUND:${observation.observationId ?? "UNKNOWN"}`);
      continue;
    }
    const key = observationKey(observation.decisionId, observation.triggerRef);
    const existing = observationsByKey.get(key) ?? [];
    existing.push(observation);
    observationsByKey.set(key, existing);
  }

  const expectedTriggerKeys = new Set<string>();
  const timeline: CompanyBrainDecisionRevisitItemV1[] = [];
  for (const source of validSources) {
    for (const trigger of source.triggers) {
      const triggerRef = String(trigger.ref).trim();
      const key = observationKey(source.decisionId, triggerRef);
      expectedTriggerKeys.add(key);
      const observations = observationsByKey.get(key) ?? [];
      const item = projectItem({
        source,
        trigger,
        observations,
        duplicateObservationIds,
        generatedAtMs
      });
      timeline.push(item);
      if (item.lane === "VERIFY_TRIGGER_EVIDENCE") {
        verificationReasons.add(`TRIGGER_EVIDENCE_REQUIRES_VERIFICATION:${source.decisionId}:${triggerRef}`);
      }
    }
  }

  for (const observation of normalizedObservations) {
    if (!observation.decisionId || !observation.triggerRef) continue;
    const key = observationKey(observation.decisionId, observation.triggerRef);
    if (!expectedTriggerKeys.has(key)) {
      verificationReasons.add(`OBSERVATION_DOES_NOT_BIND_TO_EXPLICIT_TRIGGER:${observation.observationId ?? "UNKNOWN"}`);
    }
  }

  timeline.sort(itemSort);
  sourceHealth.sort((a, b) => {
    const left = `${a.decisionId ?? ""}:${a.sourceBriefId ?? ""}`;
    const right = `${b.decisionId ?? ""}:${b.sourceBriefId ?? ""}`;
    return left.localeCompare(right);
  });

  const revisitRequired = timeline.filter((item) => item.lane === "REVISIT_DECISION");
  const noRevisitSignal = timeline.filter((item) => item.lane === "NO_REVISIT_SIGNAL");
  const waitingEvidence = timeline.filter((item) => item.lane === "WAIT_FOR_TRIGGER_EVIDENCE");
  const verificationRequired = timeline.filter((item) => item.lane === "VERIFY_TRIGGER_EVIDENCE");
  const rejectedBriefs = sourceHealth.filter((health) => !health.accepted).length;
  const hasSourceFailure = rejectedBriefs > 0;
  const hasEvidenceFailure = verificationRequired.length > 0
    || [...verificationReasons].some((reason) =>
      reason.startsWith("OBSERVATION_") || reason.startsWith("TRIGGER_EVIDENCE_")
    );
  const state: CompanyBrainDecisionRevisitReviewV1["state"] = hasSourceFailure
    ? "VERIFY_SOURCE"
    : hasEvidenceFailure
      ? "VERIFY_EVIDENCE"
      : timeline.length === 0
        ? "NO_SCOPE"
        : "READY";

  const evidenceRefs = Object.freeze([
    ...new Set(timeline.flatMap((item) => [
      ...item.evidenceRefs,
      ...item.rationale.evidenceRefs
    ]))
  ].sort((a, b) => a.localeCompare(b)));
  const sourceRefs = Object.freeze([
    ...new Set(timeline.flatMap((item) => item.sourceRefs))
  ].sort((a, b) => a.localeCompare(b)));
  const sourceDecisionIds = Object.freeze([
    ...new Set(validSources.map((source) => source.decisionId))
  ].sort((a, b) => a.localeCompare(b)));
  const sortedVerificationReasons = Object.freeze(
    [...verificationReasons].sort((a, b) => a.localeCompare(b))
  );

  return deepFreeze({
    contractVersion: COMPANY_BRAIN_DECISION_REVISIT_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_DECISION_REVISIT_REVIEW_POLICY_VERSION_V1,
    reviewId: stableId([
      generatedAt,
      String(maximumSourceAgeMs),
      String(maximumObservationAgeMs),
      ...sourceHealth.map((health) => `${health.sourceBriefId ?? ""}:${health.decisionId ?? ""}:${health.accepted}`),
      ...normalizedObservations.map((observation) => observation.observationId ?? "UNKNOWN")
    ]),
    state,
    generatedAt,
    maximumSourceAgeMs,
    maximumObservationAgeMs,
    sourceHealth: Object.freeze([...sourceHealth]),
    verificationReasons: sortedVerificationReasons,
    timeline: Object.freeze([...timeline]),
    revisitRequired: Object.freeze([...revisitRequired]),
    noRevisitSignal: Object.freeze([...noRevisitSignal]),
    waitingEvidence: Object.freeze([...waitingEvidence]),
    verificationRequired: Object.freeze([...verificationRequired]),
    summary: Object.freeze({
      suppliedBriefs: input.briefs.length,
      acceptedBriefs: validSources.length,
      rejectedBriefs,
      explicitTriggers: timeline.length,
      suppliedObservations: input.triggerObservations.length,
      revisitRequired: revisitRequired.length,
      noRevisitSignal: noRevisitSignal.length,
      waitingEvidence: waitingEvidence.length,
      verificationRequired: verificationRequired.length
    }),
    evidenceRefs,
    sourceRefs,
    sourceDecisionIds,
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
