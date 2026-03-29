import {
  createAgentUpdate,
  createOpportunity,
  createTask,
  getActiveOpportunities,
  getLatestScoreboardMetrics,
  getOpenTasks
} from "@/lib/supabase/queries";

export type AgentRunResult = {
  summary: string;
  updatesCreated: number;
  tasksCreated: number;
  opportunitiesCreated: number;
};

export type ScoreboardMetric = {
  metric_key: string;
  metric_name: string;
  category: string | null;
  unit: string | null;
  target_value: number | string | null;
  owner_agent: string | null;
  current_value: number | string | null;
  measured_at: string | null;
};

export async function getSharedAgentContext() {
  const [metrics, tasks, opportunities] = await Promise.all([
    getLatestScoreboardMetrics() as Promise<ScoreboardMetric[]>,
    getOpenTasks(50),
    getActiveOpportunities(25)
  ]);
  return { metrics, tasks, opportunities };
}

export async function writeAgentOutputs(input: {
  agentKey: string;
  insights?: Array<{
    title: string;
    summary: string;
    detailMd?: string;
    priority?: "critical" | "high" | "medium" | "low";
    relatedMetricKeys?: string[];
  }>;
  actions?: Array<{
    title: string;
    summary: string;
    detailMd?: string;
    priority?: "critical" | "high" | "medium" | "low";
    relatedMetricKeys?: string[];
  }>;
  bigBet?: {
    title: string;
    summary: string;
    detailMd?: string;
    priority?: "critical" | "high" | "medium" | "low";
    relatedMetricKeys?: string[];
  };
  tasks?: Array<{
    title: string;
    description?: string;
    priority: "critical" | "high" | "medium" | "low";
    expectedImpact?: string;
    impactScore?: number;
    whyThisMatters?: string;
    relatedMetricKeys?: string[];
    requiresApproval?: boolean;
    executionType:
      | "analysis"
      | "content"
      | "outreach_prep"
      | "pricing"
      | "research"
      | "design"
      | "data"
      | "strategy";
  }>;
  opportunities?: Array<{
    name: string;
    organization?: string;
    opportunityType:
      | "brand_partnership"
      | "licensing"
      | "press"
      | "collector_intro"
      | "athlete_collab"
      | "institutional";
    status:
      | "identified"
      | "researching"
      | "ready_for_outreach"
      | "outreach_drafted"
      | "in_conversation"
      | "negotiating"
      | "won"
      | "lost"
      | "parked";
    valueEstimate?: number;
    prestigeScore?: number;
    probabilityScore?: number;
    nextStep?: string;
    nextStepDueAt?: string;
    notesMd?: string;
    source?: string;
  }>;
}) {
  let updatesCreated = 0;
  let tasksCreated = 0;
  let opportunitiesCreated = 0;

  for (const insight of input.insights ?? []) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "insight",
      title: insight.title,
      summary: insight.summary,
      detailMd: insight.detailMd,
      priority: insight.priority,
      relatedMetricKeys: insight.relatedMetricKeys
    });
    updatesCreated++;
  }

  for (const action of input.actions ?? []) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "action",
      title: action.title,
      summary: action.summary,
      detailMd: action.detailMd,
      priority: action.priority,
      relatedMetricKeys: action.relatedMetricKeys
    });
    updatesCreated++;
  }

  if (input.bigBet) {
    await createAgentUpdate({
      agentKey: input.agentKey,
      updateType: "big_bet",
      title: input.bigBet.title,
      summary: input.bigBet.summary,
      detailMd: input.bigBet.detailMd,
      priority: input.bigBet.priority,
      relatedMetricKeys: input.bigBet.relatedMetricKeys
    });
    updatesCreated++;
  }

  for (const task of input.tasks ?? []) {
    await createTask({
      title: task.title,
      description: task.description,
      agentKey: input.agentKey,
      priority: task.priority,
      expectedImpact: task.expectedImpact,
      impactScore: task.impactScore,
      whyThisMatters: task.whyThisMatters,
      relatedMetricKeys: task.relatedMetricKeys,
      requiresApproval: task.requiresApproval,
      executionType: task.executionType,
      createdBy: input.agentKey
    });
    tasksCreated++;
  }

  for (const opp of input.opportunities ?? []) {
    await createOpportunity({
      name: opp.name,
      organization: opp.organization,
      opportunityType: opp.opportunityType,
      status: opp.status,
      valueEstimate: opp.valueEstimate,
      prestigeScore: opp.prestigeScore,
      probabilityScore: opp.probabilityScore,
      ownerAgent: input.agentKey,
      nextStep: opp.nextStep,
      nextStepDueAt: opp.nextStepDueAt,
      notesMd: opp.notesMd,
      source: opp.source
    });
    opportunitiesCreated++;
  }

  return { updatesCreated, tasksCreated, opportunitiesCreated };
}
