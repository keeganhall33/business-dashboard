export const EARLY_PLANNING_WINDOW_V1_VERSION = "EARLY_PLANNING_WINDOW_V1" as const;

export type EarlyPlanningTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED" | "PARTIAL";

export type EarlyPlanningDateRangeEvidenceV1 = {
  state: EarlyPlanningTruthStateV1;
  startDate: string | null;
  endDate: string | null;
  evidenceRefs: readonly string[];
};

export type EarlyPlanningLeadTimeEvidenceV1 = {
  state: EarlyPlanningTruthStateV1;
  minDays: number | null;
  maxDays: number | null;
  evidenceRefs: readonly string[];
};

export type EarlyPlanningCandidateV1 = {
  candidateId: string;
  canonicalOrganizationRef?: string | null;
  canonicalOpportunityRef?: string | null;
  observedAt: string | Date;
  evidenceRefs: readonly string[];
  planningWindow?: EarlyPlanningDateRangeEvidenceV1 | null;
  activationWindow?: EarlyPlanningDateRangeEvidenceV1 | null;
  engagementLeadTimeDays?: EarlyPlanningLeadTimeEvidenceV1 | null;
  productionLeadTimeDays?: EarlyPlanningLeadTimeEvidenceV1 | null;
};

export type EarlyPlanningWindowDerivationV1 =
  | "EXPLICIT_PLANNING_WINDOW"
  | "DERIVED_FROM_ACTIVATION_AND_EVIDENCED_LEAD_TIME";

export type EarlyPlanningDispositionV1 =
  | "PLAN_AHEAD"
  | "WINDOW_OPEN"
  | "MISSED_PLANNING_WINDOW"
  | "NEEDS_RESEARCH"
  | "NEEDS_VERIFICATION"
  | "SUPPRESS";

export type EarlyPlanningCoverageGapV1 =
  | "MISSING_CANONICAL_ANCHOR"
  | "MISSING_EVIDENCE"
  | "PLANNING_WINDOW_UNKNOWN"
  | "ACTIVATION_WINDOW_UNKNOWN"
  | "ENGAGEMENT_LEAD_TIME_UNKNOWN"
  | "TIMING_EVIDENCE_INFERRED_OR_PARTIAL"
  | "TIMING_EVIDENCE_STALE"
  | "TIMING_EVIDENCE_CONFLICTED";

export type EarlyPlanningSafeNextStepV1 =
  | "MONITOR_AND_PREPARE_INTERNAL_BRIEF"
  | "PREPARE_APPROVAL_READY_OUTREACH"
  | "REVIEW_MISSED_WINDOW_AND_FIND_NEXT_CYCLE"
  | "RESEARCH_PLANNING_WINDOW_OR_LEAD_TIME"
  | "VERIFY_TIMING_EVIDENCE"
  | "RESOLVE_CANONICAL_ANCHOR_OR_EVIDENCE";

export type EarlyPlanningWindowV1 = Readonly<{
  startDate: string;
  endDate: string;
}>;

export type EarlyPlanningDecisionV1 = Readonly<{
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  disposition: EarlyPlanningDispositionV1;
  derivation: EarlyPlanningWindowDerivationV1 | null;
  idealOutreachDateRange: EarlyPlanningWindowV1 | null;
  activationDateRange: EarlyPlanningWindowV1 | null;
  productionStartDateRange: EarlyPlanningWindowV1 | null;
  whyThisWindow: string;
  coverageGaps: readonly EarlyPlanningCoverageGapV1[];
  reasonCodes: readonly string[];
  safeNextStep: EarlyPlanningSafeNextStepV1;
  observedAt: string;
  evidenceRefs: readonly string[];
}>;

export type EarlyPlanningWindowInputV1 = {
  candidates: readonly EarlyPlanningCandidateV1[];
  now: string | Date;
  maximumEvidenceAgeDays?: number;
};

export type EarlyPlanningWindowResultV1 = Readonly<{
  version: typeof EARLY_PLANNING_WINDOW_V1_VERSION;
  generatedAt: string;
  decisions: readonly EarlyPlanningDecisionV1[];
  counts: Readonly<{
    reviewed: number;
    planAhead: number;
    windowOpen: number;
    missedPlanningWindow: number;
    needsResearch: number;
    needsVerification: number;
    suppressed: number;
  }>;
  externalResearchPerformed: false;
  crmMutationPerformed: false;
  outreachPerformed: false;
  externalActionAuthorized: false;
}>;

const DAY_MS = 86_400_000;
const MAX_CANDIDATES = 500;
const DEFAULT_MAX_EVIDENCE_AGE_DAYS = 180;

const TRUTH_STATES = new Set<EarlyPlanningTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);

const GAP_ORDER: readonly EarlyPlanningCoverageGapV1[] = [
  "MISSING_CANONICAL_ANCHOR",
  "MISSING_EVIDENCE",
  "TIMING_EVIDENCE_CONFLICTED",
  "TIMING_EVIDENCE_STALE",
  "TIMING_EVIDENCE_INFERRED_OR_PARTIAL",
  "PLANNING_WINDOW_UNKNOWN",
  "ACTIVATION_WINDOW_UNKNOWN",
  "ENGAGEMENT_LEAD_TIME_UNKNOWN"
];

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function timestamp(value: string | Date, label: string): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function refs(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return Object.freeze(
    [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) => a.localeCompare(b))
  );
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function truthState(value: unknown, label: string): EarlyPlanningTruthStateV1 {
  if (typeof value !== "string" || !TRUTH_STATES.has(value as EarlyPlanningTruthStateV1)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as EarlyPlanningTruthStateV1;
}

function normalizeDateRange(
  field: EarlyPlanningDateRangeEvidenceV1 | null | undefined,
  label: string
): Readonly<EarlyPlanningDateRangeEvidenceV1> | null {
  if (field == null) return null;
  if (typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);

  const state = truthState(field.state, `${label}.state`);
  const evidenceRefs = refs(field.evidenceRefs, `${label}.evidenceRefs`);
  const hasStart = field.startDate != null;
  const hasEnd = field.endDate != null;
  if (hasStart !== hasEnd) throw new Error(`${label} must provide both startDate and endDate or neither`);
  if (state === "KNOWN" && !hasStart) throw new Error(`${label} KNOWN state requires a complete date range`);
  if (state === "KNOWN" && evidenceRefs.length === 0) throw new Error(`${label} KNOWN state requires evidenceRefs`);

  if (!hasStart) {
    return freezeDeep({ state, startDate: null, endDate: null, evidenceRefs: [...evidenceRefs] });
  }

  const startDate = timestamp(field.startDate as string, `${label}.startDate`);
  const endDate = timestamp(field.endDate as string, `${label}.endDate`);
  if (Date.parse(startDate) > Date.parse(endDate)) throw new Error(`${label}.startDate must be on or before endDate`);
  return freezeDeep({ state, startDate, endDate, evidenceRefs: [...evidenceRefs] });
}

function normalizeLeadTime(
  field: EarlyPlanningLeadTimeEvidenceV1 | null | undefined,
  label: string
): Readonly<EarlyPlanningLeadTimeEvidenceV1> | null {
  if (field == null) return null;
  if (typeof field !== "object" || Array.isArray(field)) throw new Error(`${label} must be an object`);

  const state = truthState(field.state, `${label}.state`);
  const evidenceRefs = refs(field.evidenceRefs, `${label}.evidenceRefs`);
  const hasMin = field.minDays != null;
  const hasMax = field.maxDays != null;
  if (hasMin !== hasMax) throw new Error(`${label} must provide both minDays and maxDays or neither`);
  if (state === "KNOWN" && !hasMin) throw new Error(`${label} KNOWN state requires a complete lead-time range`);
  if (state === "KNOWN" && evidenceRefs.length === 0) throw new Error(`${label} KNOWN state requires evidenceRefs`);

  if (!hasMin) return freezeDeep({ state, minDays: null, maxDays: null, evidenceRefs: [...evidenceRefs] });

  const minDays = field.minDays as number;
  const maxDays = field.maxDays as number;
  if (!Number.isInteger(minDays) || !Number.isInteger(maxDays) || minDays < 0 || maxDays < minDays) {
    throw new Error(`${label} must use non-negative integer days with minDays <= maxDays`);
  }
  return freezeDeep({ state, minDays, maxDays, evidenceRefs: [...evidenceRefs] });
}

function toWindow(field: Readonly<EarlyPlanningDateRangeEvidenceV1> | null): EarlyPlanningWindowV1 | null {
  if (!field?.startDate || !field.endDate) return null;
  return freezeDeep({ startDate: field.startDate, endDate: field.endDate });
}

function deriveWindow(anchorStartDate: string, lead: Readonly<EarlyPlanningLeadTimeEvidenceV1>): EarlyPlanningWindowV1 {
  if (lead.minDays == null || lead.maxDays == null) throw new Error("lead-time range is incomplete");
  const anchorMs = Date.parse(anchorStartDate);
  return freezeDeep({
    startDate: new Date(anchorMs - lead.maxDays * DAY_MS).toISOString(),
    endDate: new Date(anchorMs - lead.minDays * DAY_MS).toISOString()
  });
}

function weakTruthGap(state: EarlyPlanningTruthStateV1): EarlyPlanningCoverageGapV1 | null {
  if (state === "CONFLICTED") return "TIMING_EVIDENCE_CONFLICTED";
  if (state === "STALE") return "TIMING_EVIDENCE_STALE";
  if (state === "INFERRED" || state === "PARTIAL") return "TIMING_EVIDENCE_INFERRED_OR_PARTIAL";
  return null;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function windowDisposition(window: EarlyPlanningWindowV1, nowMs: number): EarlyPlanningDispositionV1 {
  const start = Date.parse(window.startDate);
  const end = Date.parse(window.endDate);
  if (nowMs < start) return "PLAN_AHEAD";
  if (nowMs <= end) return "WINDOW_OPEN";
  return "MISSED_PLANNING_WINDOW";
}

function safeNextStep(disposition: EarlyPlanningDispositionV1): EarlyPlanningSafeNextStepV1 {
  if (disposition === "PLAN_AHEAD") return "MONITOR_AND_PREPARE_INTERNAL_BRIEF";
  if (disposition === "WINDOW_OPEN") return "PREPARE_APPROVAL_READY_OUTREACH";
  if (disposition === "MISSED_PLANNING_WINDOW") return "REVIEW_MISSED_WINDOW_AND_FIND_NEXT_CYCLE";
  if (disposition === "NEEDS_RESEARCH") return "RESEARCH_PLANNING_WINDOW_OR_LEAD_TIME";
  if (disposition === "NEEDS_VERIFICATION") return "VERIFY_TIMING_EVIDENCE";
  return "RESOLVE_CANONICAL_ANCHOR_OR_EVIDENCE";
}

type NormalizedCandidate = {
  candidateId: string;
  canonicalOrganizationRef: string | null;
  canonicalOpportunityRef: string | null;
  observedAt: string;
  observedAtMs: number;
  evidenceRefs: readonly string[];
  planningWindow: Readonly<EarlyPlanningDateRangeEvidenceV1> | null;
  activationWindow: Readonly<EarlyPlanningDateRangeEvidenceV1> | null;
  engagementLeadTimeDays: Readonly<EarlyPlanningLeadTimeEvidenceV1> | null;
  productionLeadTimeDays: Readonly<EarlyPlanningLeadTimeEvidenceV1> | null;
};

function normalizeCandidate(candidate: EarlyPlanningCandidateV1, index: number, nowMs: number): NormalizedCandidate {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error(`candidate ${index} must be an object`);
  const observedAt = timestamp(candidate.observedAt, `candidate ${index}.observedAt`);
  const observedAtMs = Date.parse(observedAt);
  if (observedAtMs > nowMs) throw new Error(`candidate ${index}.observedAt must not be future-dated`);

  return {
    candidateId: requiredText(candidate.candidateId, `candidate ${index}.candidateId`),
    canonicalOrganizationRef: optionalText(candidate.canonicalOrganizationRef, `candidate ${index}.canonicalOrganizationRef`),
    canonicalOpportunityRef: optionalText(candidate.canonicalOpportunityRef, `candidate ${index}.canonicalOpportunityRef`),
    observedAt,
    observedAtMs,
    evidenceRefs: refs(candidate.evidenceRefs, `candidate ${index}.evidenceRefs`),
    planningWindow: normalizeDateRange(candidate.planningWindow, `candidate ${index}.planningWindow`),
    activationWindow: normalizeDateRange(candidate.activationWindow, `candidate ${index}.activationWindow`),
    engagementLeadTimeDays: normalizeLeadTime(candidate.engagementLeadTimeDays, `candidate ${index}.engagementLeadTimeDays`),
    productionLeadTimeDays: normalizeLeadTime(candidate.productionLeadTimeDays, `candidate ${index}.productionLeadTimeDays`)
  };
}

function criticalTruthGaps(candidate: NormalizedCandidate): EarlyPlanningCoverageGapV1[] {
  const gaps = new Set<EarlyPlanningCoverageGapV1>();
  const planning = candidate.planningWindow;

  if (planning && planning.state !== "UNKNOWN") {
    const gap = weakTruthGap(planning.state);
    if (gap) gaps.add(gap);
    return GAP_ORDER.filter((item) => gaps.has(item));
  }

  for (const field of [candidate.activationWindow, candidate.engagementLeadTimeDays] as const) {
    if (!field || field.state === "UNKNOWN") continue;
    const gap = weakTruthGap(field.state);
    if (gap) gaps.add(gap);
  }
  return GAP_ORDER.filter((item) => gaps.has(item));
}

function buildDecision(candidate: NormalizedCandidate, nowMs: number, maximumEvidenceAgeDays: number): EarlyPlanningDecisionV1 {
  const gaps = new Set<EarlyPlanningCoverageGapV1>();
  const hasCanonicalAnchor = Boolean(candidate.canonicalOrganizationRef || candidate.canonicalOpportunityRef);
  if (!hasCanonicalAnchor) gaps.add("MISSING_CANONICAL_ANCHOR");
  if (candidate.evidenceRefs.length === 0) gaps.add("MISSING_EVIDENCE");
  if (nowMs - candidate.observedAtMs > maximumEvidenceAgeDays * DAY_MS) gaps.add("TIMING_EVIDENCE_STALE");
  for (const gap of criticalTruthGaps(candidate)) gaps.add(gap);

  let derivation: EarlyPlanningWindowDerivationV1 | null = null;
  let idealOutreachDateRange: EarlyPlanningWindowV1 | null = null;
  let whyThisWindow = "No evidence-backed planning window is currently available.";

  if (candidate.planningWindow?.state === "KNOWN" && candidate.planningWindow.startDate && candidate.planningWindow.endDate) {
    derivation = "EXPLICIT_PLANNING_WINDOW";
    idealOutreachDateRange = toWindow(candidate.planningWindow);
    whyThisWindow = "Uses the explicit evidence-backed planning window; event or season timing is not substituted for planning timing.";
  } else if (
    (!candidate.planningWindow || candidate.planningWindow.state === "UNKNOWN") &&
    candidate.activationWindow?.state === "KNOWN" &&
    candidate.activationWindow.startDate &&
    candidate.engagementLeadTimeDays?.state === "KNOWN"
  ) {
    derivation = "DERIVED_FROM_ACTIVATION_AND_EVIDENCED_LEAD_TIME";
    idealOutreachDateRange = deriveWindow(candidate.activationWindow.startDate, candidate.engagementLeadTimeDays);
    whyThisWindow =
      "Derived by subtracting the evidenced engagement lead-time range from the evidenced activation start date; the activation date alone is not treated as the planning window.";
  }

  if (!idealOutreachDateRange) {
    if (!candidate.planningWindow || candidate.planningWindow.state === "UNKNOWN") gaps.add("PLANNING_WINDOW_UNKNOWN");
    if (!candidate.activationWindow || candidate.activationWindow.state === "UNKNOWN" || !candidate.activationWindow.startDate) {
      gaps.add("ACTIVATION_WINDOW_UNKNOWN");
    }
    if (!candidate.engagementLeadTimeDays || candidate.engagementLeadTimeDays.state === "UNKNOWN" || candidate.engagementLeadTimeDays.minDays == null) {
      gaps.add("ENGAGEMENT_LEAD_TIME_UNKNOWN");
    }
  }

  const activationDateRange = toWindow(candidate.activationWindow);
  const productionStartDateRange =
    candidate.activationWindow?.state === "KNOWN" &&
    candidate.activationWindow.startDate &&
    candidate.productionLeadTimeDays?.state === "KNOWN"
      ? deriveWindow(candidate.activationWindow.startDate, candidate.productionLeadTimeDays)
      : null;

  let disposition: EarlyPlanningDispositionV1;
  if (gaps.has("MISSING_CANONICAL_ANCHOR") || gaps.has("MISSING_EVIDENCE")) {
    disposition = "SUPPRESS";
  } else if (
    gaps.has("TIMING_EVIDENCE_CONFLICTED") ||
    gaps.has("TIMING_EVIDENCE_STALE") ||
    gaps.has("TIMING_EVIDENCE_INFERRED_OR_PARTIAL")
  ) {
    disposition = "NEEDS_VERIFICATION";
  } else if (!idealOutreachDateRange) {
    disposition = "NEEDS_RESEARCH";
  } else {
    disposition = windowDisposition(idealOutreachDateRange, nowMs);
  }

  const coverageGaps = GAP_ORDER.filter((gap) => gaps.has(gap));
  const reasonCodes =
    disposition === "PLAN_AHEAD"
      ? ["EVIDENCE_BACKED_OUTREACH_WINDOW_IS_UPCOMING"]
      : disposition === "WINDOW_OPEN"
        ? ["EVIDENCE_BACKED_OUTREACH_WINDOW_IS_OPEN"]
        : disposition === "MISSED_PLANNING_WINDOW"
          ? ["EVIDENCE_BACKED_OUTREACH_WINDOW_HAS_PASSED"]
          : coverageGaps.length > 0
            ? coverageGaps
            : ["NO_TIMING_DECISION_REASON_AVAILABLE"];

  const allEvidenceRefs = uniqueSorted([
    ...candidate.evidenceRefs,
    ...(candidate.planningWindow?.evidenceRefs ?? []),
    ...(candidate.activationWindow?.evidenceRefs ?? []),
    ...(candidate.engagementLeadTimeDays?.evidenceRefs ?? []),
    ...(candidate.productionLeadTimeDays?.evidenceRefs ?? [])
  ]);

  return freezeDeep({
    candidateId: candidate.candidateId,
    canonicalOrganizationRef: candidate.canonicalOrganizationRef,
    canonicalOpportunityRef: candidate.canonicalOpportunityRef,
    disposition,
    derivation,
    idealOutreachDateRange,
    activationDateRange,
    productionStartDateRange,
    whyThisWindow,
    coverageGaps,
    reasonCodes,
    safeNextStep: safeNextStep(disposition),
    observedAt: candidate.observedAt,
    evidenceRefs: allEvidenceRefs
  });
}

export function evaluateEarlyPlanningWindowsV1(input: EarlyPlanningWindowInputV1): EarlyPlanningWindowResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  if (input.candidates.length > MAX_CANDIDATES) throw new Error(`candidates exceeds ${MAX_CANDIDATES}`);

  const generatedAt = timestamp(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const maximumEvidenceAgeDays = boundedInteger(
    input.maximumEvidenceAgeDays,
    DEFAULT_MAX_EVIDENCE_AGE_DAYS,
    1,
    3650,
    "maximumEvidenceAgeDays"
  );

  const ids = new Set<string>();
  const decisions = input.candidates.map((candidate, index) => {
    const normalized = normalizeCandidate(candidate, index, nowMs);
    if (ids.has(normalized.candidateId)) throw new Error(`duplicate candidateId: ${normalized.candidateId}`);
    ids.add(normalized.candidateId);
    return buildDecision(normalized, nowMs, maximumEvidenceAgeDays);
  });

  decisions.sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  const counts = {
    reviewed: decisions.length,
    planAhead: decisions.filter((item) => item.disposition === "PLAN_AHEAD").length,
    windowOpen: decisions.filter((item) => item.disposition === "WINDOW_OPEN").length,
    missedPlanningWindow: decisions.filter((item) => item.disposition === "MISSED_PLANNING_WINDOW").length,
    needsResearch: decisions.filter((item) => item.disposition === "NEEDS_RESEARCH").length,
    needsVerification: decisions.filter((item) => item.disposition === "NEEDS_VERIFICATION").length,
    suppressed: decisions.filter((item) => item.disposition === "SUPPRESS").length
  };

  return freezeDeep({
    version: EARLY_PLANNING_WINDOW_V1_VERSION,
    generatedAt,
    decisions,
    counts,
    externalResearchPerformed: false,
    crmMutationPerformed: false,
    outreachPerformed: false,
    externalActionAuthorized: false
  });
}
