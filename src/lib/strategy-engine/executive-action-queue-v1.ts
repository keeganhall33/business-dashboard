import type { ActionLevel } from "@/lib/actions/action-contract";
import type { ExplanationConfidence, ExplanationEvidenceItem } from "@/lib/intelligence/explanation-contract";
import type { ExpectedImpactRange } from "@/lib/intelligence/recommendation-contract";

export type StrategyActionStateV1 = "DO_NOW" | "PREPARE" | "MONITOR";
export type StrategyTruthStateV1 = "KNOWN" | "INFERRED" | "UNKNOWN";
export type StrategyTimeSensitivityV1 = "IMMEDIATE" | "THIS_WEEK" | "THIS_MONTH" | "WATCH";
export type StrategyOwnerV1 = "JEEVES" | "KEEGAN" | "AVERY" | "SYSTEM" | "UNKNOWN";

export type ExecutiveActionQueueItemV1 = {
  ACTION_ID: string;
  STATE: StrategyActionStateV1;
  RANK: number;
  DOMAIN: "REVENUE" | "CREATIVE_DIRECTION" | "DATA_QUALITY" | "OPERATIONS";
  WHAT_CHANGED: string;
  WHY_IT_MATTERS: string;
  RECOMMENDED_ACTION: string;
  EXPECTED_UPSIDE_RANGE: ExpectedImpactRange;
  CONFIDENCE: ExplanationConfidence;
  KEY_UNCERTAINTY: string;
  EVIDENCE_REFS: ExplanationEvidenceItem[];
  TIME_SENSITIVITY: StrategyTimeSensitivityV1;
  OWNER: StrategyOwnerV1;
  APPROVAL_CLASS: ActionLevel;
  NEXT_STEP: string;
  SUCCESS_METRIC: string;
  EVALUATION_WINDOW: { start: string; end: string };
  WHAT_WOULD_CHANGE_THE_RECOMMENDATION: string;
  TRUTH_STATE: StrategyTruthStateV1;
  DISPLAY: {
    priority_label: string;
    owner_label: string;
    confidence_label: string;
    upside_label: string;
    uncertainty_label: string;
    approval_label: string;
  };
};

export type ExecutiveActionQueueV1 = {
  generated_at: string;
  data_mode: "GOLDEN_FIXTURE";
  items: ExecutiveActionQueueItemV1[];
  sections: Record<StrategyActionStateV1, ExecutiveActionQueueItemV1[]>;
};

const stateOrder: Record<StrategyActionStateV1, number> = {
  DO_NOW: 0,
  PREPARE: 1,
  MONITOR: 2
};

const timeOrder: Record<StrategyTimeSensitivityV1, number> = {
  IMMEDIATE: 0,
  THIS_WEEK: 1,
  THIS_MONTH: 2,
  WATCH: 3
};

export function formatExpectedUpsideRange(range: ExpectedImpactRange): string {
  if (range.currency === "UNKNOWN" || range.low_incremental_revenue_cents === null || range.high_incremental_revenue_cents === null) {
    return "Upside unknown";
  }
  const low = Math.round(range.low_incremental_revenue_cents / 100);
  const high = Math.round(range.high_incremental_revenue_cents / 100);
  return `$${low.toLocaleString()}-$${high.toLocaleString()} / ${range.horizon}`;
}

export function withDisplay(item: Omit<ExecutiveActionQueueItemV1, "DISPLAY">): ExecutiveActionQueueItemV1 {
  return {
    ...item,
    DISPLAY: {
      priority_label: item.STATE.replace("_", " "),
      owner_label: item.OWNER === "UNKNOWN" ? "Owner unknown" : item.OWNER,
      confidence_label: item.CONFIDENCE.replaceAll("_", " "),
      upside_label: formatExpectedUpsideRange(item.EXPECTED_UPSIDE_RANGE),
      uncertainty_label: item.TRUTH_STATE === "UNKNOWN" ? `UNKNOWN: ${item.KEY_UNCERTAINTY}` : item.KEY_UNCERTAINTY,
      approval_label: item.APPROVAL_CLASS
    }
  };
}

export function sortExecutiveActions(items: ExecutiveActionQueueItemV1[]): ExecutiveActionQueueItemV1[] {
  return [...items].sort((a, b) => {
    const stateDelta = stateOrder[a.STATE] - stateOrder[b.STATE];
    if (stateDelta !== 0) return stateDelta;
    const rankDelta = a.RANK - b.RANK;
    if (rankDelta !== 0) return rankDelta;
    const timeDelta = timeOrder[a.TIME_SENSITIVITY] - timeOrder[b.TIME_SENSITIVITY];
    if (timeDelta !== 0) return timeDelta;
    return a.ACTION_ID.localeCompare(b.ACTION_ID);
  });
}

export function buildExecutiveActionQueueV1(
  items: ExecutiveActionQueueItemV1[] = executiveActionQueueGoldenFixturesV1,
  generated_at = "2026-08-17T23:30:00.000Z"
): ExecutiveActionQueueV1 {
  const sorted = sortExecutiveActions(items);
  return {
    generated_at,
    data_mode: "GOLDEN_FIXTURE",
    items: sorted,
    sections: {
      DO_NOW: sorted.filter((item) => item.STATE === "DO_NOW"),
      PREPARE: sorted.filter((item) => item.STATE === "PREPARE"),
      MONITOR: sorted.filter((item) => item.STATE === "MONITOR")
    }
  };
}

const evidence = (id: string, label: string, source: ExplanationEvidenceItem["source"]): ExplanationEvidenceItem => ({
  id,
  label,
  source,
  kind: "metric",
  details: { fixture: true }
});

export const executiveActionQueueGoldenFixturesV1: ExecutiveActionQueueItemV1[] = [
  withDisplay({
    ACTION_ID: "strategy-do-now-qualified-traffic",
    STATE: "DO_NOW",
    RANK: 1,
    DOMAIN: "REVENUE",
    WHAT_CHANGED: "Qualified traffic dropped while conversion quality stayed defensible.",
    WHY_IT_MATTERS: "Revenue recovery is more likely to come from restoring qualified demand than changing the product or discounting.",
    RECOMMENDED_ACTION: "Prepare a small qualified-traffic recovery plan, but do not change spend without approval.",
    EXPECTED_UPSIDE_RANGE: {
      currency: "USD",
      horizon: "7d",
      low_incremental_revenue_cents: 9000,
      expected_incremental_revenue_cents: 15000,
      high_incremental_revenue_cents: 22000,
      notes: ["Conservative fixture range; not a promise."],
      assumptions: ["Traffic can be restored without lowering conversion quality."]
    },
    CONFIDENCE: "likely",
    KEY_UNCERTAINTY: "Attribution source mix is incomplete.",
    EVIDENCE_REFS: [evidence("ev_ga4_sessions_drop", "GA4 qualified sessions trend", "internal"), evidence("ev_woo_revenue_window", "Woo revenue window", "internal")],
    TIME_SENSITIVITY: "THIS_WEEK",
    OWNER: "JEEVES",
    APPROVAL_CLASS: "L2_DRAFT_PREPARED",
    NEXT_STEP: "Draft a recovery plan and approval checklist for Keegan.",
    SUCCESS_METRIC: "Revenue recovers inside the predicted range without conversion-rate degradation.",
    EVALUATION_WINDOW: { start: "2026-08-18", end: "2026-08-25" },
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: "If conversion quality falls or attribution conflicts intensify, downgrade to measurement-first.",
    TRUTH_STATE: "INFERRED"
  }),
  withDisplay({
    ACTION_ID: "strategy-prepare-creative-direction",
    STATE: "PREPARE",
    RANK: 2,
    DOMAIN: "CREATIVE_DIRECTION",
    WHAT_CHANGED: "Creative Direction confidence moved toward graphite-led development after material collector/institutional signals.",
    WHY_IT_MATTERS: "The next studio decision should reinforce premium positioning instead of spreading attention across unrelated mediums.",
    RECOMMENDED_ACTION: "Prepare the next graphite-led series brief and success criteria before committing studio time.",
    EXPECTED_UPSIDE_RANGE: {
      currency: "UNKNOWN",
      horizon: "unknown",
      low_incremental_revenue_cents: null,
      expected_incremental_revenue_cents: null,
      high_incremental_revenue_cents: null,
      notes: ["Prestige and brand-fit value are qualitative in this fixture."],
      assumptions: ["Do not fabricate dollar value for creative prestige."]
    },
    CONFIDENCE: "strongly_supported",
    KEY_UNCERTAINTY: "Collector response to the specific next subject remains untested.",
    EVIDENCE_REFS: [evidence("ev_first_party_collector_graphite", "First-party graphite collector response", "internal")],
    TIME_SENSITIVITY: "THIS_MONTH",
    OWNER: "KEEGAN",
    APPROVAL_CLASS: "L1_RECOMMENDATION",
    NEXT_STEP: "Review the series brief and decide whether it becomes a real experiment.",
    SUCCESS_METRIC: "Brief has a clear subject, composition, collector fit, and testable learning objective.",
    EVALUATION_WINDOW: { start: "2026-08-18", end: "2026-09-15" },
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: "If first-party collector feedback rejects the direction, return to a narrower graphite test.",
    TRUTH_STATE: "KNOWN"
  }),
  withDisplay({
    ACTION_ID: "strategy-monitor-meta-attribution",
    STATE: "MONITOR",
    RANK: 3,
    DOMAIN: "DATA_QUALITY",
    WHAT_CHANGED: "Meta delivery is visible, but purchase attribution is not defensible against commerce evidence.",
    WHY_IT_MATTERS: "Scaling, cutting, or reallocating spend from platform ROAS would create fake precision and brand-risky decisions.",
    RECOMMENDED_ACTION: "Monitor Meta delivery only; keep spend recommendations blocked until attribution is reconciled.",
    EXPECTED_UPSIDE_RANGE: {
      currency: "UNKNOWN",
      horizon: "unknown",
      low_incremental_revenue_cents: null,
      expected_incremental_revenue_cents: null,
      high_incremental_revenue_cents: null,
      notes: ["Upside cannot be estimated while attribution is unknown."],
      assumptions: ["UNKNOWN is not zero."]
    },
    CONFIDENCE: "possible",
    KEY_UNCERTAINTY: "Purchase attribution remains UNKNOWN.",
    EVIDENCE_REFS: [evidence("ev_meta_delivery_snapshot", "Meta delivery snapshot", "internal"), evidence("ev_woo_attribution_counterpoint", "Woo attribution counterpoint", "internal")],
    TIME_SENSITIVITY: "WATCH",
    OWNER: "SYSTEM",
    APPROVAL_CLASS: "L0_INSIGHT",
    NEXT_STEP: "Surface attribution gap in the dashboard and wait for reconciled evidence.",
    SUCCESS_METRIC: "Attribution state moves from UNKNOWN to defensible or remains visibly blocked.",
    EVALUATION_WINDOW: { start: "2026-08-18", end: "2026-08-25" },
    WHAT_WOULD_CHANGE_THE_RECOMMENDATION: "If commerce-source attribution reconciles with platform data, re-evaluate spend recommendations.",
    TRUTH_STATE: "UNKNOWN"
  })
];

export const executiveActionQueueGoldenFixtureV1 = buildExecutiveActionQueueV1();
