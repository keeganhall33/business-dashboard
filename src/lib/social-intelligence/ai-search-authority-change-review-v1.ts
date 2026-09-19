import {
  AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION,
  AI_SEARCH_RESULT_STATES_V1,
  type AiSearchAuthorityEvaluationV1,
  type AiSearchAuthorityObservationV1,
  type AiSearchEngineV1,
  type AiSearchResultStateV1
} from "./ai-search-authority-observation-v1";

export const AI_SEARCH_AUTHORITY_CHANGE_REVIEW_V1_VERSION = "AiSearchAuthorityChangeReviewV1" as const;
export const AI_SEARCH_AUTHORITY_CHANGE_MAX_OBSERVATIONS_V1 = 500;

export type AiSearchAuthorityChangeKindV1 =
  | "MENTION_GAIN"
  | "MENTION_LOSS"
  | "CITATION_GAIN"
  | "CITATION_LOSS"
  | "CITED_SOURCE_SET_CHANGED";

export type AiSearchAuthorityChangeReasonV1 =
  | "PREVIOUS_EVALUATION_NOT_READY"
  | "CURRENT_EVALUATION_NOT_READY"
  | "CURRENT_EVALUATION_FROM_FUTURE"
  | "CURRENT_EVALUATION_TOO_OLD"
  | "WINDOW_ORDER_INVALID"
  | "WINDOW_DURATION_MISMATCH"
  | "WINDOW_GAP_TOO_LARGE"
  | "QUERY_SET_MISMATCH"
  | "QUERY_IDENTITY_MISMATCH"
  | "OBSERVATION_INTEGRITY_INVALID";

export type AiSearchAuthorityChangePolicyV1 = Readonly<{
  maxCurrentEvaluationAgeHours: number;
  maxGapHours: number;
}>;

export type AiSearchAuthorityObservedChangeV1 = Readonly<{
  changeId: string;
  engine: AiSearchEngineV1;
  queryRef: string;
  queryClass: AiSearchAuthorityObservationV1["queryClass"];
  targetEntityRef: string;
  kind: AiSearchAuthorityChangeKindV1;
  previousState: AiSearchResultStateV1;
  currentState: AiSearchResultStateV1;
  previousCitedSourceRefs: readonly string[];
  currentCitedSourceRefs: readonly string[];
  previousObservationId: string;
  currentObservationId: string;
  evidenceRefs: readonly string[];
  interpretation: "DIRECTLY_OBSERVED_FIXED_QUERY_CHANGE";
  causalClaim: false;
  attributionClaim: false;
  rankingClaim: false;
  authorityScoreClaim: false;
  competitorPerformanceClaim: false;
  endorsementClaim: false;
  relationshipClaim: false;
}>;

export type AiSearchAuthorityChangeReviewV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_AUTHORITY_CHANGE_REVIEW_V1_VERSION;
  evaluatedAt: string;
  status: "READY" | "VERIFY_REQUIRED";
  attentionState: "READY_FOR_INTERNAL_ALERT_REVIEW" | "NO_OBSERVED_CHANGE" | "VERIFY_REQUIRED";
  previousWindow: Readonly<{ startAt: string; endAt: string }>;
  currentWindow: Readonly<{ startAt: string; endAt: string }>;
  queryCount: number | null;
  changes: readonly AiSearchAuthorityObservedChangeV1[];
  reasons: readonly AiSearchAuthorityChangeReasonV1[];
  observedOverallDelta: Readonly<{
    mentionCount: number | null;
    citationCount: number | null;
    mentionRatePct: number | null;
    citationRatePct: number | null;
  }>;
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

export type AiSearchAuthorityChangeReviewInputV1 = Readonly<{
  previous: AiSearchAuthorityEvaluationV1;
  current: AiSearchAuthorityEvaluationV1;
  evaluatedAt: string;
  policy: AiSearchAuthorityChangePolicyV1;
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

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty`);
  return value.trim();
}

function nonNegativeFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return value;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
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

function observationKey(row: AiSearchAuthorityObservationV1): string {
  return `${row.engine}:${row.queryRef}`;
}

function observationIdentity(row: AiSearchAuthorityObservationV1): string {
  return [row.engine, row.queryRef, row.queryClass, row.targetEntityRef].join(":");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function validateEvaluation(
  evaluation: AiSearchAuthorityEvaluationV1,
  label: "previous" | "current"
): { observations: Map<string, AiSearchAuthorityObservationV1>; evidenceRefs: string[]; integrityValid: boolean } {
  if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) {
    throw new Error(`${label} must be an AI search authority evaluation`);
  }
  assertNoRawText(evaluation, label);
  if (evaluation.contractVersion !== AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION) {
    throw new Error(`${label}.contractVersion is unsupported`);
  }
  if (!Array.isArray(evaluation.observations)) throw new Error(`${label}.observations must be an array`);
  if (evaluation.observations.length > AI_SEARCH_AUTHORITY_CHANGE_MAX_OBSERVATIONS_V1) {
    throw new Error(`${label}.observations exceeds the supported bound`);
  }

  const windowStart = Date.parse(iso(evaluation.window?.startAt, `${label}.window.startAt`));
  const windowEnd = Date.parse(iso(evaluation.window?.endAt, `${label}.window.endAt`));
  const asOf = Date.parse(iso(evaluation.asOf, `${label}.asOf`));
  if (windowEnd <= windowStart || windowEnd > asOf) {
    throw new Error(`${label} has invalid window chronology`);
  }

  const observations = new Map<string, AiSearchAuthorityObservationV1>();
  const evidenceRefs: string[] = [];
  let integrityValid = true;
  const ids = new Set<string>();

  for (const [index, row] of evaluation.observations.entries()) {
    const observationId = nonEmpty(row.observationId, `${label}.observations[${index}].observationId`);
    const queryRef = nonEmpty(row.queryRef, `${observationId}.queryRef`);
    const targetEntityRef = nonEmpty(row.targetEntityRef, `${observationId}.targetEntityRef`);
    if (ids.has(observationId)) integrityValid = false;
    ids.add(observationId);
    if (!AI_SEARCH_RESULT_STATES_V1.includes(row.resultState)) integrityValid = false;
    if (row.freshness !== "CURRENT") integrityValid = false;

    const observedAt = Date.parse(iso(row.observedAt, `${observationId}.observedAt`));
    const capturedAt = Date.parse(iso(row.capturedAt, `${observationId}.capturedAt`));
    if (observedAt < windowStart || observedAt > windowEnd || capturedAt < observedAt || capturedAt > asOf) integrityValid = false;

    const rowEvidence = unique(row.evidenceRefs ?? []);
    if (!rowEvidence.length) integrityValid = false;
    const citedSourceRefs = unique(row.citedSourceRefs ?? []);
    if (row.resultState === "MENTIONED_WITH_CITATION" ? !citedSourceRefs.length : citedSourceRefs.length > 0) {
      integrityValid = false;
    }

    const normalized = freeze({ ...row, observationId, queryRef, targetEntityRef, evidenceRefs: rowEvidence, citedSourceRefs });
    const key = observationKey(normalized);
    if (observations.has(key)) integrityValid = false;
    observations.set(key, normalized);
    evidenceRefs.push(...rowEvidence);
  }

  if (
    evaluation.status === "READY" &&
    (evaluation.expectedQueryCount !== evaluation.observations.length ||
      evaluation.currentObservationCount !== evaluation.observations.length ||
      evaluation.missingQueryKeys.length > 0 ||
      evaluation.staleObservationIds.length > 0)
  ) {
    integrityValid = false;
  }

  return { observations, evidenceRefs: unique(evidenceRefs), integrityValid };
}

function change(
  previous: AiSearchAuthorityObservationV1,
  current: AiSearchAuthorityObservationV1,
  kind: AiSearchAuthorityChangeKindV1
): AiSearchAuthorityObservedChangeV1 {
  return freeze({
    changeId: ["ai-search-change", current.engine, current.queryRef, kind].map(encodeURIComponent).join(":"),
    engine: current.engine,
    queryRef: current.queryRef,
    queryClass: current.queryClass,
    targetEntityRef: current.targetEntityRef,
    kind,
    previousState: previous.resultState,
    currentState: current.resultState,
    previousCitedSourceRefs: unique(previous.citedSourceRefs),
    currentCitedSourceRefs: unique(current.citedSourceRefs),
    previousObservationId: previous.observationId,
    currentObservationId: current.observationId,
    evidenceRefs: unique([...previous.evidenceRefs, ...current.evidenceRefs]),
    interpretation: "DIRECTLY_OBSERVED_FIXED_QUERY_CHANGE" as const,
    causalClaim: false as const,
    attributionClaim: false as const,
    rankingClaim: false as const,
    authorityScoreClaim: false as const,
    competitorPerformanceClaim: false as const,
    endorsementClaim: false as const,
    relationshipClaim: false as const
  });
}

function delta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : Math.round((current - previous) * 1000) / 1000;
}

export function compileAiSearchAuthorityChangeReviewV1(
  input: AiSearchAuthorityChangeReviewInputV1
): AiSearchAuthorityChangeReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawText(input, "input");
  const evaluatedAt = iso(input.evaluatedAt, "evaluatedAt");
  const evaluatedAtMs = Date.parse(evaluatedAt);
  const policy = {
    maxCurrentEvaluationAgeHours: nonNegativeFinite(input.policy?.maxCurrentEvaluationAgeHours, "policy.maxCurrentEvaluationAgeHours"),
    maxGapHours: nonNegativeFinite(input.policy?.maxGapHours, "policy.maxGapHours")
  };

  const previousValidated = validateEvaluation(input.previous, "previous");
  const currentValidated = validateEvaluation(input.current, "current");
  const reasons: AiSearchAuthorityChangeReasonV1[] = [];

  if (input.previous.status !== "READY") reasons.push("PREVIOUS_EVALUATION_NOT_READY");
  if (input.current.status !== "READY") reasons.push("CURRENT_EVALUATION_NOT_READY");
  if (!previousValidated.integrityValid || !currentValidated.integrityValid) reasons.push("OBSERVATION_INTEGRITY_INVALID");

  const previousStart = Date.parse(input.previous.window.startAt);
  const previousEnd = Date.parse(input.previous.window.endAt);
  const currentStart = Date.parse(input.current.window.startAt);
  const currentEnd = Date.parse(input.current.window.endAt);
  const currentAsOf = Date.parse(input.current.asOf);

  if (currentAsOf > evaluatedAtMs) reasons.push("CURRENT_EVALUATION_FROM_FUTURE");
  if (evaluatedAtMs - currentAsOf > policy.maxCurrentEvaluationAgeHours * 3_600_000) {
    reasons.push("CURRENT_EVALUATION_TOO_OLD");
  }
  if (currentStart < previousEnd) reasons.push("WINDOW_ORDER_INVALID");
  if (currentEnd - currentStart !== previousEnd - previousStart) reasons.push("WINDOW_DURATION_MISMATCH");
  if (currentStart >= previousEnd && currentStart - previousEnd > policy.maxGapHours * 3_600_000) {
    reasons.push("WINDOW_GAP_TOO_LARGE");
  }

  const previousKeys = [...previousValidated.observations.keys()].sort((a, b) => a.localeCompare(b));
  const currentKeys = [...currentValidated.observations.keys()].sort((a, b) => a.localeCompare(b));
  if (!sameStrings(previousKeys, currentKeys)) reasons.push("QUERY_SET_MISMATCH");

  for (const key of previousKeys) {
    const previous = previousValidated.observations.get(key);
    const current = currentValidated.observations.get(key);
    if (previous && current && observationIdentity(previous) !== observationIdentity(current)) {
      reasons.push("QUERY_IDENTITY_MISMATCH");
      break;
    }
  }

  const normalizedReasons = [...new Set(reasons)].sort((left, right) => left.localeCompare(right));
  const ready = normalizedReasons.length === 0;
  const changes: AiSearchAuthorityObservedChangeV1[] = [];

  if (ready) {
    for (const key of currentKeys) {
      const previous = previousValidated.observations.get(key)!;
      const current = currentValidated.observations.get(key)!;
      if (!previous.mentionObserved && current.mentionObserved) changes.push(change(previous, current, "MENTION_GAIN"));
      if (previous.mentionObserved && !current.mentionObserved) changes.push(change(previous, current, "MENTION_LOSS"));
      if (!previous.citationObserved && current.citationObserved) changes.push(change(previous, current, "CITATION_GAIN"));
      if (previous.citationObserved && !current.citationObserved) changes.push(change(previous, current, "CITATION_LOSS"));
      if (previous.citationObserved && current.citationObserved && !sameStrings(previous.citedSourceRefs, current.citedSourceRefs)) {
        changes.push(change(previous, current, "CITED_SOURCE_SET_CHANGED"));
      }
    }
  }

  changes.sort((left, right) => left.changeId.localeCompare(right.changeId));
  const evidenceRefs = ready
    ? unique([...previousValidated.evidenceRefs, ...currentValidated.evidenceRefs])
    : [];

  return freeze({
    contractVersion: AI_SEARCH_AUTHORITY_CHANGE_REVIEW_V1_VERSION,
    evaluatedAt,
    status: ready ? ("READY" as const) : ("VERIFY_REQUIRED" as const),
    attentionState: !ready
      ? ("VERIFY_REQUIRED" as const)
      : changes.length
        ? ("READY_FOR_INTERNAL_ALERT_REVIEW" as const)
        : ("NO_OBSERVED_CHANGE" as const),
    previousWindow: { ...input.previous.window },
    currentWindow: { ...input.current.window },
    queryCount: ready ? currentKeys.length : null,
    changes,
    reasons: normalizedReasons,
    observedOverallDelta: {
      mentionCount: ready ? delta(input.current.overall.mentionCount, input.previous.overall.mentionCount) : null,
      citationCount: ready ? delta(input.current.overall.citationCount, input.previous.overall.citationCount) : null,
      mentionRatePct: ready ? delta(input.current.overall.mentionRatePct, input.previous.overall.mentionRatePct) : null,
      citationRatePct: ready ? delta(input.current.overall.citationRatePct, input.previous.overall.citationRatePct) : null
    },
    evidenceRefs,
    guardrails: [
      "Changes describe only directly observed transitions for the exact same fixed query identities across two complete comparable windows.",
      "Observed mention or citation changes do not establish search ranking, authority, recommendation, endorsement, competitor performance, relationship, attribution, causality, or future results.",
      "A stale, future-dated, incomplete, identity-mismatched, or integrity-invalid comparison is withheld from alert review.",
      "This contract grants no notification, provider-write, posting, paid-media, outreach, persistence, or external-action authority."
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
