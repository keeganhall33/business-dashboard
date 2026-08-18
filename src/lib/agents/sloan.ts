import {
  AgentRunResult,
  ensureDailyIdeaAndKpis,
  formatPercent,
  formatUsd,
  getSharedAgentContextForAgent,
  metricSnapshot,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";

export async function runSloan(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("sloan"),
    getAgentDecisionContext("sloan", ["REVENUE"])
  ]);
  const { metrics } = sharedContext;
  const { careerOs, laneMoves, latestDirective, relevantResearch, recentMeasuredOutcomes } = decisionContext;
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
      detailMd: `Use the current phase gate as the strategic guardrail. Recent measured outcomes available: ${recentMeasuredOutcomes.length}. Cross-agent research signal: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "Low AOV is the primary revenue bottleneck",
      summary: `30d avg AOV is ${formatUsd(aov?.average)} vs target ${formatUsd(aov?.target)} (latest ${formatUsd(
        aov?.current
      )}, Δ ${formatPercent(aov?.changePercent)}).`,
      detailMd: "Premium offer architecture is underdeveloped and suppressing revenue growth.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "monthly_revenue"]
    },
    {
      title: "Purchase conversion remains below acceptable range",
      summary: `Purchase conversion 30d avg is ${formatPercent(conversion?.average)} vs target ${formatPercent(
        conversion?.target
      )} (latest ${formatPercent(conversion?.current)}, Δ ${formatPercent(conversion?.changePercent)}).`,
      detailMd: "Homepage and product page clarity likely need tightening.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Cart abandonment remains too high",
      summary: `Cart abandonment 30d avg is ${formatPercent(abandonment?.average)} (latest ${formatPercent(
        abandonment?.current
      )}, Δ ${formatPercent(abandonment?.changePercent)}).`,
      detailMd: "The recovery system and checkout flow likely leave money on the table.",
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
      title: "Redesign pricing ladder only when it serves the active gate",
      summary: "Strengthen premium signed tiers and offer architecture without creating unnecessary price points or diluting the collector proposition.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov"]
    },
    {
      title: "Audit purchase conversion friction",
      summary: "Review homepage, PDP, and checkout experience for clarity and trust signals.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Deploy cart recovery strategy",
      summary: "Create abandoned-cart recovery logic and post-cart recapture flow.",
      priority: "high" as const,
      relatedMetricKeys: ["cart_abandonment_rate"]
    }
  ];

  const bigBet = {
    title: "Premium collector monetization sprint",
    summary: revenueMove
      ? `Use ${revenueMove.title.toLowerCase()} as the immediate revenue experiment while protecting scarcity, prestige, and collector clarity.`
      : "Rebuild the offer structure around scarcity, prestige, and premium collector tiers only as current evidence warrants.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCurrent Career OS bottleneck: ${careerOs.primaryBottleneck}\n\nRecent research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: ["aov", "monthly_revenue", "repeat_purchase_rate"]
  };

  const tasks = [
    {
      title: "Design premium pricing architecture",
      description: revenueMove
        ? `Build the pricing/offer recommendation around the active revenue gate: ${revenueMove.title}. Do not add tiers merely to fill a price gap.`
        : "Create a premium offer recommendation using current sales evidence; do not add tiers merely to fill a price gap.",
      priority: "critical" as const,
      expectedImpact: "Raise AOV while protecting premium positioning",
      impactScore: 9.5,
      whyThisMatters: "AOV is suppressing total revenue, but price architecture must remain consistent with the Career OS and collector proposition.",
      relatedMetricKeys: ["aov", "monthly_revenue"],
      requiresApproval: true,
      executionType: "pricing" as const,
      expectedDurationDays: 5
    },
    {
      title: "Audit checkout and recovery flow",
      description: "Identify friction points in checkout and design recovery improvements using current conversion evidence.",
      priority: "high" as const,
      expectedImpact: "Recover abandoned revenue and improve purchase conversion",
      impactScore: 8.4,
      whyThisMatters: "High abandonment is leaving recoverable revenue behind.",
      relatedMetricKeys: ["cart_abandonment_rate", "conversion_rate"],
      requiresApproval: true,
      executionType: "analysis" as const,
      expectedDurationDays: 3
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
          researchSignalsRead: relevantResearch.length,
          measuredOutcomesRead: recentMeasuredOutcomes.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "sloan",
    planTitle: "Ecommerce revenue uplift plan",
    summary: `Raise AOV and purchase conversion while advancing Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("sloan");

  await ensureDailyIdeaAndKpis({
    agentKey: "sloan",
    metrics,
    fallbackIdeaTitle: revenueMove ? `Revenue gate: ${revenueMove.title}` : "Tighten premium pricing ladder to lift AOV",
    fallbackIdeaSummary: revenueMove?.description ?? "Rebuild offer tiers around scarcity + signed editions to raise AOV without dilution."
  });

  return {
    summary: `Aligned ecommerce strategy to the current Career OS revenue gate, Avery directive, and measured revenue signals.`,
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
