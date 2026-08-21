import { buildDataConfidenceModel, mapStateToConfidenceLabel, type ConfidenceEntry, type ConfidenceSummary } from "@/lib/data-confidence";
import { buildDashboardTruthState, type DashboardTruthState, type DomainTruth } from "@/lib/dashboard/truth-state";
import { buildExecutiveActions, type ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { buildExecutiveSummary, getMaterialMovements } from "@/lib/dashboard/executive-summary";
import type { DecisionRoomEvidenceRefV1 } from "@/lib/decision-room/contracts";
import type { AskJeevesControlV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type {
  ApprovalStateV1,
  ConfidenceV1,
  ExecutiveHomeFixtureV1,
  ExecutiveIntelligenceCardV1,
  FreshnessV1,
  IntelligenceStateV1
} from "./fixtures";
import type { ExecutiveHomeDecisionRoomDrilldownV1 } from "./decision-room-drilldown";

const sourceCardId = "matters-now-live-top-priority";

function confidenceFromLabel(label?: string | null): ConfidenceV1 {
  const normalized = label?.toLowerCase() ?? "";
  if (normalized.includes("high")) return "HIGH";
  if (normalized.includes("low") || normalized.includes("blocked")) return "LOW";
  if (normalized.includes("unknown") || normalized.includes("unavailable")) return "UNKNOWN";
  return "MEDIUM";
}

function freshnessFromDomain(domain: DomainTruth | undefined): FreshnessV1 {
  if (!domain) return "UNKNOWN";
  if (domain.freshness === "stale") return "STALE";
  if (domain.freshness === "unavailable") return "UNKNOWN";
  return "FRESH";
}

function confidenceFromDomain(domain: DomainTruth | undefined): ConfidenceV1 {
  if (!domain) return "UNKNOWN";
  if (domain.confidence === "high") return "HIGH";
  if (domain.confidence === "moderate") return "MEDIUM";
  if (domain.confidence === "low") return "LOW";
  return "UNKNOWN";
}

function topRiskState(entry: ConfidenceEntry | null): IntelligenceStateV1 {
  if (!entry) return "FACT";
  if (entry.state === "stale") return "STALE";
  if (entry.state === "conflicting") return "CONFLICTED";
  if (entry.state === "unavailable" || entry.state === "insufficient_evidence") return "UNKNOWN";
  return "WARNING";
}

function topRiskFreshness(entry: ConfidenceEntry | null): FreshnessV1 {
  if (!entry) return "FRESH";
  if (entry.state === "stale") return "STALE";
  if (entry.state === "unavailable" || entry.state === "insufficient_evidence") return "UNKNOWN";
  return "FRESH";
}

function topRiskConfidence(entry: ConfidenceEntry | null): ConfidenceV1 {
  if (!entry) return "HIGH";
  return confidenceFromLabel(mapStateToConfidenceLabel(entry.state));
}

function approvalState(count: number): ApprovalStateV1 {
  return count > 0 ? "KEEGAN_ACTION_REQUIRED" : "NONE";
}

function actionCard(action: ExecutiveActionPlan | undefined, confidence: ConfidenceSummary): ExecutiveIntelligenceCardV1 {
  if (!action) {
    const risk = confidence.topRisk;
    return {
      id: sourceCardId,
      section: "WHAT_MATTERS_NOW",
      title: risk ? `Resolve ${risk.label} evidence before choosing the next move` : "No verified live recommendation is currently available",
      summary: risk?.executiveImpact ?? "The dashboard did not receive a defensible live recommendation from current overview/Fusion-shaped data.",
      state: risk ? topRiskState(risk) : "UNKNOWN",
      priority: risk ? "DO_NOW" : "MONITOR",
      confidence: risk ? topRiskConfidence(risk) : "UNKNOWN",
      approval_state: "NONE",
      freshness: risk ? topRiskFreshness(risk) : "UNKNOWN",
      specialist_domain: "EVIDENCE",
      why: risk?.decisionImpact ?? "Unavailable is preserved explicitly; fixture recommendations are not promoted into live dashboard conclusions.",
      evidence: risk ? [`${risk.provenance}: ${risk.coverage}`, `Last verified: ${risk.lastVerified ?? "UNKNOWN"}`] : ["No live top action available from dashboard overview."],
      next_action: risk?.recommendedAction ?? "Inspect Data & Evidence before acting."
    };
  }

  return {
    id: sourceCardId,
    section: "WHAT_MATTERS_NOW",
    title: action.title,
    summary: action.impact,
    state: "RECOMMENDATION",
    priority: action.priority === "P1" ? "DO_NOW" : action.priority === "P2" ? "PREPARE" : "MONITOR",
    confidence: confidenceFromLabel(action.confidence),
    approval_state: "NONE",
    freshness: "FRESH",
    specialist_domain: action.sourceDomain === "operations" ? "OPERATIONS" : action.sourceDomain === "pipeline" ? "FINANCIAL" : "STRATEGY",
    why: action.confidenceDetail ?? "Selected from current dashboard overview action evidence, with data-confidence caveats applied.",
    evidence: [action.evidence, action.owner ? `Owner: ${action.owner}` : "Owner: UNKNOWN"],
    next_action: action.due ? `${action.title} (${action.due})` : action.title
  };
}

function changeCard(data: DashboardOverviewResponse): ExecutiveIntelligenceCardV1 {
  const summary = buildExecutiveSummary(data);
  const movement = summary ? getMaterialMovements(summary)[0] : undefined;
  if (!movement || !summary) {
    return {
      id: "changed-live-unavailable",
      section: "WHAT_CHANGED",
      title: "No material live movement is verified",
      summary: "Current production-shaped data does not expose a material before/after movement for this range.",
      state: "UNKNOWN",
      priority: "MONITOR",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "EVIDENCE",
      why: "Missing comparison evidence stays unavailable rather than being backfilled with fixture change narratives.",
      evidence: ["performanceBaseline unavailable or below materiality threshold."],
      next_action: "Keep monitoring until a defensible movement appears."
    };
  }
  return {
    id: "changed-live-material-movement",
    section: "WHAT_CHANGED",
    title: `${movement.label} moved materially`,
    summary: `${movement.label} changed ${Math.round(movement.deltaPercent * 100)}% versus ${summary.comparisonLabel}.`,
    state: "FACT",
    priority: "PREPARE",
    confidence: "MEDIUM",
    approval_state: "NONE",
    freshness: "FRESH",
    specialist_domain: "EVIDENCE",
    why: "This card is derived from the live performance baseline materiality threshold.",
    evidence: [`Range: ${summary.rangeLabel}`, `Comparison: ${summary.comparisonLabel}`],
    next_action: "Open the Decision Room if this movement affects the top priority."
  };
}

function approvalCard(data: DashboardOverviewResponse): ExecutiveIntelligenceCardV1 {
  const count = data.actionQueue?.needsApprovalTasks?.count ?? data.approvalBottlenecks?.pendingCount ?? 0;
  return {
    id: "keegan-action-required-live",
    section: "KEEGAN_ACTION_REQUIRED",
    title: count > 0 ? `${count} approval item${count === 1 ? "" : "s"} require Keegan` : "No Keegan approval required",
    summary: count > 0 ? "Approval-gated work is present in the live action queue." : "No outreach, pricing, publishing, purchase, or execution approval is required by the live queue.",
    state: "FACT",
    priority: count > 0 ? "DO_NOW" : "MONITOR",
    confidence: "HIGH",
    approval_state: approvalState(count),
    freshness: "FRESH",
    specialist_domain: "OPERATIONS",
    why: "This reads the existing action queue and approval bottleneck state without changing any action.",
    evidence: [`needsApprovalTasks.count=${count}`, `oldestPendingHours=${data.approvalBottlenecks?.oldestPendingHours ?? "UNKNOWN"}`],
    next_action: count > 0 ? "Review approval queue; do not execute without explicit approval." : "No action required."
  };
}

function opportunityCard(data: DashboardOverviewResponse): ExecutiveIntelligenceCardV1 {
  const opportunity = data.opportunityRadar?.topOpportunities?.[0];
  if (!opportunity) {
    return {
      id: "top-opportunity-live-unavailable",
      section: "TOP_OPPORTUNITIES",
      title: "No verified live opportunity is available",
      summary: "The current opportunity radar has no top opportunity to promote.",
      state: "UNKNOWN",
      priority: "MONITOR",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "EVIDENCE",
      why: "No fixture opportunity is substituted for live opportunity data.",
      evidence: ["opportunityRadar.topOpportunities is empty."],
      next_action: "Wait for live opportunity evidence or inspect the opportunity radar."
    };
  }
  return {
    id: `top-opportunity-live-${opportunity.id}`,
    section: "TOP_OPPORTUNITIES",
    title: opportunity.name,
    summary: opportunity.nextStep ?? `${opportunity.opportunityType} opportunity is visible in live radar.`,
    state: "INFERENCE",
    priority: opportunity.nextStepDueAt ? "PREPARE" : "MONITOR",
    confidence: typeof opportunity.probabilityScore === "number" && opportunity.probabilityScore >= 0.7 ? "HIGH" : "MEDIUM",
    approval_state: "NONE",
    freshness: opportunity.lastVerifiedAt ? "FRESH" : "UNKNOWN",
    specialist_domain: "FINANCIAL",
    why: "Opportunity value is displayed as radar evidence, not as a committed recommendation.",
    evidence: [`Status: ${opportunity.status}`, `Value estimate: ${opportunity.valueEstimate ?? "UNKNOWN"}`, `Last verified: ${opportunity.lastVerifiedAt ?? "UNKNOWN"}`],
    next_action: opportunity.nextStep ?? "Qualify next step before acting."
  };
}

function domainGapCard(truth: DashboardTruthState, confidence: ConfidenceSummary): ExecutiveIntelligenceCardV1 {
  const risk = confidence.topRisk;
  const domain = risk ? truth.domains[risk.id] : undefined;
  return {
    id: "coverage-gap-live-top-risk",
    section: "DATA_COVERAGE_GAPS",
    title: risk ? `${risk.label} is ${risk.state.replaceAll("_", " ")}` : "No data coverage gap is currently prioritized",
    summary: risk?.executiveImpact ?? "All current confidence entries are usable; keep source caveats visible.",
    state: topRiskState(risk),
    priority: risk && risk.state !== "trusted" ? "PREPARE" : "MONITOR",
    confidence: confidenceFromDomain(domain),
    approval_state: "NONE",
    freshness: freshnessFromDomain(domain),
    specialist_domain: "EVIDENCE",
    why: domain?.consequence.summary ?? "Data coverage gaps are derived from the dashboard confidence model.",
    evidence: risk ? [`${risk.provenance}: ${risk.coverage}`, `Warnings: ${risk.warningCodes.join(", ") || "none"}`] : ["No top risk from confidence model."],
    next_action: risk?.recommendedAction ?? "Continue monitoring source health."
  };
}

function hypothesisCard(confidence: ConfidenceSummary): ExecutiveIntelligenceCardV1 {
  return {
    id: "hypothesis-live-data-confidence",
    section: "CURRENT_HYPOTHESES_EXPERIMENTS",
    title: "Current live hypothesis depends on source confidence",
    summary: confidence.overall.rationale,
    state: "HYPOTHESIS",
    priority: "MONITOR",
    confidence: confidenceFromLabel(confidence.overall.label),
    approval_state: "NONE",
    freshness: confidence.overall.lastRefresh ? "FRESH" : "UNKNOWN",
    specialist_domain: "LEARNING",
    why: "The live dashboard treats confidence caveats as hypotheses to verify, not facts to act on.",
    evidence: [`Trusted sources: ${confidence.trustedSources.join(", ") || "none"}`, `Caveat sources: ${confidence.caveatSources.join(", ") || "none"}`],
    next_action: confidence.recommendedActions[0]?.title ?? "Keep monitoring confidence drift."
  };
}

function learningCard(data: DashboardOverviewResponse): ExecutiveIntelligenceCardV1 {
  const insight = data.changeInsights?.insights?.[0];
  if (!insight) {
    return {
      id: "learning-live-unavailable",
      section: "LEARNING_SINCE_LAST_REVIEW",
      title: "No verified learning delta is available",
      summary: "The live overview did not provide a current learning/change insight.",
      state: "UNKNOWN",
      priority: "MONITOR",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "LEARNING",
      why: "Learning is not fabricated when change-insight evidence is unavailable.",
      evidence: ["changeInsights.insights is empty or unavailable."],
      next_action: "Wait for measured outcomes or explicit change insights."
    };
  }
  return {
    id: `learning-live-${insight.id}`,
    section: "LEARNING_SINCE_LAST_REVIEW",
    title: `${insight.label} ${insight.direction === "down" ? "declined" : insight.direction === "up" ? "increased" : "is unknown"}`,
    summary: insight.interpretation,
    state: "FACT",
    priority: "MONITOR",
    confidence: "MEDIUM",
    approval_state: "NONE",
    freshness: "FRESH",
    specialist_domain: "LEARNING",
    why: "This learning card is derived from the live change-insights snapshot.",
    evidence: [`Source: ${insight.source}`, `Current: ${insight.current ?? "UNKNOWN"}`, `Previous: ${insight.previous ?? "UNKNOWN"}`],
    next_action: "Use this only as learning context unless it becomes the top live recommendation."
  };
}

function doNowCard(action: ExecutiveActionPlan | undefined): ExecutiveIntelligenceCardV1 {
  if (!action) {
    return {
      id: "do-now-live-monitor",
      section: "DO_NOW_PREPARE_MONITOR",
      title: "Monitor until a defensible action appears",
      summary: "No live action passed the dashboard confidence filters.",
      state: "UNKNOWN",
      priority: "MONITOR",
      confidence: "UNKNOWN",
      approval_state: "NONE",
      freshness: "UNKNOWN",
      specialist_domain: "OPERATIONS",
      why: "The action slot stays explicit instead of replaying fixture actions.",
      evidence: ["buildExecutiveActions returned no eligible action."],
      next_action: "Inspect Data & Evidence before acting."
    };
  }
  return {
    id: `do-now-live-${action.id}`,
    section: "DO_NOW_PREPARE_MONITOR",
    title: action.title,
    summary: action.impact,
    state: "ACTION",
    priority: action.priority === "P1" ? "DO_NOW" : "PREPARE",
    confidence: confidenceFromLabel(action.confidence),
    approval_state: "NONE",
    freshness: "FRESH",
    specialist_domain: action.sourceDomain === "operations" ? "OPERATIONS" : "STRATEGY",
    why: action.confidenceDetail ?? "Action came from current dashboard overview evidence.",
    evidence: [action.evidence],
    next_action: action.due ? `${action.title} (${action.due})` : action.title
  };
}

function evidenceRefsForDecisionRoom(action: ExecutiveActionPlan | undefined, confidence: ConfidenceSummary): DecisionRoomEvidenceRefV1[] {
  const refs: DecisionRoomEvidenceRefV1[] = [];
  if (action) {
    refs.push({
      ref_id: `action-${action.id}`,
      label: action.title,
      provenance: "DASHBOARD_OVERVIEW",
      truth_state: action.confidence === "Blocked" ? "UNKNOWN" : action.confidence === "Low" ? "CONFLICTED" : "INFERRED",
      detail: action.evidence
    });
  }
  for (const entry of confidence.entries.slice(0, 4)) {
    refs.push({
      ref_id: `confidence-${entry.id}`,
      label: entry.label,
      provenance: "DATA_CONFIDENCE",
      truth_state: entry.state === "trusted" ? "KNOWN" : entry.state === "conflicting" ? "CONFLICTED" : entry.state === "unavailable" || entry.state === "insufficient_evidence" ? "UNKNOWN" : "INFERRED",
      detail: `${entry.coverage}; ${entry.executiveImpact}`
    });
  }
  return refs;
}

function buildDecisionRoom(data: DashboardOverviewResponse, action: ExecutiveActionPlan | undefined, confidence: ConfidenceSummary): ExecutiveHomeDecisionRoomDrilldownV1 {
  const topTitle = action?.title ?? confidence.topRisk?.label ?? "Live dashboard evidence unavailable";
  const evidenceRefs = evidenceRefsForDecisionRoom(action, confidence);
  const weakest = {
    assumption_id: "assumption-live-source-coverage",
    label: "Live source coverage is sufficient for the next decision",
    truth_state: confidence.topRisk?.state === "trusted" ? "KNOWN" as const : confidence.topRisk?.state === "conflicting" ? "CONFLICTED" as const : "UNKNOWN" as const,
    evidence_refs: evidenceRefs.map((ref) => ref.ref_id),
    why_it_matters: confidence.topRisk?.decisionImpact ?? "If source coverage is unavailable, recommendation strength must stay limited."
  };
  const contextualAsk: AskJeevesControlV1 = {
    id: "contextual-ask-live-dashboard",
    scope: "DECISION_CONTEXT",
    placeholder: "Ask why this live recommendation is grounded...",
    voice_state: "TRANSCRIPT_READY",
    supported_classifications: ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"],
    transcript: "live-dashboard-overview",
    spoken_answer: action ? "The recommendation is grounded in current dashboard evidence with source confidence caveats preserved." : "No live recommendation is promoted because the evidence is unavailable or insufficient.",
    written_answer: action ? `${action.evidence} ${action.confidenceDetail ?? ""}`.trim() : confidence.overall.rationale,
    memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION"
  };
  return {
    contract_version: "decision_room_view_model_v1",
    decision_id: "decision-live-dashboard-top-priority",
    generated_at: data.timestamp,
    source_mode: "LIVE_DASHBOARD_OVERVIEW",
    source_card_id: sourceCardId,
    breadcrumb: ["Executive Home", "What matters now", topTitle],
    current_recommendation: {
      recommendation_id: "live-dashboard-top-priority",
      title: topTitle,
      summary: action?.impact ?? confidence.topRisk?.executiveImpact ?? "No defensible live recommendation is available.",
      next_action: action?.title ?? confidence.topRisk?.recommendedAction ?? "Inspect Data & Evidence before acting."
    },
    confidence: confidenceFromLabel(action?.confidence ?? confidence.overall.label) === "HIGH" ? "strongly_supported" : action ? "likely" : "insufficient_evidence",
    evidence_refs: evidenceRefs,
    assumptions_unknowns: [
      weakest,
      {
        assumption_id: "unknown-live-fixture-free",
        label: "No fixture recommendation has been substituted",
        truth_state: "KNOWN",
        evidence_refs: [],
        why_it_matters: "Production dashboard conclusions must come from live dashboard/Fusion-shaped evidence or remain unavailable."
      }
    ],
    alternatives: [{ alternative_id: "alternative-wait-for-evidence", label: "Wait for stronger evidence", tradeoff: "Protects decision quality but may delay useful action.", evidence_refs: evidenceRefs.map((ref) => ref.ref_id) }],
    opportunity_cost_note: "Acting without source confidence can convert unavailable evidence into false certainty.",
    specialist_disagreement: [{ specialist: "DATA_EVIDENCE", stance: confidence.topRisk && confidence.topRisk.state !== "trusted" ? "NEEDS_MORE_EVIDENCE" : "SUPPORTS", summary: confidence.overall.rationale, evidence_refs: evidenceRefs.map((ref) => ref.ref_id), visible_in_dashboard: true }],
    strongest_argument_against: confidence.topRisk?.decisionImpact ?? "The strongest counterargument is that no live source has produced a material recommendation.",
    weakest_assumption: weakest,
    WHAT_WOULD_CHANGE_MY_MIND: confidence.recommendedActions.map((actionItem) => actionItem.title).concat("A new Fusion-backed top action with stronger source confidence."),
    next_action: action?.title ?? confidence.topRisk?.recommendedAction ?? "Inspect Data & Evidence before acting.",
    approval_class: data.actionQueue?.needsApprovalTasks?.count ? "L3_READY_FOR_APPROVAL" : "L1_RECOMMENDATION",
    challenge: { active: Boolean(confidence.topRisk && confidence.topRisk.state !== "trusted"), red_team_summary: confidence.topRisk?.decisionImpact ?? "No current red-team challenge from live confidence data.", recommendation_overwritten: false, disagreement_visible: true },
    contextual_ask: contextualAsk
  };
}

export function buildExecutiveHomeFromDashboardOverviewV1(data: DashboardOverviewResponse): {
  home: ExecutiveHomeFixtureV1;
  decisionRoom: ExecutiveHomeDecisionRoomDrilldownV1;
} {
  const confidence = buildDataConfidenceModel(data);
  const truth = buildDashboardTruthState({ data, confidence });
  const actions = buildExecutiveActions(data, 3, confidence);
  const topAction = actions[0];
  return {
    home: {
      generated_at: data.timestamp,
      hero: {
        title: "Executive Home",
        summary: `Live dashboard intelligence for ${data.range.startDate} to ${data.range.endDate}. UNKNOWN, STALE, CONFLICTED, and unavailable evidence remain explicit.`
      },
      cards: [
        actionCard(topAction, confidence),
        changeCard(data),
        doNowCard(topAction),
        approvalCard(data),
        opportunityCard(data),
        hypothesisCard(confidence),
        learningCard(data),
        domainGapCard(truth, confidence)
      ],
      empty_state: "No material live intelligence changes need attention right now.",
      loading_state: "Loading live executive intelligence with provenance intact.",
      error_state: "Unable to verify live executive intelligence. Do not treat unavailable data as zero."
    },
    decisionRoom: buildDecisionRoom(data, topAction, confidence)
  };
}
