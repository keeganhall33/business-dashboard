export type ClaritySourceStateV1 = "AVAILABLE" | "PARTIAL" | "STALE" | "UNKNOWN" | "UNAVAILABLE";

export type ClarityMetricNameV1 =
  | "SESSIONS"
  | "USERS"
  | "PAGES_PER_SESSION"
  | "SCROLL_DEPTH_PERCENT"
  | "ACTIVE_TIME_SECONDS"
  | "DEAD_CLICKS"
  | "QUICK_BACKS"
  | "EXCESSIVE_SCROLLS"
  | "RAGE_CLICKS"
  | "PURCHASES";

export type ClarityFunnelStageV1 = "PAGE_VIEW" | "PRODUCT_VIEW" | "ADD_TO_CART" | "CHECKOUT" | "PURCHASE";

export type ClarityMetricObservationV1 = {
  name: ClarityMetricNameV1;
  value: number | null;
  sourceState: ClaritySourceStateV1;
  evidenceRef: string;
};

export type ClarityEventObservationV1 = {
  sourceObservationId: string;
  eventName: string;
  count: number;
  sourceState: ClaritySourceStateV1;
  evidenceRef: string;
  segment?: Readonly<Record<string, string>>;
};

export type ClarityBehaviorPeriodV1 = {
  periodId: string;
  metrics: readonly ClarityMetricObservationV1[];
  events: readonly ClarityEventObservationV1[];
};

export type ClarityBehaviorNormalizerInputV1 = {
  current: ClarityBehaviorPeriodV1;
  prior?: ClarityBehaviorPeriodV1 | null;
  findingLimit?: number;
};

export type ClarityNormalizedMetricV1 = {
  value: number | null;
  sourceState: ClaritySourceStateV1;
  evidenceRefs: readonly string[];
};

export type ClarityMetricDeltaV1 = {
  current: number | null;
  prior: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  comparable: boolean;
};

export type ClarityFrictionFindingV1 = {
  findingId: string;
  severity: "CRITICAL" | "HIGH";
  reasonCode: "DEAD_CLICK_RATE" | "QUICK_BACK_RATE" | "ACTIVE_TIME_REGRESSION" | "DEAD_CLICK_DOUBLING";
  actionCategory: "INVESTIGATE_INTERACTION_FRICTION" | "INVESTIGATE_NAVIGATION_FRICTION" | "REVIEW_ENGAGEMENT_REGRESSION";
  currentValue: number;
  threshold: number;
  evidenceRefs: readonly string[];
};

export type ClarityBehaviorNormalizerResultV1 = {
  currentPeriodId: string;
  priorPeriodId: string | null;
  metrics: Readonly<Record<ClarityMetricNameV1, ClarityNormalizedMetricV1>>;
  deltas: Readonly<Record<ClarityMetricNameV1, ClarityMetricDeltaV1>>;
  funnel: readonly {
    stage: ClarityFunnelStageV1;
    count: number | null;
    sourceState: ClaritySourceStateV1;
    evidenceRefs: readonly string[];
  }[];
  segments: readonly Readonly<Record<string, string>>[];
  findings: readonly ClarityFrictionFindingV1[];
  externalAccessPerformed: false;
  writesPerformed: false;
};

const METRICS: readonly ClarityMetricNameV1[] = [
  "SESSIONS",
  "USERS",
  "PAGES_PER_SESSION",
  "SCROLL_DEPTH_PERCENT",
  "ACTIVE_TIME_SECONDS",
  "DEAD_CLICKS",
  "QUICK_BACKS",
  "EXCESSIVE_SCROLLS",
  "RAGE_CLICKS",
  "PURCHASES"
];
const FUNNEL: readonly ClarityFunnelStageV1[] = ["PAGE_VIEW", "PRODUCT_VIEW", "ADD_TO_CART", "CHECKOUT", "PURCHASE"];
const STATES = new Set<ClaritySourceStateV1>(["AVAILABLE", "PARTIAL", "STALE", "UNKNOWN", "UNAVAILABLE"]);
const STATE_RANK: Record<ClaritySourceStateV1, number> = {
  AVAILABLE: 0,
  PARTIAL: 1,
  STALE: 2,
  UNKNOWN: 3,
  UNAVAILABLE: 4
};
const MAX_OBSERVATIONS = 5_000;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function boundedNumber(value: unknown, label: string, maximum = 1_000_000_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be a finite non-negative bounded number`);
  }
  return value;
}

function state(value: unknown, label: string): ClaritySourceStateV1 {
  if (!STATES.has(value as ClaritySourceStateV1)) throw new Error(`${label} is unsupported`);
  return value as ClaritySourceStateV1;
}

function worstState(values: readonly ClaritySourceStateV1[]): ClaritySourceStateV1 {
  return [...values].sort((left, right) => STATE_RANK[right] - STATE_RANK[left])[0] ?? "UNKNOWN";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function alias(eventName: string): ClarityFunnelStageV1 | null {
  const key = eventName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (["page_view", "pageview"].includes(key)) return "PAGE_VIEW";
  if (["view_item", "product_view", "view_product"].includes(key)) return "PRODUCT_VIEW";
  if (["add_to_cart", "kh_add_to_cart"].includes(key)) return "ADD_TO_CART";
  if (["checkout", "begin_checkout", "kh_checkout_entry"].includes(key)) return "CHECKOUT";
  if (["purchase", "kh_purchase", "order_complete"].includes(key)) return "PURCHASE";
  return null;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function normalizeMetrics(period: ClarityBehaviorPeriodV1): Record<ClarityMetricNameV1, ClarityNormalizedMetricV1> {
  const supplied = new Map<ClarityMetricNameV1, ClarityMetricObservationV1>();
  for (const observation of period.metrics) {
    if (!METRICS.includes(observation.name)) throw new Error(`metric ${String(observation.name)} is unsupported`);
    if (supplied.has(observation.name)) throw new Error(`metric ${observation.name} is duplicated`);
    const sourceState = state(observation.sourceState, `metric ${observation.name} sourceState`);
    const evidenceRef = text(observation.evidenceRef, `metric ${observation.name} evidenceRef`);
    const maximum = observation.name === "SCROLL_DEPTH_PERCENT" ? 100 : 1_000_000_000_000;
    const value = observation.value == null ? null : boundedNumber(observation.value, `metric ${observation.name} value`, maximum);
    if (value == null && sourceState === "AVAILABLE") throw new Error(`metric ${observation.name} cannot be AVAILABLE without a value`);
    supplied.set(observation.name, { ...observation, value, sourceState, evidenceRef });
  }
  return METRICS.reduce<Record<ClarityMetricNameV1, ClarityNormalizedMetricV1>>((result, name) => {
    const observation = supplied.get(name);
    result[name] = observation
      ? { value: observation.value, sourceState: observation.sourceState, evidenceRefs: [observation.evidenceRef] }
      : { value: null, sourceState: "UNKNOWN", evidenceRefs: [] };
    return result;
  }, {} as Record<ClarityMetricNameV1, ClarityNormalizedMetricV1>);
}

function normalizeFunnel(events: readonly ClarityEventObservationV1[]) {
  const groups = new Map<string, { stage: ClarityFunnelStageV1; counts: number[]; states: ClaritySourceStateV1[]; refs: string[] }>();
  const segments = new Map<string, Readonly<Record<string, string>>>();
  for (const event of events) {
    const sourceObservationId = text(event.sourceObservationId, "event sourceObservationId");
    const eventName = text(event.eventName, `event ${sourceObservationId} eventName`);
    const count = boundedNumber(event.count, `event ${sourceObservationId} count`);
    if (!Number.isInteger(count)) throw new Error(`event ${sourceObservationId} count must be an integer`);
    const sourceState = state(event.sourceState, `event ${sourceObservationId} sourceState`);
    const evidenceRef = text(event.evidenceRef, `event ${sourceObservationId} evidenceRef`);
    const stage = alias(eventName);
    if (event.segment) {
      const normalized = Object.fromEntries(
        Object.entries(event.segment)
          .map(([key, value]) => [text(key, "segment key"), text(value, `segment ${key}`)])
          .sort(([left], [right]) => left.localeCompare(right))
      );
      segments.set(JSON.stringify(normalized), normalized);
    }
    if (!stage) continue;
    const key = `${sourceObservationId}:${stage}`;
    const group = groups.get(key) ?? { stage, counts: [], states: [], refs: [] };
    group.counts.push(count);
    group.states.push(sourceState);
    group.refs.push(evidenceRef);
    groups.set(key, group);
  }

  const byStage = new Map<ClarityFunnelStageV1, { count: number; states: ClaritySourceStateV1[]; refs: string[] }>();
  for (const group of groups.values()) {
    const stage = byStage.get(group.stage) ?? { count: 0, states: [], refs: [] };
    stage.count += Math.max(...group.counts);
    stage.states.push(...group.states);
    stage.refs.push(...group.refs);
    byStage.set(group.stage, stage);
  }
  return {
    funnel: FUNNEL.map((stage) => {
      const value = byStage.get(stage);
      return value
        ? { stage, count: value.count, sourceState: worstState(value.states), evidenceRefs: unique(value.refs) }
        : { stage, count: null, sourceState: "UNKNOWN" as const, evidenceRefs: [] };
    }),
    segments: [...segments.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value)
  };
}

function delta(current: ClarityNormalizedMetricV1, prior: ClarityNormalizedMetricV1 | null): ClarityMetricDeltaV1 {
  const comparable =
    current.value != null &&
    prior?.value != null &&
    !["UNKNOWN", "UNAVAILABLE", "STALE"].includes(current.sourceState) &&
    !["UNKNOWN", "UNAVAILABLE", "STALE"].includes(prior.sourceState);
  if (!comparable || prior?.value == null || current.value == null) {
    return { current: current.value, prior: prior?.value ?? null, absoluteChange: null, percentChange: null, comparable: false };
  }
  const absoluteChange = current.value - prior.value;
  return {
    current: current.value,
    prior: prior.value,
    absoluteChange,
    percentChange: prior.value === 0 ? null : (absoluteChange / Math.abs(prior.value)) * 100,
    comparable: true
  };
}

export function normalizeClarityBehaviorV1(input: ClarityBehaviorNormalizerInputV1): ClarityBehaviorNormalizerResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const currentPeriodId = text(input.current?.periodId, "current periodId");
  if (!Array.isArray(input.current?.metrics) || !Array.isArray(input.current?.events)) throw new Error("current observations must be arrays");
  if (input.current.metrics.length + input.current.events.length > MAX_OBSERVATIONS) throw new Error("current observations exceed limit");
  if (input.prior && (!Array.isArray(input.prior.metrics) || !Array.isArray(input.prior.events))) throw new Error("prior observations must be arrays");
  if (input.prior && input.prior.metrics.length + input.prior.events.length > MAX_OBSERVATIONS) throw new Error("prior observations exceed limit");
  const priorPeriodId = input.prior ? text(input.prior.periodId, "prior periodId") : null;
  const findingLimit = input.findingLimit ?? 20;
  if (!Number.isInteger(findingLimit) || findingLimit < 0 || findingLimit > 20) throw new Error("findingLimit must be between 0 and 20");

  const metrics = normalizeMetrics(input.current);
  const priorMetrics = input.prior ? normalizeMetrics(input.prior) : null;
  const deltas = Object.fromEntries(METRICS.map((name) => [name, delta(metrics[name], priorMetrics?.[name] ?? null)])) as Record<ClarityMetricNameV1, ClarityMetricDeltaV1>;
  const { funnel, segments } = normalizeFunnel(input.current.events);
  const findings: ClarityFrictionFindingV1[] = [];
  const sessions = metrics.SESSIONS.value;
  const deadClicks = metrics.DEAD_CLICKS.value;
  const quickBacks = metrics.QUICK_BACKS.value;
  const currentDeadClickRate = sessions && deadClicks != null ? (deadClicks / sessions) * 100 : null;
  const priorSessions = priorMetrics?.SESSIONS.value;
  const priorDeadClicks = priorMetrics?.DEAD_CLICKS.value;
  const priorDeadClickRate = priorSessions && priorDeadClicks != null ? (priorDeadClicks / priorSessions) * 100 : null;

  if (currentDeadClickRate != null && currentDeadClickRate > 10) {
    findings.push({ findingId: "dead-click-rate", severity: "CRITICAL", reasonCode: "DEAD_CLICK_RATE", actionCategory: "INVESTIGATE_INTERACTION_FRICTION", currentValue: currentDeadClickRate, threshold: 10, evidenceRefs: unique([...metrics.SESSIONS.evidenceRefs, ...metrics.DEAD_CLICKS.evidenceRefs]) });
  }
  const quickBackRate = sessions && quickBacks != null ? (quickBacks / sessions) * 100 : null;
  if (quickBackRate != null && quickBackRate > 12) {
    findings.push({ findingId: "quick-back-rate", severity: "HIGH", reasonCode: "QUICK_BACK_RATE", actionCategory: "INVESTIGATE_NAVIGATION_FRICTION", currentValue: quickBackRate, threshold: 12, evidenceRefs: unique([...metrics.SESSIONS.evidenceRefs, ...metrics.QUICK_BACKS.evidenceRefs]) });
  }
  const activeTimeDelta = deltas.ACTIVE_TIME_SECONDS.percentChange;
  if (activeTimeDelta != null && activeTimeDelta < -20) {
    findings.push({ findingId: "active-time-regression", severity: "HIGH", reasonCode: "ACTIVE_TIME_REGRESSION", actionCategory: "REVIEW_ENGAGEMENT_REGRESSION", currentValue: activeTimeDelta, threshold: -20, evidenceRefs: unique([...(metrics.ACTIVE_TIME_SECONDS.evidenceRefs), ...(priorMetrics?.ACTIVE_TIME_SECONDS.evidenceRefs ?? [])]) });
  }
  if (currentDeadClickRate != null && priorDeadClickRate != null && priorDeadClickRate > 0 && currentDeadClickRate >= priorDeadClickRate * 2) {
    findings.push({ findingId: "dead-click-doubling", severity: "HIGH", reasonCode: "DEAD_CLICK_DOUBLING", actionCategory: "INVESTIGATE_INTERACTION_FRICTION", currentValue: currentDeadClickRate / priorDeadClickRate, threshold: 2, evidenceRefs: unique([...metrics.SESSIONS.evidenceRefs, ...metrics.DEAD_CLICKS.evidenceRefs, ...(priorMetrics?.SESSIONS.evidenceRefs ?? []), ...(priorMetrics?.DEAD_CLICKS.evidenceRefs ?? [])]) });
  }
  const severity = { CRITICAL: 0, HIGH: 1 } as const;
  findings.sort((left, right) => severity[left.severity] - severity[right.severity] || left.findingId.localeCompare(right.findingId));

  return freeze({
    currentPeriodId,
    priorPeriodId,
    metrics,
    deltas,
    funnel,
    segments,
    findings: findings.slice(0, findingLimit),
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
