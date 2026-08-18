import {
  AgentRunResult,
  formatNumberValue,
  formatPercent,
  getSharedAgentContextForAgent,
  metricSnapshot,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";
import { recordDailyAgentKpis } from "./kpi-pulse";

export async function runLyra(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("lyra"),
    getAgentDecisionContext("lyra")
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
  const audienceMove = laneMoves.find((move) => move.lane === "AUDIENCE") ?? null;
  const ownedFutureMove = laneMoves.find((move) => move.lane === "OWNED_FUTURE") ?? null;
  const executiveDirection = directiveSummary(latestDirective);
  const researchSignal = topResearchSummary(relevantResearch);

  const engagement = metricSnapshot(metrics, "engagement_rate");
  const cultural = metricSnapshot(metrics, "cultural_relevance_score");

  const insights = [
    {
      title: "Brand and audience strategy must follow the active authorship gate",
      summary: audienceMove
        ? `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}: ${audienceMove.title}. Avery direction: ${executiveDirection}`
        : `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} has no ready audience move. Avery direction: ${executiveDirection}`,
      detailMd: `Do not default to generic luxury copy or posting volume. Use the current phase, owned-future work, real audience outcomes, and evidence-gated external context. Fusion: ${fusionSummary} Supplemental research: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: ["engagement_rate", "cultural_relevance_score", "conversion_rate"]
    },
    {
      title: "Audience attention is a continuity problem, not only an engagement-rate problem",
      summary: `Engagement 30d avg is ${formatPercent(engagement?.average)} vs target ${formatPercent(
        engagement?.target
      )} (latest ${formatPercent(engagement?.current)}, Δ ${formatPercent(engagement?.changePercent)}).`,
      detailMd:
        "Evaluate cadence, content mix, cultural proof, subject relevance, and narrative continuity before assuming the solution is copy optimization.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate"]
    },
    {
      title: "Cultural relevance must compound between tentpoles",
      summary: `Cultural relevance 30d avg is ${formatNumberValue(cultural?.average)} (latest ${formatNumberValue(
        cultural?.current
      )}, Δ ${formatPercent(cultural?.changePercent)}).`,
      detailMd: "The objective is sustained recognition and cultural proof, not isolated spikes around major projects.",
      priority: "high" as const,
      relatedMetricKeys: ["cultural_relevance_score"]
    },
    ...(ownedFutureMove
      ? [
          {
            title: "Owned visual language is a brand system, not a side experiment",
            summary: `${ownedFutureMove.title}: ${ownedFutureMove.description}`,
            detailMd:
              "Lyra should help define how the audience learns the new visual mechanism, what proof establishes authorship, and how it remains connected to Keegan's sports/cultural advantage.",
            priority: "critical" as const,
            relatedMetricKeys: ["cultural_relevance_score"]
          }
        ]
      : [])
  ];

  const actions = [
    ...(audienceMove
      ? [
          {
            title: "Advance the current Career OS audience gate",
            summary: `${audienceMove.title}: ${audienceMove.description}`,
            priority: "critical" as const,
            relatedMetricKeys: ["engagement_rate", "cultural_relevance_score"]
          }
        ]
      : []),
    ...(ownedFutureMove
      ? [
          {
            title: "Make the owned-future work legible to the audience",
            summary: `${ownedFutureMove.title}: define the story, visual cue, process proof, and feedback signal that will test whether the language is becoming identifiable.`,
            priority: "high" as const,
            relatedMetricKeys: ["cultural_relevance_score"]
          }
        ]
      : []),
    {
      title: "Protect the content heartbeat",
      summary:
        "Maintain a sustainable repeatable system across process, impossible detail, story, cultural proof, archive, reveal, and commerce. Increase frequency only when the production system can support quality.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate"]
    }
  ];

  const bigBet = {
    title: "Identifiable authorship and sustained attention",
    summary: audienceMove
      ? `Turn '${audienceMove.title}' into a repeatable content and recognition system rather than a one-off campaign.`
      : "Build sustained awareness around recognizable Keegan authorship, cultural proof, and a dependable content system.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCareer OS bottleneck: ${careerOs.primaryBottleneck}\n\nFusion: ${fusionSummary}\n\nSupplemental research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: ["cultural_relevance_score", "engagement_rate", "conversion_rate"]
  };

  const activeMove = audienceMove ?? ownedFutureMove;
  const tasks = activeMove
    ? [
        {
          title: `Brand gate: ${activeMove.title}`,
          description: `${activeMove.description} Build the smallest useful narrative/content system that advances this gate and specify how audience response will be measured.`,
          priority: "critical" as const,
          expectedImpact: "Advance sustained awareness and identifiable authorship",
          impactScore: 9.0,
          whyThisMatters: activeMove.why,
          relatedMetricKeys: ["engagement_rate", "cultural_relevance_score"],
          requiresApproval: true,
          executionType: "content" as const,
          expectedDurationDays: Math.max(1, activeMove.reviewAfterDays || 3)
        }
      ]
    : [
        {
          title: "Diagnose the current audience continuity gap",
          description:
            "Review recent content cadence, formats, cultural proof, audience outcomes, and Fusion context. Recommend one next narrative/content experiment with a measurement window.",
          priority: "high" as const,
          expectedImpact: "Prevent generic brand work and restore sustained attention",
          impactScore: 8.3,
          whyThisMatters: "Low engagement can have multiple causes and should not default to a homepage rewrite.",
          relatedMetricKeys: ["engagement_rate", "cultural_relevance_score"],
          requiresApproval: false,
          executionType: "analysis" as const,
          expectedDurationDays: 2
        }
      ];

  const outputResult = await writeAgentOutputs({
    agentKey: "lyra",
    insights,
    actions,
    bigBet,
    tasks,
    outcomes: [
      {
        outcomeType: "decision",
        title: "Lyra strategy cycle",
        summary: `Brand and audience strategy aligned to Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}${activeMove ? ` and move '${activeMove.title}'` : ""}.`,
        impactWindow: "7d",
        relatedMetricKeys: ["engagement_rate", "cultural_relevance_score", "conversion_rate"],
        metadata: {
          source: "agent_strategy_cycle",
          careerOsPhase: careerOs.currentPhase.number,
          audienceMove: audienceMove?.id ?? null,
          ownedFutureMove: ownedFutureMove?.id ?? null,
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
    agentKey: "lyra",
    planTitle: "Brand, audience, and cultural intelligence plan",
    summary: `Use current evidence and Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} to drive the next audience and authorship move.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("lyra");
  await recordDailyAgentKpis({ agentKey: "lyra", metrics });

  return {
    summary: "Aligned brand and audience strategy to Avery, Career OS, canonical Fusion context, owned visual-language work, and measured audience outcomes.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
