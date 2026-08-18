import {
  AgentRunResult,
  ensureDailyIdeaAndKpis,
  formatNumberValue,
  formatPercent,
  getSharedAgentContextForAgent,
  metricSnapshot,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";

export async function runLyra(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("lyra"),
    getAgentDecisionContext("lyra", ["AUDIENCE", "CAREER"])
  ]);
  const { metrics } = sharedContext;
  const { careerOs, laneMoves, latestDirective, relevantResearch, recentMeasuredOutcomes } = decisionContext;
  const audienceMove = laneMoves.find((move) => move.lane === "AUDIENCE") ?? null;
  const careerMove = laneMoves.find((move) => move.lane === "CAREER") ?? null;
  const executiveDirection = directiveSummary(latestDirective);
  const researchSignal = topResearchSummary(relevantResearch);

  const engagement = metricSnapshot(metrics, "engagement_rate");
  const cultural = metricSnapshot(metrics, "cultural_relevance_score");

  const insights = [
    {
      title: "Brand strategy must follow the active Career OS narrative gate",
      summary: audienceMove
        ? `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}: ${audienceMove.title}. Avery direction: ${executiveDirection}`
        : `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} has no ready audience move. Avery direction: ${executiveDirection}`,
      detailMd: `Do not default to generic luxury copy. The current phase objective and real audience outcomes determine what story needs to be told next. Recent measured outcomes available: ${recentMeasuredOutcomes.length}. Research signal: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: ["engagement_rate", "cultural_relevance_score", "conversion_rate"]
    },
    {
      title: "Brand engagement is too soft",
      summary: `Engagement 30d avg is ${formatPercent(engagement?.average)} vs target ${formatPercent(
        engagement?.target
      )} (latest ${formatPercent(engagement?.current)}, Δ ${formatPercent(engagement?.changePercent)}).`,
      detailMd:
        "The brand likely needs sharper authority-based storytelling and stronger emotional positioning.",
      priority: "high" as const,
      relatedMetricKeys: ["engagement_rate"]
    },
    {
      title: "Cultural relevance has room to rise",
      summary: `Cultural relevance 30d avg is ${formatNumberValue(cultural?.average)} (latest ${formatNumberValue(
        cultural?.current
      )}, Δ ${formatPercent(cultural?.changePercent)}).`,
      detailMd: "The brand ceiling is high, but narrative pressure needs to increase through repeatable cultural proof rather than isolated spikes.",
      priority: "high" as const,
      relatedMetricKeys: ["cultural_relevance_score"]
    },
    {
      title: "Message clarity is likely affecting purchase conversion",
      summary: "Brand and ecommerce are linked at the homepage and product-story level.",
      detailMd: "Luxury clarity and authority cues matter, but messaging should also make the active product and career proposition unmistakable.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    }
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
    ...(careerMove
      ? [
          {
            title: "Support the active career-positioning gate",
            summary: `${careerMove.title}: make the story, proof, and presentation consistent with this move.`,
            priority: "high" as const,
            relatedMetricKeys: ["cultural_relevance_score"]
          }
        ]
      : []),
    {
      title: "Sharpen homepage narrative around current proof",
      summary: "Anchor messaging around authority, precision, cultural significance, and the specific collector/career proposition now being advanced.",
      priority: "critical" as const,
      relatedMetricKeys: ["conversion_rate", "cultural_relevance_score"]
    },
    {
      title: "Build collector-status narrative",
      summary: "Position ownership as identity, taste, scarcity, and cultural participation without inventing prestige that the evidence does not support.",
      priority: "high" as const,
      relatedMetricKeys: ["repeat_purchase_rate"]
    }
  ];

  const bigBet = {
    title: "Adaptive Impossible in Pencil brand campaign",
    summary: audienceMove
      ? `Turn '${audienceMove.title}' into a repeatable content and brand system rather than a one-off campaign.`
      : "Develop a cohesive storytelling system that adapts to the active Career OS phase and measured audience response.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCareer OS bottleneck: ${careerOs.primaryBottleneck}\n\nRecent research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: ["cultural_relevance_score", "engagement_rate", "conversion_rate"]
  };

  const tasks = [
    {
      title: "Rewrite homepage narrative hierarchy",
      description: audienceMove
        ? `Strengthen hero, supporting copy, and authority language so the site supports the active audience gate '${audienceMove.title}' and the current collector proposition.`
        : "Strengthen hero, supporting copy, and authority language using the current Career OS phase and measured audience evidence.",
      priority: "critical" as const,
      expectedImpact: "Increase desire, clarity, and conversion quality",
      impactScore: 8.9,
      whyThisMatters: "The brand message must pull harder at first impression without drifting away from the active strategic phase.",
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
    tasks,
    outcomes: [
      {
        outcomeType: "decision",
        title: "Lyra strategy cycle",
        summary: `Brand strategy aligned to Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}${audienceMove ? ` and audience move '${audienceMove.title}'` : ""}.`,
        impactWindow: "7d",
        relatedMetricKeys: ["engagement_rate", "cultural_relevance_score", "conversion_rate"],
        metadata: {
          source: "agent_strategy_cycle",
          careerOsPhase: careerOs.currentPhase.number,
          audienceMove: audienceMove?.id ?? null,
          careerMove: careerMove?.id ?? null,
          directiveAvailable: Boolean(latestDirective),
          researchSignalsRead: relevantResearch.length,
          measuredOutcomesRead: recentMeasuredOutcomes.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "lyra",
    planTitle: "Brand narrative reinforcement plan",
    summary: `Use current evidence and Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} to drive the next brand and audience moves.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks }
  });

  const status = await publishAgentStatusSnapshot("lyra");

  await ensureDailyIdeaAndKpis({
    agentKey: "lyra",
    metrics,
    fallbackIdeaTitle: audienceMove ? `Audience gate: ${audienceMove.title}` : "Sharpen homepage narrative to increase authority + purchase conversion",
    fallbackIdeaSummary: audienceMove?.description ?? "Tighten the Impossible in Pencil story hierarchy and prestige cues to lift purchase conversion."
  });

  return {
    summary: "Aligned brand and content strategy to Avery's directive, the active Career OS gates, current research, and measured audience signals.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
