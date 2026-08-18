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
import { getAgentUpdates, getCommerceTelemetry, getRecentOutcomeMemory } from "@/lib/supabase/queries";
import { buildCareerOperatingSystem, type CareerOutcomeRow } from "@/lib/career/career-operating-system";

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function runAvery(): Promise<AgentRunResult> {
  const [sharedContext, careerOutcomeMemory] = await Promise.all([
    getSharedAgentContextForAgent("avery"),
    getRecentOutcomeMemory({ agentKey: "avery", includeExpired: true, limit: 500 })
  ]);
  const { metrics, opportunities, researchMemory } = sharedContext;
  const [sloanUpdates, lyraUpdates, noahUpdates] = await Promise.all([
    getAgentUpdates("sloan", 5),
    getAgentUpdates("lyra", 5),
    getAgentUpdates("noah", 5)
  ]);

  const careerOs = buildCareerOperatingSystem(careerOutcomeMemory as CareerOutcomeRow[]);
  const careerFeedbackCount = careerOutcomeMemory.filter(
    (row: { metadata?: Record<string, unknown> | null }) => row.metadata?.source === "career_os_v1"
  ).length;
  const recentIntelCount = researchMemory.length;

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
    )}). Active opportunities tracked: ${formatNumberValue(activeOpportunityCount)}. ` +
    `Career OS: Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}, ${careerOs.phaseCompletionPercent}% gates complete; ` +
    `current bottleneck: ${careerOs.primaryBottleneck}. Awaiting results: ${careerOs.awaitingResults.length}. ` +
    `Feedback records available: ${careerFeedbackCount}; recent research-memory signals available: ${recentIntelCount}.`;

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
      title: "Career OS phase gate",
      summary: `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} is ${careerOs.phaseCompletionPercent}% complete. Highest current bottleneck: ${careerOs.primaryBottleneck}.`,
      detailMd:
        careerOs.awaitingResults.length > 0
          ? `${careerOs.awaitingResults.length} executed career move(s) are still awaiting real-world results. Do not treat execution as proof of success; close those loops before advancing outcome-dependent gates.`
          : "No career moves are currently waiting on delayed outcomes. Advance the highest-leverage executable moves while continuing to ingest new intelligence.",
      priority: "critical" as const,
      relatedMetricKeys: []
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
      summary: "Brand, ecommerce, research, and career feedback need to converge on the same 2 to 3 priorities backed by current evidence.",
      detailMd: `Recent output counts: Sloan ${sloanUpdates.length}, Lyra ${lyraUpdates.length}, Noah ${noahUpdates.length}. Career feedback records ${careerFeedbackCount}; recent intelligence records ${recentIntelCount}.`,
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Advance the current Career OS bottleneck",
      summary: careerOs.primaryBottleneck,
      detailMd: `Current phase: ${careerOs.currentPhase.title}. Use new research, measured outcomes, and relationship/opportunity changes to challenge the tactic while preserving the phase objective.`,
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Reprioritize all agents around AOV, purchase conversion, and pipeline",
      summary: "Kill low-leverage drift and force concentration on the highest-value bottlenecks.",
      priority: "critical" as const,
      relatedMetricKeys: ["aov", "conversion_rate"]
    },
    {
      title: "Sequence work into one clear operating week",
      summary: "Career OS gates first, pricing/conversion next, messaging/distribution next, opportunity preparation after that unless new evidence changes the order.",
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
    summary: "Coordinate product, brand, relationship, and partnership systems around one premium growth push without losing the current Career OS phase gate.",
    detailMd: "The business should behave like a focused luxury operator, not a generalist content machine. Career feedback and new intelligence can change tactics; the phase objective remains the guardrail until its gates are defensibly satisfied.",
    priority: "critical" as const,
    relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
  };

  const tasks = [
    {
      title: "Define weekly command priorities",
      description: `Publish the top 3 system priorities and suppress low-value work for the week. Current Career OS bottleneck: ${careerOs.primaryBottleneck}`,
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
          noahUpdates: noahUpdates.length,
          careerOsPhase: careerOs.currentPhase.number,
          careerOsPhaseId: careerOs.currentPhase.id,
          careerOsCompletionPercent: careerOs.phaseCompletionPercent,
          careerOsBottleneck: careerOs.primaryBottleneck,
          careerOsAwaitingResults: careerOs.awaitingResults.length,
          careerFeedbackCount,
          recentIntelCount
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
            `Current Career OS phase: ${careerOs.currentPhase.title}. Current bottleneck: ${careerOs.primaryBottleneck}. Top business priorities remain premium pricing, conversion clarity, and partnership pipeline expansion unless new evidence changes the tactical order.`,
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
      },
      careerOs: {
        phase: careerOs.currentPhase.number,
        phaseId: careerOs.currentPhase.id,
        completionPercent: careerOs.phaseCompletionPercent,
        bottleneck: careerOs.primaryBottleneck,
        awaitingResults: careerOs.awaitingResults.length,
        feedbackRecords: careerFeedbackCount,
        recentIntelRecords: recentIntelCount
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
