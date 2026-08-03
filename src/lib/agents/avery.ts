import {
  AgentRunResult,
  ensureDailyIdeaAndKpis,
  formatNumberValue,
  formatPercent,
  formatUsd,
  getSharedAgentContextForAgent,
  logWarRoomNote,
  metricSnapshot,
  publishAgentStatusSnapshot,
  publishCeoDirective,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { getAgentUpdates, getCommerceTelemetry } from "@/lib/supabase/queries";

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function runAvery(): Promise<AgentRunResult> {
  const { metrics, opportunities } = await getSharedAgentContextForAgent("avery");
  const [sloanUpdates, lyraUpdates, noahUpdates] = await Promise.all([
    getAgentUpdates("sloan", 5),
    getAgentUpdates("lyra", 5),
    getAgentUpdates("noah", 5)
  ]);

  const aov = metricSnapshot(metrics, "aov");
  const conversion = metricSnapshot(metrics, "conversion_rate");
  const aovAvgValue = aov?.average ?? aov?.current ?? null;
  const aovCurrentValue = aov?.current ?? aov?.average ?? null;
  const aovDeltaValue = aov?.changePercent ?? null;
  const conversionAvgValue = conversion?.average ?? conversion?.current ?? null;
  const conversionCurrentValue = conversion?.current ?? conversion?.average ?? null;
  const conversionDeltaValue = conversion?.changePercent ?? null;
  const dateEnd = new Date();
  const dateStart = new Date(dateEnd);
  dateStart.setUTCDate(dateStart.getUTCDate() - 30);
  const commerceTelemetry = await getCommerceTelemetry({
    startDate: formatDateOnly(dateStart),
    endDate: formatDateOnly(dateEnd)
  });
  const fallbackAovValue = commerceTelemetry?.woo?.summary?.avgOrderValue ?? null;
  const orders = commerceTelemetry?.woo?.summary?.orders ?? null;
  const sessions = commerceTelemetry?.ga4?.summary?.sessions ?? null;
  const fallbackConversionValue = orders != null && sessions ? (orders / sessions) * 100 : null;
  const resolvedAovAvg = aovAvgValue ?? fallbackAovValue;
  const resolvedAovCurrent = aovCurrentValue ?? fallbackAovValue;
  const resolvedConversionAvg = conversionAvgValue ?? fallbackConversionValue;
  const resolvedConversionCurrent = conversionCurrentValue ?? fallbackConversionValue;
  const activeOpportunityCount = opportunities?.length ?? 0;
  const directiveSummary =
    `Pricing and purchase conversion remain below target: AOV 30d avg ${formatUsd(resolvedAovAvg)} (Δ ${formatPercent(
      aovDeltaValue
    )}), purchase conversion ${formatPercent(resolvedConversionAvg)} (Δ ${formatPercent(
      conversionDeltaValue
    )}). Active opportunities tracked: ${formatNumberValue(activeOpportunityCount)}.`;

  const insights = [
    {
      title: "Revenue gap is still primarily structural",
      summary: `AOV 30d avg is ${formatUsd(resolvedAovAvg)} vs target ${formatUsd(aov?.target)} (latest ${formatUsd(
        resolvedAovCurrent
      )}, trend ${formatPercent(aovDeltaValue)}). Purchase conversion 30d avg is ${formatPercent(
        resolvedConversionAvg
      )} vs target ${formatPercent(conversion?.target)} (latest ${formatPercent(
        resolvedConversionCurrent
      )}, Δ ${formatPercent(conversionDeltaValue)}).`,
      detailMd:
        "The strongest path is not more noise. It is better offer structure and sharper brand presentation.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "Pipeline expansion must accelerate",
      summary: `Only ${formatNumberValue(activeOpportunityCount)} high-priority opportunities are active right now.`,
      detailMd: "The system needs more high-status opportunities entering the funnel.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Cross-agent work must stay coordinated",
      summary: "Brand, ecommerce, and research outputs need to converge on the same 2 to 3 priorities backed by the 30d data trends above.",
      detailMd: `Recent output counts: Sloan ${sloanUpdates.length}, Lyra ${lyraUpdates.length}, Noah ${noahUpdates.length}.`,
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Reprioritize all agents around AOV, purchase conversion, and pipeline",
      summary: "Kill low-leverage drift and force concentration on the highest-value bottlenecks.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate"]
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
    relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
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
        relatedMetricKeys: ["aov", "conversion_rate"],
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
          relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
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
        aov_current: aov?.current ?? null,
        aov_avg_30d: aov?.average ?? null,
        conversion_rate_current: conversion?.current ?? null,
        conversion_rate_avg_30d: conversion?.average ?? null,
        active_opportunities_count: activeOpportunityCount
      }
    }
  });

  const status = await publishAgentStatusSnapshot("avery");

  await ensureDailyIdeaAndKpis({
    agentKey: "avery",
    metrics,
    fallbackIdeaTitle: "Kill low-leverage drift: enforce 3 weekly priorities",
    fallbackIdeaSummary: directiveSummary
  });

  return {
    summary: directiveSummary,
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
