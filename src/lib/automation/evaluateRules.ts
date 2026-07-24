import { createTask, findOpenTaskByTitle, getLatestScoreboardMetrics, getMetricAlertRules } from "@/lib/supabase/queries";
import type { ScoreboardMetric } from "@/lib/agents/shared";
import type { EnforcementMode } from "@/lib/scheduler/enforcement";

function compare(operator: string, left: number, right: number) {
  switch (operator) {
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    default:
      return false;
  }
}

type EvaluateRulesOptions = {
  mode?: EnforcementMode;
};

export async function evaluateRules(options?: EvaluateRulesOptions) {
  const mode = options?.mode ?? "active";
  const allowTaskCreation = mode === "active";
  const [rules, metrics] = await Promise.all([
    getMetricAlertRules(),
    getLatestScoreboardMetrics() as Promise<ScoreboardMetric[]>
  ]);

type TriggerSummary = {
  metricKey: string;
  condition: string;
  assignedAgent: string;
  taskCreated: boolean;
  taskId: string;
  taskPlanned?: boolean;
  skippedReason?: string;
  severity?: string;
};

  const triggersFired: TriggerSummary[] = [];

  for (const rule of rules) {
    const metric = metrics.find((m) => m.metric_key === rule.metric_key);
    if (!metric || metric.current_value == null) continue;

    const fired = compare(
      String(rule.condition_operator),
      Number(metric.current_value),
      Number(rule.threshold_value)
    );

    if (!fired) continue;

    const title = `Respond to ${metric.metric_name} threshold breach`;
    const existing = await findOpenTaskByTitle(rule.assigned_agent, title);
    if (existing) {
      triggersFired.push({
        metricKey: rule.metric_key,
        condition: `${rule.condition_operator} ${rule.threshold_value}`,
        assignedAgent: rule.assigned_agent,
        taskCreated: false,
        taskId: existing.id,
        taskPlanned: false,
        severity: rule.severity ?? undefined
      });
      continue;
    }

    if (!allowTaskCreation) {
      triggersFired.push({
        metricKey: rule.metric_key,
        condition: `${rule.condition_operator} ${rule.threshold_value}`,
        assignedAgent: rule.assigned_agent,
        taskCreated: false,
        taskId: "simulated",
        taskPlanned: true,
        skippedReason: "task_creation_disabled",
        severity: rule.severity ?? undefined
      });
      continue;
    }

    const task = await createTask({
      title,
      description: `${rule.trigger_action}. Current value ${metric.current_value}, threshold ${rule.threshold_value}.`,
      agentKey: rule.assigned_agent,
      priority: rule.severity,
      expectedImpact: "Return metric toward target range",
      impactScore: rule.severity === "critical" ? 9 : 7,
      whyThisMatters: `${metric.metric_name} breached the configured threshold.`,
      relatedMetricKeys: [rule.metric_key],
      requiresApproval: true,
      executionType: "strategy",
      createdBy: "system"
    });

    triggersFired.push({
      metricKey: rule.metric_key,
      condition: `${rule.condition_operator} ${rule.threshold_value}`,
      assignedAgent: rule.assigned_agent,
      taskCreated: true,
      taskId: task.id,
      taskPlanned: true,
      severity: rule.severity ?? undefined
    });
  }

  return { rulesEvaluated: rules.length, triggersFired };
}
