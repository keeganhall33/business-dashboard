export const OPPORTUNITY_RADAR_PRECISION_REVIEW_VERSION =
  "OPPORTUNITY_RADAR_PRECISION_REVIEW_V1" as const;

export const MAX_OPPORTUNITY_RADAR_REVIEW_CANDIDATES = 500;
export const MAX_SURFACED_OPPORTUNITIES = 5;

export type OpportunityRadarTruthStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type OpportunityRadarEvidenceFieldV1<T> = {
  state: OpportunityRadarTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
};

export type OpportunityRadarPrecisionCandidateV1 = {
  candidateId: string;
  title: string;
  observedAt: string | Date;
  sourceRefs: readonly string[];
  syndicationKey?: string | null;
  planningHorizonMonths: OpportunityRadarEvidenceFieldV1<number>;
  keeganFit: OpportunityRadarEvidenceFieldV1<string>;
  buyerOrFunction: OpportunityRadarEvidenceFieldV1<string>;
  differentiatedThesis: OpportunityRadarEvidenceFieldV1<string>;
  accessPath: OpportunityRadarEvidenceFieldV1<string>;
  safeNextMove: OpportunityRadarEvidenceFieldV1<string>;
};

export type OpportunityRadarPrecisionReviewInputV1 = {
  candidates: readonly OpportunityRadarPrecisionCandidateV1[];
  now: string | Date;
  minimumRunwayMonths?: number;
  maximumEvidenceAgeDays?: number;
  maximumSurfaced?: number;
};

export type OpportunityRadarSuppressionReasonV1 =
  | "CONFLICTED_EVIDENCE"
  | "STALE_EVIDENCE"
  | "UNKNOWN_EVIDENCE"
  | "INFERRED_EVIDENCE_REQUIRES_VERIFICATION"
  | "INSUFFICIENT_PLANNING_RUNWAY"
  | "KEEGAN_FIT_UNPROVEN"
  | "BUYER_OR_FUNCTION_UNPROVEN"
  | "GENERIC_THESIS"
  | "ACCESS_PATH_MISSING"
  | "SAFE_NEXT_MOVE_MISSING"
  | "DUPLICATE_EVIDENCE"
  | "SURFACE_LIMIT_REACHED";

export type OpportunityRadarQualifiedDecisionV1 = {
  status: "QUALIFIED";
  reasonCode: "PRECISION_CRITERIA_MET";
  candidate: Readonly<{
    candidateId: string;
    title: string;
    observedAt: string;
    planningHorizonMonths: number;
    keeganFit: string;
    buyerOrFunction: string;
    differentiatedThesis: string;
    accessPath: string;
    safeNextMove: string;
    sourceRefs: readonly string[];
  }>;
};

export type OpportunityRadarSuppressedDecisionV1 = {
  status: "SUPPRESSED";
  candidateId: string;
  title: string;
  reasonCodes: readonly OpportunityRadarSuppressionReasonV1[];
  duplicateOfCandidateId: string | null;
  evidenceStates: Readonly<{
    planningHorizonMonths: OpportunityRadarTruthStateV1;
    keeganFit: OpportunityRadarTruthStateV1;
    buyerOrFunction: OpportunityRadarTruthStateV1;
    differentiatedThesis: OpportunityRadarTruthStateV1;
    accessPath: OpportunityRadarTruthStateV1;
    safeNextMove: OpportunityRadarTruthStateV1;
  }>;
  sourceRefs: readonly string[];
};

export type OpportunityRadarPrecisionReviewResultV1 = {
  version: typeof OPPORTUNITY_RADAR_PRECISION_REVIEW_VERSION;
  generatedAt: string;
  qualified: readonly Readonly<OpportunityRadarQualifiedDecisionV1>[];
  suppressed: readonly Readonly<OpportunityRadarSuppressedDecisionV1>[];
  counts: Readonly<{
    reviewed: number;
    qualified: number;
    suppressed: number;
  }>;
  externalMutationPerformed: false;
};

type NormalizedField<T> = {
  state: OpportunityRadarTruthStateV1;
  value: T | null;
  evidenceRefs: readonly string[];
};

type NormalizedCandidate = {
  candidateId: string;
  title: string;
  observedAt: string;
  observedAtMs: number;
  sourceRefs: readonly string[];
  dedupKey: string;
  planningHorizonMonths: NormalizedField<number>;
  keeganFit: NormalizedField<string>;
  buyerOrFunction: NormalizedField<string>;
  differentiatedThesis: NormalizedField<string>;
  accessPath: NormalizedField<string>;
  safeNextMove: NormalizedField<string>;
};

const DAY_MS = 86_400_000;
const INPUT_KEYS = new Set([
  "candidates",
  "now",
  "minimumRunwayMonths",
  "maximumEvidenceAgeDays",
  "maximumSurfaced"
]);
const CANDIDATE_KEYS = new Set([
  "candidateId",
  "title",
  "observedAt",
  "sourceRefs",
  "syndicationKey",
  "planningHorizonMonths",
  "keeganFit",
  "buyerOrFunction",
  "differentiatedThesis",
  "accessPath",
  "safeNextMove"
]);
const FIELD_KEYS = new Set(["state", "value", "evidenceRefs"]);
const TRUTH_STATES = new Set<OpportunityRadarTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED"
]);
const REASON_ORDER: readonly OpportunityRadarSuppressionReasonV1[] = [
  "CONFLICTED_EVIDENCE",
  "STALE_EVIDENCE",
  "UNKNOWN_EVIDENCE",
  "INFERRED_EVIDENCE_REQUIRES_VERIFICATION",
  "INSUFFICIENT_PLANNING_RUNWAY",
  "KEEGAN_FIT_UNPROVEN",
  "BUYER_OR_FUNCTION_UNPROVEN",
  "GENERIC_THESIS",
  "ACCESS_PATH_MISSING",
  "SAFE_NEXT_MOVE_MISSING",
  "DUPLICATE_EVIDENCE",
  "SURFACE_LIMIT_REACHED"
];

function isObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (!isObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const result = value == null ? fallback : value;
  if (typeof result !== "number" || !Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return result;
}

function normalizeRefs(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(
    [...new Set(value.map((ref, index) => requiredText(ref, `${label}[${index}]`)))].sort((a, b) =>
      a.localeCompare(b)
    )
  );
}

function normalizeField<T extends string | number>(
  value: unknown,
  label: string,
  type: "string" | "number"
): NormalizedField<T> {
  assertKeys(value, FIELD_KEYS, label);
  const field = value as OpportunityRadarEvidenceFieldV1<T>;
  if (!TRUTH_STATES.has(field.state)) throw new Error(`${label}.state is unsupported`);
  let normalizedValue: T | null = null;
  if (field.value != null) {
    if (type === "string") normalizedValue = requiredText(field.value, `${label}.value`) as T;
    else {
      if (typeof field.value !== "number" || !Number.isFinite(field.value) || field.value < 0) {
        throw new Error(`${label}.value must be a non-negative finite number or null`);
      }
      normalizedValue = field.value as T;
    }
  }
  const evidenceRefs = normalizeRefs(field.evidenceRefs, `${label}.evidenceRefs`);
  return Object.freeze({ state: field.state, value: normalizedValue, evidenceRefs });
}

function normalizeTitleKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function frozen<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) frozen(child);
  }
  return Object.freeze(value);
}

function normalizeCandidate(
  candidate: OpportunityRadarPrecisionCandidateV1,
  index: number,
  nowMs: number
): NormalizedCandidate {
  const label = `candidate ${index}`;
  assertKeys(candidate, CANDIDATE_KEYS, label);
  const candidateId = requiredText(candidate.candidateId, `${label}.candidateId`);
  const title = requiredText(candidate.title, `${label}.title`);
  const observedAt = timestamp(candidate.observedAt, `${label}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`${label}.observedAt must not be future-dated`);
  const syndicationKey = optionalText(candidate.syndicationKey, `${label}.syndicationKey`);

  return {
    candidateId,
    title,
    observedAt,
    observedAtMs,
    sourceRefs: normalizeRefs(candidate.sourceRefs, `${label}.sourceRefs`),
    dedupKey: syndicationKey ? `story:${syndicationKey.toLocaleLowerCase("en-US")}` : `title:${normalizeTitleKey(title)}`,
    planningHorizonMonths: normalizeField<number>(candidate.planningHorizonMonths, `${label}.planningHorizonMonths`, "number"),
    keeganFit: normalizeField<string>(candidate.keeganFit, `${label}.keeganFit`, "string"),
    buyerOrFunction: normalizeField<string>(candidate.buyerOrFunction, `${label}.buyerOrFunction`, "string"),
    differentiatedThesis: normalizeField<string>(candidate.differentiatedThesis, `${label}.differentiatedThesis`, "string"),
    accessPath: normalizeField<string>(candidate.accessPath, `${label}.accessPath`, "string"),
    safeNextMove: normalizeField<string>(candidate.safeNextMove, `${label}.safeNextMove`, "string")
  };
}

function fields(candidate: NormalizedCandidate): readonly NormalizedField<string | number>[] {
  return [
    candidate.planningHorizonMonths,
    candidate.keeganFit,
    candidate.buyerOrFunction,
    candidate.differentiatedThesis,
    candidate.accessPath,
    candidate.safeNextMove
  ];
}

function nonGeneric(value: string | null, minimumLength = 12): boolean {
  return Boolean(value && value.trim().length >= minimumLength);
}

function suppressionReasons(
  candidate: NormalizedCandidate,
  nowMs: number,
  minimumRunwayMonths: number,
  maximumEvidenceAgeDays: number
): OpportunityRadarSuppressionReasonV1[] {
  const candidateFields = fields(candidate);
  const reasons = new Set<OpportunityRadarSuppressionReasonV1>();

  if (candidateFields.some((field) => field.state === "CONFLICTED")) reasons.add("CONFLICTED_EVIDENCE");
  if (
    candidateFields.some((field) => field.state === "STALE") ||
    nowMs - candidate.observedAtMs > maximumEvidenceAgeDays * DAY_MS
  ) {
    reasons.add("STALE_EVIDENCE");
  }
  if (candidateFields.some((field) => field.state === "UNKNOWN")) reasons.add("UNKNOWN_EVIDENCE");
  if (candidateFields.some((field) => field.state === "INFERRED")) {
    reasons.add("INFERRED_EVIDENCE_REQUIRES_VERIFICATION");
  }
  if (
    candidate.planningHorizonMonths.value == null ||
    candidate.planningHorizonMonths.value < minimumRunwayMonths
  ) {
    reasons.add("INSUFFICIENT_PLANNING_RUNWAY");
  }
  if (!nonGeneric(candidate.keeganFit.value)) reasons.add("KEEGAN_FIT_UNPROVEN");
  if (!nonGeneric(candidate.buyerOrFunction.value, 5)) reasons.add("BUYER_OR_FUNCTION_UNPROVEN");
  if (!nonGeneric(candidate.differentiatedThesis.value)) reasons.add("GENERIC_THESIS");
  if (!nonGeneric(candidate.accessPath.value, 5)) reasons.add("ACCESS_PATH_MISSING");
  if (!nonGeneric(candidate.safeNextMove.value, 5)) reasons.add("SAFE_NEXT_MOVE_MISSING");

  return REASON_ORDER.filter((reason) => reasons.has(reason));
}

function completeness(candidate: NormalizedCandidate): number {
  return fields(candidate).reduce((score, field) => score + (field.state === "KNOWN" && field.value != null ? 1 : 0), 0);
}

function evidenceStates(candidate: NormalizedCandidate) {
  return {
    planningHorizonMonths: candidate.planningHorizonMonths.state,
    keeganFit: candidate.keeganFit.state,
    buyerOrFunction: candidate.buyerOrFunction.state,
    differentiatedThesis: candidate.differentiatedThesis.state,
    accessPath: candidate.accessPath.state,
    safeNextMove: candidate.safeNextMove.state
  } as const;
}

function suppressedDecision(
  candidate: NormalizedCandidate,
  reasonCodes: readonly OpportunityRadarSuppressionReasonV1[],
  duplicateOfCandidateId: string | null = null
): OpportunityRadarSuppressedDecisionV1 {
  return frozen({
    status: "SUPPRESSED" as const,
    candidateId: candidate.candidateId,
    title: candidate.title,
    reasonCodes: [...reasonCodes],
    duplicateOfCandidateId,
    evidenceStates: evidenceStates(candidate),
    sourceRefs: [...candidate.sourceRefs]
  });
}

function qualifiedDecision(candidate: NormalizedCandidate): OpportunityRadarQualifiedDecisionV1 {
  return frozen({
    status: "QUALIFIED" as const,
    reasonCode: "PRECISION_CRITERIA_MET" as const,
    candidate: {
      candidateId: candidate.candidateId,
      title: candidate.title,
      observedAt: candidate.observedAt,
      planningHorizonMonths: candidate.planningHorizonMonths.value as number,
      keeganFit: candidate.keeganFit.value as string,
      buyerOrFunction: candidate.buyerOrFunction.value as string,
      differentiatedThesis: candidate.differentiatedThesis.value as string,
      accessPath: candidate.accessPath.value as string,
      safeNextMove: candidate.safeNextMove.value as string,
      sourceRefs: [...candidate.sourceRefs]
    }
  });
}

export function reviewOpportunityRadarPrecisionV1(
  input: OpportunityRadarPrecisionReviewInputV1
): OpportunityRadarPrecisionReviewResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > MAX_OPPORTUNITY_RADAR_REVIEW_CANDIDATES) {
    throw new Error(`candidates exceeds ${MAX_OPPORTUNITY_RADAR_REVIEW_CANDIDATES}`);
  }

  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const minimumRunwayMonths = boundedInteger(input.minimumRunwayMonths, 3, 1, 60, "minimumRunwayMonths");
  const maximumEvidenceAgeDays = boundedInteger(input.maximumEvidenceAgeDays, 90, 1, 365, "maximumEvidenceAgeDays");
  const maximumSurfaced = boundedInteger(
    input.maximumSurfaced,
    MAX_SURFACED_OPPORTUNITIES,
    1,
    MAX_SURFACED_OPPORTUNITIES,
    "maximumSurfaced"
  );

  const normalized = input.candidates.map((candidate, index) => normalizeCandidate(candidate, index, nowMs));
  const candidateIds = normalized.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error("candidates contains duplicate candidateId values");

  const groups = new Map<string, NormalizedCandidate[]>();
  for (const candidate of normalized) {
    const group = groups.get(candidate.dedupKey) ?? [];
    group.push(candidate);
    groups.set(candidate.dedupKey, group);
  }

  const suppressed: OpportunityRadarSuppressedDecisionV1[] = [];
  const eligible: NormalizedCandidate[] = [];

  for (const group of [...groups.values()].sort((a, b) => a[0].dedupKey.localeCompare(b[0].dedupKey))) {
    const ranked = [...group].sort((a, b) => {
      const qualityDifference = completeness(b) - completeness(a);
      if (qualityDifference) return qualityDifference;
      const freshnessDifference = b.observedAtMs - a.observedAtMs;
      if (freshnessDifference) return freshnessDifference;
      return a.candidateId.localeCompare(b.candidateId);
    });
    const representative = ranked[0];
    const reasons = suppressionReasons(representative, nowMs, minimumRunwayMonths, maximumEvidenceAgeDays);
    if (reasons.length) suppressed.push(suppressedDecision(representative, reasons));
    else eligible.push(representative);

    for (const duplicate of ranked.slice(1)) {
      suppressed.push(suppressedDecision(duplicate, ["DUPLICATE_EVIDENCE"], representative.candidateId));
    }
  }

  eligible.sort((a, b) => {
    const runwayDifference =
      (a.planningHorizonMonths.value as number) - (b.planningHorizonMonths.value as number);
    if (runwayDifference) return runwayDifference;
    const freshnessDifference = b.observedAtMs - a.observedAtMs;
    if (freshnessDifference) return freshnessDifference;
    return a.candidateId.localeCompare(b.candidateId);
  });

  const qualified = eligible.slice(0, maximumSurfaced).map(qualifiedDecision);
  for (const candidate of eligible.slice(maximumSurfaced)) {
    suppressed.push(suppressedDecision(candidate, ["SURFACE_LIMIT_REACHED"]));
  }

  suppressed.sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  return frozen({
    version: OPPORTUNITY_RADAR_PRECISION_REVIEW_VERSION,
    generatedAt,
    qualified,
    suppressed,
    counts: {
      reviewed: normalized.length,
      qualified: qualified.length,
      suppressed: suppressed.length
    },
    externalMutationPerformed: false as const
  });
}
