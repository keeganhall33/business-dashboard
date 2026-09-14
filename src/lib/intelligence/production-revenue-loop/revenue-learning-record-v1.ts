import type { createActionFromRecommendation } from "@/lib/actions/action-store";
import type { RevenueDecisionPacketV1 } from "./decision-packet-v1";

export type RevenueDurableActionInputV1 = Parameters<
  typeof createActionFromRecommendation
>[0];

const PROJECTION_ACTOR = "REVENUE_DECISION_PACKET_V1";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function confidence(
  packet: RevenueDecisionPacketV1
): "strongly_supported" | "possible" | "insufficient_evidence" {
  if (packet.primaryDriver.confidence === "MEDIUM") return "strongly_supported";
  if (packet.primaryDriver.confidence === "LOW") return "possible";
  return "insufficient_evidence";
}

function title(packet: RevenueDecisionPacketV1): string {
  return packet.primaryDriver.driver
    ? `Revenue decision: ${packet.primaryDriver.driver.toLowerCase()} signal`
    : "Revenue decision: reconcile source evidence";
}

/**
 * Projects an evidence-honest revenue packet into the existing canonical action
 * creation boundary. This function is intentionally pure: it does not persist,
 * approve, execute, or mark an action as taken.
 */
export function projectRevenueDecisionPacketToDurableActionInputV1(
  packet: RevenueDecisionPacketV1
): RevenueDurableActionInputV1 {
  if (packet.status === "INVALID_INPUT") {
    throw new Error("INVALID_REVENUE_DECISION_PACKET");
  }

  const consequential =
    packet.recommendedAction.approvalClass === "KEEGAN_APPROVAL_REQUIRED";
  const sourceCoverage = packet.sourceCoverage.map((item) => ({
    source: item.source,
    truthState: item.truthState,
    evidenceRefs: [...item.evidenceRefs]
  }));
  const evaluationWindow = packet.measurement.evaluationWindow
    ? { ...packet.measurement.evaluationWindow }
    : null;

  return deepFreeze({
    recommendationId: packet.recommendedAction.id,
    opportunityId: null,
    fingerprint: `revenue-decision:${packet.recommendedAction.id}`,
    title: title(packet),
    description: packet.recommendedAction.description,
    category: "revenue_decision",
    channel: "business_dashboard",
    affected_products: [],
    affected_audiences: [],
    priority_score: {
      status: packet.status,
      reasonCode: packet.reasonCode
    },
    confidence: confidence(packet),
    expected_outcome: packet.measurement.successThreshold,
    estimated_impact: {
      metric: packet.measurement.metric,
      baseline: packet.measurement.baseline,
      direction: packet.whatChanged.direction,
      baselineCents: packet.whatChanged.baselineCents,
      currentCents: packet.whatChanged.currentCents,
      absoluteChangeCents: packet.whatChanged.absoluteChangeCents,
      percentChange: packet.whatChanged.percentChange,
      successThreshold: packet.measurement.successThreshold
    },
    estimated_cost: { state: "UNKNOWN" },
    estimated_effort: { state: "UNKNOWN" },
    risk: consequential ? "medium" : "low",
    evidence_snapshot: {
      decision_id: packet.recommendedAction.id,
      packet_version: packet.version,
      generated_at: packet.generatedAt,
      packet_status: packet.status,
      reason_code: packet.reasonCode,
      outcome_state: packet.outcomeState,
      what_changed: { ...packet.whatChanged },
      source_coverage: sourceCoverage,
      primary_driver: { ...packet.primaryDriver },
      hypothesis:
        packet.primaryDriver.state === "SUPPORTED"
          ? packet.primaryDriver.statement
          : null,
      expected_mechanism: null,
      corroborating_evidence: [...packet.corroboratingEvidence],
      conflicting_evidence: [...packet.conflictingEvidence],
      alternative_hypotheses: [...packet.alternativeHypotheses],
      recommended_action: { ...packet.recommendedAction }
    },
    approval_requirements: {
      approvalClass: packet.recommendedAction.approvalClass,
      keeganApprovalRequired: consequential,
      executesMutation: false
    },
    measurement_window: {
      metric: packet.measurement.metric,
      success_metric: packet.measurement.metric,
      baseline: packet.measurement.baseline,
      start: evaluationWindow?.startDate ?? null,
      end: evaluationWindow?.endDate ?? null,
      success_threshold: packet.measurement.successThreshold,
      stop_rule: packet.measurement.stopRule,
      outcome_state: packet.outcomeState
    },
    assumptions: [...packet.assumptions],
    limitations: [...packet.limitations],
    idempotencyKey: `revenue-decision:${packet.recommendedAction.id}:${packet.generatedAt}`,
    actor: PROJECTION_ACTOR
  });
}
