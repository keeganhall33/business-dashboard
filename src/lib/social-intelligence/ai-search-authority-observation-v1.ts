export const AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION = "AiSearchAuthorityObservationV1" as const;

export const AI_SEARCH_ENGINES_V1 = [
  "OPENAI_CHATGPT",
  "GOOGLE_AI_OVERVIEW",
  "GOOGLE_GEMINI",
  "PERPLEXITY",
  "MICROSOFT_COPILOT",
  "OTHER"
] as const;
export type AiSearchEngineV1 = (typeof AI_SEARCH_ENGINES_V1)[number];

export const AI_SEARCH_QUERY_CLASSES_V1 = [
  "BRAND",
  "ARTIST_DISCOVERY",
  "CATEGORY_DISCOVERY",
  "PROJECT_DISCOVERY",
  "OTHER"
] as const;
export type AiSearchQueryClassV1 = (typeof AI_SEARCH_QUERY_CLASSES_V1)[number];

export const AI_SEARCH_RESULT_STATES_V1 = [
  "NOT_MENTIONED",
  "MENTIONED",
  "MENTIONED_WITH_CITATION"
] as const;
export type AiSearchResultStateV1 = (typeof AI_SEARCH_RESULT_STATES_V1)[number];

export type AiSearchExpectedQueryInputV1 = {
  engine: AiSearchEngineV1;
  queryRef: string;
  queryClass: AiSearchQueryClassV1;
  targetEntityRef: string;
  planEvidenceRefs: readonly string[];
};

export type AiSearchAuthorityObservationInputV1 = {
  observationId: string;
  engine: AiSearchEngineV1;
  queryRef: string;
  queryClass: AiSearchQueryClassV1;
  targetEntityRef: string;
  observedAt: string;
  capturedAt: string;
  resultState: AiSearchResultStateV1;
  citedSourceRefs?: readonly string[];
  evidenceRefs: readonly string[];
};

export type AiSearchAuthorityEvaluationInputV1 = {
  asOf: string;
  window: {
    startAt: string;
    endAt: string;
  };
  maxObservationAgeDays: number;
  expectedQueries: readonly AiSearchExpectedQueryInputV1[];
  observations: readonly AiSearchAuthorityObservationInputV1[];
};

export type AiSearchAuthorityObservationV1 = Readonly<{
  observationId: string;
  engine: AiSearchEngineV1;
  queryRef: string;
  queryClass: AiSearchQueryClassV1;
  targetEntityRef: string;
  observedAt: string;
  capturedAt: string;
  resultState: AiSearchResultStateV1;
  citedSourceRefs: readonly string[];
  evidenceRefs: readonly string[];
  freshness: "CURRENT" | "STALE";
  mentionObserved: boolean;
  citationObserved: boolean;
}>;

export type AiSearchAuthorityEngineSummaryV1 = Readonly<{
  engine: AiSearchEngineV1;
  expectedQueryCount: number;
  currentObservationCount: number;
  mentionCount: number | null;
  citationCount: number | null;
  mentionRatePct: number | null;
  citationRatePct: number | null;
  state: "COMPLETE_OBSERVED_WINDOW" | "INCOMPLETE";
  evidenceRefs: readonly string[];
  limitation: string;
}>;

export type AiSearchAuthorityEvaluationV1 = Readonly<{
  contractVersion: typeof AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION;
  asOf: string;
  window: Readonly<{ startAt: string; endAt: string }>;
  maxObservationAgeDays: number;
  status: "READY" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
  expectedQueryCount: number;
  currentObservationCount: number;
  missingQueryKeys: readonly string[];
  staleObservationIds: readonly string[];
  observations: readonly AiSearchAuthorityObservationV1[];
  engines: readonly AiSearchAuthorityEngineSummaryV1[];
  overall: Readonly<{
    mentionCount: number | null;
    citationCount: number | null;
    mentionRatePct: number | null;
    citationRatePct: number | null;
  }>;
  issues: readonly string[];
  guardrails: readonly string[];
  authorityScore: null;
  rankingClaimAllowed: false;
  competitorClaimAllowed: false;
  attributionClaimAllowed: false;
  causalClaimAllowed: false;
  externalAccessPerformed: false;
  writesPerformed: false;
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

function nonEmpty(value: string, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function iso(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a valid timestamp`);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[] | undefined, field: string): string[] {
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  const normalized = values.map((value, index) => nonEmpty(value, `${field}[${index}]`));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function assertEnum(value: string, allowed: readonly string[], field: string): void {
  if (!allowed.includes(value)) throw new Error(`${field} is unsupported`);
}

function assertNoRawAnswerOrPromptText(value: unknown, field: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (PROHIBITED_RAW_TEXT_KEYS.has(key)) {
      throw new Error(`${field}.${key} is prohibited; persist a non-sensitive queryRef/evidenceRef instead`);
    }
  }
}

function key(engine: AiSearchEngineV1, queryRef: string): string {
  return `${engine}:${queryRef}`;
}

function percent(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100_000) / 1_000;
}

function ageDays(earlier: string, later: string): number {
  return (Date.parse(later) - Date.parse(earlier)) / 86_400_000;
}

export function compileAiSearchAuthorityEvaluationV1(
  input: AiSearchAuthorityEvaluationInputV1
): AiSearchAuthorityEvaluationV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  assertNoRawAnswerOrPromptText(input, "input");
  if (!Array.isArray(input.expectedQueries) || input.expectedQueries.length === 0) {
    throw new Error("expectedQueries must contain at least one planned query");
  }
  if (!Array.isArray(input.observations)) throw new Error("observations must be an array");
  if (!Number.isInteger(input.maxObservationAgeDays) || input.maxObservationAgeDays < 1 || input.maxObservationAgeDays > 365) {
    throw new Error("maxObservationAgeDays must be an integer between 1 and 365");
  }

  const asOf = iso(input.asOf, "asOf");
  const startAt = iso(input.window?.startAt, "window.startAt");
  const endAt = iso(input.window?.endAt, "window.endAt");
  if (Date.parse(endAt) <= Date.parse(startAt)) throw new Error("window must have a positive duration");
  if (Date.parse(endAt) > Date.parse(asOf)) throw new Error("window.endAt cannot be after asOf");

  const plan = new Map<
    string,
    Readonly<{
      engine: AiSearchEngineV1;
      queryRef: string;
      queryClass: AiSearchQueryClassV1;
      targetEntityRef: string;
      planEvidenceRefs: readonly string[];
    }>
  >();

  input.expectedQueries.forEach((candidate, index) => {
    assertNoRawAnswerOrPromptText(candidate, `expectedQueries[${index}]`);
    assertEnum(candidate.engine, AI_SEARCH_ENGINES_V1, `expectedQueries[${index}].engine`);
    assertEnum(candidate.queryClass, AI_SEARCH_QUERY_CLASSES_V1, `expectedQueries[${index}].queryClass`);
    const queryRef = nonEmpty(candidate.queryRef, `expectedQueries[${index}].queryRef`);
    const targetEntityRef = nonEmpty(candidate.targetEntityRef, `expectedQueries[${index}].targetEntityRef`);
    const planEvidenceRefs = unique(candidate.planEvidenceRefs, `expectedQueries[${index}].planEvidenceRefs`);
    if (!planEvidenceRefs.length) throw new Error(`expectedQueries[${index}] requires plan evidence`);
    const queryKey = key(candidate.engine, queryRef);
    if (plan.has(queryKey)) throw new Error(`duplicate planned query: ${queryKey}`);
    plan.set(
      queryKey,
      freeze({ engine: candidate.engine, queryRef, queryClass: candidate.queryClass, targetEntityRef, planEvidenceRefs })
    );
  });

  const seenObservationIds = new Set<string>();
  const seenQueryKeys = new Set<string>();
  const observations = input.observations.map((candidate, index): AiSearchAuthorityObservationV1 => {
    assertNoRawAnswerOrPromptText(candidate, `observations[${index}]`);
    assertEnum(candidate.engine, AI_SEARCH_ENGINES_V1, `observations[${index}].engine`);
    assertEnum(candidate.queryClass, AI_SEARCH_QUERY_CLASSES_V1, `observations[${index}].queryClass`);
    assertEnum(candidate.resultState, AI_SEARCH_RESULT_STATES_V1, `observations[${index}].resultState`);

    const observationId = nonEmpty(candidate.observationId, `observations[${index}].observationId`);
    if (seenObservationIds.has(observationId)) throw new Error(`duplicate observationId: ${observationId}`);
    seenObservationIds.add(observationId);

    const queryRef = nonEmpty(candidate.queryRef, `observations[${index}].queryRef`);
    const targetEntityRef = nonEmpty(candidate.targetEntityRef, `observations[${index}].targetEntityRef`);
    const queryKey = key(candidate.engine, queryRef);
    const expected = plan.get(queryKey);
    if (!expected) throw new Error(`unplanned observation: ${queryKey}`);
    if (seenQueryKeys.has(queryKey)) throw new Error(`duplicate observation for planned query: ${queryKey}`);
    seenQueryKeys.add(queryKey);
    if (candidate.queryClass !== expected.queryClass) throw new Error(`${queryKey} queryClass does not match plan`);
    if (targetEntityRef !== expected.targetEntityRef) throw new Error(`${queryKey} targetEntityRef does not match plan`);

    const observedAt = iso(candidate.observedAt, `observations[${index}].observedAt`);
    const capturedAt = iso(candidate.capturedAt, `observations[${index}].capturedAt`);
    if (Date.parse(observedAt) < Date.parse(startAt) || Date.parse(observedAt) > Date.parse(endAt)) {
      throw new Error(`${observationId}.observedAt must be inside the declared evaluation window`);
    }
    if (Date.parse(observedAt) > Date.parse(capturedAt)) throw new Error(`${observationId}.observedAt cannot be after capturedAt`);
    if (Date.parse(capturedAt) > Date.parse(asOf)) throw new Error(`${observationId}.capturedAt cannot be after asOf`);

    const evidenceRefs = unique(candidate.evidenceRefs, `observations[${index}].evidenceRefs`);
    if (!evidenceRefs.length) throw new Error(`${observationId} requires evidence`);
    const citedSourceRefs = unique(candidate.citedSourceRefs ?? [], `observations[${index}].citedSourceRefs`);
    if (candidate.resultState === "MENTIONED_WITH_CITATION" && !citedSourceRefs.length) {
      throw new Error(`${observationId} requires citedSourceRefs for MENTIONED_WITH_CITATION`);
    }
    if (candidate.resultState !== "MENTIONED_WITH_CITATION" && citedSourceRefs.length) {
      throw new Error(`${observationId} cannot attach citedSourceRefs without an observed citation`);
    }

    const freshness =
      ageDays(capturedAt, asOf) <= input.maxObservationAgeDays ? ("CURRENT" as const) : ("STALE" as const);
    return freeze({
      observationId,
      engine: candidate.engine,
      queryRef,
      queryClass: candidate.queryClass,
      targetEntityRef,
      observedAt,
      capturedAt,
      resultState: candidate.resultState,
      citedSourceRefs,
      evidenceRefs,
      freshness,
      mentionObserved: candidate.resultState !== "NOT_MENTIONED",
      citationObserved: candidate.resultState === "MENTIONED_WITH_CITATION"
    });
  });

  const currentByKey = new Map(
    observations.filter((observation) => observation.freshness === "CURRENT").map((observation) => [key(observation.engine, observation.queryRef), observation])
  );
  const missingQueryKeys = [...plan.keys()].filter((queryKey) => !currentByKey.has(queryKey)).sort((a, b) => a.localeCompare(b));
  const staleObservationIds = observations
    .filter((observation) => observation.freshness === "STALE")
    .map((observation) => observation.observationId)
    .sort((a, b) => a.localeCompare(b));

  const engines = [...new Set([...plan.values()].map((entry) => entry.engine))]
    .sort((a, b) => a.localeCompare(b))
    .map((engine): AiSearchAuthorityEngineSummaryV1 => {
      const expectedEntries = [...plan.values()].filter((entry) => entry.engine === engine);
      const currentRows = expectedEntries.flatMap((entry) => {
        const observation = currentByKey.get(key(entry.engine, entry.queryRef));
        return observation ? [observation] : [];
      });
      const complete = currentRows.length === expectedEntries.length;
      const mentionCount = complete ? currentRows.filter((row) => row.mentionObserved).length : null;
      const citationCount = complete ? currentRows.filter((row) => row.citationObserved).length : null;
      const evidenceRefs = unique(
        [
          ...expectedEntries.flatMap((entry) => entry.planEvidenceRefs),
          ...currentRows.flatMap((row) => row.evidenceRefs)
        ],
        `${engine}.evidenceRefs`
      );
      return freeze({
        engine,
        expectedQueryCount: expectedEntries.length,
        currentObservationCount: currentRows.length,
        mentionCount,
        citationCount,
        mentionRatePct: complete && mentionCount !== null ? percent(mentionCount, expectedEntries.length) : null,
        citationRatePct: complete && citationCount !== null ? percent(citationCount, expectedEntries.length) : null,
        state: complete ? ("COMPLETE_OBSERVED_WINDOW" as const) : ("INCOMPLETE" as const),
        evidenceRefs,
        limitation: complete
          ? "Rates describe only this fixed, evidenced query set and point-in-time observation window; they are not a search ranking, authority score, forecast, endorsement, or causal claim."
          : "Rates are withheld because the fixed query set does not have complete current evidence."
      });
    });

  const complete = missingQueryKeys.length === 0;
  const currentRows = observations.filter((observation) => observation.freshness === "CURRENT");
  const overallMentionCount = complete ? currentRows.filter((row) => row.mentionObserved).length : null;
  const overallCitationCount = complete ? currentRows.filter((row) => row.citationObserved).length : null;
  const issues = [
    ...missingQueryKeys.map((queryKey) => `Missing current observation for planned query ${queryKey}.`),
    ...staleObservationIds.map((observationId) => `Observation ${observationId} exceeds the caller-supplied freshness policy.`)
  ];
  const status = complete ? "READY" : currentRows.length ? "PARTIAL" : "INSUFFICIENT_EVIDENCE";

  return freeze({
    contractVersion: AI_SEARCH_AUTHORITY_OBSERVATION_V1_VERSION,
    asOf,
    window: { startAt, endAt },
    maxObservationAgeDays: input.maxObservationAgeDays,
    status,
    expectedQueryCount: plan.size,
    currentObservationCount: currentRows.length,
    missingQueryKeys,
    staleObservationIds,
    observations: [...observations].sort((a, b) => a.engine.localeCompare(b.engine) || a.queryRef.localeCompare(b.queryRef)),
    engines,
    overall: {
      mentionCount: overallMentionCount,
      citationCount: overallCitationCount,
      mentionRatePct: complete && overallMentionCount !== null ? percent(overallMentionCount, plan.size) : null,
      citationRatePct: complete && overallCitationCount !== null ? percent(overallCitationCount, plan.size) : null
    },
    issues,
    guardrails: [
      "This compiler consumes explicit observations only; it performs no provider access or scraping.",
      "Raw prompts, queries, answers, and responses are prohibited from this durable contract; use non-sensitive queryRef and evidenceRef identifiers.",
      "Missing or stale planned observations are never zero-filled and suppress aggregate rates.",
      "Observed mentions and citations do not establish ranking, endorsement, competitor performance, relationship, attribution, causality, authority score, business impact, or monetary value.",
      "Provider outputs can vary by session, model, geography, personalization, and time; this result applies only to the declared evidenced window.",
      "No publishing, outreach, spend, SEO mutation, provider write, notification, or approval bypass is authorized."
    ],
    authorityScore: null,
    rankingClaimAllowed: false,
    competitorClaimAllowed: false,
    attributionClaimAllowed: false,
    causalClaimAllowed: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
