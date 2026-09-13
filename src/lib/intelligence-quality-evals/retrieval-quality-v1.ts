export const RETRIEVAL_QUALITY_CONTRACT_VERSION_V1 = "RETRIEVAL_QUALITY_EVAL_V1" as const;

export const RETRIEVAL_QUALITY_LIMITS_V1 = Object.freeze({
  maxCases: 64,
  maxEvidenceRefsPerCase: 32,
  maxIdentifierLength: 256
});

export type RetrievalEvalCaseKindV1 = "KNOWN" | "CONFLICTED" | "SUPERSEDED" | "UNKNOWN";
export type RetrievalAnswerTruthStateV1 = "KNOWN" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type RetrievalEvalStateV1 = "PASS" | "FAIL" | "UNKNOWN";

export type RetrievalQualityExpectationV1 = Readonly<{
  case_id: string;
  kind: RetrievalEvalCaseKindV1;
  required_evidence_refs: readonly string[];
  forbidden_evidence_refs: readonly string[];
  expected_answer_state: RetrievalAnswerTruthStateV1;
}>;

export type RetrievalQualityObservationV1 = Readonly<{
  case_id: string;
  retrieved_evidence_refs: readonly string[];
  cited_evidence_refs: readonly string[];
  answer_state: RetrievalAnswerTruthStateV1;
  latency_ms: number | null;
  cost_usd: number | null;
}>;

export type RetrievalQualityEvalInputV1 = Readonly<{
  run_id: string;
  evaluated_at: string;
  expectations: readonly RetrievalQualityExpectationV1[];
  observations: readonly RetrievalQualityObservationV1[];
}>;

export type RetrievalQualityCaseResultV1 = Readonly<{
  case_id: string;
  kind: RetrievalEvalCaseKindV1;
  state: RetrievalEvalStateV1;
  reason_codes: readonly RetrievalQualityReasonCodeV1[];
  required_retrieved: number;
  required_total: number;
  cited_supported: number;
  cited_total: number;
}>;

export type RetrievalQualityReasonCodeV1 =
  | "OBSERVATION_MISSING"
  | "ANSWER_STATE_MISMATCH"
  | "REQUIRED_EVIDENCE_MISSED"
  | "REQUIRED_CITATION_MISSED"
  | "UNSUPPORTED_CITATION"
  | "FORBIDDEN_SUPERSEDED_EVIDENCE_CITED"
  | "CONFLICT_NOT_PRESERVED"
  | "UNKNOWN_NOT_ABSTAINED"
  | "CASE_VERIFIED";

export type RetrievalQualityEvalResultV1 = Readonly<{
  contract_version: typeof RETRIEVAL_QUALITY_CONTRACT_VERSION_V1;
  run_id: string;
  evaluated_at: string;
  state: RetrievalEvalStateV1;
  cases: readonly RetrievalQualityCaseResultV1[];
  metrics: Readonly<{
    source_recall: number | null;
    citation_precision: number | null;
    conflict_recall: number | null;
    supersession_accuracy: number | null;
    unknown_abstention_accuracy: number | null;
    observed_latency_ms: number | null;
    observed_cost_usd: number | null;
    latency_coverage: "KNOWN" | "INCOMPLETE" | "UNKNOWN";
    cost_coverage: "KNOWN" | "INCOMPLETE" | "UNKNOWN";
  }>;
}>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const caseKinds = new Set<RetrievalEvalCaseKindV1>(["KNOWN", "CONFLICTED", "SUPERSEDED", "UNKNOWN"]);
const truthStates = new Set<RetrievalAnswerTruthStateV1>(["KNOWN", "UNKNOWN", "STALE", "CONFLICTED"]);

function fail(code: string): never {
  throw new Error(`RETRIEVAL_QUALITY_${code}`);
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > RETRIEVAL_QUALITY_LIMITS_V1.maxIdentifierLength || !identifierPattern.test(value)) {
    fail(`${name.toUpperCase()}_INVALID`);
  }
  return value;
}

function uniqueRefs(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > RETRIEVAL_QUALITY_LIMITS_V1.maxEvidenceRefsPerCase) fail(`${name.toUpperCase()}_INVALID`);
  const refs = value.map((entry) => identifier(entry, name));
  if (new Set(refs).size !== refs.length) fail(`${name.toUpperCase()}_DUPLICATE`);
  return refs;
}

function nonNegativeMetric(value: unknown, name: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(`${name.toUpperCase()}_INVALID`);
  return value;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function coverage(values: readonly (number | null)[]): "KNOWN" | "INCOMPLETE" | "UNKNOWN" {
  const known = values.filter((value): value is number => value !== null).length;
  if (known === 0) return "UNKNOWN";
  return known === values.length ? "KNOWN" : "INCOMPLETE";
}

function validateExpectation(raw: RetrievalQualityExpectationV1): RetrievalQualityExpectationV1 {
  const caseId = identifier(raw?.case_id, "case_id");
  if (!caseKinds.has(raw?.kind)) fail("CASE_KIND_INVALID");
  if (!truthStates.has(raw?.expected_answer_state)) fail("EXPECTED_ANSWER_STATE_INVALID");
  const required = uniqueRefs(raw.required_evidence_refs, "required_evidence_refs");
  const forbidden = uniqueRefs(raw.forbidden_evidence_refs, "forbidden_evidence_refs");
  if (required.some((ref) => forbidden.includes(ref))) fail("EVIDENCE_REF_OVERLAP");
  if (raw.kind === "UNKNOWN" && (required.length > 0 || raw.expected_answer_state !== "UNKNOWN")) fail("UNKNOWN_CASE_INVALID");
  if (raw.kind === "CONFLICTED" && (required.length < 2 || raw.expected_answer_state !== "CONFLICTED")) fail("CONFLICT_CASE_INVALID");
  if (raw.kind === "SUPERSEDED" && (required.length === 0 || forbidden.length === 0 || raw.expected_answer_state !== "KNOWN")) fail("SUPERSEDED_CASE_INVALID");
  if (raw.kind === "KNOWN" && (required.length === 0 || raw.expected_answer_state !== "KNOWN")) fail("KNOWN_CASE_INVALID");
  return Object.freeze({ case_id: caseId, kind: raw.kind, required_evidence_refs: Object.freeze(required), forbidden_evidence_refs: Object.freeze(forbidden), expected_answer_state: raw.expected_answer_state });
}

function validateObservation(raw: RetrievalQualityObservationV1): RetrievalQualityObservationV1 {
  const caseId = identifier(raw?.case_id, "case_id");
  if (!truthStates.has(raw?.answer_state)) fail("ANSWER_STATE_INVALID");
  return Object.freeze({
    case_id: caseId,
    retrieved_evidence_refs: Object.freeze(uniqueRefs(raw.retrieved_evidence_refs, "retrieved_evidence_refs")),
    cited_evidence_refs: Object.freeze(uniqueRefs(raw.cited_evidence_refs, "cited_evidence_refs")),
    answer_state: raw.answer_state,
    latency_ms: nonNegativeMetric(raw.latency_ms, "latency_ms"),
    cost_usd: nonNegativeMetric(raw.cost_usd, "cost_usd")
  });
}

function evaluateCase(expectation: RetrievalQualityExpectationV1, observation: RetrievalQualityObservationV1 | undefined): RetrievalQualityCaseResultV1 {
  if (!observation) {
    return Object.freeze({
      case_id: expectation.case_id,
      kind: expectation.kind,
      state: "UNKNOWN",
      reason_codes: Object.freeze(["OBSERVATION_MISSING"] as RetrievalQualityReasonCodeV1[]),
      required_retrieved: 0,
      required_total: expectation.required_evidence_refs.length,
      cited_supported: 0,
      cited_total: 0
    });
  }

  const retrieved = new Set(observation.retrieved_evidence_refs);
  const required = new Set(expectation.required_evidence_refs);
  const forbidden = new Set(expectation.forbidden_evidence_refs);
  const requiredRetrieved = expectation.required_evidence_refs.filter((ref) => retrieved.has(ref)).length;
  const citedSupported = observation.cited_evidence_refs.filter((ref) => required.has(ref)).length;
  const reasons: RetrievalQualityReasonCodeV1[] = [];

  if (observation.answer_state !== expectation.expected_answer_state) reasons.push("ANSWER_STATE_MISMATCH");
  if (requiredRetrieved !== expectation.required_evidence_refs.length) reasons.push("REQUIRED_EVIDENCE_MISSED");
  if (expectation.kind !== "UNKNOWN" && citedSupported !== expectation.required_evidence_refs.length) reasons.push("REQUIRED_CITATION_MISSED");
  if (observation.cited_evidence_refs.some((ref) => !required.has(ref))) reasons.push("UNSUPPORTED_CITATION");
  if (observation.cited_evidence_refs.some((ref) => forbidden.has(ref))) reasons.push("FORBIDDEN_SUPERSEDED_EVIDENCE_CITED");
  if (expectation.kind === "CONFLICTED" && (requiredRetrieved < 2 || citedSupported < 2 || observation.answer_state !== "CONFLICTED")) reasons.push("CONFLICT_NOT_PRESERVED");
  if (expectation.kind === "UNKNOWN" && (observation.answer_state !== "UNKNOWN" || observation.cited_evidence_refs.length > 0)) reasons.push("UNKNOWN_NOT_ABSTAINED");
  if (reasons.length === 0) reasons.push("CASE_VERIFIED");

  return Object.freeze({
    case_id: expectation.case_id,
    kind: expectation.kind,
    state: reasons.length === 1 && reasons[0] === "CASE_VERIFIED" ? "PASS" : "FAIL",
    reason_codes: Object.freeze([...new Set(reasons)]),
    required_retrieved: requiredRetrieved,
    required_total: expectation.required_evidence_refs.length,
    cited_supported: citedSupported,
    cited_total: observation.cited_evidence_refs.length
  });
}

export function evaluateRetrievalQualityV1(input: RetrievalQualityEvalInputV1): RetrievalQualityEvalResultV1 {
  const runId = identifier(input?.run_id, "run_id");
  if (typeof input?.evaluated_at !== "string" || !Number.isFinite(Date.parse(input.evaluated_at))) fail("EVALUATED_AT_INVALID");
  if (!Array.isArray(input.expectations) || input.expectations.length === 0 || input.expectations.length > RETRIEVAL_QUALITY_LIMITS_V1.maxCases) fail("EXPECTATIONS_INVALID");
  if (!Array.isArray(input.observations) || input.observations.length > RETRIEVAL_QUALITY_LIMITS_V1.maxCases) fail("OBSERVATIONS_INVALID");

  const expectations = input.expectations.map(validateExpectation);
  const observations = input.observations.map(validateObservation);
  if (new Set(expectations.map((item) => item.case_id)).size !== expectations.length) fail("EXPECTATION_CASE_DUPLICATE");
  if (new Set(observations.map((item) => item.case_id)).size !== observations.length) fail("OBSERVATION_CASE_DUPLICATE");
  const expectationIds = new Set(expectations.map((item) => item.case_id));
  if (observations.some((item) => !expectationIds.has(item.case_id))) fail("OBSERVATION_CASE_UNKNOWN");

  const observationByCase = new Map(observations.map((item) => [item.case_id, item]));
  const cases = expectations.map((expectation) => evaluateCase(expectation, observationByCase.get(expectation.case_id)));
  const scoredCases = cases.filter((item) => item.state !== "UNKNOWN");
  const requiredRetrieved = scoredCases.reduce((total, item) => total + item.required_retrieved, 0);
  const requiredTotal = scoredCases.reduce((total, item) => total + item.required_total, 0);
  const citedSupported = scoredCases.reduce((total, item) => total + item.cited_supported, 0);
  const citedTotal = scoredCases.reduce((total, item) => total + item.cited_total, 0);
  const state: RetrievalEvalStateV1 = cases.some((item) => item.state === "FAIL")
    ? "FAIL"
    : cases.some((item) => item.state === "UNKNOWN")
      ? "UNKNOWN"
      : "PASS";
  const classAccuracy = (kind: RetrievalEvalCaseKindV1) => {
    const selected = cases.filter((item) => item.kind === kind);
    if (selected.length === 0 || selected.some((item) => item.state === "UNKNOWN")) return null;
    return ratio(selected.filter((item) => item.state === "PASS").length, selected.length);
  };
  const latencies = observations.map((item) => item.latency_ms);
  const costs = observations.map((item) => item.cost_usd);

  return Object.freeze({
    contract_version: RETRIEVAL_QUALITY_CONTRACT_VERSION_V1,
    run_id: runId,
    evaluated_at: input.evaluated_at,
    state,
    cases: Object.freeze(cases),
    metrics: Object.freeze({
      source_recall: ratio(requiredRetrieved, requiredTotal),
      citation_precision: ratio(citedSupported, citedTotal),
      conflict_recall: classAccuracy("CONFLICTED"),
      supersession_accuracy: classAccuracy("SUPERSEDED"),
      unknown_abstention_accuracy: classAccuracy("UNKNOWN"),
      observed_latency_ms: latencies.every((value) => value === null) ? null : latencies.reduce<number>((total, value) => total + (value ?? 0), 0),
      observed_cost_usd: costs.every((value) => value === null) ? null : costs.reduce<number>((total, value) => total + (value ?? 0), 0),
      latency_coverage: coverage(latencies),
      cost_coverage: coverage(costs)
    })
  });
}
