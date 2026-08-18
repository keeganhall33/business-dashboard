import {
  AgentRunResult,
  formatPercent,
  formatUsd,
  getSharedAgentContextForAgent,
  metricSnapshot,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";
import { recordDailyAgentKpis } from "./kpi-pulse";

export async function runSloan(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("sloan"),
    getAgentDecisionContext("sloan")
  ]);
  const { metrics } = sharedContext;
  const {
    careerOs,
    laneMoves,
    latestDirective,
    fusionDecision,
    fusionSummary,
    relevantResearch,
    recentMeasuredOutcomes
  } = decisionContext;
  const revenueMove = laneMoves[0] ?? null;
  const executiveDirection = directiveSummary(latestDirective);
  const researchSignal = topResearchSummary(relevantResearch);

  const aov = metricSnapshot(metrics, "aov");
  const conversion = metricSnapshot(metrics, "conversion_rate");
  const abandonment = metricSnapshot(metrics, "cart_abandonment_rate");

  const insights = [
    {
      title: "Current revenue work must stay aligned to the Career OS",
      summary: revenueMove
        ? `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}: ${revenueMove.title}. Avery direction: ${executiveDirection}`
        : `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} has no ready revenue-lane move. Avery direction: ${executiveDirection}`,
      detailMd: `Use the current phase gate as the strategic guardrail. Recent measured outcomes available: ${recentMeasuredOutcomes.length}. Canonical Fusion context: ${fusionSummary} Supplemental research: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "AOV requires attention, not an automatic price change",
      summary: `30d avg AOV is ${formatUsd(aov?.average)} vs target ${formatUsd(aov?.target)} (latest ${formatUsd(
        aov?.current
      )}, Δ ${formatPercent(aov?.changePercent)}).`,
      detailMd:
        "AOV is a constraint signal. Change pricing or offer architecture only when current product, launch, margin, and collector evidence support the intervention.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "monthly_revenue"]
    },
    {
      title: "Purchase conversion remains below acceptable range",
      summary: `Purchase conversion 30d avg is ${formatPercent(conversion?.average)} vs target ${formatPercent(
        conversion?.target
      )} (latest ${formatPercent(conversion?.current)}, Δ ${formatPercent(conversion?.changePercent)}).`,
      detailMd: "Diagnose traffic quality, offer clarity, product fit, and checkout friction before assigning causality to the website narrative.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Cart abandonment is a recoverable-value signal",
      summary: `Cart abandonment 30d avg is ${formatPercent(abandonment?.average)} (latest ${formatPercent(
        abandonment?.current
      )}, Δ ${formatPercent(abandonment?.changePercent)}).`,
      detailMd: "Recovery and checkout changes should be measured as experiments rather than assumed wins.",
      priority: "high" as const,
      relatedMetricKeys: ["cart_abandonment_rate"]
    }
  ];

  const actions = [
    ...(revenueMove
      ? [
          {
            title: "Advance the current Career OS revenue gate",
            summary: `${revenueMove.title}: ${revenueMove.description}`,
            priority: "critical" as const,
            relatedMetricKeys: ["aov", "monthly_revenue"]
          }
        ]
      : []),
    {
      title: "Choose the next revenue intervention from evidence",
      summary:
        "Compare pricing, offer clarity, traffic quality, conversion friction, cart recovery, and product demand. Advance the intervention with the strongest evidence and clearest measurement window.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "cart_abandonment_rate"]
    }
  ];

  const bigBet = {
    title: "Evidence-backed collector economics",
    summary: revenueMove
      ? `Use ${revenueMove.title.toLowerCase()} as the immediate revenue experiment while protecting scarcity, prestige, cash flow, and collector clarity.`
      : "Improve collector economics through the highest-confidence current revenue intervention rather than repeatedly redesigning pricing by default.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCurrent Career OS bottleneck: ${careerOs.primaryBottleneck}\n\nFusion: ${fusionSummary}\n\nSupplemental research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: ["aov", "monthly_revenue", "conversion_rate", "repeat_purchase_rate"]
  };

  const tasks = revenueMove
    ? [
        {
          title: `Revenue gate: ${revenueMove.title}`,
          description: `${revenueMove.description} Define the baseline, expected result, evaluation window, and what would cause the recommendation to change before execution.`,
          priority: "critical" as const,
          expectedImpact: "Advance the active Career OS revenue gate with measurable evidence",
          impactScore: 9.2,
          whyThisMatters: revenueMove.why,
          relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"],
          requiresApproval: true,
          executionType: "strategy" as const,
          expectedDurationDays: Math.max(1, revenueMove.reviewAfterDays || 3)
        }
      ]
    : [
        {
          title: "Diagnose the current revenue binding constraint",
          description:
            "Compare current AOV, conversion, abandonment, traffic/product context, recent outcomes, and Fusion evidence. Produce one ranked intervention with measurement and stop conditions.",
          priority: "high" as const,
          expectedImpact: "Prevent repeated low-confidence revenue changes",
          impactScore: 8.4,
          whyThisMatters: "Revenue metrics can identify symptoms without identifying the correct intervention.",
          relatedMetricKeys: ["aov", "conversion_rate", "cart_abandonment_rate"],
          requiresApproval: false,
          executionType: "analysis" as const,
          expectedDurationDays: 2
        }
      ];

  const outputResult = await writeAgentOutputs({
    agentKey: "sloan",
    insights,
    actions,
    bigBet,
    tasks,
    outcomes: [
      {
        outcomeType: "decision",
        title: "Sloan strategy cycle",
        summary: `Revenue strategy aligned to Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}${revenueMove ? ` and move '${revenueMove.title}'` : ""}.`,
        impactWindow: "7d",
        relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"],
        metadata: {
          source: "agent_strategy_cycle",
          careerOsPhase: careerOs.currentPhase.number,
          careerOsMove: revenueMove?.id ?? null,
          directiveAvailable: Boolean(latestDirective),
          fusionRunId: fusionDecision?.runId ?? null,
          fusionDecisionAvailable: Boolean(fusionDecision?.isDecision),
          researchSignalsRead: relevantResearch.length,
          measuredOutcomesRead: recentMeasuredOutcomes.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "sloan",
    planTitle: "Revenue and commerce decision plan",
    summary: `Advance the highest-confidence revenue move while supporting Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("sloan");
  await recordDailyAgentKpis({ agentKey: "sloan", metrics });

  return {
    summary: "Aligned revenue strategy to the Career OS, Avery directive, canonical Fusion decision, and measured business outcomes.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
