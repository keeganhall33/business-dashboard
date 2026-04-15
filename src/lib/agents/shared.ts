import {
  createAgentPlan,
  createAgentUpdate,
  createOpportunity,
  createTask,
  createAgentMessage,
  createOutcomeMemory,
  createResearchMemory,
  getActiveOpportunities,
  getAgentTasksByStatus,
  getLatestScoreboardMetrics,
  getOpenTasks,
  getRecentOutcomeMemory,
  getRecentResearchMemory,
  getOrCreateAgentThread,
  findOpenTaskByTitle
} from "@/lib/supabase/queries";

export type AgentRunResult = {
  summary: string;
  updatesCreated: number;
  tasksCreated: number;
  opportunitiesCreated: number;
  planId?: string;
  tasksActivated?: number;
  researchLogged?: number;
  outcomesLogged?: number;
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
  return getSharedAgentContextForAgent();
}

export async function getSharedAgentContextForAgent(agentKey?: string) {
  const [metrics, tasks, opportunities, researchMemory, outcomeMemory] = await Promise.all([
    getLatestScoreboardMetrics() as Promise<ScoreboardMetric[]>,
    getOpenTasks(50),
    getActiveOpportunities(25),
    getRecentResearchMemory({ agentKey, limit: 15 }),
    getRecentOutcomeMemory({ agentKey, limit: 15 })
  ]);
  return { metrics, tasks, opportunities, researchMemory, outcomeMemory };
}

export type AgentPlanPayload = {
  insights?: AgentPlanInsight[];
  actions?: AgentPlanInsight[];
  bigBet?: AgentPlanInsight;
  tasks?: AgentPlanTask[];
  opportunities?: AgentPlanOpportunity[];
  postApprovalUpdates?: AgentPlanApprovalUpdate[];
  research?: AgentPlanResearch[];
  outcomes?: AgentPlanOutcome[];
};

type AgentPlanInsight = {
  title: string;
  summary: string;
  detailMd?: string;
  priority?: "critical" | "high" | "medium" | "low";
  relatedMetricKeys?: string[];
};

type AgentPlanTask = {
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
  expectedDurationDays?: number;
};

type AgentPlanOpportunity = {
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
};

type AgentPlanApprovalUpdate = {
  updateType: string;
  title: string;
  summary: string;
  detailMd?: string;
  priority?: "critical" | "high" | "medium" | "low";
  relatedMetricKeys?: string[];
};

type AgentPlanResearch = {
  focusArea: string;
  subject: string;
  subjectType?: string;
  status?: string;
  summary: string;
  detailMd?: string;
  importanceScore?: number;
  confidence?: number;
  payload?: Record<string, unknown>;
  relatedTaskId?: string;
  relatedMetricKeys?: string[];
  sourceUrl?: string;
};

type AgentPlanOutcome = {
  outcomeType: "task" | "decision" | "experiment" | "launch" | "partnership" | "content" | "note";
  title: string;
  summary: string;
  detailMd?: string;
  impactScore?: number;
  impactWindow?: string;
  relatedTaskId?: string;
  relatedMetricKeys?: string[];
  happenedAtIso?: string;
  expiresAtIso?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAgentOutputs(input: {
  agentKey: string;
} & AgentPlanPayload) {
  let updatesCreated = 0;
  let tasksCreated = 0;
  let opportunitiesCreated = 0;
  let researchLogged = 0;
  let outcomesLogged = 0;

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
    const existing = await findOpenTaskByTitle(input.agentKey, task.title);
    if (existing) continue;
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
      createdBy: input.agentKey,
      expectedDurationDays: task.expectedDurationDays
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

  for (const research of input.research ?? []) {
    await createResearchMemory({
      agentKey: input.agentKey,
      focusArea: research.focusArea,
      subject: research.subject,
      subjectType: research.subjectType,
      status: research.status,
      summary: research.summary,
      detailMd: research.detailMd,
      importanceScore: research.importanceScore,
      confidence: research.confidence,
      payload: research.payload,
      relatedTaskId: research.relatedTaskId,
      relatedMetricKeys: research.relatedMetricKeys,
      sourceUrl: research.sourceUrl
    });
    researchLogged++;
  }

  for (const outcome of input.outcomes ?? []) {
    await createOutcomeMemory({
      agentKey: input.agentKey,
      outcomeType: outcome.outcomeType,
      title: outcome.title,
      summary: outcome.summary,
      detailMd: outcome.detailMd,
      impactScore: outcome.impactScore,
      impactWindow: outcome.impactWindow,
      relatedTaskId: outcome.relatedTaskId,
      relatedMetricKeys: outcome.relatedMetricKeys,
      happenedAtIso: outcome.happenedAtIso,
      expiresAtIso: outcome.expiresAtIso,
      metadata: outcome.metadata
    });
    outcomesLogged++;
  }

  return { updatesCreated, tasksCreated, opportunitiesCreated, researchLogged, outcomesLogged };
}

export async function submitAgentPlanDraft(input: {
  agentKey: string;
  planTitle: string;
  summary: string;
  detailMd?: string;
  payload: AgentPlanPayload;
}) {
  const thread = await getOrCreateAgentThread({ agentKey: input.agentKey, threadType: "default" });

  await createAgentMessage({
    threadId: thread.id,
    senderType: "agent",
    senderKey: input.agentKey,
    messageType: "plan",
    body: input.summary,
    metadata: {
      title: input.planTitle,
      detailMd: input.detailMd ?? null
    }
  });

  const plan = await createAgentPlan({
    agentKey: input.agentKey,
    threadId: thread.id,
    title: input.planTitle,
    summary: input.summary,
    detailMd: input.detailMd,
    payloadJson: input.payload,
    submittedBy: input.agentKey
  });

  return { threadId: thread.id, planId: plan.id };
}

export async function publishAgentStatusSnapshot(agentKey: string) {
  const tasks = await getAgentTasksByStatus(agentKey, ["in_progress"], 25);
  if (!tasks.length) {
    return { published: false, activeTaskCount: 0 };
  }

  const titles = tasks.slice(0, 3).map((task) => task.title as string);
  const summary =
    titles.length === 1
      ? `Working on ${titles[0]}`
      : `Working on ${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  const body = tasks.length > 3 ? `${summary} (+${tasks.length - 3} more).` : `${summary}.`;

  await createAgentUpdate({
    agentKey,
    updateType: "summary",
    title: "Execution status",
    summary: body,
    detailMd: tasks.map((task) => `- ${task.title as string} (${task.status})`).join("\n"),
    priority: "medium",
    relatedMetricKeys: []
  });

  const thread = await getOrCreateAgentThread({ agentKey, threadType: "default" });
  await createAgentMessage({
    threadId: thread.id,
    senderType: "agent",
    senderKey: agentKey,
    messageType: "status",
    body,
    metadata: {
      activeTaskIds: tasks.map((task) => task.id),
      activeTaskCount: tasks.length
    }
  });

  return { published: true, activeTaskCount: tasks.length };
}

export async function publishCeoDirective(input: {
  directive: string;
  detailMd?: string;
  targetAgents: string[];
  priority?: "critical" | "high" | "medium" | "low";
}) {
  await Promise.all(
    input.targetAgents.map(async (agentKey) => {
      await createAgentUpdate({
        agentKey,
        updateType: "directive",
        title: input.directive,
        summary: input.detailMd ?? input.directive,
        detailMd: input.detailMd,
        priority: input.priority ?? "high",
        relatedMetricKeys: []
      });

      const thread = await getOrCreateAgentThread({ agentKey, threadType: "default" });
      await createAgentMessage({
        threadId: thread.id,
        senderType: "ceo",
        senderKey: "avery",
        messageType: "directive",
        body: input.directive,
        metadata: {
          detail: input.detailMd ?? null,
          priority: input.priority ?? "high"
        }
      });
    })
  );
}

export async function logWarRoomNote(input: {
  title: string;
  summary: string;
  detailMd?: string;
  metadata?: Record<string, unknown>;
}) {
  const thread = await getOrCreateAgentThread({ agentKey: "avery", threadType: "war_room", title: "Executive War Room" });
  await createAgentMessage({
    threadId: thread.id,
    senderType: "ceo",
    senderKey: "avery",
    messageType: "war_room",
    body: input.summary,
    metadata: {
      title: input.title,
      detailMd: input.detailMd ?? null,
      ...(input.metadata ?? {})
    }
  });
}
