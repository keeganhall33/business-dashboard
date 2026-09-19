import {
  compileAiSearchAuthorityChangeReviewV1,
  type AiSearchAuthorityChangeReasonV1
} from "./ai-search-authority-change-review-v1";
import type {
  AiSearchAuthorityEvaluationV1,
  AiSearchAuthorityObservationV1,
  AiSearchEngineV1,
  AiSearchResultStateV1
} from "./ai-search-authority-observation-v1";

export const AI_SEARCH_AUTHORITY_PERSISTENCE_REVIEW_V1_VERSION = "AiSearchAuthorityPersistenceReviewV1" as const;
export const AI_SEARCH_AUTHORITY_PERSISTENCE_MAX_EVALUATIONS_V1 = 24;

export type AiSearchAuthorityPersistentSignalKindV1 =
  | "PERSISTENT_MENTION_GAIN"
  | "PERSISTENT_MENTION_LOSS"
  | "PERSISTENT_CITATION_GAIN"
  | "PERSISTENT_CITATION_LOSS";

export type AiSearchAuthorityPersistenceReasonV1 =
  | "INSUFFICIENT_WINDOWS"
  | "LATEST_EVALUATION_FROM_FUTURE"
  | "LATEST_EVALUATION_TOO_OLD"
  | "PAIRWISE_COMPARISON_NOT_READY";

export type AiSearchAuthorityPersistencePolicyV1 = Readonly<{
  minStableWindows: number;
  maxLatestEvaluationAgeHours: number;
  maxGapHours: number;
}>;

export type AiSearchAuthorityPersistentSignalV1 = Readonly<{
  signalId: string;
  engine: AiSearchEngineV1;
  queryRef: string;
  queryClass: AiSearchAuthorityObservationV1["queryClass"];
  targetEntityRef: string;
  kind: AiSearchAuthorityPersistentSignalKindV1;
  previousState: AiSearchResultStateV1;
  currentState: AiSearchResultStateV1;
  transitionObservationId: string;
  stableObservationIds: readonly string[];
  stableWindowCount: number;
  evidenceRefs: readonly string[];
  interpretation: "DIRECTLY_OBSERVED_PERSISTENT_FIXED_QUERY_CHANGE";
  causalClaim: false;
  attributionClaim: false;
  rankingClaim: false;
  authorityScoreClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
}>;

export type AiSearchAuthorityPersistenceReviewV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_AUTHORITY_PERSISTENCE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED";
  attentionState: "READY_FOR_INTERNAL_ALERT_REVIEW" | "NO_PERSISTENT_CHANGE" | "VERIFY_REQUIRED";
  evaluationCount: number;
  queryCount: number | null;
  firstWindow: Readonly<{ startAt: string; endAt: string }> | null;
  latestWindow: Readonly<{ startAt: string; endAt: string }> | null;
  signals: readonly AiSearchAuthorityPersistentSignalV1[];
  reasons: readonly AiSearchAuthorityPersistenceReasonV1[];
  sequenceIssues: readonly string[];
  evidenceRefs: readonly string[];
  guardrails: readonly string[];
  confidence: null;
  authorityScore: null;
  causality: "NOT_ESTABLISHED";
  attribution: "NOT_ESTABLISHED";
  notificationAuthority: "NONE";
  providerWriteAuthority: "NONE";
  externalAccessPerformed: false;
  writesPerformed: false;
}>;

export type AiSearchAuthorityPersistenceReviewInputV1 = Readonly<{
  evaluations: readonly AiSearchAuthorityEvaluationV1[];
  evaluatedAt: string;
  policy: AiSearchAuthorityPersistencePolicyV1;
}>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function iso(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a valid timestamp`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function integerInRange(value: unknown, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function observationKey(row: AiSearchAuthorityObservationV1): string {
  return `${row.engine}:${row.queryRef}`;
}

function observationMap(evaluation: AiSearchAuthorityEvaluationV1): Map<string, AiSearchAuthorityObservationV1> {
  return new Map(evaluation.observations.map((row) => [observationKey(row), row] as const));
}

function stateFor(row: AiSearchAuthorityObservationV1, dimension: "mention" | "citation"): boolean {
  return dimension === "mention" ? row.mentionObserved : row.citationObserved;
}

function persistentSignal(
  rows: readonly AiSearchAuthorityObservationV1[],
  dimension: "mention" | "citation",
  minStableWindows: number
): AiSearchAuthorityPersistentSignalV1 | null {
  if (rows.length < minStableWindows + 1) return null;

  const currentValue = stateFor(rows.at(-1)!, dimension);
  let stableStart = rows.length - 1;
  while (stableStart > 0 && stateFor(rows[stableStart - 1]!, dimension) === currentValue) stableStart -= 1;

  const stableRows = rows.slice(stableStart);
  if (stableStart === 0 || stableRows.length < minStableWindows) return null;

  const previous = rows[stableStart - 1]!;
  const current = rows.at(-1)!;
  const previousValue = stateFor(previous, dimension);
  if (previousValue === currentValue) return null;

  const direction = currentValue ? "GAIN" : "LOSS";
  const kind = `PERSISTENT_${dimension === "mention" ? "MENTION" : "CITATION"}_${direction}` as AiSearchAuthorityPersistentSignalKindV1;
  const evidenceRefs = unique([
    ...previous.evidenceRefs,
    ...stableRows.flatMap((row) => row.evidenceRefs)
  ]);

  return freeze({
    signalId: ["ai-search-persistent", current.engine, current.queryRef, kind, stableRows[0]!.observationId]
      .map(encodeURIComponent)
      .join(":"),
    engine: current.engine,
    queryRef: current.queryRef,
    queryClass: current.queryClass,
    targetEntityRef: current.targetEntityRef,
    kind,
    previousState: previous.resultState,
    currentState: current.resultState,
    transitionObservationId: stableRows[0]!.observationId,
    stableObservationIds: stableRows.map((row) => row.observationId),
    stableWindowCount: stableRows.length,
    evidenceRefs,
    interpretation: "DIRECTLY_OBSERVED_PERSISTENT_FIXED_QUERY_CHANGE" as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    rankingClaim: false as const,
    authorityScoreClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const
  });
}

function pairIssue(index: number, reasons: readonly AiSearchAuthorityChangeReasonV1[]): string {
  return `evaluations[${index}] -> evaluations[${index + 1}]: ${reasons.join(",") || "comparison not ready"}`;
}

export function compileAiSearchAuthorityPersistenceReviewV1(
  input: AiSearchAuthorityPersistenceReviewInputV1
): AiSearchAuthorityPersistenceReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.evaluations)) throw new Error("evaluations must be an array");
  if (input.evaluations.length > AI_SEARCH_AUTHORITY_PERSISTENCE_MAX_EVALUATIONS_V1) {
    throw new Error(`evaluations must not exceed ${AI_SEARCH_AUTHORITY_PERSISTENCE_MAX_EVALUATIONS_V1}`);
  }

  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = {
    minStableWindows: integerInRange(input.policy?.minStableWindows, 2, 10, "policy.minStableWindows"),
    maxLatestEvaluationAgeHours: finiteNonNegative(
      input.policy?.maxLatestEvaluationAgeHours,
      "policy.maxLatestEvaluationAgeHours"
    ),
    maxGapHours: finiteNonNegative(input.policy?.maxGapHours, "policy.maxGapHours")
  };

  const reasons = new Set<AiSearchAuthorityPersistenceReasonV1>();
  const sequenceIssues: string[] = [];
  if (input.evaluations.length < policy.minStableWindows + 1) reasons.add("INSUFFICIENT_WINDOWS");

  for (let index = 0; index < input.evaluations.length - 1; index += 1) {
    const previous = input.evaluations[index]!;
    const current = input.evaluations[index + 1]!;
    const comparison = compileAiSearchAuthorityChangeReviewV1({
      previous,
      current,
      evaluatedAt: current.asOf,
      policy: {
        maxCurrentEvaluationAgeHours: 0,
        maxGapHours: policy.maxGapHours
      }
    });
    if (comparison.status !== "READY") {
      reasons.add("PAIRWISE_COMPARISON_NOT_READY");
      sequenceIssues.push(pairIssue(index, comparison.reasons));
    }
  }

  const latest = input.evaluations.at(-1) ?? null;
  if (latest) {
    const latestAsOf = Date.parse(iso(latest.asOf, "evaluations[last].asOf"));
    if (latestAsOf > evaluatedAtMs) reasons.add("LATEST_EVALUATION_FROM_FUTURE");
    if (evaluatedAtMs - latestAsOf > policy.maxLatestEvaluationAgeHours * 3_600_000) {
      reasons.add("LATEST_EVALUATION_TOO_OLD");
    }
  }

  const ready = reasons.size === 0;
  const signals: AiSearchAuthorityPersistentSignalV1[] = [];
  let queryCount: number | null = null;

  if (ready && input.evaluations.length) {
    const maps = input.evaluations.map(observationMap);
    const keys = [...maps[0]!.keys()].sort((left, right) => left.localeCompare(right));
    queryCount = keys.length;

    for (const key of keys) {
      const rows = maps.map((map) => map.get(key)!);
      const mention = persistentSignal(rows, "mention", policy.minStableWindows);
      const citation = persistentSignal(rows, "citation", policy.minStableWindows);
      if (mention) signals.push(mention);
      if (citation) signals.push(citation);
    }
  }

  signals.sort((left, right) => left.signalId.localeCompare(right.signalId));
  const evidenceRefs = ready
    ? unique(input.evaluations.flatMap((evaluation: AiSearchAuthorityEvaluationV1) =>
        evaluation.observations.flatMap((row: AiSearchAuthorityObservationV1) => row.evidenceRefs)
      ))
    : [];
  const first = input.evaluations[0] ?? null;

  return freeze({
    contractVersion: AI_SEARCH_AUTHORITY_PERSISTENCE_REVIEW_V1_VERSION,
    evaluatedAt,
    status: ready ? ("READY" as const) : ("VERIFY_REQUIRED" as const),
    attentionState: !ready
      ? ("VERIFY_REQUIRED" as const)
      : signals.length
        ? ("READY_FOR_INTERNAL_ALERT_REVIEW" as const)
        : ("NO_PERSISTENT_CHANGE" as const),
    evaluationCount: input.evaluations.length,
    queryCount,
    firstWindow: first ? { ...first.window } : null,
    latestWindow: latest ? { ...latest.window } : null,
    signals,
    reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
    sequenceIssues: [...sequenceIssues].sort((left, right) => left.localeCompare(right)),
    evidenceRefs,
    guardrails: [
      "A signal requires the same fixed query identity across complete comparable evaluation windows and a caller-selected minimum run of stable observed states after a real transition.",
      "A single-window gain or loss never becomes a persistent signal, and incomplete, stale, future-dated, gapped, duration-mismatched, or identity-mismatched sequences are withheld.",
      "Persistent mention or citation changes are observations only; they do not establish search rank, authority, endorsement, competitor performance, relationship, attribution, causality, business impact, confidence, or monetary value.",
      "This contract performs no provider access and grants no notification, provider-write, publishing, outreach, spend, SEO mutation, persistence, or approval-bypass authority."
    ],
    confidence: null,
    authorityScore: null,
    causality: "NOT_ESTABLISHED" as const,
    attribution: "NOT_ESTABLISHED" as const,
    notificationAuthority: "NONE" as const,
    providerWriteAuthority: "NONE" as const,
    externalAccessPerformed: false as const,
    writesPerformed: false as const
  });
}
