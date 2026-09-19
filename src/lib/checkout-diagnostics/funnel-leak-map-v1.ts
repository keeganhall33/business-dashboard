import {
  CHECKOUT_STAGE_ORDER,
  type CheckoutDateRangeV1,
  type CheckoutDiagnosticsViewModelV1,
  type CheckoutStageKey,
} from "./view-model-v1";

export const CHECKOUT_FUNNEL_LEAK_MAP_VERSION = "CHECKOUT_FUNNEL_LEAK_MAP_V1" as const;
export const MATERIAL_CHECKOUT_DROPOFF_RATE = 0.3 as const;

export type CheckoutFunnelLeakSignalV1 =
  | "MATERIAL_CURRENT_DROPOFF"
  | "REGRESSED_VS_PRIOR";

export type CheckoutFunnelLeakMapInputV1 = {
  diagnostics: CheckoutDiagnosticsViewModelV1;
  evidenceRefsByStage: Partial<Record<CheckoutStageKey, readonly string[]>>;
  evaluatedAt: string;
  maxAgeHours: number;
};

export type CheckoutFunnelLeakEntryV1 = {
  rank: number;
  from: CheckoutStageKey;
  to: CheckoutStageKey;
  fromLabel: string;
  toLabel: string;
  currentFromCount: number;
  currentToCount: number;
  priorFromCount: number;
  priorToCount: number;
  currentStepConversion: number;
  priorStepConversion: number;
  conversionDeltaPoints: number;
  currentDropoffRate: number;
  priorDropoffRate: number;
  currentLostCount: number;
  priorLostCount: number;
  signals: readonly CheckoutFunnelLeakSignalV1[];
  observedFacts: readonly string[];
  nextStep: "INVESTIGATE_STAGE_FRICTION" | "MONITOR";
  evidenceRefs: readonly string[];
};

export type CheckoutFunnelLeakMapResultV1 = {
  version: typeof CHECKOUT_FUNNEL_LEAK_MAP_VERSION;
  state: "READY" | "WITHHELD";
  reasonCode:
    | "FUNNEL_LEAK_MAP_READY"
    | "INVALID_INPUT"
    | "DIAGNOSTICS_NOT_READY"
    | "SOURCE_TRUTH_INCOMPLETE"
    | "RANGE_MISMATCH"
    | "STALE_EVIDENCE"
    | "FUTURE_EVIDENCE"
    | "INCOMPLETE_CURRENT_RANGE"
    | "STAGE_EVIDENCE_INCOMPLETE"
    | "EVIDENCE_PROVENANCE_MISSING";
  currentRange: Readonly<CheckoutDateRangeV1>;
  priorRange: Readonly<CheckoutDateRangeV1>;
  entries: readonly CheckoutFunnelLeakEntryV1[];
  evidenceRefs: readonly string[];
  attribution: "NOT_ESTABLISHED";
  monetaryImpact: null;
  confidence: null;
  limitations: readonly string[];
  authority: {
    websiteWriteAllowed: false;
    checkoutWriteAllowed: false;
    metaWriteAllowed: false;
    trackingWriteAllowed: false;
    pricingWriteAllowed: false;
    externalMutationAllowed: false;
    causalClaimAllowed: false;
    revenueAttributionAllowed: false;
  };
};

const SOURCE_KEYS = ["META", "GA4", "FUNNELKIT", "WOO"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validRange(value: unknown): value is CheckoutDateRangeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Partial<CheckoutDateRangeV1>;
  const start = calendarDate(range.startDate);
  const end = calendarDate(range.endDate);
  return start !== null && end !== null && start <= end;
}

function rangeDays(range: CheckoutDateRangeV1): number {
  return ((calendarDate(range.endDate) as number) - (calendarDate(range.startDate) as number)) / DAY_MS + 1;
}

function validIsoInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function finiteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function safeRef(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 240) return false;
  return !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i.test(value);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function points(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function unknownRange(): CheckoutDateRangeV1 {
  return { startDate: "UNKNOWN", endDate: "UNKNOWN" };
}

function withheld(
  input: Partial<CheckoutFunnelLeakMapInputV1>,
  reasonCode: Exclude<CheckoutFunnelLeakMapResultV1["reasonCode"], "FUNNEL_LEAK_MAP_READY">,
): CheckoutFunnelLeakMapResultV1 {
  const diagnostics = input.diagnostics;
  const currentRange = validRange(diagnostics?.currentRange)
    ? { ...diagnostics.currentRange }
    : unknownRange();
  const priorRange = validRange(diagnostics?.priorRange)
    ? { ...diagnostics.priorRange }
    : unknownRange();

  return deepFreeze({
    version: CHECKOUT_FUNNEL_LEAK_MAP_VERSION,
    state: "WITHHELD",
    reasonCode,
    currentRange,
    priorRange,
    entries: [],
    evidenceRefs: [],
    attribution: "NOT_ESTABLISHED",
    monetaryImpact: null,
    confidence: null,
    limitations: [
      "Checkout leak ranking is withheld until complete, fresh, range-matched, evidence-backed diagnostics are available.",
      "Missing, partial, stale, conflicted, or unproven evidence is never converted into zero, confidence, causal attribution, revenue impact, or an optimization claim.",
    ],
    authority: {
      websiteWriteAllowed: false,
      checkoutWriteAllowed: false,
      metaWriteAllowed: false,
      trackingWriteAllowed: false,
      pricingWriteAllowed: false,
      externalMutationAllowed: false,
      causalClaimAllowed: false,
      revenueAttributionAllowed: false,
    },
  });
}

function validComparisonRanges(current: CheckoutDateRangeV1, prior: CheckoutDateRangeV1): boolean {
  if (!validRange(current) || !validRange(prior)) return false;
  if (rangeDays(current) !== rangeDays(prior)) return false;
  const currentStart = calendarDate(current.startDate) as number;
  const priorEnd = calendarDate(prior.endDate) as number;
  return priorEnd + DAY_MS === currentStart;
}

function stageEvidence(
  evidenceRefsByStage: Partial<Record<CheckoutStageKey, readonly string[]>>,
): Record<CheckoutStageKey, readonly string[]> | null {
  const normalized = {} as Record<CheckoutStageKey, readonly string[]>;
  for (const stage of CHECKOUT_STAGE_ORDER) {
    const refs = evidenceRefsByStage[stage];
    if (!Array.isArray(refs) || refs.length === 0 || refs.length > 12 || refs.some((ref) => !safeRef(ref))) return null;
    normalized[stage] = [...new Set(refs.map((ref) => ref.trim()))].sort();
  }
  return normalized;
}

function buildEntries(
  diagnostics: CheckoutDiagnosticsViewModelV1,
  refsByStage: Record<CheckoutStageKey, readonly string[]>,
): CheckoutFunnelLeakEntryV1[] | null {
  if (!Array.isArray(diagnostics.stageRows) || diagnostics.stageRows.length !== CHECKOUT_STAGE_ORDER.length) return null;

  const rows = new Map<CheckoutStageKey, CheckoutDiagnosticsViewModelV1["stageRows"][number]>();
  for (const row of diagnostics.stageRows) {
    if (!CHECKOUT_STAGE_ORDER.includes(row.key) || rows.has(row.key)) return null;
    if (!finiteCount(row.currentCount) || !finiteCount(row.priorCount)) return null;
    rows.set(row.key, row);
  }
  if (rows.size !== CHECKOUT_STAGE_ORDER.length) return null;

  const entries: Omit<CheckoutFunnelLeakEntryV1, "rank">[] = [];
  for (let index = 1; index < CHECKOUT_STAGE_ORDER.length; index += 1) {
    const from = CHECKOUT_STAGE_ORDER[index - 1];
    const to = CHECKOUT_STAGE_ORDER[index];
    const fromRow = rows.get(from);
    const toRow = rows.get(to);
    if (!fromRow || !toRow) return null;

    const currentFromCount = fromRow.currentCount as number;
    const currentToCount = toRow.currentCount as number;
    const priorFromCount = fromRow.priorCount as number;
    const priorToCount = toRow.priorCount as number;
    if (currentToCount > currentFromCount || priorToCount > priorFromCount) return null;

    const currentStepConversion = currentFromCount === 0 ? 0 : currentToCount / currentFromCount;
    const priorStepConversion = priorFromCount === 0 ? 0 : priorToCount / priorFromCount;
    const currentDropoffRate = currentFromCount === 0 ? 0 : 1 - currentStepConversion;
    const priorDropoffRate = priorFromCount === 0 ? 0 : 1 - priorStepConversion;
    const conversionDeltaPoints = (currentStepConversion - priorStepConversion) * 100;
    const currentLostCount = currentFromCount - currentToCount;
    const priorLostCount = priorFromCount - priorToCount;
    const signals: CheckoutFunnelLeakSignalV1[] = [];
    const observedFacts: string[] = [];

    if (currentDropoffRate >= MATERIAL_CHECKOUT_DROPOFF_RATE) {
      signals.push("MATERIAL_CURRENT_DROPOFF");
      observedFacts.push(`Observed current adjacent-stage drop-off is ${percent(currentDropoffRate)} (${currentLostCount} of ${currentFromCount} sessions did not reach ${toRow.label}).`);
    }
    if (conversionDeltaPoints < 0) {
      signals.push("REGRESSED_VS_PRIOR");
      observedFacts.push(`Observed step conversion moved ${points(conversionDeltaPoints)} versus the matched prior period.`);
    }
    if (signals.length === 0) {
      observedFacts.push(`Observed current adjacent-stage drop-off is ${percent(currentDropoffRate)}; no material-dropoff or matched-period regression signal is asserted.`);
    }

    entries.push({
      from,
      to,
      fromLabel: fromRow.label,
      toLabel: toRow.label,
      currentFromCount,
      currentToCount,
      priorFromCount,
      priorToCount,
      currentStepConversion,
      priorStepConversion,
      conversionDeltaPoints,
      currentDropoffRate,
      priorDropoffRate,
      currentLostCount,
      priorLostCount,
      signals,
      observedFacts,
      nextStep: signals.length > 0 ? "INVESTIGATE_STAGE_FRICTION" : "MONITOR",
      evidenceRefs: [...new Set([...refsByStage[from], ...refsByStage[to]])].sort(),
    });
  }

  entries.sort((left, right) => {
    const leftMaterial = left.signals.includes("MATERIAL_CURRENT_DROPOFF") ? 1 : 0;
    const rightMaterial = right.signals.includes("MATERIAL_CURRENT_DROPOFF") ? 1 : 0;
    if (leftMaterial !== rightMaterial) return rightMaterial - leftMaterial;

    const leftRegression = Math.min(left.conversionDeltaPoints, 0);
    const rightRegression = Math.min(right.conversionDeltaPoints, 0);
    if (leftRegression !== rightRegression) return leftRegression - rightRegression;

    if (left.currentLostCount !== right.currentLostCount) return right.currentLostCount - left.currentLostCount;
    if (left.currentDropoffRate !== right.currentDropoffRate) return right.currentDropoffRate - left.currentDropoffRate;
    return left.to.localeCompare(right.to);
  });

  return entries.map((entry, index) => ({ rank: index + 1, ...entry }));
}

/**
 * Builds a deterministic checkout funnel leak map from already-normalized,
 * decision-grade checkout diagnostics. The map localizes observed adjacent-stage
 * loss and matched-period regression only. It does not claim why the movement
 * occurred, attribute revenue, or authorize any production mutation.
 */
export function buildCheckoutFunnelLeakMapV1(input: CheckoutFunnelLeakMapInputV1): CheckoutFunnelLeakMapResultV1 {
  if (
    !input ||
    !input.diagnostics ||
    !input.evidenceRefsByStage ||
    !validIsoInstant(input.evaluatedAt) ||
    typeof input.maxAgeHours !== "number" ||
    !Number.isFinite(input.maxAgeHours) ||
    input.maxAgeHours <= 0 ||
    input.maxAgeHours > 720
  ) {
    return withheld(input ?? {}, "INVALID_INPUT");
  }

  const diagnostics = input.diagnostics;
  if (
    diagnostics.state !== "READY" ||
    diagnostics.decisionGrade !== true ||
    !Array.isArray(diagnostics.integrityIssues) ||
    diagnostics.integrityIssues.length > 0
  ) {
    return withheld(input, "DIAGNOSTICS_NOT_READY");
  }

  if (SOURCE_KEYS.some((source) => diagnostics.sourceTruth?.[source] !== "COMPLETE")) {
    return withheld(input, "SOURCE_TRUTH_INCOMPLETE");
  }

  if (!validComparisonRanges(diagnostics.currentRange, diagnostics.priorRange)) {
    return withheld(input, "RANGE_MISMATCH");
  }

  if (!validIsoInstant(diagnostics.asOf) || calendarDate(diagnostics.completeThrough) === null) {
    return withheld(input, "INVALID_INPUT");
  }

  const evaluatedAt = Date.parse(input.evaluatedAt);
  const asOf = Date.parse(diagnostics.asOf);
  if (asOf > evaluatedAt) return withheld(input, "FUTURE_EVIDENCE");
  if (evaluatedAt - asOf > input.maxAgeHours * 60 * 60 * 1000) return withheld(input, "STALE_EVIDENCE");

  const completeThrough = calendarDate(diagnostics.completeThrough) as number;
  const currentEnd = calendarDate(diagnostics.currentRange.endDate) as number;
  const asOfDate = calendarDate(new Date(asOf).toISOString().slice(0, 10)) as number;
  if (completeThrough < currentEnd || completeThrough > asOfDate) {
    return withheld(input, "INCOMPLETE_CURRENT_RANGE");
  }

  const refsByStage = stageEvidence(input.evidenceRefsByStage);
  if (!refsByStage) return withheld(input, "EVIDENCE_PROVENANCE_MISSING");

  const entries = buildEntries(diagnostics, refsByStage);
  if (!entries) return withheld(input, "STAGE_EVIDENCE_INCOMPLETE");

  return deepFreeze({
    version: CHECKOUT_FUNNEL_LEAK_MAP_VERSION,
    state: "READY",
    reasonCode: "FUNNEL_LEAK_MAP_READY",
    currentRange: { ...diagnostics.currentRange },
    priorRange: { ...diagnostics.priorRange },
    entries,
    evidenceRefs: [...new Set(CHECKOUT_STAGE_ORDER.flatMap((stage) => refsByStage[stage]))].sort(),
    attribution: "NOT_ESTABLISHED",
    monetaryImpact: null,
    confidence: null,
    limitations: [
      "Ranking reflects observed adjacent-stage loss, the existing 30% material-dropoff threshold, and matched-period conversion movement only.",
      "A funnel leak entry is an investigation priority, not proof that checkout UX, shipping, payment, Meta traffic, or any other mechanism caused the observed movement.",
      "No revenue value, expected lift, attribution, confidence score, statistical significance, or causal conclusion is synthesized from checkout counts.",
    ],
    authority: {
      websiteWriteAllowed: false,
      checkoutWriteAllowed: false,
      metaWriteAllowed: false,
      trackingWriteAllowed: false,
      pricingWriteAllowed: false,
      externalMutationAllowed: false,
      causalClaimAllowed: false,
      revenueAttributionAllowed: false,
    },
  });
}
