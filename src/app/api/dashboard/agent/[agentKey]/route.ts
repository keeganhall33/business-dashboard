import { notFound, ok, serverError } from "@/lib/api/responses";
import {
  getAgentProfile,
  getAgentUpdates,
  getLatestScoreboardMetrics,
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
  priority: string;
  status: string;
  expected_impact: string | null;
  why_this_matters: string | null;
  related_metric_keys: string[];
  requires_approval: boolean;
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

    const [metrics, updates, openTasks, completedTasks] = await Promise.all([
      getLatestScoreboardMetrics() as Promise<ScoreboardMetricRow[]>,
      getAgentUpdates(agentKey, 10) as Promise<AgentUpdateRow[]>,
      getTasks({ agentKey, status: "pending" }),
      getTasks({ agentKey, status: "completed" })
    ]);

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
      openTasks: (openTasks.items as TaskRow[]).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        expectedImpact: t.expected_impact,
        whyThisMatters: t.why_this_matters,
        relatedMetricKeys: t.related_metric_keys,
        requiresApproval: t.requires_approval
      })),
      completedTasks: completedTasks.items,
      weeklyOutputRequirements: { weekly: ["3 revenue insights", "3 actions", "1 pricing recommendation"] }
    });
  } catch (error) {
    return serverError("Failed to load agent dashboard", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
