export type ClarityEvidenceTruthState =
  | "COMPLETE"
  | "PARTIAL"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export type ClarityBehaviorState =
  | "READY"
  | "PARTIAL"
  | "STALE"
  | "CONFLICTED"
  | "UNAVAILABLE";

export interface ClarityDateRangeV1 {
  startDate: string;
  endDate: string;
}

export interface ClarityPeriodMetricsV1 {
  sessions?: unknown;
  uniqueUsers?: unknown;
  pagesPerSession?: unknown;
  scrollDepthPercent?: unknown;
  activeTimeSeconds?: unknown;
  rageClickSessions?: unknown;
  deadClickSessions?: unknown;
  excessiveScrollSessions?: unknown;
  quickBackSessions?: unknown;
  purchaseSessions?: unknown;
}

export interface ClarityBehaviorInputV1 {
  sourceTruth: ClarityEvidenceTruthState;
  requestedRange: {
    current: ClarityDateRangeV1;
    prior: ClarityDateRangeV1;
  };
  observedRange?: {
    current?: ClarityDateRangeV1 | null;
    prior?: ClarityDateRangeV1 | null;
  } | null;
  current?: ClarityPeriodMetricsV1 | null;
  prior?: ClarityPeriodMetricsV1 | null;
  freshness?: {
    extractedAt?: string | null;
    completeThrough?: string | null;
    now?: string | null;
    maxAgeHours?: number | null;
  } | null;
}

export type ClarityCommerceStageV1 = "PRODUCT_VIEW" | "ADD_TO_CART" | "CHECKOUT" | "PURCHASE";

export interface ClarityRawCommerceEventV1 {
  sessionId: string | null;
  eventName: string | null;
}

export interface ClarityNormalizedFunnelV1 {
  counts: Record<ClarityCommerceStageV1, number>;
  recognizedEvents: number;
  deduplicatedEvents: number;
  ignoredEvents: number;
  sessionsWithRecognizedEvents: number;
}

export interface ClarityMetricV1 {
  current: number | null;
  prior: number | null;
  delta: number | null;
  deltaPercent: number | null;
}

export type ClarityFindingSeverityV1 = "CRITICAL" | "HIGH" | "WATCH";

export interface ClarityBehaviorFindingV1 {
  id: "DEAD_CLICK_RATE" | "DEAD_CLICK_REGRESSION" | "QUICK_BACK_RATE" | "ACTIVE_TIME_DECLINE";
  severity: ClarityFindingSeverityV1;
  fact: string;
  inference: string;
  nextAction: string;
  requiresApproval: true;
  externalMutationAllowed: false;
  causalClaim: false;
}

export interface ClarityBehaviorViewModelV1 {
  state: ClarityBehaviorState;
  stateLabel: string;
  decisionGrade: boolean;
  currentRange: ClarityDateRangeV1;
  priorRange: ClarityDateRangeV1;
  extractedAt: string | null;
  completeThrough: string | null;
  metrics: {
    sessions: ClarityMetricV1;
    uniqueUsers: ClarityMetricV1;
    pagesPerSession: ClarityMetricV1;
    scrollDepthPercent: ClarityMetricV1;
    activeTimeSeconds: ClarityMetricV1;
    deadClickRate: ClarityMetricV1;
    quickBackRate: ClarityMetricV1;
    rageClickRate: ClarityMetricV1;
    excessiveScrollRate: ClarityMetricV1;
    purchaseRate: ClarityMetricV1;
  };
  findings: ClarityBehaviorFindingV1[];
  truthNotes: string[];
  attributionNote: string;
}

const COMMERCE_EVENT_ALIASES: Record<string, ClarityCommerceStageV1> = {
  "product viewed": "PRODUCT_VIEW",
  "add to cart": "ADD_TO_CART",
  "kh_add_to_cart": "ADD_TO_CART",
  "checkout": "CHECKOUT",
  "begin checkout": "CHECKOUT",
  "kh_checkout_entry": "CHECKOUT",
  "purchase": "PURCHASE",
};

function optionalNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function metric(current: number | null, prior: number | null): ClarityMetricV1 {
  const delta = current === null || prior === null ? null : current - prior;
  const deltaPercent = delta === null || prior === 0 ? null : delta / prior;
  return { current, prior, delta, deltaPercent };
}

function rangeEquals(left: ClarityDateRangeV1 | null | undefined, right: ClarityDateRangeV1): boolean {
  return left?.startDate === right.startDate && left?.endDate === right.endDate;
}

function validIsoInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function isStale(input: ClarityBehaviorInputV1): boolean {
  const extractedAt = validIsoInstant(input.freshness?.extractedAt);
  const now = validIsoInstant(input.freshness?.now);
  const maxAgeHours = input.freshness?.maxAgeHours;
  if (extractedAt === null || now === null || typeof maxAgeHours !== "number" || !Number.isFinite(maxAgeHours) || maxAgeHours < 0) {
    return false;
  }
  return now - extractedAt > maxAgeHours * 60 * 60 * 1000;
}

function observedRangesMatch(input: ClarityBehaviorInputV1): boolean {
  return rangeEquals(input.observedRange?.current, input.requestedRange.current)
    && rangeEquals(input.observedRange?.prior, input.requestedRange.prior);
}

function hasCompleteCoreMetrics(input: ClarityBehaviorInputV1): boolean {
  const current = input.current;
  const prior = input.prior;
  if (!current || !prior) return false;
  const keys: Array<keyof ClarityPeriodMetricsV1> = [
    "sessions",
    "uniqueUsers",
    "pagesPerSession",
    "scrollDepthPercent",
    "activeTimeSeconds",
    "deadClickSessions",
    "quickBackSessions",
  ];
  return keys.every((key) => optionalNonNegativeNumber(current[key]) !== null && optionalNonNegativeNumber(prior[key]) !== null);
}

function deriveState(input: ClarityBehaviorInputV1): ClarityBehaviorState {
  if (input.sourceTruth === "CONFLICTED") return "CONFLICTED";
  if (input.sourceTruth === "UNAVAILABLE") return "UNAVAILABLE";
  if (input.sourceTruth === "STALE" || isStale(input)) return "STALE";
  if (input.sourceTruth !== "COMPLETE") return "PARTIAL";
  if (!observedRangesMatch(input)) return "PARTIAL";
  if (!hasCompleteCoreMetrics(input)) return "PARTIAL";
  if (!input.freshness?.completeThrough || input.freshness.completeThrough < input.requestedRange.current.endDate) return "PARTIAL";
  return "READY";
}

function stateLabel(state: ClarityBehaviorState): string {
  switch (state) {
    case "READY": return "Clarity behavioral evidence ready";
    case "PARTIAL": return "Clarity behavioral evidence is partial";
    case "STALE": return "Clarity behavioral evidence is stale";
    case "CONFLICTED": return "Clarity behavioral evidence is conflicted";
    case "UNAVAILABLE": return "Clarity behavioral evidence is unavailable";
  }
}

function fixedPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function buildFindings(
  state: ClarityBehaviorState,
  deadClickRate: ClarityMetricV1,
  quickBackRate: ClarityMetricV1,
  activeTimeSeconds: ClarityMetricV1,
): ClarityBehaviorFindingV1[] {
  if (state !== "READY") return [];
  const findings: ClarityBehaviorFindingV1[] = [];

  if (deadClickRate.current !== null && deadClickRate.current > 0.10) {
    findings.push({
      id: "DEAD_CLICK_RATE",
      severity: "CRITICAL",
      fact: `Dead-click sessions are ${fixedPercent(deadClickRate.current)} of sessions in the selected range, above the 10% critical threshold.`,
      inference: "This is a prioritization signal for interaction friction, not proof that dead clicks caused conversion loss.",
      nextAction: "Review supporting recordings and segment the affected pages, devices, browsers, and traffic sources before proposing a site change.",
      requiresApproval: true,
      externalMutationAllowed: false,
      causalClaim: false,
    });
  }

  if (
    deadClickRate.current !== null
    && deadClickRate.prior !== null
    && deadClickRate.prior > 0
    && deadClickRate.current / deadClickRate.prior >= 2
  ) {
    findings.push({
      id: "DEAD_CLICK_REGRESSION",
      severity: "CRITICAL",
      fact: `Dead-click rate is at least 2× the matched comparison period (${fixedPercent(deadClickRate.current)} vs ${fixedPercent(deadClickRate.prior)}).`,
      inference: "The matched-period regression warrants investigation; timing alone does not establish which deployment, campaign, or page element caused it.",
      nextAction: "Compare affected segments and recordings across the two matched periods, then test a specific hypothesis with a rollback and measurement plan.",
      requiresApproval: true,
      externalMutationAllowed: false,
      causalClaim: false,
    });
  }

  if (quickBackRate.current !== null && quickBackRate.current > 0.12) {
    findings.push({
      id: "QUICK_BACK_RATE",
      severity: "HIGH",
      fact: `Quick-back sessions are ${fixedPercent(quickBackRate.current)} of sessions in the selected range, above the 12% high-friction threshold.`,
      inference: "Quick backs can indicate expectation or navigation mismatch, but the aggregate rate does not identify a cause.",
      nextAction: "Segment quick backs by entry page, device/browser, campaign, and source before recommending an experiment.",
      requiresApproval: true,
      externalMutationAllowed: false,
      causalClaim: false,
    });
  }

  if (
    activeTimeSeconds.current !== null
    && activeTimeSeconds.prior !== null
    && activeTimeSeconds.prior > 0
    && activeTimeSeconds.current / activeTimeSeconds.prior < 0.80
  ) {
    findings.push({
      id: "ACTIVE_TIME_DECLINE",
      severity: "HIGH",
      fact: `Active time declined ${fixedPercent((activeTimeSeconds.prior - activeTimeSeconds.current) / activeTimeSeconds.prior)} versus the matched comparison period.`,
      inference: "Lower active time is an observed engagement change, not evidence by itself of worse conversion or a specific root cause.",
      nextAction: "Compare page, device/browser, and acquisition segments and reconcile the change with GA4 and WooCommerce before acting.",
      requiresApproval: true,
      externalMutationAllowed: false,
      causalClaim: false,
    });
  }

  return findings;
}

export function normalizeClarityCommerceEventsV1(events: ClarityRawCommerceEventV1[]): ClarityNormalizedFunnelV1 {
  const counts: Record<ClarityCommerceStageV1, number> = {
    PRODUCT_VIEW: 0,
    ADD_TO_CART: 0,
    CHECKOUT: 0,
    PURCHASE: 0,
  };
  const uniqueStageEvents = new Set<string>();
  const sessions = new Set<string>();
  let recognizedEvents = 0;
  let ignoredEvents = 0;

  for (const event of events) {
    const name = event.eventName?.trim().toLowerCase() ?? "";
    const stage = COMMERCE_EVENT_ALIASES[name];
    const sessionId = event.sessionId?.trim() ?? "";
    if (!stage || !sessionId) {
      ignoredEvents += 1;
      continue;
    }

    recognizedEvents += 1;
    sessions.add(sessionId);
    uniqueStageEvents.add(`${sessionId}\u0000${stage}`);
  }

  for (const key of uniqueStageEvents) {
    const stage = key.slice(key.indexOf("\u0000") + 1) as ClarityCommerceStageV1;
    counts[stage] += 1;
  }

  return {
    counts,
    recognizedEvents,
    deduplicatedEvents: recognizedEvents - uniqueStageEvents.size,
    ignoredEvents,
    sessionsWithRecognizedEvents: sessions.size,
  };
}

export function buildClarityBehaviorViewModelV1(input: ClarityBehaviorInputV1): ClarityBehaviorViewModelV1 {
  const current = input.current ?? {};
  const prior = input.prior ?? {};
  const currentSessions = optionalNonNegativeNumber(current.sessions);
  const priorSessions = optionalNonNegativeNumber(prior.sessions);
  const deadClickRate = metric(
    ratio(optionalNonNegativeNumber(current.deadClickSessions), currentSessions),
    ratio(optionalNonNegativeNumber(prior.deadClickSessions), priorSessions),
  );
  const quickBackRate = metric(
    ratio(optionalNonNegativeNumber(current.quickBackSessions), currentSessions),
    ratio(optionalNonNegativeNumber(prior.quickBackSessions), priorSessions),
  );
  const rageClickRate = metric(
    ratio(optionalNonNegativeNumber(current.rageClickSessions), currentSessions),
    ratio(optionalNonNegativeNumber(prior.rageClickSessions), priorSessions),
  );
  const excessiveScrollRate = metric(
    ratio(optionalNonNegativeNumber(current.excessiveScrollSessions), currentSessions),
    ratio(optionalNonNegativeNumber(prior.excessiveScrollSessions), priorSessions),
  );
  const purchaseRate = metric(
    ratio(optionalNonNegativeNumber(current.purchaseSessions), currentSessions),
    ratio(optionalNonNegativeNumber(prior.purchaseSessions), priorSessions),
  );
  const activeTimeSeconds = metric(
    optionalNonNegativeNumber(current.activeTimeSeconds),
    optionalNonNegativeNumber(prior.activeTimeSeconds),
  );
  const state = deriveState(input);
  const truthNotes: string[] = [];

  if (!observedRangesMatch(input)) truthNotes.push("Observed Clarity windows do not exactly match the requested current/prior ranges.");
  if (input.freshness?.completeThrough && input.freshness.completeThrough < input.requestedRange.current.endDate) {
    truthNotes.push(`Clarity is complete only through ${input.freshness.completeThrough}; the requested range ends ${input.requestedRange.current.endDate}.`);
  }
  if (isStale(input)) truthNotes.push("The Clarity extraction exceeds the configured freshness limit.");
  if (!hasCompleteCoreMetrics(input)) truthNotes.push("One or more core Clarity metrics are missing or invalid; missing values remain unknown rather than becoming zero.");
  if (input.sourceTruth === "CONFLICTED") truthNotes.push("Clarity source evidence is conflicted; behavioral recommendations are suppressed.");
  if (input.sourceTruth === "UNAVAILABLE") truthNotes.push("Clarity source evidence is unavailable; other analytics sources may continue independently.");

  return {
    state,
    stateLabel: stateLabel(state),
    decisionGrade: state === "READY",
    currentRange: input.requestedRange.current,
    priorRange: input.requestedRange.prior,
    extractedAt: input.freshness?.extractedAt ?? null,
    completeThrough: input.freshness?.completeThrough ?? null,
    metrics: {
      sessions: metric(currentSessions, priorSessions),
      uniqueUsers: metric(optionalNonNegativeNumber(current.uniqueUsers), optionalNonNegativeNumber(prior.uniqueUsers)),
      pagesPerSession: metric(optionalNonNegativeNumber(current.pagesPerSession), optionalNonNegativeNumber(prior.pagesPerSession)),
      scrollDepthPercent: metric(optionalNonNegativeNumber(current.scrollDepthPercent), optionalNonNegativeNumber(prior.scrollDepthPercent)),
      activeTimeSeconds,
      deadClickRate,
      quickBackRate,
      rageClickRate,
      excessiveScrollRate,
      purchaseRate,
    },
    findings: buildFindings(state, deadClickRate, quickBackRate, activeTimeSeconds),
    truthNotes,
    attributionNote: "Clarity behavior can prioritize investigation and experiments, but aggregate behavioral correlation does not establish conversion causality. Consequential production changes require review and approval; this model grants no external mutation authority.",
  };
}
