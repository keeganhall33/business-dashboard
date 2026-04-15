import {
  AgentRunResult,
  getSharedAgentContextForAgent,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";

export async function runLyra(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContextForAgent("lyra");
  const engagement = metrics.find((m) => m.metric_key === "engagement_rate");
  const cultural = metrics.find((m) => m.metric_key === "cultural_relevance_score");

  const insights = [
    {
      title: "Brand engagement is too soft",
      summary: `Engagement rate is ${engagement?.current_value}% versus target.`,
      detailMd:
        "The brand likely needs sharper authority-based storytelling and stronger emotional positioning.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate"]
    },
    {
      title: "Cultural relevance has room to rise",
      summary: `Current internal relevance score is ${cultural?.current_value}.`,
      detailMd: "The brand ceiling is high, but narrative pressure needs to increase.",
      priority: "high" as const,
      relatedMetricKeys: ["cultural_relevance_score"]
    },
    {
      title: "Message clarity is likely affecting conversion",
      summary: "Brand and ecommerce are linked at the homepage and product-story level.",
      detailMd: "Luxury clarity and authority cues likely need to be more explicit.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    }
  ];

  const actions = [
    {
      title: "Sharpen homepage narrative",
      summary: "Anchor messaging around authority, precision, and cultural significance.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    },
    {
      title: "Build collector-status narrative",
      summary: "Position ownership as identity, taste, and cultural participation.",
      priority: "high" as const,
      relatedMetricKeys: ["repeat_purchase_rate"]
    },
    {
      title: "Prioritize prestige-oriented campaign language",
      summary: "Use more selective, authority-rich framing across brand surfaces.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate", "cultural_relevance_score"]
    }
  ];

  const bigBet = {
    title: "Impossible in Pencil brand campaign",
    summary:
      "Develop a cohesive storytelling campaign that unifies homepage, product storytelling, and social narrative.",
    detailMd: "This campaign should make the work feel singular, elite, and culturally magnetic.",
    priority: "critical" as const,
    relatedMetricKeys: ["cultural_relevance_score", "engagement_rate", "conversion_rate"]
  };

  const tasks = [
    {
      title: "Rewrite homepage narrative hierarchy",
      description:
        "Strengthen hero, supporting copy, and authority language for immediate luxury positioning.",
      priority: "critical" as const,
      expectedImpact: "Increase desire and conversion quality",
      impactScore: 8.9,
      whyThisMatters: "The brand message must pull harder at first impression.",
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"],
      requiresApproval: true,
      executionType: "content" as const
    }
  ];

  const outputResult = await writeAgentOutputs({
    agentKey: "lyra",
    insights,
    actions,
    bigBet,
    tasks
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "lyra",
    planTitle: "Brand narrative reinforcement plan",
    summary: "Rebuild the Impossible in Pencil story to lift engagement and conversion.",
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("lyra");

  return {
    summary: "Sharpened brand narrative and conversion messaging priorities.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId
  };
}
