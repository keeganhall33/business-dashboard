export const REVENUE_DECISION_PACKET_VERSION = "REVENUE_DECISION_PACKET_V1" as const;
export const MAX_EVIDENCE_REFS_PER_SOURCE = 10;

export type RevenueSourceV1 = "WOO" | "GA4" | "META";
export type RevenueTruthStateV1 = "CURRENT" | "PARTIAL" | "STALE" | "UNKNOWN" | "CONFLICTED";

export type RevenueMetricsV1 = {
  revenueCents: number | null;
  orders: number | null;
  averageOrderValueCents: number | null;
  sessions: number | null;
  spendCents: number | null;
  attributedPurchaseValueCents: number | null;
};

export type RevenueSourceObservationV1 = {
  source: RevenueSourceV1;
  truthState: RevenueTruthStateV1;
  observedAt: string;
  current: RevenueMetricsV1;
  previous: RevenueMetricsV1;
  evidenceRefs: string[];
};

export type RevenueDecisionPacketInputV1 = {
  generatedAt: string;
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  observations: RevenueSourceObservationV1[];
};

export type RevenueDecisionPacketV1 = {
  version: typeof REVENUE_DECISION_PACKET_VERSION;
  status: "READY_FOR_DECISION" | "INSUFFICIENT_EVIDENCE" | "INVALID_INPUT";
  reasonCode: string;
  generatedAt: string;
  whatChanged: {
    metric: "REVENUE";
    baselineCents: number | null;
    currentCents: number | null;
    absoluteChangeCents: number | null;
    percentChange: number | null;
    direction: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
  };
  sourceCoverage: Array<{
    source: RevenueSourceV1;
    truthState: RevenueTruthStateV1;
    evidenceRefs: readonly string[];
  }>;
  primaryDriver: {
    state: "SUPPORTED" | "UNKNOWN";
    driver: "TRAFFIC" | "CONVERSION" | "ORDER_VALUE" | null;
    statement: string;
    confidence: "MEDIUM" | "LOW" | "UNKNOWN";
  };
  corroboratingEvidence: readonly string[];
  conflictingEvidence: readonly string[];
  alternativeHypotheses: readonly string[];
  recommendedAction: {
    id: string;
    description: string;
    approvalClass: "AUTO_CONTINUE" | "KEEGAN_APPROVAL_REQUIRED";
    executesMutation: false;
  };
  measurement: {
    metric: string;
    baseline: number | null;
    evaluationWindow: { startDate: string; endDate: string } | null;
    successThreshold: string;
    stopRule: string;
  };
  assumptions: readonly string[];
  limitations: readonly string[];
  outcomeState: "IMPLEMENTED_NEEDS_OUTCOME";
};

const SOURCES: readonly RevenueSourceV1[] = ["WOO", "GA4", "META"];
const TRUTH_STATES: readonly RevenueTruthStateV1[] = ["CURRENT", "PARTIAL", "STALE", "UNKNOWN", "CONFLICTED"];
const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds)) return Number.NaN;
  return new Date(milliseconds).toISOString().slice(0, 10) === value ? milliseconds : Number.NaN;
}

function validRange(range: { startDate: string; endDate: string }): boolean {
  const start = dateValue(range.startDate);
  const end = dateValue(range.endDate);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start && (end - start) / DAY_MS + 1 === 30;
}

function numberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function validMetrics(metrics: RevenueMetricsV1): boolean {
  return Boolean(metrics) && Object.values(metrics).every(numberOrNull);
}

function validObservation(observation: RevenueSourceObservationV1, generatedAtMs: number): boolean {
  const observedAtMs = Date.parse(observation?.observedAt ?? "");
  return Boolean(
    observation &&
    SOURCES.includes(observation.source) &&
    TRUTH_STATES.includes(observation.truthState) &&
    Number.isFinite(observedAtMs) &&
    observedAtMs <= generatedAtMs &&
    validMetrics(observation.current) &&
    validMetrics(observation.previous) &&
    Array.isArray(observation.evidenceRefs) &&
    observation.evidenceRefs.length <= MAX_EVIDENCE_REFS_PER_SOURCE &&
    (observation.truthState !== "CURRENT" || observation.evidenceRefs.length > 0) &&
    observation.evidenceRefs.every((ref) => typeof ref === "string" && ref.trim().length > 0 && ref.length <= 200)
  );
}

function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function direction(current: number | null, previous: number | null): RevenueDecisionPacketV1["whatChanged"]["direction"] {
  if (current === null || previous === null) return "UNKNOWN";
  if (current > previous) return "UP";
  if (current < previous) return "DOWN";
  return "FLAT";
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

function addDays(date: string, days: number): string {
  return new Date(dateValue(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function stableId(input: RevenueDecisionPacketInputV1): string {
  const value = `${input.currentRange.startDate}:${input.currentRange.endDate}:${input.comparisonRange.startDate}:${input.comparisonRange.endDate}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `revenue-action:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function freezePacket(packet: RevenueDecisionPacketV1): RevenueDecisionPacketV1 {
  packet.sourceCoverage.forEach((item) => {
    Object.freeze(item.evidenceRefs);
    Object.freeze(item);
  });
  Object.freeze(packet.sourceCoverage);
  Object.freeze(packet.whatChanged);
  Object.freeze(packet.primaryDriver);
  Object.freeze(packet.corroboratingEvidence);
  Object.freeze(packet.conflictingEvidence);
  Object.freeze(packet.alternativeHypotheses);
  Object.freeze(packet.recommendedAction);
  if (packet.measurement.evaluationWindow) Object.freeze(packet.measurement.evaluationWindow);
  Object.freeze(packet.measurement);
  Object.freeze(packet.assumptions);
  Object.freeze(packet.limitations);
  return Object.freeze(packet);
}

function invalid(input: RevenueDecisionPacketInputV1): RevenueDecisionPacketV1 {
  return freezePacket({
    version: REVENUE_DECISION_PACKET_VERSION,
    status: "INVALID_INPUT",
    reasonCode: "INVALID_OR_UNBOUNDED_INPUT",
    generatedAt: input?.generatedAt ?? "UNKNOWN",
    whatChanged: { metric: "REVENUE", baselineCents: null, currentCents: null, absoluteChangeCents: null, percentChange: null, direction: "UNKNOWN" },
    sourceCoverage: SOURCES.map((source) => ({ source, truthState: "UNKNOWN", evidenceRefs: Object.freeze([]) })),
    primaryDriver: { state: "UNKNOWN", driver: null, statement: "Input could not be validated.", confidence: "UNKNOWN" },
    corroboratingEvidence: [],
    conflictingEvidence: [],
    alternativeHypotheses: [],
    recommendedAction: { id: "revenue-action:invalid", description: "Correct the bounded input before making a revenue decision.", approvalClass: "AUTO_CONTINUE", executesMutation: false },
    measurement: { metric: "UNKNOWN", baseline: null, evaluationWindow: null, successThreshold: "UNKNOWN", stopRule: "Do not execute a consequential action from invalid input." },
    assumptions: [],
    limitations: ["No decision packet was produced from invalid or unbounded input."],
    outcomeState: "IMPLEMENTED_NEEDS_OUTCOME"
  });
}

export function buildRevenueDecisionPacketV1(input: RevenueDecisionPacketInputV1): RevenueDecisionPacketV1 {
  const sourceSet = new Set(input.observations.map((item) => item.source));
  const generatedAtMs = Date.parse(input.generatedAt);
  const adjacent = dateValue(input.comparisonRange.endDate) + DAY_MS === dateValue(input.currentRange.startDate);
  if (
    !Number.isFinite(generatedAtMs) ||
    !validRange(input.currentRange) ||
    !validRange(input.comparisonRange) ||
    !adjacent ||
    !Array.isArray(input.observations) ||
    input.observations.length > SOURCES.length ||
    sourceSet.size !== input.observations.length ||
    input.observations.some((item) => !validObservation(item, generatedAtMs))
  ) return invalid(input);

  const bySource = new Map(input.observations.map((item) => [item.source, item]));
  const coverage = SOURCES.map((source) => {
    const observation = bySource.get(source);
    return {
      source,
      truthState: observation?.truthState ?? "UNKNOWN" as RevenueTruthStateV1,
      evidenceRefs: Object.freeze([...(observation?.evidenceRefs ?? [])].sort())
    };
  });
  const woo = bySource.get("WOO");
  const ga4 = bySource.get("GA4");
  const meta = bySource.get("META");
  const currentRevenue = woo?.current.revenueCents ?? null;
  const previousRevenue = woo?.previous.revenueCents ?? null;
  const revenueChange = change(currentRevenue, previousRevenue);
  const absoluteChange = currentRevenue !== null && previousRevenue !== null ? currentRevenue - previousRevenue : null;
  const allCurrent = coverage.every((item) => item.truthState === "CURRENT");
  const conflicts = coverage
    .filter((item) => item.truthState === "CONFLICTED")
    .map((item) => `${item.source} evidence is conflicted.`);
  const limitations = coverage
    .filter((item) => item.truthState !== "CURRENT")
    .map((item) => `${item.source} coverage is ${item.truthState}.`);

  let driver: RevenueDecisionPacketV1["primaryDriver"]["driver"] = null;
  let driverStatement = "The primary driver is UNKNOWN because the evidence does not isolate one supported contributor.";
  const corroborating: string[] = [];
  const alternatives = ["Product mix or timing may have changed within the aggregate period.", "Unobserved channel, inventory, or checkout effects may have contributed."];

  const sessionsChange = change(ga4?.current.sessions ?? null, ga4?.previous.sessions ?? null);
  const currentConversion = woo?.current.orders != null && ga4?.current.sessions ? woo.current.orders / ga4.current.sessions : null;
  const previousConversion = woo?.previous.orders != null && ga4?.previous.sessions ? woo.previous.orders / ga4.previous.sessions : null;
  const conversionChange = change(currentConversion, previousConversion);
  const aovChange = change(woo?.current.averageOrderValueCents ?? null, woo?.previous.averageOrderValueCents ?? null);

  if (allCurrent && revenueChange !== null && revenueChange !== 0) {
    const candidates = [
      { driver: "TRAFFIC" as const, value: sessionsChange },
      { driver: "CONVERSION" as const, value: conversionChange },
      { driver: "ORDER_VALUE" as const, value: aovChange }
    ].filter((candidate): candidate is { driver: "TRAFFIC" | "CONVERSION" | "ORDER_VALUE"; value: number } =>
      candidate.value !== null && Math.sign(candidate.value) === Math.sign(revenueChange)
    ).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    if (candidates[0] && (!candidates[1] || Math.abs(candidates[0].value) - Math.abs(candidates[1].value) >= 0.05)) {
      driver = candidates[0].driver;
      driverStatement = `${driver} is the best-supported contributor, not a proven cause, across the matched periods.`;
      corroborating.push(`${driver} moved in the same direction as revenue and had the largest distinct proportional change.`);
      if (meta?.current.spendCents != null && meta.previous.spendCents != null) {
        corroborating.push("Meta spend is included as context only and is not treated as causal attribution.");
      }
    }
  }

  const evaluationWindow = { startDate: addDays(input.currentRange.endDate, 1), endDate: addDays(input.currentRange.endDate, 14) };
  const actionId = stableId(input);
  const actionByDriver = {
    TRAFFIC: {
      description: "Run one 14-day approval-gated acquisition test on the highest-volume landing page while holding checkout and pricing changes constant.",
      metric: "GA4 sessions",
      baseline: ga4?.current.sessions ?? null
    },
    CONVERSION: {
      description: "Run one 14-day approval-gated checkout-friction test at the highest-volume loss step while holding spend and pricing constant.",
      metric: "Woo orders per GA4 session",
      baseline: currentConversion
    },
    ORDER_VALUE: {
      description: "Run one 14-day approval-gated product-mix placement test while holding price and acquisition spend constant.",
      metric: "Woo average order value cents",
      baseline: woo?.current.averageOrderValueCents ?? null
    }
  } as const;
  const selectedAction = driver ? actionByDriver[driver] : null;
  const status = allCurrent && currentRevenue !== null && previousRevenue !== null ? "READY_FOR_DECISION" : "INSUFFICIENT_EVIDENCE";

  return freezePacket({
    version: REVENUE_DECISION_PACKET_VERSION,
    status,
    reasonCode: driver ? "BOUNDED_CONTRIBUTOR_SUPPORTED" : allCurrent ? "DRIVER_NOT_ISOLATED" : "SOURCE_COVERAGE_INCOMPLETE",
    generatedAt: input.generatedAt,
    whatChanged: {
      metric: "REVENUE",
      baselineCents: previousRevenue,
      currentCents: currentRevenue,
      absoluteChangeCents: absoluteChange,
      percentChange: round(revenueChange),
      direction: direction(currentRevenue, previousRevenue)
    },
    sourceCoverage: coverage,
    primaryDriver: {
      state: driver ? "SUPPORTED" : "UNKNOWN",
      driver,
      statement: driverStatement,
      confidence: driver ? "MEDIUM" : allCurrent ? "LOW" : "UNKNOWN"
    },
    corroboratingEvidence: corroborating.sort(),
    conflictingEvidence: conflicts.sort(),
    alternativeHypotheses: alternatives.sort(),
    recommendedAction: selectedAction
      ? { id: actionId, description: selectedAction.description, approvalClass: "KEEGAN_APPROVAL_REQUIRED", executesMutation: false }
      : { id: actionId, description: "Reconcile the missing, stale, or conflicting source evidence before changing spend, pricing, checkout, or inventory.", approvalClass: "AUTO_CONTINUE", executesMutation: false },
    measurement: selectedAction
      ? { metric: selectedAction.metric, baseline: round(selectedAction.baseline), evaluationWindow, successThreshold: "Improve the selected metric by at least 5% versus baseline without a material revenue decline.", stopRule: "Stop and reverse if matched revenue declines more than 10% after the first 3 complete days." }
      : { metric: "Source coverage", baseline: coverage.filter((item) => item.truthState === "CURRENT").length, evaluationWindow: null, successThreshold: "All three sources must be CURRENT for the matched periods.", stopRule: "Do not execute a consequential revenue action while the driver remains UNKNOWN." },
    assumptions: ["Matched 30-day periods are comparable only to the extent stated by the supplied evidence."],
    limitations: [...new Set(limitations)].sort(),
    outcomeState: "IMPLEMENTED_NEEDS_OUTCOME"
  });
}
