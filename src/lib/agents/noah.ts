import {
  AgentRunResult,
  formatNumberValue,
  getSharedAgentContextForAgent,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";
import { recordDailyAgentKpis } from "./kpi-pulse";

type OpportunityRow = Record<string, unknown> & {
  status?: string;
  name?: string;
  prestige_score?: number | string | null;
  prestigeScore?: number | string | null;
  next_step?: string | null;
  nextStep?: string | null;
};

function numericPrestige(opp: OpportunityRow) {
  const raw = opp.prestige_score ?? opp.prestigeScore ?? 0;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function hasAccessMechanism(opp: OpportunityRow) {
  const nextStep = opp.next_step ?? opp.nextStep;
  return typeof nextStep === "string" && nextStep.trim().length >= 12;
}

export async function runNoah(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("noah"),
    getAgentDecisionContext("noah")
  ]);
  const { metrics, opportunities: contextOpportunities } = sharedContext;
  const {
    careerOs,
    laneMoves,
    latestDirective,
    fusionDecision,
    fusionSummary,
    relevantResearch,
    recentMeasuredOutcomes
  } = decisionContext;
  const relationshipMove = laneMoves.find((move) => move.lane === "RELATIONSHIP") ?? null;
  const careerMove = laneMoves.find((move) => move.lane === "CAREER") ?? null;
  const executiveDirection = directiveSummary(latestDirective);
  const researchSignal = topResearchSummary(relevantResearch);

  const activeOpportunities = ((contextOpportunities ?? []) as OpportunityRow[]).filter(
    (opp) => !["won", "lost", "parked"].includes(String(opp.status ?? ""))
  );
  const prestigeOpportunities = activeOpportunities.filter((opp) => numericPrestige(opp) >= 8);
  const qualifiedPathOpportunities = activeOpportunities.filter(hasAccessMechanism);
  const readyForOutreach = activeOpportunities.filter((opp) => opp.status === "ready_for_outreach");

  const insights = [
    {
      title: "External intelligence must serve the active relationship and career gates",
      summary: relationshipMove
        ? `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}: ${relationshipMove.title}. Avery direction: ${executiveDirection}`
        : `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} has no ready relationship move. Avery direction: ${executiveDirection}`,
      detailMd: `Power-map activity, events, gifts, competitor patterns, emerging models, and partnership research should converge on the current phase. Canonical Fusion context: ${fusionSummary} Supplemental research: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Pipeline quality matters more than target-list size",
      summary: `${formatNumberValue(activeOpportunities.length)} live opportunities are tracked; ${formatNumberValue(qualifiedPathOpportunities.length)} have a concrete next-step/access mechanism and ${formatNumberValue(prestigeOpportunities.length)} clear the stored prestige bar.`,
      detailMd:
        "An impressive name is not actionable pipeline. Qualification requires strategic fit, timing, evidence, a value proposition, and a credible path to the person or buyer.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Timing and room access must be mapped before the moment becomes obvious",
      summary: `${formatNumberValue(readyForOutreach.length)} opportunities are staged for outreach; event and relationship windows should be tracked months ahead when possible.`,
      detailMd:
        "For important rooms, identify host, sponsor, invite path, intermediary, encounter objective, proof point, seed to plant, and follow-up before attendance becomes the plan.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Competitive and success-pattern intelligence is a standing responsibility",
      summary:
        "Monitor what elite artists, creators, brands, athletes, entertainment operators, technology companies, luxury businesses, and adjacent markets are doing early enough to adapt useful mechanisms.",
      detailMd:
        "The objective is not imitation. Detect repeatable mechanisms, evidence of traction, timing, transferability to Keegan, and the smallest asymmetric test before the opportunity becomes crowded.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const actions = [
    ...(relationshipMove
      ? [
          {
            title: "Advance the current Career OS relationship gate",
            summary: `${relationshipMove.title}: ${relationshipMove.description}`,
            priority: "critical" as const,
            relatedMetricKeys: []
          }
        ]
      : []),
    ...(careerMove
      ? [
          {
            title: "Align external intelligence to the active career gate",
            summary: `${careerMove.title}: use relationships, rooms, gifts, events, and qualified opportunities to make this move easier to execute.`,
            priority: "high" as const,
            relatedMetricKeys: []
          }
        ]
      : []),
    {
      title: "Run the Opportunity Radar against current external change",
      summary:
        "Identify emerging models, cultural windows, competitor moves, event ecosystems, and partnership shifts. Only escalate a recommendation when the evidence and Fusion decision gates support action.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Advance the Cultural Power Map through real access paths",
      summary:
        "Rank relationships by leverage, current distance, best intermediary, value Keegan can provide, timing, and the natural next move. Prefer warm paths over cold outreach.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Maintain the Success Pattern Library",
      summary:
        "Continuously reverse engineer high performers and business models, then flag mechanisms that warrant an early Keegan-specific test.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: "External opportunity and access compounding",
    summary: relationshipMove
      ? `Use '${relationshipMove.title}' as the immediate operating focus while continuously scanning for external changes that can accelerate the same phase.`
      : "Turn external intelligence into earlier, better-qualified access, partnership, and asymmetric-test opportunities without manufacturing pipeline.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCareer OS bottleneck: ${careerOs.primaryBottleneck}\n\nFusion: ${fusionSummary}\n\nSupplemental research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: []
  };

  const activeMove = relationshipMove ?? careerMove;
  const tasks = activeMove
    ? [
        {
          title: `External-intelligence gate: ${activeMove.title}`,
          description: `${activeMove.description} Identify the highest-leverage people, access paths, external triggers, events, or opportunities that could accelerate this move. Preserve evidence, uncertainty, timing, and follow-up state.`,
          priority: "critical" as const,
          expectedImpact: "Accelerate the active Career OS gate through qualified external leverage",
          impactScore: 9.2,
          whyThisMatters: activeMove.why,
          relatedMetricKeys: [],
          requiresApproval: false,
          executionType: "research" as const,
          expectedDurationDays: Math.max(1, activeMove.reviewAfterDays || 3)
        }
      ]
    : [
        {
          title: "Refresh Opportunity Radar and power-network paths",
          description:
            "Review canonical external intelligence, Fusion state, active opportunities, upcoming planning windows, competitor/success patterns, and relationship paths. Produce only evidence-backed research or qualified next steps.",
          priority: "high" as const,
          expectedImpact: "Surface high-upside external opportunities before timing closes",
          impactScore: 8.7,
          whyThisMatters: "External advantage comes from acting on strong signals early without mistaking noise for opportunity.",
          relatedMetricKeys: [],
          requiresApproval: false,
          executionType: "research" as const,
          expectedDurationDays: 3
        }
      ];

  // Named opportunities are no longer fabricated by the deterministic agent runner.
  // They must already exist from first-party history or be created by evidence-backed
  // opportunity qualification in the intelligence pipeline.
  const opportunityDrafts: [] = [];

  const outputResult = await writeAgentOutputs({
    agentKey: "noah",
    insights,
    actions,
    bigBet,
    tasks,
    opportunities: opportunityDrafts,
    outcomes: [
      {
        outcomeType: "decision",
        title: "Noah strategy cycle",
        summary: `External-intelligence strategy aligned to Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}${activeMove ? ` and move '${activeMove.title}'` : ""}.`,
        impactWindow: "7d",
        relatedMetricKeys: [],
        metadata: {
          source: "agent_strategy_cycle",
          careerOsPhase: careerOs.currentPhase.number,
          relationshipMove: relationshipMove?.id ?? null,
          careerMove: careerMove?.id ?? null,
          directiveAvailable: Boolean(latestDirective),
          fusionRunId: fusionDecision?.runId ?? null,
          fusionDecisionAvailable: Boolean(fusionDecision?.isDecision),
          researchSignalsRead: relevantResearch.length,
          measuredOutcomesRead: recentMeasuredOutcomes.length,
          activeOpportunities: activeOpportunities.length,
          qualifiedPathOpportunities: qualifiedPathOpportunities.length,
          prestigeOpportunities: prestigeOpportunities.length
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "noah",
    planTitle: "External intelligence and opportunity plan",
    summary: `Use evidence-backed external intelligence, access paths, and timing to advance Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks, opportunities: opportunityDrafts }
  });

  const status = await publishAgentStatusSnapshot("noah");
  await recordDailyAgentKpis({ agentKey: "noah", metrics });

  return {
    summary: "Aligned external intelligence, relationships, Opportunity Radar, and success-pattern research to Avery, Career OS, Fusion, and measured outcomes without fabricating pipeline.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
