import {
  compileAiSearchAuthorityChangeReviewV1,
  type AiSearchAuthorityChangeReasonV1,
  type AiSearchAuthorityObservedChangeV1
} from "./ai-search-authority-change-review-v1";
import type {
  AiSearchAuthorityEvaluationV1,
  AiSearchEngineV1
} from "./ai-search-authority-observation-v1";

export const AI_SEARCH_INTERVENTION_OUTCOME_REVIEW_V1_VERSION = "AiSearchInterventionOutcomeReviewV1" as const;
export const AI_SEARCH_INTERVENTION_OUTCOME_MAX_TARGET_QUERIES_V1 = 300;

export const AI_SEARCH_INTERVENTION_KINDS_V1 = [
  "OWNED_SITE_CONTENT",
  "STRUCTURED_DATA",
  "ENTITY_CONSISTENCY",
  "THIRD_PARTY_CORROBORATION",
  "TECHNICAL_DISCOVERABILITY",
  "OTHER"
] as const;
export type AiSearchInterventionKindV1 = (typeof AI_SEARCH_INTERVENTION_KINDS_V1)[number];

export type AiSearchInterventionTargetQueryV1 = Readonly<{
  engine: AiSearchEngineV1;
  queryRef: string;
}>;

export type AiSearchInterventionOutcomePolicyV1 = Readonly<{
  maxPostEvaluationAgeHours: number;
  maxComparisonGapHours: number;
  minPostLagHours: number;
  maxPostLagHours: number;
}>;

export type AiSearchInterventionOutcomeVerificationReasonV1 =
  | "CHANGE_REVIEW_NOT_READY"
  | "MEASUREMENT_PLAN_AFTER_INTERVENTION_START"
  | "BASELINE_OVERLAPS_INTERVENTION"
  | "INTERVENTION_CHRONOLOGY_INVALID"
  | "INTERVENTION_COMPLETED_IN_FUTURE"
  | "POST_WINDOW_OVERLAPS_INTERVENTION"
  | "POST_LAG_TOO_SHORT"
  | "POST_LAG_TOO_LONG"
  | "TARGET_QUERY_NOT_IN_BENCHMARK"
  | "TARGET_ENTITY_MISMATCH";

export type AiSearchInterventionOutcomeStateV1 =
  | "OBSERVED_GAIN"
  | "OBSERVED_LOSS"
  | "OBSERVED_MIXED_MOVEMENT"
  | "NO_OBSERVED_MOVEMENT"
  | "VERIFY_REQUIRED";

export type AiSearchInterventionOutcomeReviewInputV1 = Readonly<{
  intervention: Readonly<{
    interventionId: string;
    interventionKind: AiSearchInterventionKindV1;
    targetEntityRef: string;
    startedAt: string;
    completedAt: string;
    evidenceRefs: readonly string[];
  }>;
  measurementPlan: Readonly<{
    declaredAt: string;
    targetQueries: readonly AiSearchInterventionTargetQueryV1[];
    evidenceRefs: readonly string[];
  }>;
  baseline: AiSearchAuthorityEvaluationV1;
  post: AiSearchAuthorityEvaluationV1;
  evaluatedAt: string;
  policy: AiSearchInterventionOutcomePolicyV1;
}>;

export type AiSearchInterventionOutcomeReviewV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_INTERVENTION_OUTCOME_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "REVIEW_READY" | "VERIFY_REQUIRED";
  outcomeState: AiSearchInterventionOutcomeStateV1;
  intervention: Readonly<{
    interventionId: string;
    interventionKind: AiSearchInterventionKindV1;
    targetEntityRef: string;
    startedAt: string;
    completedAt: string;
    evidenceRefs: readonly string[];
  }>;
  measurementPlan: Readonly<{
    declaredAt: string;
    targetQueries: readonly AiSearchInterventionTargetQueryV1[];
    evidenceRefs: readonly string[];
  }>;
  baselineWindow: Readonly<{ startAt: string; endAt: string }>;
  postWindow: Readonly<{ startAt: string; endAt: string }>;
  postLagHours: number | null;
  targetQueryCount: number | null;
  observedTargetMovement: Readonly<{
    baselineMentionCount: number | null;
    postMentionCount: number | null;
    mentionCountDelta: number | null;
    baselineCitationCount: number | null;
    postCitationCount: number | null;
    citationCountDelta: number | null;
    baselineMentionRatePct: number | null;
    postMentionRatePct: number | null;
    mentionRateDeltaPct: number | null;
    baselineCitationRatePct: number | null;
    postCitationRatePct: number | null;
    citationRateDeltaPct: number | null;
  }>;
  targetChanges: readonly AiSearchAuthorityObservedChangeV1[];
  nonTargetObservedChangeCount: number | null;
  verificationReasons: readonly AiSearchInterventionOutcomeVerificationReasonV1[];
  upstreamChangeReviewReasons: readonly AiSearchAuthorityChangeReasonV1[];
  evidenceRefs: readonly string[];
  reviewCandidate: "GOVERNED_OUTCOME_REVIEW" | "NONE";
  learningScope: "SINGLE_PRE_POST_COMPARISON_NOT_DURABLE_POLICY";
  confidence: null;
  attribution: "NOT_ESTABLISHED";
  causality: "NOT_ESTABLISHED";
  monetaryValue: null;
  durableLearningAllowed: false;
  rankingClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
  notificationAuthority: "NONE";
  publicationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
  guardrails: readonly string[];
}>;

const PROHIBITED_RAW_TEXT_KEYS = new Set([
  "query",
  "queryText",
  "prompt",
  "promptText",
  "answer",
  "answerText",
  "response",
  "responseText"
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function assertNoRawText(value: unknown, field: string, seen = new Set<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  for (const [key, child] of Object.entries(object)) {
    if (PROHIBITED_RAW_TEXT_KEYS.has(key)) {
      throw new Error(`${field}.${key} is prohibited; use non-sensitive refs instead`);
    }
    assertNoRawText(child, `${field}.${key}`, seen);
  }
}

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty`);
  return value.trim();
}

function iso(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a valid timestamp`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function nonNegativeFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function safeRefs(values: readonly string[] | undefined, field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  const normalized = values.map((value, index) => nonEmpty(value, `${field}[${index}]`));
  const unsafe = normalized.find((value) =>
    /(?:authorization\s*:\s*bearer|[?&](?:access_token|token|api_key|client_secret|password)=|(?:access[_-]?token|api[_-]?key|client[_-]?secret|password)\s*[:=]|^op:\/\/)/i.test(value)
  );
  if (unsafe) throw new Error(`${field} contains a secret-like reference`);
  return unique(normalized);
}

function targetKey(target: AiSearchInterventionTargetQueryV1): string {
  return `${target.engine}:${target.queryRef}`;
}

function observationKey(engine: AiSearchEngineV1, queryRef: string): string {
  return `${engine}:${queryRef}`;
}

function percent(count: number, total: number): number {
  return Math.round((count / total) * 100_000) / 1_000;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function outcomeState(mentionDelta: number, citationDelta: number): AiSearchInterventionOutcomeStateV1 {
  if (mentionDelta === 0 && citationDelta === 0) return "NO_OBSERVED_MOVEMENT";
  if (mentionDelta >= 0 && citationDelta >= 0) return "OBSERVED_GAIN";
  if (mentionDelta <= 0 && citationDelta <= 0) return "OBSERVED_LOSS";
  return "OBSERVED_MIXED_MOVEMENT";
}

function uniqueReasons(
  values: readonly AiSearchInterventionOutcomeVerificationReasonV1[]
): AiSearchInterventionOutcomeVerificationReasonV1[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Measures a predeclared AI-search intervention against exact fixed-query
 * before/after observations. Chronology, freshness, query identity, and
 * evidence must all reconcile before any movement is reported. Even a ready
 * result is only an observed post-intervention comparison: it does not prove
 * that the intervention caused the movement or deserves durable learning.
 */
export function compileAiSearchInterventionOutcomeReviewV1(
  input: AiSearchInterventionOutcomeReviewInputV1
): AiSearchInterventionOutcomeReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");

  if (!(AI_SEARCH_INTERVENTION_KINDS_V1 as readonly string[]).includes(input.intervention?.interventionKind)) {
    throw new Error("intervention.interventionKind is unsupported");
  }

  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const interventionId = nonEmpty(input.intervention?.interventionId, "intervention.interventionId");
  const targetEntityRef = nonEmpty(input.intervention?.targetEntityRef, "intervention.targetEntityRef");
  const startedAt = iso(input.intervention?.startedAt, "intervention.startedAt");
  const completedAt = iso(input.intervention?.completedAt, "intervention.completedAt");
  const interventionEvidenceRefs = safeRefs(input.intervention?.evidenceRefs, "intervention.evidenceRefs");
  if (!interventionEvidenceRefs.length) throw new Error("intervention.evidenceRefs requires execution evidence");

  const declaredAt = iso(input.measurementPlan?.declaredAt, "measurementPlan.declaredAt");
  const planEvidenceRefs = safeRefs(input.measurementPlan?.evidenceRefs, "measurementPlan.evidenceRefs");
  if (!planEvidenceRefs.length) throw new Error("measurementPlan.evidenceRefs requires predeclared measurement evidence");
  if (!Array.isArray(input.measurementPlan?.targetQueries) || input.measurementPlan.targetQueries.length === 0) {
    throw new Error("measurementPlan.targetQueries must contain at least one target query");
  }
  if (input.measurementPlan.targetQueries.length > AI_SEARCH_INTERVENTION_OUTCOME_MAX_TARGET_QUERIES_V1) {
    throw new Error(`measurementPlan.targetQueries exceeds ${AI_SEARCH_INTERVENTION_OUTCOME_MAX_TARGET_QUERIES_V1}`);
  }

  const seenTargetKeys = new Set<string>();
  const targetQueries = input.measurementPlan.targetQueries.map((target, index) => {
    const queryRef = nonEmpty(target.queryRef, `measurementPlan.targetQueries[${index}].queryRef`);
    const normalized = freeze({ engine: target.engine, queryRef });
    const key = targetKey(normalized);
    if (seenTargetKeys.has(key)) throw new Error(`duplicate target query: ${key}`);
    seenTargetKeys.add(key);
    return normalized;
  });

  const maxPostEvaluationAgeHours = nonNegativeFinite(
    input.policy?.maxPostEvaluationAgeHours,
    "policy.maxPostEvaluationAgeHours"
  );
  const maxComparisonGapHours = nonNegativeFinite(
    input.policy?.maxComparisonGapHours,
    "policy.maxComparisonGapHours"
  );
  const minPostLagHours = nonNegativeFinite(input.policy?.minPostLagHours, "policy.minPostLagHours");
  const maxPostLagHours = nonNegativeFinite(input.policy?.maxPostLagHours, "policy.maxPostLagHours");
  if (maxPostLagHours < minPostLagHours) throw new Error("policy.maxPostLagHours must be >= policy.minPostLagHours");

  const changeReview = compileAiSearchAuthorityChangeReviewV1({
    previous: input.baseline,
    current: input.post,
    evaluatedAt,
    policy: {
      maxCurrentEvaluationAgeHours: maxPostEvaluationAgeHours,
      maxGapHours: maxComparisonGapHours
    }
  });

  const reasons: AiSearchInterventionOutcomeVerificationReasonV1[] = [];
  if (changeReview.status !== "READY") reasons.push("CHANGE_REVIEW_NOT_READY");

  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);
  const declaredAtMs = Date.parse(declaredAt);
  const baselineEndMs = Date.parse(input.baseline.window.endAt);
  const postStartMs = Date.parse(input.post.window.startAt);

  if (declaredAtMs > startedAtMs) reasons.push("MEASUREMENT_PLAN_AFTER_INTERVENTION_START");
  if (baselineEndMs > startedAtMs) reasons.push("BASELINE_OVERLAPS_INTERVENTION");
  if (completedAtMs < startedAtMs) reasons.push("INTERVENTION_CHRONOLOGY_INVALID");
  if (completedAtMs > evaluatedAtMs) reasons.push("INTERVENTION_COMPLETED_IN_FUTURE");
  if (postStartMs < completedAtMs) reasons.push("POST_WINDOW_OVERLAPS_INTERVENTION");

  const postLagHours = postStartMs >= completedAtMs
    ? rounded((postStartMs - completedAtMs) / 3_600_000)
    : null;
  if (postLagHours !== null && postLagHours < minPostLagHours) reasons.push("POST_LAG_TOO_SHORT");
  if (postLagHours !== null && postLagHours > maxPostLagHours) reasons.push("POST_LAG_TOO_LONG");

  const baselineByKey = new Map(
    input.baseline.observations.map((row) => [observationKey(row.engine, row.queryRef), row])
  );
  const postByKey = new Map(input.post.observations.map((row) => [observationKey(row.engine, row.queryRef), row]));

  for (const target of targetQueries) {
    const key = targetKey(target);
    const baseline = baselineByKey.get(key);
    const post = postByKey.get(key);
    if (!baseline || !post) {
      reasons.push("TARGET_QUERY_NOT_IN_BENCHMARK");
      continue;
    }
    if (baseline.targetEntityRef !== targetEntityRef || post.targetEntityRef !== targetEntityRef) {
      reasons.push("TARGET_ENTITY_MISMATCH");
    }
  }

  const verificationReasons = uniqueReasons(reasons);
  const ready = verificationReasons.length === 0;
  const targetKeySet = new Set(targetQueries.map(targetKey));
  const targetChanges = ready
    ? changeReview.changes.filter((row) => targetKeySet.has(observationKey(row.engine, row.queryRef)))
    : [];

  let movement: AiSearchInterventionOutcomeReviewV1["observedTargetMovement"] = {
    baselineMentionCount: null,
    postMentionCount: null,
    mentionCountDelta: null,
    baselineCitationCount: null,
    postCitationCount: null,
    citationCountDelta: null,
    baselineMentionRatePct: null,
    postMentionRatePct: null,
    mentionRateDeltaPct: null,
    baselineCitationRatePct: null,
    postCitationRatePct: null,
    citationRateDeltaPct: null
  };
  let measuredState: AiSearchInterventionOutcomeStateV1 = "VERIFY_REQUIRED";
  let evidenceRefs: string[] = [];

  if (ready) {
    const baselineRows = targetQueries.map((target) => baselineByKey.get(targetKey(target))!);
    const postRows = targetQueries.map((target) => postByKey.get(targetKey(target))!);
    const baselineMentionCount = baselineRows.filter((row) => row.mentionObserved).length;
    const postMentionCount = postRows.filter((row) => row.mentionObserved).length;
    const baselineCitationCount = baselineRows.filter((row) => row.citationObserved).length;
    const postCitationCount = postRows.filter((row) => row.citationObserved).length;
    const mentionCountDelta = postMentionCount - baselineMentionCount;
    const citationCountDelta = postCitationCount - baselineCitationCount;
    const baselineMentionRatePct = percent(baselineMentionCount, targetQueries.length);
    const postMentionRatePct = percent(postMentionCount, targetQueries.length);
    const baselineCitationRatePct = percent(baselineCitationCount, targetQueries.length);
    const postCitationRatePct = percent(postCitationCount, targetQueries.length);

    movement = freeze({
      baselineMentionCount,
      postMentionCount,
      mentionCountDelta,
      baselineCitationCount,
      postCitationCount,
      citationCountDelta,
      baselineMentionRatePct,
      postMentionRatePct,
      mentionRateDeltaPct: rounded(postMentionRatePct - baselineMentionRatePct),
      baselineCitationRatePct,
      postCitationRatePct,
      citationRateDeltaPct: rounded(postCitationRatePct - baselineCitationRatePct)
    });
    measuredState = outcomeState(mentionCountDelta, citationCountDelta);
    evidenceRefs = unique([
      ...interventionEvidenceRefs,
      ...planEvidenceRefs,
      ...baselineRows.flatMap((row) => row.evidenceRefs),
      ...postRows.flatMap((row) => row.evidenceRefs),
      ...targetChanges.flatMap((row) => row.evidenceRefs)
    ]);
  }

  return freeze({
    contractVersion: AI_SEARCH_INTERVENTION_OUTCOME_REVIEW_V1_VERSION,
    evaluatedAt,
    status: ready ? ("REVIEW_READY" as const) : ("VERIFY_REQUIRED" as const),
    outcomeState: measuredState,
    intervention: {
      interventionId,
      interventionKind: input.intervention.interventionKind,
      targetEntityRef,
      startedAt,
      completedAt,
      evidenceRefs: interventionEvidenceRefs
    },
    measurementPlan: {
      declaredAt,
      targetQueries,
      evidenceRefs: planEvidenceRefs
    },
    baselineWindow: freeze({ ...input.baseline.window }),
    postWindow: freeze({ ...input.post.window }),
    postLagHours,
    targetQueryCount: ready ? targetQueries.length : null,
    observedTargetMovement: movement,
    targetChanges,
    nonTargetObservedChangeCount: ready ? changeReview.changes.length - targetChanges.length : null,
    verificationReasons,
    upstreamChangeReviewReasons: [...changeReview.reasons],
    evidenceRefs,
    reviewCandidate: ready ? ("GOVERNED_OUTCOME_REVIEW" as const) : ("NONE" as const),
    learningScope: "SINGLE_PRE_POST_COMPARISON_NOT_DURABLE_POLICY" as const,
    confidence: null,
    attribution: "NOT_ESTABLISHED" as const,
    causality: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    durableLearningAllowed: false as const,
    rankingClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const,
    notificationAuthority: "NONE" as const,
    publicationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const,
    guardrails: [
      "This review measures only exact predeclared fixed-query observations before and after an evidenced intervention.",
      "Observed movement does not establish that the intervention caused the movement, produced authority, improved ranking, changed competitor performance, created an endorsement or relationship, or generated monetary value.",
      "A single pre/post comparison cannot become durable strategy or policy; repeated comparable evidence and governed learning review are required.",
      "No notification, publication, provider write, outreach, spend, or approval bypass authority is granted."
    ]
  });
}
