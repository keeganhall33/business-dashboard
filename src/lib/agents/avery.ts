import {
  AgentRunResult,
  getSharedAgentContextForAgent,
  logWarRoomNote,
  publishAgentStatusSnapshot,
  publishCeoDirective,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { getAgentUpdates } from "@/lib/supabase/queries";

export async function runAvery(): Promise<AgentRunResult> {
  const { metrics } = await getSharedAgentContextForAgent("avery");
  const [sloanUpdates, lyraUpdates, noahUpdates] = await Promise.all([
    getAgentUpdates("sloan", 5),
    getAgentUpdates("lyra", 5),
    getAgentUpdates("noah", 5)
  ]);

  const aov = metrics.find((m) => m.metric_key === "aov");
  const conversion = metrics.find((m) => m.metric_key === "conversion_rate");
  const pipeline = metrics.find((m) => m.metric_key === "active_brand_conversations");
  const directiveSummary =
    "Shift the system toward pricing power, conversion clarity, and rapid partnership pipeline expansion.";

  const insights = [
    {
      title: "Revenue gap is still primarily structural",
      summary: `AOV (${aov?.current_value}) and conversion (${conversion?.current_value}%) remain below target.`,
      detailMd:
        "The strongest path is not more noise. It is better offer structure and sharper brand presentation.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "Pipeline expansion must accelerate",
      summary: `Only ${pipeline?.current_value} active brand conversations are live.`,
      detailMd: "The system needs more high-status opportunities entering the funnel.",
      priority: "critical" as const,
      relatedMetricKeys: ["active_brand_conversations"]
    },
    {
      title: "Cross-agent work must stay coordinated",
      summary: "Brand, ecommerce, and research outputs need to converge on the same 2 to 3 priorities.",
      detailMd: `Recent output counts: Sloan ${sloanUpdates.length}, Lyra ${lyraUpdates.length}, Noah ${noahUpdates.length}.`,
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Reprioritize all agents around AOV, conversion, and pipeline",
      summary: "Kill low-leverage drift and force concentration on the highest-value bottlenecks.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "active_brand_conversations"]
    },
    {
      title: "Sequence work into one clear operating week",
      summary: "Pricing first, messaging second, opportunity prep third.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Enforce approval discipline",
      summary: "Require approval for any external action or irreversible change.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: "Prestige revenue sprint",
    summary: "Coordinate product, brand, and partnership systems around one premium growth push.",
    detailMd: "The business should behave like a focused luxury operator, not a generalist content machine.",
    priority: "critical" as const,
    relatedMetricKeys: ["monthly_revenue", "aov", "active_brand_conversations"]
  };

  const tasks = [
    {
      title: "Define weekly command priorities",
      description: "Publish the top 3 system priorities and suppress low-value work for the week.",
      priority: "high" as const,
      expectedImpact: "Better strategic alignment and faster execution",
      impactScore: 8.0,
      whyThisMatters: "Focus drift kills performance.",
      relatedMetricKeys: ["agent_task_completion_rate"],
      requiresApproval: false,
      executionType: "strategy" as const,
      expectedDurationDays: 2
    }
  ];

  const outputResult = await writeAgentOutputs({
    agentKey: "avery",
    insights,
    actions,
    bigBet,
    tasks,
    outcomes: [
      {
        outcomeType: "decision",
        title: "Directive: premium revenue sprint",
        summary: directiveSummary,
        detailMd: bigBet.detailMd,
        impactScore: 9.1,
        impactWindow: "7d",
        relatedMetricKeys: ["aov", "conversion_rate", "active_brand_conversations"],
        metadata: {
          sloanUpdates: sloanUpdates.length,
          lyraUpdates: lyraUpdates.length,
          noahUpdates: noahUpdates.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "avery",
    planTitle: "Executive operating directive",
    summary: directiveSummary,
    detailMd: bigBet.detailMd,
    payload: {
      insights,
      actions,
      bigBet,
      tasks,
      postApprovalUpdates: [
        {
          updateType: "directive",
          title: "Weekly Executive Directive",
          summary: directiveSummary,
          detailMd:
            "Top priorities: premium pricing, conversion clarity, and partnership pipeline expansion.",
          priority: "critical",
          relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate", "active_brand_conversations"]
        }
      ]
    }
  });

  await publishCeoDirective({
    directive: "Premium revenue sprint",
    detailMd: directiveSummary,
    targetAgents: ["sloan", "lyra", "noah"],
    priority: "critical"
  });

  await logWarRoomNote({
    title: "Weekly Executive Directive",
    summary: directiveSummary,
    detailMd: bigBet.detailMd,
    metadata: {
      metrics: {
        aov: aov?.current_value ?? null,
        conversion_rate: conversion?.current_value ?? null,
        active_brand_conversations: pipeline?.current_value ?? null
      }
    }
  });

  const status = await publishAgentStatusSnapshot("avery");

  return {
    summary: directiveSummary,
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
