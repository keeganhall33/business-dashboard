import type { DecisionEvidenceGapV1, DecisionEvidenceRefV1 } from "./contracts";

const ref = (input: DecisionEvidenceRefV1): DecisionEvidenceRefV1 => input;

export const DECISION_EVIDENCE_GAP_FIXTURES_V1: DecisionEvidenceGapV1[] = [
  {
    contract_version: "decision_evidence_gap_v1",
    DECISION_ID: "decision-sufficient-direct-evidence",
    EVIDENCE_REFS: [
      ref({
        ref_id: "ev_fixture_woo_completed_orders_snapshot",
        label: "Completed order snapshot",
        source: "data_evidence_fixture",
        directness: "DIRECT",
        truth_state: "KNOWN",
        freshness_state: "FRESH",
        evidence_quality: "HIGH",
        notes: "Direct fixture evidence is sufficient for this narrow decision."
      })
    ],
    COVERAGE_STATE: "COMPLETE",
    CRITICAL_UNKNOWN: null,
    MATERIALITY_IF_RESOLVED: "LOW",
    CURRENT_PROXY_OR_ANALOG: [],
    DIRECT_VS_PROXY_EVIDENCE: { direct_ref_ids: ["ev_fixture_woo_completed_orders_snapshot"], proxy_or_analog_ref_ids: [], proxy_masquerades_as_direct: false },
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: "No additional research needed for this fixture decision.",
    ESTIMATED_INFORMATION_VALUE_QUALITATIVE: "LOW",
    COST_OR_EFFORT_CLASS: "NOT_WORTH_IT",
    TIME_SENSITIVITY: "LOW",
    CONFIDENCE_CAP: "strongly_supported",
    STOP_RESEARCH_RULE: "Stop when direct fresh evidence covers the decision and no material unknown remains.",
    WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: "A direct contradiction from first-party evidence."
  },
  {
    contract_version: "decision_evidence_gap_v1",
    DECISION_ID: "decision-material-unknown-cheap-research",
    EVIDENCE_REFS: [
      ref({
        ref_id: "project-economics-strategic-weak-direct",
        label: "Weak direct economics fixture",
        source: "financial_fixture",
        directness: "DIRECT",
        truth_state: "UNKNOWN",
        freshness_state: "UNKNOWN",
        evidence_quality: "UNKNOWN",
        notes: "Direct economics are intentionally unknown."
      })
    ],
    COVERAGE_STATE: "GAP",
    CRITICAL_UNKNOWN: "Whether a host or sponsor covers direct event cost.",
    MATERIALITY_IF_RESOLVED: "DECISION_CHANGING",
    CURRENT_PROXY_OR_ANALOG: [],
    DIRECT_VS_PROXY_EVIDENCE: { direct_ref_ids: ["project-economics-strategic-weak-direct"], proxy_or_analog_ref_ids: [], proxy_masquerades_as_direct: false },
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: "Run the cheapest credible internal research step: identify one sponsor/host cost-coverage path before any external action.",
    ESTIMATED_INFORMATION_VALUE_QUALITATIVE: "CRITICAL",
    COST_OR_EFFORT_CLASS: "LOW",
    TIME_SENSITIVITY: "NOW",
    CONFIDENCE_CAP: "possible",
    STOP_RESEARCH_RULE: "Stop after one credible source confirms coverage path, or after no credible path is found.",
    WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: "Known cost coverage would move the recommendation from research-first to bounded validation."
  },
  {
    contract_version: "decision_evidence_gap_v1",
    DECISION_ID: "decision-proxy-only-prestige",
    EVIDENCE_REFS: [
      ref({
        ref_id: "strategy-prepare-creative-direction",
        label: "Premium positioning proxy",
        source: "strategy_fixture",
        directness: "PROXY",
        truth_state: "INFERRED",
        freshness_state: "FRESH",
        evidence_quality: "MEDIUM",
        notes: "Strategy fit is proxy evidence, not direct buyer or sponsor evidence."
      })
    ],
    COVERAGE_STATE: "PARTIAL",
    CRITICAL_UNKNOWN: "Direct buyer intent.",
    MATERIALITY_IF_RESOLVED: "HIGH",
    CURRENT_PROXY_OR_ANALOG: [],
    DIRECT_VS_PROXY_EVIDENCE: { direct_ref_ids: [], proxy_or_analog_ref_ids: ["strategy-prepare-creative-direction"], proxy_masquerades_as_direct: false },
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: "Find one direct buyer/sponsor signal before raising confidence.",
    ESTIMATED_INFORMATION_VALUE_QUALITATIVE: "HIGH",
    COST_OR_EFFORT_CLASS: "LOW",
    TIME_SENSITIVITY: "THIS_WEEK",
    CONFIDENCE_CAP: "possible",
    STOP_RESEARCH_RULE: "Stop if the only available support remains proxy prestige fit.",
    WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: "A direct buyer/sponsor signal would raise confidence; a negative signal would downgrade."
  },
  {
    contract_version: "decision_evidence_gap_v1",
    DECISION_ID: "decision-stale-conflicted-attribution",
    EVIDENCE_REFS: [
      ref({
        ref_id: "ev_fixture_ga4_web_analytics_snapshot",
        label: "Stale analytics fixture",
        source: "data_evidence_fixture",
        directness: "DIRECT",
        truth_state: "STALE",
        freshness_state: "STALE",
        evidence_quality: "MEDIUM",
        notes: "Stale analytics remain visible."
      }),
      ref({
        ref_id: "ev_fixture_meta_delivery_snapshot",
        label: "Conflicted paid attribution fixture",
        source: "data_evidence_fixture",
        directness: "DIRECT",
        truth_state: "CONFLICTED",
        freshness_state: "FRESH",
        evidence_quality: "CONFLICTED",
        notes: "Conflicted attribution blocks a spend recommendation."
      })
    ],
    COVERAGE_STATE: "CONFLICTED",
    CRITICAL_UNKNOWN: "Which attribution source is decision-grade.",
    MATERIALITY_IF_RESOLVED: "DECISION_CHANGING",
    CURRENT_PROXY_OR_ANALOG: [],
    DIRECT_VS_PROXY_EVIDENCE: { direct_ref_ids: ["ev_fixture_ga4_web_analytics_snapshot", "ev_fixture_meta_delivery_snapshot"], proxy_or_analog_ref_ids: [], proxy_masquerades_as_direct: false },
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: "Refresh GA4 and compare against commerce-source attribution before any recommendation changes.",
    ESTIMATED_INFORMATION_VALUE_QUALITATIVE: "CRITICAL",
    COST_OR_EFFORT_CLASS: "MEDIUM",
    TIME_SENSITIVITY: "NOW",
    CONFIDENCE_CAP: "insufficient_evidence",
    STOP_RESEARCH_RULE: "Stop only when stale and conflicted source states are resolved or explicitly accepted as blockers.",
    WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: "Fresh non-conflicted attribution would allow a recommendation; continued conflict keeps it blocked."
  },
  {
    contract_version: "decision_evidence_gap_v1",
    DECISION_ID: "decision-low-value-skip-research",
    EVIDENCE_REFS: [
      ref({
        ref_id: "learn-low-attribution-meta-003",
        label: "Low-attribution learning fixture",
        source: "learning_fixture",
        directness: "ANALOG",
        truth_state: "UNKNOWN",
        freshness_state: "UNKNOWN",
        evidence_quality: "LOW",
        notes: "Analog learning value is too weak to justify more research right now."
      })
    ],
    COVERAGE_STATE: "UNKNOWN",
    CRITICAL_UNKNOWN: "Whether the analog applies to this decision.",
    MATERIALITY_IF_RESOLVED: "LOW",
    CURRENT_PROXY_OR_ANALOG: [],
    DIRECT_VS_PROXY_EVIDENCE: { direct_ref_ids: [], proxy_or_analog_ref_ids: ["learn-low-attribution-meta-003"], proxy_masquerades_as_direct: false },
    NEXT_BEST_SOURCE_OR_RESEARCH_ACTION: "Skip research for now and preserve attention for higher-materiality unknowns.",
    ESTIMATED_INFORMATION_VALUE_QUALITATIVE: "LOW",
    COST_OR_EFFORT_CLASS: "NOT_WORTH_IT",
    TIME_SENSITIVITY: "LOW",
    CONFIDENCE_CAP: "insufficient_evidence",
    STOP_RESEARCH_RULE: "Stop because information value is low and research would not change the recommendation.",
    WHAT_RESULT_WOULD_CHANGE_THE_RECOMMENDATION: "Only a direct high-quality signal would reopen research."
  }
];
