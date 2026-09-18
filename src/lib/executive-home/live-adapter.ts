import { buildDataConfidenceModel, mapStateToConfidenceLabel, type ConfidenceEntry, type ConfidenceSummary } from "@/lib/data-confidence";
import { buildDashboardTruthState, type DashboardTruthState, type DomainTruth } from "@/lib/dashboard/truth-state";
import { buildExecutiveActions, type ExecutiveActionPlan } from "@/lib/dashboard/executive-layout";
import { buildExecutiveSummary, getMaterialMovements } from "@/lib/dashboard/executive-summary";
import { countRangeDays } from "@/lib/date/range";
import type { DecisionRoomEvidenceRefV1 } from "@/lib/decision-room/contracts";
import type { AskJeevesControlV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { DurableAction } from "@/lib/actions/action-contract";
import type { AgentFusionContext } from "@/lib/agents/fusion-context";
import type { CanonicalRelationshipFollowUpQueueResultV1 } from "@/lib/relationships-crm/canonical-follow-up-queue-v1";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import type {
  ApprovalStateV1,
  ConfidenceV1,
  ExecutiveCommandCenterV1,
  ExecutiveBusinessPulseMetricV1,
  ExecutiveHomeFixtureV1,
  ExecutiveIntelligenceCardV1,
  FreshnessV1,
  IntelligenceStateV1,
  ExecutiveCommandCenterTruthStateV1
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

function truthStateFromConfidence(entry: ConfidenceEntry | null | undefined): ExecutiveCommandCenterTruthStateV1 {
  if (!entry) return "UNKNOWN";
  if (entry.state === "trusted") return "KNOWN";
  if (entry.state === "stale") return "STALE";
  if (entry.state === "conflicting") return "CONFLICTED";
  if (entry.state === "unavailable" || entry.state === "insufficient_evidence") return "UNKNOWN";
  return "INFERRED";
}

function compactTrend(metric: { history?: Array<{ value: number | null }> | null } | undefined): Array<number | null> {
  const history = metric?.history?.map((entry) => entry.value ?? null).filter((value, index, values) => index >= Math.max(0, values.length - 6));
  return history && history.length > 1 ? history : [null, null, null];
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function formatComparison(
  deltaPercent: number | null | undefined,
  previous: number | null | undefined,
  formatPrevious: (value: number) => string
) {
  if (previous == null || !Number.isFinite(previous)) return "No verified comparison";
  if (deltaPercent == null || !Number.isFinite(deltaPercent)) return `Previous period: ${formatPrevious(previous)}`;
  const percent = Math.round(deltaPercent * 100);
  return `${percent > 0 ? "+" : ""}${percent}% vs previous (${formatPrevious(previous)})`;
}

function telemetryTruth(
  data: DashboardOverviewResponse,
  source: "woo" | "ga4" | "meta",
  hasValue: boolean
): ExecutiveCommandCenterTruthStateV1 {
  if (!hasValue) return "UNKNOWN";
  const health = data.telemetryHealth?.[source];
  const metadata = data.telemetryMetadata?.[source];
  if (source === "meta" && data.metaAds?.status === "BROKEN") return "CONFLICTED";
  if (health?.status === "critical") return "CONFLICTED";
  if (metadata?.freshnessStatus === "stale") return "STALE";
  if (metadata?.coverageStatus === "partial" || health?.status === "warning" || data.metaAds?.status === "PARTIAL" || data.metaAds?.status === "FALLBACK") return "INFERRED";
  if (!health && !metadata) return "INFERRED";
  return "KNOWN";
}

function buildBusinessPulse(data: DashboardOverviewResponse): ExecutiveBusinessPulseMetricV1[] {
  const baseline = data.performanceBaseline?.metrics;
  const woo = data.commerceTelemetry?.woo;
  const ga4 = data.commerceTelemetry?.ga4;
  const selectedDays = countRangeDays(data.range);
  const metaRangeMatches = Boolean(data.metaAds && selectedDays > 0 && data.metaAds.range === selectedDays);
  const meta = metaRangeMatches ? data.metaAds?.summary : null;
  const revenue = baseline?.revenue.current ?? woo?.summary.revenue ?? null;
  const orders = baseline?.orders.current ?? woo?.summary.orders ?? null;
  const sessions = baseline?.sessions.current ?? ga4?.summary.sessions ?? null;
  const roas = meta?.roas ?? null;

  return [
    {
      id: "revenue",
      label: "Revenue",
      value: revenue == null ? "Unavailable" : `${baseline?.revenue.currentQualifier === "at_least" ? "At least " : ""}${currency.format(revenue)}`,
      comparison: formatComparison(baseline?.revenue.deltaPercent, baseline?.revenue.previous, (value) => currency.format(value)),
      trend: (woo?.timeseries ?? []).slice(-14).map((point) => point.revenue),
      truth_state: telemetryTruth(data, "woo", revenue != null),
      source: "WooCommerce"
    },
    {
      id: "orders",
      label: "Orders",
      value: orders == null ? "Unavailable" : integer.format(orders),
      comparison: formatComparison(baseline?.orders.deltaPercent, baseline?.orders.previous, (value) => integer.format(value)),
      trend: (woo?.timeseries ?? []).slice(-14).map((point) => point.orders),
      truth_state: telemetryTruth(data, "woo", orders != null),
      source: "WooCommerce"
    },
    {
      id: "sessions",
      label: "Site traffic",
      value: sessions == null ? "Unavailable" : integer.format(sessions),
      comparison: formatComparison(baseline?.sessions.deltaPercent, baseline?.sessions.previous, (value) => integer.format(value)),
      trend: (ga4?.timeseries ?? []).slice(-14).map((point) => point.sessions),
      truth_state: telemetryTruth(data, "ga4", sessions != null),
      source: "Google Analytics"
    },
    {
      id: "meta",
      label: "Meta ads",
      value: roas != null ? `${roas.toFixed(1)}x ROAS` : meta?.spend != null ? `${currency.format(meta.spend)} spent` : "Unavailable",
      comparison: !metaRangeMatches && data.metaAds
        ? `Only a ${data.metaAds.range}-day Meta snapshot is available`
        : roas != null && meta?.spend != null
          ? `${currency.format(meta.spend)} spend`
          : roas == null && meta?.spend != null
            ? "ROAS unavailable"
            : "No verified spend",
      trend: [],
      truth_state: telemetryTruth(data, "meta", roas != null || meta?.spend != null),
      source: "Meta Ads"
    }
  ];
}

function reportingRangeLabel(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return `${startDate} to ${endDate}`;
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(end);
  return `${startLabel}–${endLabel}`;
}

function opportunityProjection(opportunity: NonNullable<DashboardOverviewResponse["opportunityRadar"]>["topOpportunities"][number]): ExecutiveCommandCenterV1["opportunities"][number] {
  return {
    id: opportunity.id,
    title: opportunity.name,
    upside: opportunity.valueEstimate == null ? "UNKNOWN" : `$${Math.round(opportunity.valueEstimate).toLocaleString()}`,
    fit: opportunity.prestigeScore == null ? "UNKNOWN" : `${Math.round(opportunity.prestigeScore * 100)}% prestige fit`,
    timing: opportunity.nextStepDueAt ? "Next step scheduled" : "UNKNOWN",
    effort: opportunity.nextStep ? "Next step known" : "UNKNOWN",
    // Records in opportunity_pipeline are canonical opportunities Keegan added
    // or approved. Their existence is known; freshness and next-step timing are
    // separate concerns and must not downgrade the record to "INFERRED".
    evidence: "KNOWN",
    next_move: opportunity.nextStep ?? "Wait for opportunity evidence.",
    detail_href: `/opportunities-actions/opportunity/${encodeURIComponent(opportunity.id)}`
  };
}

function buildCommandCenter(data: DashboardOverviewResponse, actions: ExecutiveActionPlan[], confidence: ConfidenceSummary): ExecutiveCommandCenterV1 {
  const topAction = actions[0];
  const material = buildExecutiveSummary(data);
  const movement = material ? getMaterialMovements(material)[0] : undefined;
  const topOpportunity = data.opportunityRadar?.topOpportunities?.[0];
  const approvalCount = data.actionQueue?.needsApprovalTasks?.count ?? data.approvalBottlenecks?.pendingCount ?? 0;
  const trustedCount = confidence.entries.filter((entry) => entry.state === "trusted").length;
  const caveatCount = confidence.entries.length - trustedCount;
  const primaryMetric = data.revenueEngine?.metrics?.[0];
  const strategyStepLabel = topAction?.title ?? confidence.topRisk?.recommendedAction ?? "Inspect Data & Evidence";

  return {
    generated_at: data.timestamp,
    business_pulse: buildBusinessPulse(data),
    kpis: [
      {
        id: "material-change",
        label: "What changed",
        value: movement ? `${movement.label} moved` : "No verified movement",
        detail: movement ? `${movement.label} changed versus ${material?.comparisonLabel ?? "the comparison period"}.` : "No material before/after movement is available for this range.",
        trend: compactTrend(primaryMetric),
        truth_state: movement ? "KNOWN" : "UNKNOWN",
        last_updated: data.timestamp,
        source: "dashboard executive summary"
      },
      {
        id: "automation-health",
        label: "Automation health",
        value: topAction ? "Keep automation on track" : "Needs evidence",
        detail: topAction?.confidenceDetail ?? confidence.overall.rationale,
        trend: [trustedCount, trustedCount, confidence.entries.length],
        truth_state: topAction ? "INFERRED" : truthStateFromConfidence(confidence.topRisk),
        last_updated: confidence.overall.lastRefresh ?? data.timestamp,
        source: "dashboard action/confidence model"
      },
      {
        id: "keegan-review",
        label: "Keegan review",
        value: approvalCount > 0 ? `${approvalCount} to review` : "None required",
        detail: approvalCount > 0 ? "Approval-gated work is separated from awareness items." : "No live approval-gated action is queued.",
        trend: [approvalCount, approvalCount],
        truth_state: "KNOWN",
        last_updated: data.timestamp,
        source: "action queue"
      },
      {
        id: "highest-value-opportunity",
        label: "Best opportunity",
        value: topOpportunity?.name ?? "UNKNOWN",
        detail: topOpportunity?.nextStep ?? "No verified opportunity is available.",
        trend: [topOpportunity?.prestigeScore ?? null, topOpportunity?.probabilityScore ?? null],
        truth_state: topOpportunity ? "INFERRED" : "UNKNOWN",
        last_updated: topOpportunity?.lastVerifiedAt ?? null,
        source: "opportunity radar"
      },
      {
        id: "data-health",
        label: "Data health",
        value: caveatCount > 0 ? `${caveatCount} caveat${caveatCount === 1 ? "" : "s"}` : "Usable",
        detail: confidence.topRisk?.executiveImpact ?? "Current sources do not expose a top caveat.",
        trend: [trustedCount, caveatCount],
        truth_state: truthStateFromConfidence(confidence.topRisk),
        last_updated: confidence.overall.lastRefresh ?? null,
        source: "data confidence"
      },
      {
        id: "engine-state",
        label: "Intelligence engine",
        value: "4 lanes visible",
        detail: "Strategy, execution, evidence, and learning signals stay separated instead of one fake score.",
        trend: [4, 4, 4, 4],
        truth_state: "KNOWN",
        last_updated: data.timestamp,
        source: "Executive Home adapter"
      }
    ],
    what_changed: [
      {
        id: "material-movement",
        label: movement ? `${movement.label} changed` : "No material movement verified",
        value: movement ? `${Math.round(movement.deltaPercent * 100)}%` : "UNKNOWN",
        why_it_matters: movement ? "A material movement may change the next executive decision." : "Unavailable change evidence stays UNKNOWN rather than zero.",
        trend: compactTrend(primaryMetric),
        truth_state: movement ? "KNOWN" : "UNKNOWN"
      },
      {
        id: "confidence-caveat",
        label: confidence.topRisk?.label ?? "Source coverage",
        value: confidence.topRisk ? confidence.topRisk.state.replaceAll("_", " ") : "UNKNOWN",
        why_it_matters: confidence.topRisk?.decisionImpact ?? "Source caveats determine whether the dashboard can recommend action.",
        trend: [trustedCount, caveatCount],
        truth_state: truthStateFromConfidence(confidence.topRisk)
      }
    ],
    strategy_path: {
      title: strategyStepLabel,
      current_step_id: "step-current-recommendation",
      next_step_id: "step-verify-outcome",
      dependency_note: "Current step unlocks verification; the dashboard does not auto-complete inferred work.",
      steps: [
        {
          id: "step-current-recommendation",
          label: strategyStepLabel,
          why_it_matters: topAction?.impact ?? confidence.overall.rationale,
          state: "IN_PROGRESS",
          dependency_ids: [],
          unlocks_step_id: "step-verify-outcome",
          requires_verification: false,
          completed_at: null,
          provenance: "DASHBOARD_OVERVIEW"
        },
        {
          id: "step-verify-outcome",
          label: "Verify the result before reranking",
          why_it_matters: "Recommendations should update after meaningful completion or new evidence, not from a static checklist.",
          state: "WAITING",
          dependency_ids: ["step-current-recommendation"],
          unlocks_step_id: "step-next-recommendation",
          requires_verification: true,
          completed_at: null,
          provenance: "DASHBOARD_OVERVIEW"
        },
        {
          id: "step-next-recommendation",
          label: "Surface the next best move",
          why_it_matters: "The next step becomes visible only after the prior step is explicitly completed and verified.",
          state: "NOT_STARTED",
          dependency_ids: ["step-verify-outcome"],
          unlocks_step_id: null,
          requires_verification: true,
          completed_at: null,
          provenance: "DASHBOARD_OVERVIEW"
        }
      ],
      history: []
    },
    do_now: [
      { id: "do-access-check", label: strategyStepLabel, state: "IN_PROGRESS", progress: topAction ? 50 : null, detail: topAction?.evidence ?? "No eligible action has source confidence yet." },
      { id: "do-source-caveat", label: confidence.topRisk?.recommendedAction ?? "Keep source caveats visible", state: confidence.topRisk ? "WAITING" : "NOT_STARTED", progress: null, detail: confidence.topRisk?.executiveImpact ?? "No top caveat currently prioritized." }
    ],
    keegan_actions: [
      {
        id: "approval-queue",
        label: approvalCount > 0 ? `${approvalCount} approval item${approvalCount === 1 ? "" : "s"}` : "No Keegan approval required",
        approval_state: approvalState(approvalCount),
        detail: approvalCount > 0 ? "Review before any external or irreversible action." : "No external action, pricing, publishing, or purchase approval is queued."
      }
    ],
    opportunities: data.opportunityRadar?.topOpportunities?.length
      ? data.opportunityRadar.topOpportunities.slice(0, 3).map(opportunityProjection)
      : [{ id: "unknown-opportunity", title: "No verified opportunity", upside: "UNKNOWN", fit: "UNKNOWN", timing: "UNKNOWN", effort: "UNKNOWN", evidence: "UNKNOWN", next_move: "Wait for opportunity evidence.", detail_href: "/opportunities-actions" }],
    system_glance: [
      { id: "projects", label: "Projects", value: data.pipelinePanel?.deals?.length == null ? "UNKNOWN" : String(data.pipelinePanel.deals.length), truth_state: data.pipelinePanel ? "KNOWN" : "UNKNOWN", source: "pipeline panel" },
      { id: "insights", label: "Insights", value: data.changeInsights?.insights?.length == null ? "UNKNOWN" : String(data.changeInsights.insights.length), truth_state: data.changeInsights ? "KNOWN" : "UNKNOWN", source: "change insights" },
      { id: "decisions", label: "Decisions", value: "1 drill-down", truth_state: "KNOWN", source: "Decision Room adapter" },
      { id: "sources", label: "Sources", value: `${trustedCount} trusted`, truth_state: caveatCount > 0 ? "STALE" : "KNOWN", source: "data confidence" }
    ],
    intelligence_engine: [
      { id: "strategy", lane: "Strategy", status: topAction ? "Recommendation ready" : "Needs evidence", truth_state: topAction ? "INFERRED" : "UNKNOWN" },
      { id: "execution", lane: "Execution", status: approvalCount > 0 ? "Review needed" : "No approval block", truth_state: "KNOWN" },
      { id: "evidence", lane: "Evidence", status: confidence.topRisk?.state.replaceAll("_", " ") ?? "No top caveat", truth_state: truthStateFromConfidence(confidence.topRisk) },
      { id: "learning", lane: "Learning", status: data.changeInsights?.insights?.length ? "Change visible" : "No verified delta", truth_state: data.changeInsights?.insights?.length ? "KNOWN" : "UNKNOWN" }
    ]
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
        summary: `Live dashboard intelligence for ${data.range.startDate} to ${data.range.endDate}. UNKNOWN, STALE, CONFLICTED, and unavailable evidence remain explicit.`,
        range_label: reportingRangeLabel(data.range.startDate, data.range.endDate)
      },
      command_center: buildCommandCenter(data, actions, confidence),
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

export type ExecutiveHomeCanonicalAvailabilityV3 = "AVAILABLE" | "UNAVAILABLE";

export type ExecutiveHomeCanonicalInputsV3 = {
  now: string;
  fusion: AgentFusionContext | null;
  actions: readonly DurableAction[];
  followUps: CanonicalRelationshipFollowUpQueueResultV1 | null;
  availability: {
    fusion: ExecutiveHomeCanonicalAvailabilityV3;
    actions: ExecutiveHomeCanonicalAvailabilityV3;
    followUps: ExecutiveHomeCanonicalAvailabilityV3;
  };
};

const terminalActionStatuses = new Set<DurableAction["status"]>([
  "rejected",
  "expired",
  "cancelled",
  "successful",
  "unsuccessful",
  "inconclusive"
]);

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function actionScore(action: DurableAction): number | null {
  const score = record(action.priority_score)?.overallScore;
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function compareActions(left: DurableAction, right: DurableAction): number {
  const leftScore = actionScore(left);
  const rightScore = actionScore(right);
  if (leftScore != null || rightScore != null) {
    if (leftScore == null) return 1;
    if (rightScore == null) return -1;
    if (leftScore !== rightScore) return rightScore - leftScore;
  }
  const updated = Date.parse(right.updated_at) - Date.parse(left.updated_at);
  return Number.isFinite(updated) && updated !== 0 ? updated : left.id.localeCompare(right.id);
}

function actionTruth(action: DurableAction | undefined): ExecutiveCommandCenterTruthStateV1 {
  if (!action) return "UNKNOWN";
  return action.evidence_snapshot_id && action.evidence_snapshot_hash ? "KNOWN" : "UNKNOWN";
}

function actionFreshness(action: DurableAction | undefined, now: string): FreshnessV1 {
  if (!action) return "UNKNOWN";
  const age = Date.parse(now) - Date.parse(action.updated_at);
  if (!Number.isFinite(age)) return "UNKNOWN";
  return age > 14 * 86_400_000 ? "STALE" : "FRESH";
}

function fusionFreshness(fusion: AgentFusionContext | null, now: string): FreshnessV1 {
  if (!fusion?.generatedAt) return "UNKNOWN";
  const age = Date.parse(now) - Date.parse(fusion.generatedAt);
  if (!Number.isFinite(age)) return "UNKNOWN";
  return age > 48 * 3_600_000 ? "STALE" : "FRESH";
}

function fusionConfidence(value: string | null): ConfidenceV1 {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized === "HIGH" || normalized === "CONFIRMED") return "HIGH";
  if (normalized === "MEDIUM" || normalized === "LIKELY" || normalized === "STRONGLY_SUPPORTED") return "MEDIUM";
  if (normalized === "LOW" || normalized === "POSSIBLE") return "LOW";
  return "UNKNOWN";
}

function outcomeSummary(action: DurableAction): string | null {
  const outcome = record(action.outcome);
  const result = record(action.result_snapshot);
  for (const source of [outcome, result]) {
    const direct = recordText(source?.summary) ?? recordText(source?.observed_outcome)
      ?? recordText(source?.result) ?? recordText(source?.description);
    if (direct) return direct;
    const metric = recordText(source?.metric) ?? recordText(source?.metric_name);
    const value = source?.value;
    if (metric && (typeof value === "number" || typeof value === "string")) {
      const unit = recordText(source?.unit);
      return `${metric}: ${String(value)}${unit ? ` ${unit}` : ""}`;
    }
  }
  return null;
}

function replaceEngineLane(
  home: ExecutiveHomeFixtureV1,
  id: string,
  status: string,
  truthState: ExecutiveCommandCenterTruthStateV1
) {
  const lane = home.command_center.intelligence_engine.find((item) => item.id === id);
  if (lane) {
    lane.status = status;
    lane.truth_state = truthState;
  }
}

/**
 * Pure V3 projection over canonical read results. It never performs a read or write,
 * and starts from the production V1 adapter so partial source failures stay isolated.
 */
export function buildExecutiveHomeFromCanonicalSystemsV3(
  data: DashboardOverviewResponse,
  canonical: ExecutiveHomeCanonicalInputsV3,
  baseBuilder: typeof buildExecutiveHomeFromDashboardOverviewV1 = buildExecutiveHomeFromDashboardOverviewV1
): ReturnType<typeof buildExecutiveHomeFromDashboardOverviewV1> {
  const result = structuredClone(baseBuilder(data));
  const home = result.home;
  const fusion = canonical.fusion;
  const fusionIsFresh = fusionFreshness(fusion, canonical.now);

  home.command_center.system_glance.push({
    id: "canonical-fusion",
    label: "Fusion decision",
    value: canonical.availability.fusion === "UNAVAILABLE"
      ? "Unavailable"
      : fusion?.isDecision ? "Decision ready" : "No decision",
    truth_state: canonical.availability.fusion === "UNAVAILABLE" || !fusion
      ? "UNKNOWN"
      : fusionIsFresh === "STALE" ? "STALE" : fusion.isDecision ? "KNOWN" : "UNKNOWN",
    source: fusion ? `FUSION_RUN:${fusion.runId}` : "FUSION_RUN"
  });

  if (fusion?.isDecision && fusion.recommendedAction) {
    const fusionCard = home.cards.find((card) => card.section === "WHAT_MATTERS_NOW");
    if (fusionCard) {
      fusionCard.id = `fusion-${fusion.runId}`;
      fusionCard.title = fusion.headline ?? fusion.recommendedAction;
      fusionCard.summary = fusion.recommendedAction;
      fusionCard.state = "RECOMMENDATION";
      fusionCard.priority = "DO_NOW";
      fusionCard.confidence = fusionConfidence(fusion.confidenceLevel);
      fusionCard.freshness = fusionIsFresh;
      fusionCard.specialist_domain = "STRATEGY";
      fusionCard.why = fusion.why ?? "Persisted Fusion selected this governed recommendation.";
      fusionCard.evidence = [
        `FUSION_RUN:${fusion.runId}`,
        `Generated: ${fusion.generatedAt ?? "UNKNOWN"}`,
        `Missing evidence: ${fusion.missingEvidence.join("; ") || "none recorded"}`
      ];
      fusionCard.next_action = fusion.recommendedAction;
    }
    home.command_center.strategy_path.title = fusion.recommendedAction;
    const currentStep = home.command_center.strategy_path.steps[0];
    if (currentStep) {
      currentStep.label = fusion.recommendedAction;
      currentStep.why_it_matters = `${fusion.why ?? "Selected by persisted Fusion."} Provenance: FUSION_RUN:${fusion.runId}.`;
    }
    replaceEngineLane(home, "strategy", fusionIsFresh === "STALE" ? "Fusion decision is stale" : "Fusion recommendation ready", fusionIsFresh === "STALE" ? "STALE" : "KNOWN");

    result.decisionRoom.current_recommendation = {
      recommendation_id: fusion.selectedCandidateId ?? `fusion-${fusion.runId}`,
      title: fusion.headline ?? fusion.recommendedAction,
      summary: fusion.why ?? fusion.recommendedAction,
      next_action: fusion.recommendedAction
    };
    result.decisionRoom.next_action = fusion.recommendedAction;
    result.decisionRoom.evidence_refs.unshift({
      ref_id: `fusion-${fusion.runId}`,
      label: fusion.headline ?? "Persisted Fusion recommendation",
      provenance: "FUSION_GOVERNED_COMMAND",
      truth_state: fusionIsFresh === "STALE" ? "INFERRED" : "KNOWN",
      detail: `Generated ${fusion.generatedAt ?? "UNKNOWN"}; missing evidence: ${fusion.missingEvidence.join("; ") || "none recorded"}.`
    });
  } else {
    replaceEngineLane(
      home,
      "strategy",
      canonical.availability.fusion === "UNAVAILABLE" ? "Fusion unavailable" : "No persisted Fusion decision",
      "UNKNOWN"
    );
  }

  const orderedActions = [...canonical.actions].sort(compareActions);
  const activeAction = orderedActions.find((action) => !terminalActionStatuses.has(action.status));
  const observedAction = orderedActions.find((action) => outcomeSummary(action) != null);
  const actionsTruth = canonical.availability.actions === "AVAILABLE" ? actionTruth(activeAction ?? observedAction) : "UNKNOWN";

  home.command_center.system_glance.push({
    id: "canonical-actions",
    label: "Durable actions",
    value: canonical.availability.actions === "UNAVAILABLE"
      ? "Unavailable"
      : activeAction ? "Action in flight" : observedAction ? "Outcome recorded" : "No current action",
    truth_state: actionsTruth,
    source: activeAction || observedAction ? `DURABLE_ACTION:${(activeAction ?? observedAction)!.id}` : "DURABLE_ACTION"
  });

  if (activeAction) {
    const actionIsStale = actionFreshness(activeAction, canonical.now) === "STALE";
    home.command_center.do_now.unshift({
      id: `durable-action-${activeAction.id}`,
      label: activeAction.title,
      state: activeAction.status === "execution_blocked" ? "BLOCKED"
        : activeAction.status === "awaiting_approval" ? "WAITING"
          : activeAction.status === "executed" || activeAction.status === "measuring" ? "NEEDS_VERIFICATION" : "IN_PROGRESS",
      progress: null,
      detail: `${activeAction.description ?? activeAction.expected_outcome ?? "No action detail recorded."} Provenance: DURABLE_ACTION:${activeAction.id}; updated ${activeAction.updated_at}.`
    });
    replaceEngineLane(home, "execution", actionIsStale ? `Stale action: ${activeAction.title}` : activeAction.title, actionIsStale ? "STALE" : actionsTruth);
    if (activeAction.status === "awaiting_approval") {
      home.command_center.keegan_actions.unshift({
        id: `durable-action-approval-${activeAction.id}`,
        label: activeAction.title,
        approval_state: "KEEGAN_ACTION_REQUIRED",
        detail: `Approval is required by DURABLE_ACTION:${activeAction.id}; no execution occurred.`
      });
    }
  } else {
    replaceEngineLane(home, "execution", canonical.availability.actions === "UNAVAILABLE" ? "Durable actions unavailable" : "No current durable action", "UNKNOWN");
  }

  const learningCardV3 = home.cards.find((card) => card.section === "LEARNING_SINCE_LAST_REVIEW");
  if (learningCardV3 && observedAction) {
    const observed = outcomeSummary(observedAction)!;
    learningCardV3.id = `durable-outcome-${observedAction.id}`;
    learningCardV3.title = observedAction.lessons ? "A measured lesson candidate is available" : "A measured outcome is available";
    learningCardV3.summary = observed;
    learningCardV3.state = "FACT";
    learningCardV3.confidence = confidenceFromLabel(observedAction.confidence);
    learningCardV3.freshness = actionFreshness(observedAction, canonical.now);
    learningCardV3.why = observedAction.lessons
      ? "The durable action contains an observed outcome and an explicit lesson candidate; it is not auto-promoted to policy."
      : "The observed outcome is shown without inventing a causal lesson.";
    learningCardV3.evidence = [
      `DURABLE_ACTION:${observedAction.id}`,
      `Evidence snapshot: ${observedAction.evidence_snapshot_id ?? "UNKNOWN"}`,
      `Updated: ${observedAction.updated_at}`
    ];
    learningCardV3.next_action = observedAction.lessons ?? "Review attribution and confounders before recording a lesson.";
    replaceEngineLane(home, "learning", observedAction.lessons ? "Lesson candidate available" : "Outcome recorded; attribution pending", actionTruth(observedAction));
  } else if (canonical.availability.actions === "UNAVAILABLE") {
    replaceEngineLane(home, "learning", "Durable outcomes unavailable", "UNKNOWN");
  }

  const topFollowUp = canonical.followUps?.items
    .slice()
    .sort((left, right) => right.priority - left.priority || left.itemId.localeCompare(right.itemId))[0];
  const followUpTruth: ExecutiveCommandCenterTruthStateV1 = topFollowUp?.truthState === "CONFLICTED"
    ? "CONFLICTED"
    : topFollowUp?.freshnessState === "STALE" ? "STALE"
      : topFollowUp?.truthState === "KNOWN" && topFollowUp.freshnessState === "CURRENT" ? "KNOWN" : "UNKNOWN";

  home.command_center.system_glance.push({
    id: "canonical-crm-follow-ups",
    label: "CRM follow-ups",
    value: canonical.availability.followUps === "UNAVAILABLE"
      ? "Unavailable"
      : topFollowUp ? `${canonical.followUps?.items.length ?? 0} due` : "None due",
    truth_state: canonical.availability.followUps === "UNAVAILABLE" ? "UNKNOWN" : topFollowUp ? followUpTruth : "KNOWN",
    source: topFollowUp ? `CRM_FOLLOW_UP:${topFollowUp.itemId}` : "CRM_FOLLOW_UP_QUEUE"
  });

  if (topFollowUp) {
    const followUpLabel = topFollowUp.suggestedMove.replaceAll("_", " ").toLowerCase();
    home.command_center.do_now.unshift({
      id: `crm-follow-up-${topFollowUp.itemId}`,
      label: followUpLabel,
      state: topFollowUp.requiresReview || followUpTruth === "CONFLICTED" ? "BLOCKED" : "NOT_STARTED",
      progress: null,
      detail: `Due ${topFollowUp.dueAt ?? "UNKNOWN"}; ${topFollowUp.primaryQueueClass}; provenance CRM_FOLLOW_UP:${topFollowUp.itemId}.`
    });
    if (topFollowUp.requiresReview) {
      home.command_center.keegan_actions.unshift({
        id: `crm-follow-up-review-${topFollowUp.itemId}`,
        label: `Verify ${followUpLabel}`,
        approval_state: "KEEGAN_ACTION_REQUIRED",
        detail: `CRM follow-up evidence is ${topFollowUp.truthState}/${topFollowUp.freshnessState}; no outreach occurred.`
      });
    }
  }

  home.command_center.do_now = home.command_center.do_now.slice(0, 4);
  home.command_center.keegan_actions = home.command_center.keegan_actions.slice(0, 3);
  home.command_center.system_glance = home.command_center.system_glance.slice(0, 8);
  return result;
}
