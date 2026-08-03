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

export async function runSloan(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContextForAgent("sloan");
  const aov = metricSnapshot(metrics, "aov");
  const conversion = metricSnapshot(metrics, "conversion_rate");
  const abandonment = metricSnapshot(metrics, "cart_abandonment_rate");

  const insights = [
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
    {
      title: "Redesign pricing ladder",
      summary: "Introduce stronger premium signed tiers and better offer architecture.",
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
    summary: "Rebuild the offer structure around scarcity, prestige, and premium collector tiers.",
    detailMd: "This is the fastest path to lift AOV materially without diluting the brand.",
    priority: "critical" as const,
    relatedMetricKeys: ["aov", "monthly_revenue", "repeat_purchase_rate"]
  };

  const tasks = [
    {
      title: "Design premium pricing architecture",
      description: "Create a 3-tier premium signed edition structure and revised product positioning.",
      priority: "critical" as const,
      expectedImpact: "Raise AOV materially within 30 to 60 days",
      impactScore: 9.5,
      whyThisMatters: "AOV is suppressing total revenue.",
      relatedMetricKeys: ["aov", "monthly_revenue"],
      requiresApproval: true,
      executionType: "pricing" as const,
      expectedDurationDays: 5
    },
    {
      title: "Audit checkout and recovery flow",
      description: "Identify friction points in checkout and design recovery improvements.",
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
    tasks
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "sloan",
    planTitle: "Ecommerce revenue uplift plan",
    summary: "Raise AOV, unclog purchase conversion, and recover abandoned revenue.",
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("sloan");

  await ensureDailyIdeaAndKpis({
    agentKey: "sloan",
    metrics,
    fallbackIdeaTitle: "Tighten premium pricing ladder to lift AOV",
    fallbackIdeaSummary: "Rebuild offer tiers around scarcity + signed editions to raise AOV without dilution."
  });

  return {
    summary: "Identified AOV, purchase conversion, and abandonment as the top ecommerce blockers.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId
  };
}
