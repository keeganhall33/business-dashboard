import { notFound, ok, serverError } from "@/lib/api/responses";
import { normalizeDeliverableLinks } from "@/lib/domain/deliverables";
import {
  getAgentProfile,
  getAgentUpdates,
  getAgentPlans,
  getAgentMessages,
  getLatestScoreboardMetrics,
  getOrCreateAgentThread,
  getTasks
} from "@/lib/supabase/queries";

type ScoreboardMetricRow = {
  metric_key: string;
  metric_name: string;
  current_value: number | string | null;
  target_value: number | string | null;
  unit: string | null;
  owner_agent: string | null;
};

type AgentUpdateRow = {
  id: string;
  update_type: string;
  title: string;
  summary: string;
  detail_md: string | null;
  priority: string;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  agent_key: string;
  priority: string;
  status: string;
  expected_impact: string | null;
  impact_score: number | null;
  why_this_matters: string | null;
  related_metric_keys: string[];
  requires_approval: boolean;
  expected_duration_days?: number | null;
  created_at?: string | null;
  result_summary?: string | null;
  deliverable_links?: unknown;
  completed_at?: string | null;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function GET(_req: Request, context: { params: Promise<{ agentKey: string }> }) {
  try {
    const { agentKey } = await context.params;

    const profile = await getAgentProfile(agentKey).catch(() => null);
    if (!profile) return notFound(`Unknown agent: ${agentKey}`);

    const [metrics, updates, openTasks, completedTasks, plans] = await Promise.all([
      getLatestScoreboardMetrics() as Promise<ScoreboardMetricRow[]>,
      getAgentUpdates(agentKey, 10) as Promise<AgentUpdateRow[]>,
      getTasks({ agentKey, status: "pending" }),
      getTasks({ agentKey, status: "completed" }),
      getAgentPlans(agentKey, { limit: 5 })
    ]);

    const thread = await getOrCreateAgentThread({ agentKey, threadType: "default" });
    const messages = await getAgentMessages(thread.id, 100);

    const ownedMetrics = metrics
      .filter((m) => m.owner_agent === agentKey)
      .map((m) => ({
        metricKey: m.metric_key,
        metricName: m.metric_name,
        currentValue: toNumber(m.current_value) ?? 0,
        targetValue: toNumber(m.target_value) ?? 0,
        status: "warning",
        unit: m.unit ?? null
      }));

    return ok({
      ok: true,
      agent: {
        agentKey: profile.agent_key,
        displayName: profile.display_name,
        roleTitle: profile.role_title,
        mandate: profile.mandate,
        decisionScope: profile.decision_scope
      },
      ownedMetrics,
      recentUpdates: updates.map((u) => ({
        id: u.id,
        updateType: u.update_type,
        title: u.title,
        summary: u.summary,
        detailMd: u.detail_md,
        priority: u.priority,
        createdAt: u.created_at
      })),
      openTasks: (openTasks.items as TaskRow[]).map(mapTask),
      completedTasks: (completedTasks.items as TaskRow[]).map(mapTask),
      weeklyOutputRequirements: { weekly: ["3 revenue insights", "3 actions", "1 pricing recommendation"] },
      planQueue: {
        pending: mapPlan(plans.find((p) => p.status === "pending") ?? null),
        recent: plans
          .filter((p) => p.status !== "pending")
          .map((p) => mapPlan(p))
      },
      conversation: {
        threadId: thread.id,
        title: thread.title,
        messages: messages.map((m) => ({
          id: m.id,
          senderType: m.sender_type,
          senderKey: m.sender_key,
          messageType: m.message_type,
          body: m.body,
          metadata: m.metadata,
          createdAt: m.created_at
        }))
      }
    });
  } catch (error) {
    return serverError("Failed to load agent dashboard", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function mapTask(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    agentKey: task.agent_key,
    priority: task.priority,
    status: task.status,
    expectedImpact: task.expected_impact,
    impactScore: task.impact_score ?? null,
    requiresApproval: task.requires_approval,
    description: task.description ?? null,
    deliverableSummary: task.result_summary ?? null,
    deliverableLinks: normalizeDeliverableLinks(task.deliverable_links),
    whyThisMatters: task.why_this_matters,
    relatedMetricKeys: task.related_metric_keys ?? [],
    expectedDurationDays: task.expected_duration_days ?? null,
    createdAt: task.created_at ?? null,
    completedAt: task.completed_at ?? null
  };
}

function mapPlan(plan: Record<string, unknown> | null | undefined) {
  if (!plan) return null;
  return {
    id: plan.id as string,
    title: plan.title as string,
    status: plan.status as string,
    summary: (plan.summary as string) ?? null,
    submittedAt: plan.submitted_at as string,
    approvedAt: (plan.approved_at as string | null) ?? null,
    approvedBy: (plan.approved_by as string | null) ?? null
  };
}
