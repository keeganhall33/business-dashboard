import { createTask, getLatestScoreboardMetrics, getMetricAlertRules } from "@/lib/supabase/queries";
import type { ScoreboardMetric } from "@/lib/agents/shared";

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

export async function evaluateRules() {
  const [rules, metrics] = await Promise.all([
    getMetricAlertRules(),
    getLatestScoreboardMetrics() as Promise<ScoreboardMetric[]>
  ]);

  const triggersFired = [] as Array<{
    metricKey: string;
    condition: string;
    assignedAgent: string;
    taskCreated: boolean;
    taskId: string;
  }>;

  for (const rule of rules) {
    const metric = metrics.find((m) => m.metric_key === rule.metric_key);
    if (!metric || metric.current_value == null) continue;

    const fired = compare(
      String(rule.condition_operator),
      Number(metric.current_value),
      Number(rule.threshold_value)
    );

    if (!fired) continue;

    const task = await createTask({
      title: `Respond to ${metric.metric_name} threshold breach`,
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
      taskId: task.id
    });
  }

  return { rulesEvaluated: rules.length, triggersFired };
}
