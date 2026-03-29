import { AgentRunResult, getSharedAgentContext, writeAgentOutputs } from "./shared";

export async function runNoah(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContext();
  const pipeline = metrics.find((m) => m.metric_key === "active_brand_conversations");

  const insights = [
    {
      title: "Partnership pipeline is too thin",
      summary: `Only ${pipeline?.current_value} active conversations are live.`,
      detailMd: "The opportunity engine needs more top-of-funnel prestige targets.",
      priority: "critical" as const,
      relatedMetricKeys: ["active_brand_conversations"]
    },
    {
      title: "Targeting should skew harder toward prestige leverage",
      summary: "A smaller set of high-status targets can outperform a larger generic list.",
      detailMd:
        "Focus on elite institutions, top sports properties, collectible brands, and culturally resonant figures.",
      priority: "high" as const,
      relatedMetricKeys: ["active_brand_conversations"]
    },
    {
      title: "Timing opportunities should be mapped further ahead",
      summary: "The system benefits from identifying cultural windows before they peak.",
      detailMd: "This improves pitch timing and creative readiness.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Build next prestige target list",
      summary: "Identify 25 high-fit institutions, brands, and figures.",
      priority: "critical" as const,
      relatedMetricKeys: ["active_brand_conversations"]
    },
    {
      title: "Map strongest near-term cultural openings",
      summary:
        "Identify upcoming moments that align with sports, celebrity, or institutional collaborations.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Prepare target-specific pitch angles",
      summary: "Define why each target is strategically right.",
      priority: "high" as const,
      relatedMetricKeys: ["active_brand_conversations"]
    }
  ];

  const bigBet = {
    title: "Prestige partnership sprint",
    summary:
      "Concentrate on a narrow set of high-upside targets with tailored pitch angles.",
    detailMd: "This should improve both deal quality and future brand leverage.",
    priority: "critical" as const,
    relatedMetricKeys: ["active_brand_conversations", "tier1_brand_collabs"]
  };

  const tasks = [
    {
      title: "Research 25 prestige-fit targets",
      description:
        "Build the next high-value target list with target type, rationale, and next-step suggestion.",
      priority: "critical" as const,
      expectedImpact: "Expand deal flow and increase likelihood of higher-value collaborations",
      impactScore: 8.8,
      whyThisMatters: "The opportunity engine is underfilled.",
      relatedMetricKeys: ["active_brand_conversations"],
      requiresApproval: true,
      executionType: "research" as const
    }
  ];

  const opportunities = [
    {
      name: "Topps sports collectible collaboration",
      organization: "Topps",
      opportunityType: "licensing" as const,
      status: "researching" as const,
      valueEstimate: 50000,
      prestigeScore: 9.2,
      probabilityScore: 0.35,
      nextStep: "Find the right category or licensing contact and tailor the angle",
      nextStepDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notesMd: "Strong fit with sports-adjacent prestige and collectible behavior.",
      source: "research"
    }
  ];

  const output = await writeAgentOutputs({
    agentKey: "noah",
    insights,
    actions,
    bigBet,
    tasks,
    opportunities
  });

  return {
    summary: "Expanded the research pipeline and created the next opportunity sprint.",
    ...output
  };
}
