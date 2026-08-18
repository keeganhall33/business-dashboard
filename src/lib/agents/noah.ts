import {
  AgentRunResult,
  ensureDailyIdeaAndKpis,
  formatNumberValue,
  getSharedAgentContextForAgent,
  publishAgentStatusSnapshot,
  submitAgentPlanDraft,
  writeAgentOutputs
} from "./shared";
import { directiveSummary, getAgentDecisionContext, topResearchSummary } from "./decision-context";

type OpportunityRow = Record<string, unknown> & {
  status?: string;
  name?: string;
  prestige_score?: number | string | null;
  prestigeScore?: number | string | null;
};

function numericPrestige(opp: OpportunityRow) {
  const raw = opp.prestige_score ?? opp.prestigeScore ?? 0;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export async function runNoah(): Promise<AgentRunResult> {
  const [sharedContext, decisionContext] = await Promise.all([
    getSharedAgentContextForAgent("noah"),
    getAgentDecisionContext("noah", ["RELATIONSHIP", "CAREER"])
  ]);
  const { metrics, opportunities: contextOpportunities } = sharedContext;
  const { careerOs, laneMoves, latestDirective, relevantResearch, recentMeasuredOutcomes } = decisionContext;
  const relationshipMove = laneMoves.find((move) => move.lane === "RELATIONSHIP") ?? null;
  const careerMove = laneMoves.find((move) => move.lane === "CAREER") ?? null;
  const executiveDirection = directiveSummary(latestDirective);
  const researchSignal = topResearchSummary(relevantResearch);

  const activeOpportunities = ((contextOpportunities ?? []) as OpportunityRow[]).filter(
    (opp) => !["won", "lost", "parked"].includes(String(opp.status ?? ""))
  );
  const prestigeOpportunities = activeOpportunities.filter((opp) => numericPrestige(opp) >= 8);
  const readyForOutreach = activeOpportunities.filter((opp) => opp.status === "ready_for_outreach");

  const insights = [
    {
      title: "Partnership strategy must serve the active relationship gate",
      summary: relationshipMove
        ? `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}: ${relationshipMove.title}. Avery direction: ${executiveDirection}`
        : `Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title} has no ready relationship move. Avery direction: ${executiveDirection}`,
      detailMd: `The power map, introductions, gifts, room access, and opportunity pipeline should reinforce one another. Recent measured outcomes available: ${recentMeasuredOutcomes.length}. Research signal: ${researchSignal}`,
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Partnership pipeline is too thin",
      summary: `Only ${formatNumberValue(activeOpportunities.length)} live opportunities are on deck; maintain enough qualified premium conversations to avoid dependence on any one deal.`,
      detailMd: "The opportunity engine needs more high-quality top-of-funnel targets, but list size alone is not success.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Targeting should skew harder toward prestige leverage",
      summary: `${formatNumberValue(prestigeOpportunities.length)} current opportunities clear the prestige bar using the stored prestige score.`,
      detailMd:
        "Prioritize elite institutions, top sports properties, collectible brands, and culturally resonant figures when access and strategic fit justify the pursuit.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Timing opportunities should be mapped further ahead",
      summary: `${formatNumberValue(readyForOutreach.length)} opportunities are staged for outreach; each should have a specific access path, timing reason, and follow-up rule.`,
      detailMd: "Proactive sequencing keeps the pipeline from idling while preventing random cold outreach.",
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
            title: "Align network activity to the active career gate",
            summary: `${careerMove.title}: use relationships, rooms, gifts, and introductions to make this move easier to execute.`,
            priority: "high" as const,
            relatedMetricKeys: []
          }
        ]
      : []),
    {
      title: "Build the next evidence-backed prestige target list",
      summary: "Research targets with access path, strategic value, value to them, timing, and a concrete next move. Do not count names without a pathway as pipeline.",
      priority: "critical" as const,
      relatedMetricKeys: []
    },
    {
      title: "Map strongest near-term cultural openings",
      summary:
        "Identify upcoming moments that align with sports, celebrity, institutional collaborations, or the current Career OS gate.",
      priority: "high" as const,
      relatedMetricKeys: []
    },
    {
      title: "Prepare target-specific pitch angles",
      summary: "Define why each target should care, which proof point matters to them, and what the first interaction should accomplish.",
      priority: "high" as const,
      relatedMetricKeys: []
    }
  ];

  const bigBet = {
    title: "Prestige relationship and partnership sprint",
    summary: relationshipMove
      ? `Use '${relationshipMove.title}' as the operating focus while building a narrow set of high-upside opportunities around it.`
      : "Concentrate on a narrow set of high-upside relationships and opportunities with tailored access paths and pitch angles.",
    detailMd: `Avery directive: ${executiveDirection}\n\nCareer OS bottleneck: ${careerOs.primaryBottleneck}\n\nRecent research: ${researchSignal}`,
    priority: "critical" as const,
    relatedMetricKeys: []
  };

  const tasks = [
    {
      title: "Research 25 prestige-fit targets",
      description:
        "Build an actual target list with person/organization, strategic value, current relationship distance, best access path, introducer if known, value to them, timing trigger, and next step. A name without these fields does not count as completed research.",
      priority: "critical" as const,
      expectedImpact: "Expand qualified deal flow and increase likelihood of higher-value collaborations",
      impactScore: 8.8,
      whyThisMatters: "The opportunity engine is underfilled and needs evidence-backed pathways, not just more names.",
      relatedMetricKeys: [],
      requiresApproval: true,
      executionType: "research" as const,
      expectedDurationDays: 6
    }
  ];

  const upperDeckExists = activeOpportunities.some(
    (opp) => String(opp.name ?? "").trim().toLowerCase() === "upper deck hall of fame capsule"
  );
  const opportunityDrafts = upperDeckExists
    ? []
    : [
        {
          name: "Upper Deck Hall of Fame capsule",
          organization: "Upper Deck",
          opportunityType: "licensing" as const,
          status: "researching" as const,
          valueEstimate: 55000,
          prestigeScore: 9.1,
          probabilityScore: 0.32,
          nextStep: "Validate the right creative/licensing path and update the opportunity with current evidence before outreach",
          nextStepDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          notesMd: "Existing Upper Deck relationship makes this strategically plausible, but the opportunity remains a hypothesis until the current contact path and economics are validated.",
          source: "existing_relationship_hypothesis"
        }
      ];

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
        summary: `Partnership strategy aligned to Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}${relationshipMove ? ` and relationship move '${relationshipMove.title}'` : ""}.`,
        impactWindow: "7d",
        relatedMetricKeys: [],
        metadata: {
          source: "agent_strategy_cycle",
          careerOsPhase: careerOs.currentPhase.number,
          relationshipMove: relationshipMove?.id ?? null,
          careerMove: careerMove?.id ?? null,
          directiveAvailable: Boolean(latestDirective),
          researchSignalsRead: relevantResearch.length,
          measuredOutcomesRead: recentMeasuredOutcomes.length,
          activeOpportunities: activeOpportunities.length,
          prestigeOpportunities: prestigeOpportunities.length,
          preventedDuplicateUpperDeck: upperDeckExists
        }
      }
    ]
  });

  const plan = await submitAgentPlanDraft({
    agentKey: "noah",
    planTitle: "Partnership pipeline expansion plan",
    summary: `Expand qualified prestige relationships and opportunities while advancing Phase ${careerOs.currentPhase.number} ${careerOs.currentPhase.title}.`,
    detailMd: bigBet.detailMd,
    payload: { insights, actions, bigBet, tasks, opportunities: opportunityDrafts }
  });

  const status = await publishAgentStatusSnapshot("noah");

  await ensureDailyIdeaAndKpis({
    agentKey: "noah",
    metrics,
    fallbackIdeaTitle: relationshipMove ? `Relationship gate: ${relationshipMove.title}` : "Add qualified Tier-1 targets to keep pipeline full",
    fallbackIdeaSummary: relationshipMove?.description ?? "Keep the prestige partnership funnel fed with a small, high-status target list backed by real access paths."
  });

  return {
    summary: "Aligned partnership strategy to the active Career OS relationship gates, fixed prestige scoring, and prevented unsupported/duplicate intelligence from compounding.",
    updatesCreated: outputResult.updatesCreated + (status.published ? 1 : 0),
    tasksCreated: outputResult.tasksCreated,
    opportunitiesCreated: outputResult.opportunitiesCreated,
    planId: plan.planId,
    outcomesLogged: outputResult.outcomesLogged
  };
}
