import {
  AgentRunResult,
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
import { getAgentDecisionContext, topResearchSummary } from "./decision-context";
import { recordDailyAgentKpis } from "./kpi-pulse";

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function runAvery(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("avery"),
    getAgentDecisionContext("avery")
  ]);
  const { metrics, opportunities } = sharedContext;
  const {
    careerOs,
    fusionDecision,
    fusionSummary,
    relevantResearch,
    recentMeasuredOutcomes
  } = decisionContext;

  const [sloanUpdates, lyraUpdates, noahUpdates] = await Promise.all([
    getAgentUpdates("sloan", 8),
    getAgentUpdates("lyra", 8),
    getAgentUpdates("noah", 8)
  ]);

  const aov = metricSnapshot(metrics, "aov");
  const conversion = metricSnapshot(metrics, "conversion_rate");
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
  const resolvedAov = aov?.average ?? aov?.current ?? fallbackAovValue;
  const resolvedConversion = conversion?.average ?? conversion?.current ?? fallbackConversionValue;
  const activeOpportunityCount = opportunities?.length ?? 0;
  const activeMoves = careerOs.todayMoves.slice(0, 5);
  const activeMoveSummary = activeMoves.length
    ? activeMoves.map((move) => `${move.lane}: ${move.title}`).join(" | ")
    : "No ready Career OS moves";
  const researchSignal = topResearchSummary(relevantResearch);

  const directiveTitle = `Phase ${careerOs.currentPhase.number}: ${careerOs.currentPhase.title}`;
  const directiveSummary = [
    `Career OS phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} is ${careerOs.phaseCompletionPercent}% complete.`,
    `Binding strategic bottleneck: ${careerOs.primaryBottleneck}.`,
    `Ready moves: ${activeMoveSummary}.`,
    `Internal revenue evidence: AOV ${formatUsd(resolvedAov)}, purchase conversion ${formatPercent(resolvedConversion)}, active opportunities ${formatNumberValue(activeOpportunityCount)}.`,
    `Fusion: ${fusionSummary}`,
    `Awaiting real-world results: ${careerOs.awaitingResults.length}; recent measured outcomes available: ${recentMeasuredOutcomes.length}.`
  ].join(" ");

  const insights = [
    {
      title: "The current Career OS bottleneck is the executive binding constraint",
      summary: `${careerOs.primaryBottleneck} Phase completion: ${careerOs.phaseCompletionPercent}%.`,
      detailMd:
        "Avery should change the tactical mix whenever new evidence warrants it, but should not let attractive side projects displace the current phase objective without an explicit strategic decision.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Revenue metrics are decision inputs, not permanent strategy",
      summary: `AOV is ${formatUsd(resolvedAov)} and purchase conversion is ${formatPercent(resolvedConversion)}.`,
      detailMd:
        "These can be binding business constraints, but they do not automatically outrank identity, audience, relationship, rights, or owned-IP gates. Sloan should diagnose the intervention; Avery should decide the cross-business priority.",
      priority: "high" as const,
      relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"]
    },
    {
      title: "External intelligence must enter strategy through evidence gates",
      summary: fusionSummary,
      detailMd: fusionDecision?.isDecision
        ? "A current Fusion decision is available and may re-rank work when it is compatible with hard constraints and the Career OS objective."
        : "No canonical Fusion operating decision is available. Supplemental research can create questions or research tasks, but should not independently change operating strategy.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Cross-agent outputs must converge on one operating week",
      summary: `Recent specialist updates: Sloan ${sloanUpdates.length}, Lyra ${lyraUpdates.length}, Noah ${noahUpdates.length}.`,
      detailMd: `Specialist advice should be judged against the same phase objective, hard constraints, measured outcomes, and Fusion state. Supplemental research signal: ${researchSignal}`,
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    {
      title: "Advance the current Career OS bottleneck",
      summary: careerOs.primaryBottleneck,
      detailMd: `Current phase: ${careerOs.currentPhase.title}. Current ready moves: ${activeMoveSummary}.`,
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    ...(careerOs.awaitingResults.length
      ? [
          {
            title: "Close the oldest unresolved feedback loops",
            summary: `${careerOs.awaitingResults.length} executed move(s) are awaiting results. Review due outcomes before treating those tactics as validated.`,
            priority: "critical" as const,
            relatedMetricKeys: []
          }
        ]
      : []),
    ...(fusionDecision?.isDecision
      ? [
          {
            title: "Evaluate the current Fusion decision against the phase objective",
            summary: fusionDecision.recommendedAction ?? fusionDecision.headline ?? "Review the current Fusion decision.",
            priority: "high" as const,
            relatedMetricKeys: []
          }
        ]
      : []),
    {
      title: "Sequence specialists around the binding constraint",
      summary:
        "Assign Sloan, Lyra, and Noah the work in their domain that most directly advances the current phase. Suppress static recurring recommendations that are not supported by new evidence.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: `Phase acceleration: ${careerOs.currentPhase.title}`,
    summary:
      "Concentrate the executive system on satisfying the current phase gates while protecting cash flow, creative quality, reputation, rights, and future optionality.",
    detailMd: `${directiveSummary}\n\nThe objective is not to maximize activity. It is to choose the smallest set of actions with the highest expected effect on Keegan's trajectory, then learn from the results.`,
    priority: "critical" as const,
    relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
  };

  const tasks = [
    {
      title: `Set weekly priorities for ${careerOs.currentPhase.title}`,
      description: `Publish no more than three binding weekly priorities using the current Career OS moves, unresolved outcomes, internal evidence, Fusion decision, and specialist findings. Current bottleneck: ${careerOs.primaryBottleneck}`,
      priority: "critical" as const,
      expectedImpact: "Higher decision quality, less strategic drift, and faster phase progression",
      impactScore: 9.4,
      whyThisMatters: "A broad backlog is not an operating strategy.",
      relatedMetricKeys: ["agent_task_completion_rate"],
      requiresApproval: false,
      executionType: "strategy" as const,
      expectedDurationDays: 1
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
        title: `Executive directive: ${directiveTitle}`,
        summary: directiveSummary,
        detailMd: bigBet.detailMd,
        impactScore: 9.3,
        impactWindow: "7d",
        relatedMetricKeys: ["aov", "conversion_rate", "monthly_revenue"],
        metadata: {
          source: "agent_strategy_cycle",
          sloanUpdates: sloanUpdates.length,
          lyraUpdates: lyraUpdates.length,
          noahUpdates: noahUpdates.length,
          careerOsPhase: careerOs.currentPhase.number,
          careerOsPhaseId: careerOs.currentPhase.id,
          careerOsCompletionPercent: careerOs.phaseCompletionPercent,
          careerOsBottleneck: careerOs.primaryBottleneck,
          careerOsAwaitingResults: careerOs.awaitingResults.length,
          activeCareerMoves: activeMoves.map((move) => move.id),
          fusionRunId: fusionDecision?.runId ?? null,
          fusionDecisionAvailable: Boolean(fusionDecision?.isDecision),
          measuredOutcomesRead: recentMeasuredOutcomes.length,
          supplementalResearchRead: relevantResearch.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "avery",
    planTitle: `Executive operating directive: ${careerOs.currentPhase.title}`,
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
          title: directiveTitle,
          summary: directiveSummary,
          detailMd: `Current bottleneck: ${careerOs.primaryBottleneck}. Tactics may change as evidence changes; the phase objective remains the operating guardrail until its gates are defensibly satisfied.`,
          priority: "critical",
          relatedMetricKeys: ["monthly_revenue", "aov", "conversion_rate"]
        }
      ]
    }
  });

  await publishCeoDirective({
    directive: directiveTitle,
    detailMd: directiveSummary,
    targetAgents: ["sloan", "lyra", "noah"],
    priority: "critical"
  });

  await logWarRoomNote({
    title: directiveTitle,
    summary: directiveSummary,
    detailMd: bigBet.detailMd,
    metadata: {
      metrics: {
        aov: resolvedAov,
        conversion_rate: resolvedConversion,
        active_opportunities_count: activeOpportunityCount
      },
      careerOs: {
        phase: careerOs.currentPhase.number,
        phaseId: careerOs.currentPhase.id,
        completionPercent: careerOs.phaseCompletionPercent,
        bottleneck: careerOs.primaryBottleneck,
        awaitingResults: careerOs.awaitingResults.length,
        readyMoves: activeMoves.map((move) => ({ id: move.id, lane: move.lane, title: move.title }))
      },
      fusion: {
        runId: fusionDecision?.runId ?? null,
        decisionAvailable: Boolean(fusionDecision?.isDecision),
        selectedCandidateId: fusionDecision?.selectedCandidateId ?? null
      }
    }
  });

  const status = await publishAgentStatusSnapshot("avery");
  await recordDailyAgentKpis({ agentKey: "avery", metrics });

  return {
    summary: directiveSummary,
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
