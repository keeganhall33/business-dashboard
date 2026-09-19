export const META_FIXED_WINDOW_AUDIT_VERSION = "META_FIXED_WINDOW_AUDIT_V1" as const;

export type MetaAuditTruthStateV1 =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type MetaAuditLevelV1 = "CAMPAIGN" | "AD_SET" | "AD" | "CREATIVE";
export type MetaAuditMetricDirectionV1 = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type MetaAuditWindowV1 = "CURRENT_7D" | "PRIOR_7D" | "CURRENT_14D" | "PRIOR_14D";

export type MetaFixedWindowObservationV1 = {
  window: MetaAuditWindowV1;
  level: MetaAuditLevelV1;
  scopeId: string;
  metricName: string;
  metricDefinitionId: string;
  range: { startDate: string; endDate: string };
  observedAt: string;
  completeThrough: string | null;
  truthState: MetaAuditTruthStateV1;
  value: number | null;
  evidenceRefs: string[];
};

export type MetaFixedWindowAuditInputV1 = {
  generatedAt: string;
  maximumEvidenceAgeHours: number;
  materialChangeRatio: number;
  direction: MetaAuditMetricDirectionV1;
  observations: MetaFixedWindowObservationV1[];
};

export type MetaWindowComparisonV1 = {
  currentWindow: "CURRENT_7D" | "CURRENT_14D";
  priorWindow: "PRIOR_7D" | "PRIOR_14D";
  currentValue: number;
  priorValue: number;
  absoluteChange: number;
  relativeChange: number | null;
  direction: "DETERIORATION" | "IMPROVEMENT" | "NO_MATERIAL_CHANGE" | "UNRESOLVED_ZERO_BASELINE";
};

export type MetaFixedWindowAuditV1 = {
  version: typeof META_FIXED_WINDOW_AUDIT_VERSION;
  status: "READY" | "VERIFY_EVIDENCE" | "INVALID_INPUT";
  reasonCode: string;
  generatedAt: string;
  level: MetaAuditLevelV1 | null;
  scopeId: string | null;
  metricName: string | null;
  metricDefinitionId: string | null;
  signal:
    | "CONSISTENT_DETERIORATION"
    | "SHORT_WINDOW_ONLY_DETERIORATION"
    | "CONSISTENT_IMPROVEMENT"
    | "MIXED_OR_NO_MATERIAL_PATTERN"
    | null;
  comparisons: readonly MetaWindowComparisonV1[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  causalityEstablished: false;
  attributionEstablished: false;
  confidenceEstablished: false;
  monetaryImpactEstablished: false;
  externalMutationPerformed: false;
};

const WINDOWS: readonly MetaAuditWindowV1[] = [
  "CURRENT_7D",
  "PRIOR_7D",
  "CURRENT_14D",
  "PRIOR_14D"
];
const LEVELS: readonly MetaAuditLevelV1[] = ["CAMPAIGN", "AD_SET", "AD", "CREATIVE"];
const TRUTH_STATES: readonly MetaAuditTruthStateV1[] = [
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE"
];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EVIDENCE_REFS = 12;

function parseDateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
    ? parsed
    : Number.NaN;
}

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function validEvidenceRefs(refs: unknown): refs is string[] {
  return (
    Array.isArray(refs) &&
    refs.length > 0 &&
    refs.length <= MAX_EVIDENCE_REFS &&
    refs.every((ref) => validText(ref, 240))
  );
}

function inclusiveDays(range: { startDate: string; endDate: string }): number {
  const start = parseDateOnly(range.startDate);
  const end = parseDateOnly(range.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return Number.NaN;
  return Math.floor((end - start) / DAY_MS) + 1;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function emptyResult(
  input: MetaFixedWindowAuditInputV1,
  status: MetaFixedWindowAuditV1["status"],
  reasonCode: string,
  limitations: string[]
): MetaFixedWindowAuditV1 {
  return deepFreeze({
    version: META_FIXED_WINDOW_AUDIT_VERSION,
    status,
    reasonCode,
    generatedAt: input?.generatedAt ?? "UNKNOWN",
    level: null,
    scopeId: null,
    metricName: null,
    metricDefinitionId: null,
    signal: null,
    comparisons: [],
    evidenceRefs: [],
    limitations: [...new Set(limitations)].sort(),
    causalityEstablished: false,
    attributionEstablished: false,
    confidenceEstablished: false,
    monetaryImpactEstablished: false,
    externalMutationPerformed: false
  });
}

function validObservationShape(observation: MetaFixedWindowObservationV1): boolean {
  return Boolean(
    observation &&
      WINDOWS.includes(observation.window) &&
      LEVELS.includes(observation.level) &&
      validText(observation.scopeId, 160) &&
      validText(observation.metricName, 120) &&
      validText(observation.metricDefinitionId, 160) &&
      Number.isFinite(inclusiveDays(observation.range)) &&
      Number.isFinite(Date.parse(observation.observedAt)) &&
      (observation.completeThrough === null || Number.isFinite(parseDateOnly(observation.completeThrough))) &&
      TRUTH_STATES.includes(observation.truthState) &&
      (observation.value === null ||
        (typeof observation.value === "number" && Number.isFinite(observation.value) && observation.value >= 0)) &&
      validEvidenceRefs(observation.evidenceRefs)
  );
}

function compare(
  current: MetaFixedWindowObservationV1,
  prior: MetaFixedWindowObservationV1,
  direction: MetaAuditMetricDirectionV1,
  threshold: number
): MetaWindowComparisonV1 {
  const currentValue = current.value as number;
  const priorValue = prior.value as number;
  const absoluteChange = currentValue - priorValue;
  const relativeChange = priorValue === 0 ? (currentValue === 0 ? 0 : null) : absoluteChange / priorValue;

  let movement: MetaWindowComparisonV1["direction"] = "NO_MATERIAL_CHANGE";
  if (relativeChange === null) {
    movement = "UNRESOLVED_ZERO_BASELINE";
  } else {
    const deterioration =
      direction === "HIGHER_IS_BETTER"
        ? relativeChange <= -threshold
        : relativeChange >= threshold;
    const improvement =
      direction === "HIGHER_IS_BETTER"
        ? relativeChange >= threshold
        : relativeChange <= -threshold;
    if (deterioration) movement = "DETERIORATION";
    else if (improvement) movement = "IMPROVEMENT";
  }

  return {
    currentWindow: current.window as "CURRENT_7D" | "CURRENT_14D",
    priorWindow: prior.window as "PRIOR_7D" | "PRIOR_14D",
    currentValue,
    priorValue,
    absoluteChange,
    relativeChange,
    direction: movement
  };
}

export function auditMetaFixedWindowsV1(
  input: MetaFixedWindowAuditInputV1
): MetaFixedWindowAuditV1 {
  if (
    !input ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    !Number.isFinite(input.maximumEvidenceAgeHours) ||
    input.maximumEvidenceAgeHours <= 0 ||
    input.maximumEvidenceAgeHours > 168 ||
    !Number.isFinite(input.materialChangeRatio) ||
    input.materialChangeRatio <= 0 ||
    input.materialChangeRatio > 1 ||
    !["HIGHER_IS_BETTER", "LOWER_IS_BETTER"].includes(input.direction) ||
    !Array.isArray(input.observations) ||
    input.observations.length !== WINDOWS.length ||
    input.observations.some((observation) => !validObservationShape(observation))
  ) {
    return emptyResult(input, "INVALID_INPUT", "INVALID_OR_UNBOUNDED_INPUT", [
      "Exactly four bounded fixed-window observations are required."
    ]);
  }

  const byWindow = new Map(input.observations.map((observation) => [observation.window, observation]));
  if (byWindow.size !== WINDOWS.length || WINDOWS.some((window) => !byWindow.has(window))) {
    return emptyResult(input, "INVALID_INPUT", "WINDOW_SET_INVALID", [
      "Current/prior 7-day and 14-day observations must each appear exactly once."
    ]);
  }

  const observations = WINDOWS.map((window) => byWindow.get(window) as MetaFixedWindowObservationV1);
  const identity = observations[0];
  if (
    observations.some(
      (observation) =>
        observation.level !== identity.level ||
        observation.scopeId !== identity.scopeId ||
        observation.metricName !== identity.metricName ||
        observation.metricDefinitionId !== identity.metricDefinitionId
    )
  ) {
    return emptyResult(input, "VERIFY_EVIDENCE", "IDENTITY_OR_METRIC_DRIFT", [
      "All fixed windows must refer to the exact same Meta scope and metric definition."
    ]);
  }

  const current7 = byWindow.get("CURRENT_7D") as MetaFixedWindowObservationV1;
  const prior7 = byWindow.get("PRIOR_7D") as MetaFixedWindowObservationV1;
  const current14 = byWindow.get("CURRENT_14D") as MetaFixedWindowObservationV1;
  const prior14 = byWindow.get("PRIOR_14D") as MetaFixedWindowObservationV1;

  const current7Start = parseDateOnly(current7.range.startDate);
  const prior7End = parseDateOnly(prior7.range.endDate);
  const current14Start = parseDateOnly(current14.range.startDate);
  const prior14End = parseDateOnly(prior14.range.endDate);
  if (
    inclusiveDays(current7.range) !== 7 ||
    inclusiveDays(prior7.range) !== 7 ||
    inclusiveDays(current14.range) !== 14 ||
    inclusiveDays(prior14.range) !== 14 ||
    current7Start - prior7End !== DAY_MS ||
    current14Start - prior14End !== DAY_MS ||
    current7.range.endDate !== current14.range.endDate
  ) {
    return emptyResult(input, "VERIFY_EVIDENCE", "FIXED_WINDOWS_NOT_COMPARABLE", [
      "Each comparison pair must use adjacent non-overlapping fixed windows of the declared duration, and current windows must share one end date."
    ]);
  }

  const generatedAt = Date.parse(input.generatedAt);
  const maximumAgeMs = input.maximumEvidenceAgeHours * 60 * 60 * 1000;
  const evidenceProblems: string[] = [];
  for (const observation of observations) {
    const observedAt = Date.parse(observation.observedAt);
    const completeThrough = observation.completeThrough === null
      ? Number.NaN
      : parseDateOnly(observation.completeThrough);
    const end = parseDateOnly(observation.range.endDate);
    if (observation.truthState !== "COMPLETE") {
      evidenceProblems.push(`${observation.window} truth is ${observation.truthState}, not COMPLETE.`);
    }
    if (observation.value === null) {
      evidenceProblems.push(`${observation.window} has no observed metric value.`);
    }
    if (observedAt > generatedAt) {
      evidenceProblems.push(`${observation.window} evidence is future-dated.`);
    } else if (generatedAt - observedAt > maximumAgeMs) {
      evidenceProblems.push(`${observation.window} evidence exceeds the freshness ceiling.`);
    }
    if (!Number.isFinite(completeThrough) || completeThrough < end) {
      evidenceProblems.push(`${observation.window} is not complete through its requested end date.`);
    }
  }
  if (evidenceProblems.length > 0) {
    return emptyResult(input, "VERIFY_EVIDENCE", "SOURCE_EVIDENCE_NOT_DECISION_GRADE", evidenceProblems);
  }

  const comparisons = [
    compare(current7, prior7, input.direction, input.materialChangeRatio),
    compare(current14, prior14, input.direction, input.materialChangeRatio)
  ];
  const shortDirection = comparisons[0].direction;
  const longDirection = comparisons[1].direction;
  let signal: NonNullable<MetaFixedWindowAuditV1["signal"]> = "MIXED_OR_NO_MATERIAL_PATTERN";
  if (shortDirection === "DETERIORATION" && longDirection === "DETERIORATION") {
    signal = "CONSISTENT_DETERIORATION";
  } else if (shortDirection === "DETERIORATION" && longDirection !== "DETERIORATION") {
    signal = "SHORT_WINDOW_ONLY_DETERIORATION";
  } else if (shortDirection === "IMPROVEMENT" && longDirection === "IMPROVEMENT") {
    signal = "CONSISTENT_IMPROVEMENT";
  }

  const evidenceRefs = [...new Set(observations.flatMap((observation) => observation.evidenceRefs))].sort();
  const limitations = [
    "Fixed-window movement is descriptive only. It does not establish why performance changed.",
    "A short-window-only deterioration is a volatility/review signal, not proof of a rolling-window artifact or statistical noise.",
    "No audience, creative, funnel, scaling, pause, budget, revenue-attribution, or causal recommendation is authorized by this contract alone."
  ];

  return deepFreeze({
    version: META_FIXED_WINDOW_AUDIT_VERSION,
    status: "READY",
    reasonCode: "FIXED_WINDOWS_COMPARABLE",
    generatedAt: input.generatedAt,
    level: identity.level,
    scopeId: identity.scopeId,
    metricName: identity.metricName,
    metricDefinitionId: identity.metricDefinitionId,
    signal,
    comparisons,
    evidenceRefs,
    limitations,
    causalityEstablished: false,
    attributionEstablished: false,
    confidenceEstablished: false,
    monetaryImpactEstablished: false,
    externalMutationPerformed: false
  });
}
