import { AgentRunResult, getSharedAgentContext, writeAgentOutputs } from "./shared";

export async function runSloan(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContext();

  const aov = metrics.find((m) => m.metric_key === "aov");
  const conversion = metrics.find((m) => m.metric_key === "conversion_rate");
  const abandonment = metrics.find((m) => m.metric_key === "cart_abandonment_rate");

  const insights = [
    {
      title: "Low AOV is the primary revenue bottleneck",
      summary: `Current AOV is ${aov?.current_value}, well below target.`,
      detailMd: "Premium offer architecture is underdeveloped and suppressing revenue growth.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "monthly_revenue"]
    },
    {
      title: "Conversion remains below acceptable range",
      summary: `Current conversion rate is ${conversion?.current_value}%.`,
      detailMd: "Homepage and product page clarity likely need tightening.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate"]
    },
    {
      title: "Cart abandonment remains too high",
      summary: `Cart abandonment is ${abandonment?.current_value}%.`,
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
      title: "Audit conversion friction",
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
      executionType: "pricing" as const
    },
    {
      title: "Audit checkout and recovery flow",
      description: "Identify friction points in checkout and design recovery improvements.",
      priority: "high" as const,
      expectedImpact: "Recover abandoned revenue and improve conversion",
      impactScore: 8.4,
      whyThisMatters: "High abandonment is leaving recoverable revenue behind.",
      relatedMetricKeys: ["cart_abandonment_rate", "conversion_rate"],
      requiresApproval: true,
      executionType: "analysis" as const
    }
  ];

  const output = await writeAgentOutputs({
    agentKey: "sloan",
    insights,
    actions,
    bigBet,
    tasks
  });

  return {
    summary: "Identified AOV, conversion, and abandonment as the top ecommerce blockers.",
    ...output
  };
}
