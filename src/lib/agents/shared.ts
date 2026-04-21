import {
  createAgentPlan,
  createAgentUpdate,
  createAgentIdea,
  createAgentKpiReading,
  createOpportunity,
  createTask,
  createAgentMessage,
  createOutcomeMemory,
  createResearchMemory,
  getAgentDailyIdeaQuotaForDate,
  getLatestAgentKpiReading,
  getActiveOpportunities,
  getAgentTasksByStatus,
  getScoreboardMetricsForRange,
  getOpenTasks,
  getRecentOutcomeMemory,
  getRecentResearchMemory,
  getOrCreateAgentThread,
  findOpenTaskByTitle,
  upsertAgentKpiDefinition
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
  history?: ScoreboardMetricHistoryEntry[];
  stats?: ScoreboardMetricStats | null;
};

export type ScoreboardMetricHistoryEntry = {
  measured_at: string;
  value: number | null;
};

export type ScoreboardMetricStats = {
  average: number | null;
  min: number | null;
  max: number | null;
  changePercent: number | null;
};

function formatDateIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function coerceNumberValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").trim();
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function metricSnapshot(metrics: ScoreboardMetric[], metricKey: string) {
  const metric = metrics.find((m) => m.metric_key === metricKey);
  if (!metric) return null;
  return {
    metric,
    current: coerceNumberValue(metric.current_value),
    target: coerceNumberValue(metric.target_value),
    average: metric.stats?.average ?? null,
    changePercent: metric.stats?.changePercent ?? null
  };
}

export function formatUsd(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const formatted = value.toFixed(digits);
  return `${value >= 0 ? "+" : ""}${formatted}%`;
}

export function formatNumberValue(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sameUtcDay(a: string, b: string) {
  const da = startOfUtcDay(new Date(a));
  const db = startOfUtcDay(new Date(b));
  return da.getTime() === db.getTime();
}

/**
 * Minimal autonomy hooks:
 * - Ensure the agent logs at least 1 idea/day (agent_ideas)
 * - Ensure the agent records KPI readings/day (agent_kpi_readings)
 */
export async function ensureDailyIdeaAndKpis(input: {
  agentKey: string;
  metrics: ScoreboardMetric[];
  fallbackIdeaTitle: string;
  fallbackIdeaSummary?: string;
}) {
  const today = new Date();

  // ---- Idea quota (>= 1/day)
  const quotaRows = await getAgentDailyIdeaQuotaForDate({ agentKey: input.agentKey, date: today });
  const metQuota = quotaRows[0]?.met_quota ?? false;

  if (!metQuota) {
    await createAgentIdea({
      agentKey: input.agentKey,
      ideaType: "minor",
      title: input.fallbackIdeaTitle,
      summary: input.fallbackIdeaSummary ?? "Autologged idea to satisfy daily quota.",
      expectedImpact: null,
      status: "proposed",
      requiresCeoApproval: false
    });
  }

  // ---- KPI readings
  // Prefer metrics explicitly owned by this agent; fall back to the most important business metrics.
  const owned = input.metrics.filter((m) => (m.owner_agent ?? "").toLowerCase() === input.agentKey.toLowerCase());
  const fallbackKeys = new Set(["aov", "conversion_rate", "monthly_revenue", "pipeline_count"]);
  const fallback = input.metrics.filter((m) => fallbackKeys.has(m.metric_key));
  const candidates = [...owned, ...fallback]
    .filter((m, idx, arr) => arr.findIndex((x) => x.metric_key === m.metric_key) === idx)
    .slice(0, 3);

  for (const metric of candidates) {
    const kpiKey = `${input.agentKey}:${metric.metric_key}`;
    await upsertAgentKpiDefinition({
      kpiKey,
      agentKey: input.agentKey,
      kpiName: metric.metric_name ?? metric.metric_key,
      description: `Autotracked from scoreboard metric '${metric.metric_key}'.`,
      targetValue: parseNumeric(metric.target_value),
      unit: metric.unit,
      frequency: "daily",
      priority: "medium"
    });

    const latest = await getLatestAgentKpiReading(kpiKey);
    const measuredAtIso = metric.measured_at ?? new Date().toISOString();

    // Keep it to one reading/day per KPI to prevent spam.
    if (latest?.measured_at && sameUtcDay(latest.measured_at as string, measuredAtIso)) {
      continue;
    }

    await createAgentKpiReading({
      kpiKey,
      value: parseNumeric(metric.current_value),
      measuredAtIso,
      source: "scoreboard",
      notes: null
    });
  }
}

export async function getSharedAgentContext() {
  return getSharedAgentContextForAgent();
}

export async function getSharedAgentContextForAgent(agentKey?: string) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 44);
  const range = { startDate: formatDateIso(startDate), endDate: formatDateIso(endDate) };
  const [metrics, tasks, opportunities, researchMemory, outcomeMemory] = await Promise.all([
    getScoreboardMetricsForRange(range) as Promise<ScoreboardMetric[]>,
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
