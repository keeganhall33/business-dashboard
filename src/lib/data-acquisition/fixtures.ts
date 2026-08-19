import { DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1, type DataAcquisitionCoverageMapV1 } from "./contracts";

export const DATA_ACQUISITION_COVERAGE_FIXTURES_V1 = ([
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-healthy-first-party-commerce",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Validate completed-order revenue for dashboard finance context",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-completed-order-total",
        label: "Completed order total",
        materiality: "HIGH",
        truth_state: "KNOWN",
        coverage_state: "COMPLETE",
        why_required: "Finance context needs a first-party order fact before revenue-sensitive recommendations.",
        covered_by_source_ids: ["woo.completed_orders"]
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "woo.completed_orders",
        label: "Woo completed orders",
        SOURCE_CLASS: "FIRST_PARTY",
        SOURCE_HEALTH: "HEALTHY",
        FRESHNESS: "FRESH",
        evidence_quality: "HIGH",
        covers_fact_ids: ["fact-completed-order-total"],
        notes: "Fixture first-party commerce coverage is current and decision-grade."
      }
    ],
    SOURCE_CLASS: ["FIRST_PARTY"],
    SOURCE_HEALTH: "HEALTHY",
    FRESHNESS: "FRESH",
    COVERAGE_STATE: "COMPLETE",
    CRITICAL_GAPS: [],
    CONFLICTS: [],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "monitor-woo-freshness",
      label: "No new acquisition; monitor freshness drift.",
      safety: "READ_ONLY_INTERNAL_REVIEW",
      rationale: "Additional research has low value while first-party coverage is healthy."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "LOW",
    COST_OR_EFFORT_CLASS: "NOT_WORTH_IT",
    STOP_RESEARCH_RULE: "Stop while first-party completed-order evidence is fresh and non-conflicted.",
    APPROVAL_CLASS: "NO_APPROVAL_NEEDED",
    evidence_refs: ["ev_fixture_woo_completed_orders_snapshot"]
  },
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-stale-first-party-analytics",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Assess website conversion mix",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-current-session-conversion-mix",
        label: "Current session and conversion mix",
        materiality: "HIGH",
        truth_state: "STALE",
        coverage_state: "PARTIAL",
        why_required: "Conversion recommendations need current traffic quality and conversion mix.",
        covered_by_source_ids: ["ga4.web_analytics"]
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "ga4.web_analytics",
        label: "GA4 web analytics",
        SOURCE_CLASS: "FIRST_PARTY",
        SOURCE_HEALTH: "STALE",
        FRESHNESS: "STALE",
        evidence_quality: "MEDIUM",
        covers_fact_ids: ["fact-current-session-conversion-mix"],
        notes: "Stale first-party analytics remain visible; they are not treated as false."
      }
    ],
    SOURCE_CLASS: ["FIRST_PARTY"],
    SOURCE_HEALTH: "STALE",
    FRESHNESS: "STALE",
    COVERAGE_STATE: "PARTIAL",
    CRITICAL_GAPS: [
      {
        fact_id: "fact-current-session-conversion-mix",
        materiality: "HIGH",
        coverage_state: "PARTIAL",
        truth_state: "STALE",
        why_it_matters: "The decision can change if the current traffic mix differs from the stale fixture."
      }
    ],
    CONFLICTS: [],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "refresh-ga4-window",
      label: "Refresh the selected GA4 window before conversion recommendations.",
      safety: "READ_ONLY_INTERNAL_REVIEW",
      rationale: "Fresh first-party analytics are higher value than proxy assumptions."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "HIGH",
    COST_OR_EFFORT_CLASS: "LOW",
    STOP_RESEARCH_RULE: "Stop after the current selected-window source is fresh enough for the decision.",
    APPROVAL_CLASS: "NO_APPROVAL_NEEDED",
    evidence_refs: ["ev_fixture_ga4_web_analytics_snapshot"]
  },
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-conflicted-attribution",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Decide whether paid attribution evidence can support spend allocation",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-decision-grade-attribution-source",
        label: "Decision-grade attribution source",
        materiality: "DECISION_CRITICAL",
        truth_state: "CONFLICTED",
        coverage_state: "CONFLICTED",
        why_required: "Spend recommendations cannot rely on averaged conflicting attribution.",
        covered_by_source_ids: ["meta.ads_attribution", "woo.order_source"]
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "meta.ads_attribution",
        label: "Meta ads attribution",
        SOURCE_CLASS: "PRIMARY",
        SOURCE_HEALTH: "CONFLICTED",
        FRESHNESS: "FRESH",
        evidence_quality: "CONFLICTED",
        covers_fact_ids: ["fact-decision-grade-attribution-source"],
        notes: "Platform attribution conflicts with commerce-source attribution."
      },
      {
        source_id: "woo.order_source",
        label: "Woo order source",
        SOURCE_CLASS: "FIRST_PARTY",
        SOURCE_HEALTH: "HEALTHY",
        FRESHNESS: "FRESH",
        evidence_quality: "HIGH",
        covers_fact_ids: ["fact-decision-grade-attribution-source"],
        notes: "First-party commerce counterpoint is preserved."
      }
    ],
    SOURCE_CLASS: ["FIRST_PARTY", "PRIMARY"],
    SOURCE_HEALTH: "CONFLICTED",
    FRESHNESS: "FRESH",
    COVERAGE_STATE: "CONFLICTED",
    CRITICAL_GAPS: [
      {
        fact_id: "fact-decision-grade-attribution-source",
        materiality: "DECISION_CRITICAL",
        coverage_state: "CONFLICTED",
        truth_state: "CONFLICTED",
        why_it_matters: "Resolving the conflict determines whether spend allocation is safe."
      }
    ],
    CONFLICTS: [
      {
        conflict_id: "conflict-meta-vs-woo-attribution",
        source_ids: ["meta.ads_attribution", "woo.order_source"],
        fact_ids: ["fact-decision-grade-attribution-source"],
        summary: "Meta and Woo attribution disagree on which source drove order value.",
        resolution_action: "Compare source-specific order evidence before any paid-spend recommendation."
      }
    ],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "compare-commerce-attribution",
      label: "Compare Meta, Woo, and GA4 attribution evidence before spend allocation.",
      safety: "READ_ONLY_INTERNAL_REVIEW",
      rationale: "Conflict resolution has decision-critical information value."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "CRITICAL",
    COST_OR_EFFORT_CLASS: "MEDIUM",
    STOP_RESEARCH_RULE: "Stop only when the attribution conflict is resolved or accepted as a blocker.",
    APPROVAL_CLASS: "NO_APPROVAL_NEEDED",
    evidence_refs: ["ev_fixture_meta_delivery_snapshot", "ev_fixture_woo_attribution_counterpoint"]
  },
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-missing-public-research",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Validate whether a prestige sports-culture opportunity has institutional fit",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-institutional-program-fit",
        label: "Institutional program fit",
        materiality: "DECISION_CRITICAL",
        truth_state: "NEEDS_RESEARCH",
        coverage_state: "GAP",
        why_required: "The strategy changes if there is no credible public evidence of program fit.",
        covered_by_source_ids: []
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "public.program-pages",
        label: "Public program pages",
        SOURCE_CLASS: "PRIMARY",
        SOURCE_HEALTH: "MISSING",
        FRESHNESS: "UNKNOWN",
        evidence_quality: "UNKNOWN",
        covers_fact_ids: [],
        notes: "Safe public research is available but has not been collected in this fixture."
      }
    ],
    SOURCE_CLASS: ["PRIMARY"],
    SOURCE_HEALTH: "MISSING",
    FRESHNESS: "UNKNOWN",
    COVERAGE_STATE: "GAP",
    CRITICAL_GAPS: [
      {
        fact_id: "fact-institutional-program-fit",
        materiality: "DECISION_CRITICAL",
        coverage_state: "GAP",
        truth_state: "NEEDS_RESEARCH",
        why_it_matters: "Public program fit is a gating fact for whether to scout the opportunity."
      }
    ],
    CONFLICTS: [],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "review-public-program-pages",
      label: "Review official public program pages and summarize fit/no-fit evidence.",
      safety: "SAFE_PUBLIC_RESEARCH",
      rationale: "This is safe, low-effort public research with decision-critical information value."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "CRITICAL",
    COST_OR_EFFORT_CLASS: "LOW",
    STOP_RESEARCH_RULE: "Stop after official public evidence supports fit/no-fit or the source is unavailable.",
    APPROVAL_CLASS: "NO_APPROVAL_NEEDED",
    evidence_refs: []
  },
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-protected-private-source",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Assess private relationship history for warm access",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-private-relationship-history",
        label: "Private relationship history",
        materiality: "HIGH",
        truth_state: "UNKNOWN",
        coverage_state: "UNKNOWN",
        why_required: "Warm access should be based on real relationship history, not inference.",
        covered_by_source_ids: []
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "private.email_or_crm",
        label: "Private email/CRM relationship history",
        SOURCE_CLASS: "PROTECTED_PRIVATE",
        SOURCE_HEALTH: "APPROVAL_REQUIRED",
        FRESHNESS: "UNKNOWN",
        evidence_quality: "UNKNOWN",
        covers_fact_ids: [],
        notes: "Protected private source cannot be connected or searched automatically in this slice."
      }
    ],
    SOURCE_CLASS: ["PROTECTED_PRIVATE"],
    SOURCE_HEALTH: "APPROVAL_REQUIRED",
    FRESHNESS: "UNKNOWN",
    COVERAGE_STATE: "UNKNOWN",
    CRITICAL_GAPS: [
      {
        fact_id: "fact-private-relationship-history",
        materiality: "HIGH",
        coverage_state: "UNKNOWN",
        truth_state: "UNKNOWN",
        why_it_matters: "The access recommendation changes if a real first-party relationship exists."
      }
    ],
    CONFLICTS: [],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "request-private-source-approval",
      label: "Ask Keegan for explicit approval before any private source connection or review.",
      safety: "APPROVAL_GATED_PRIVATE_SOURCE",
      rationale: "Private relationship data is high value but cannot be acquired automatically."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "HIGH",
    COST_OR_EFFORT_CLASS: "APPROVAL_REQUIRED",
    STOP_RESEARCH_RULE: "Stop before private-source work unless Keegan explicitly approves it.",
    APPROVAL_CLASS: "KEEGAN_APPROVAL_REQUIRED",
    evidence_refs: []
  },
  {
    contract_version: DATA_ACQUISITION_COVERAGE_MAP_VERSION_V1,
    map_id: "coverage-low-value-proxy-trend",
    as_of: "2026-08-19",
    source: "fixture",
    DECISION_OR_CAPABILITY: "Check whether a generic social trend should influence premium positioning",
    REQUIRED_FACTS: [
      {
        fact_id: "fact-generic-trend-applicability",
        label: "Generic trend applicability",
        materiality: "LOW",
        truth_state: "INFERRED",
        coverage_state: "PARTIAL",
        why_required: "Only relevant if it would change a premium positioning decision.",
        covered_by_source_ids: ["proxy.social-trend"]
      }
    ],
    CURRENT_SOURCES: [
      {
        source_id: "proxy.social-trend",
        label: "Generic social trend proxy",
        SOURCE_CLASS: "PROXY",
        SOURCE_HEALTH: "DEGRADED",
        FRESHNESS: "UNKNOWN",
        evidence_quality: "LOW",
        covers_fact_ids: ["fact-generic-trend-applicability"],
        notes: "Proxy trend signal is low materiality and should not consume research capacity."
      }
    ],
    SOURCE_CLASS: ["PROXY"],
    SOURCE_HEALTH: "DEGRADED",
    FRESHNESS: "UNKNOWN",
    COVERAGE_STATE: "PARTIAL",
    CRITICAL_GAPS: [],
    CONFLICTS: [],
    NEXT_BEST_ACQUISITION_ACTION: {
      action_id: "suppress-low-value-trend-research",
      label: "Suppress generic trend research unless a direct premium-positioning signal appears.",
      safety: "SUPPRESS",
      rationale: "The information value is low and would not change the decision."
    },
    VALUE_OF_INFORMATION_QUALITATIVE: "LOW",
    COST_OR_EFFORT_CLASS: "NOT_WORTH_IT",
    STOP_RESEARCH_RULE: "Stop because proxy trend research is low materiality and not decision-changing.",
    APPROVAL_CLASS: "NO_APPROVAL_NEEDED",
    evidence_refs: ["proxy_social_trend_fixture"]
  }
] satisfies DataAcquisitionCoverageMapV1[]).sort((a, b) => a.map_id.localeCompare(b.map_id));
