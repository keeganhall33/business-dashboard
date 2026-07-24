import {
  getRecentOpportunities,
  getRecentSystemRunsByAgent,
  getRecentTasks
} from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import type { EnforcementMode } from "@/lib/scheduler/enforcement";
import type { SimulatedAlert } from "./observeReports";

const DAY_MS = 24 * 60 * 60 * 1000;
const agents = ["avery", "sloan", "lyra", "noah"] as const;

type TaskRow = {
  id: string;
  title: string;
  agent_key?: string | null;
  priority: string;
  status: string;
  requires_approval?: boolean;
  approved_by_user?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

type OpportunityRow = {
  id: string;
  name?: string;
  owner_agent?: string | null;
  status: string;
  updated_at?: string | null;
};

export type StaleCheckResult = {
  alertsCreatedOrUpdated: number;
  alertsAttempted: number;
  staleAgents: string[];
  staleTaskIds: string[];
  pendingApprovalCount: number;
  stalledOpportunityIds: string[];
  simulatedAlerts: SimulatedAlert[];
  mode: EnforcementMode;
};

export type StaleCheckOptions = {
  mode?: EnforcementMode;
};

function hoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60);
}

function daysSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / DAY_MS;
}

function agentStaleThresholds(agentKey: string) {
  switch (agentKey) {
    case "avery":
      return { medium: 9999, high: 2, critical: 5 };
    case "sloan":
      return { medium: 3, high: 7, critical: 9999 };
    case "lyra":
      return { medium: 4, high: 8, critical: 9999 };
    case "noah":
      return { medium: 3, high: 7, critical: 9999 };
    default:
      return { medium: 4, high: 7, critical: 9999 };
  }
}

function getAgentSeverity(agentKey: string, days: number) {
  const thresholds = agentStaleThresholds(agentKey);
  if (days >= thresholds.critical) return "critical" as const;
  if (days >= thresholds.high) return "high" as const;
  if (days >= thresholds.medium) return "medium" as const;
  return null;
}

function getTaskStaleSeverity(task: TaskRow) {
  const createdHours = hoursSince(task.created_at);
  const updatedHours = hoursSince(task.updated_at ?? task.created_at);

  if (task.priority === "critical") {
    if (task.status === "pending" && createdHours > 24) return "high";
    if (task.status === "approved" && updatedHours > 24) return "critical";
    if (task.status === "in_progress" && updatedHours > 24 * 5) return "high";
  }

  if (task.priority === "high") {
    if (task.status === "pending" && createdHours > 24 * 3) return "medium";
    if (task.status === "approved" && updatedHours > 24 * 2) return "high";
    if (task.status === "in_progress" && updatedHours > 24 * 10) return "medium";
  }

  return null;
}

export async function runStaleChecks(options?: StaleCheckOptions): Promise<StaleCheckResult> {
  const mode = options?.mode ?? "active";
  const allowAlerts = mode === "active";
  let alertsCreatedOrUpdated = 0;
  let alertsAttempted = 0;
  const staleAgents: string[] = [];
  const staleTaskIds: string[] = [];
  const stalledOpportunityIds: string[] = [];
  const simulatedAlerts: SimulatedAlert[] = [];

  const [tasks, opportunities] = await Promise.all([
    getRecentTasks(200),
    getRecentOpportunities(200)
  ]);

  const agentRunResults = await Promise.all(
    agents.map(async (agentKey) => ({
      agentKey,
      runs: await getRecentSystemRunsByAgent(agentKey, 1)
    }))
  );

  for (const { agentKey, runs } of agentRunResults) {
    const lastRun = runs[0];
    const days = daysSince(lastRun?.started_at);
    const severity = getAgentSeverity(agentKey, days);
    const dedupeKey = makeAlertDedupeKey(["stale_agent", agentKey]);

    if (severity) {
      staleAgents.push(agentKey);
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "create", title: `${agentKey} is stale`, severity });
      } else {
        const result = await createOrUpdateAlert({
          alertType: "stale_agent",
          severity,
          title: `${agentKey} is stale`,
          summary: `${agentKey} has not run in ${Math.floor(days)} day(s).`,
          relatedAgentKey: agentKey,
          dedupeKey
        });
        if (result.action !== "unchanged") alertsCreatedOrUpdated++;
      }
    } else {
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "resolve", title: `Resolve stale agent alert: ${agentKey}`, severity: "info" });
      } else {
        await resolveAlertByKey(dedupeKey);
      }
    }
  }

  const openTasks = (tasks as TaskRow[]).filter((task) =>
    ["pending", "in_review", "approved", "in_progress", "blocked"].includes(task.status)
  );

  for (const task of openTasks) {
    const severity = getTaskStaleSeverity(task);
    const dedupeKey = makeAlertDedupeKey(["stale_task", task.id]);

    if (severity) {
      staleTaskIds.push(task.id);
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "create", title: `Task is stale: ${task.title}`, severity });
      } else {
        const result = await createOrUpdateAlert({
          alertType: "stale_task",
          severity,
          title: `Task is stale: ${task.title}`,
          summary: `Task ${task.title} is stale in status ${task.status} at priority ${task.priority}.`,
          relatedAgentKey: task.agent_key,
          relatedTaskId: task.id,
          dedupeKey
        });
        if (result.action !== "unchanged") alertsCreatedOrUpdated++;
      }
    } else {
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "resolve", title: `Resolve stale task alert: ${task.title}`, severity: "info" });
      } else {
        await resolveAlertByKey(dedupeKey);
      }
    }
  }

  const pendingApprovals = openTasks.filter(
    (task) =>
      task.requires_approval &&
      !task.approved_by_user &&
      ["pending", "in_review", "approved"].includes(task.status)
  );

  const approvalBottleneckKey = makeAlertDedupeKey(["approval_bottleneck", "all"]);
  if (pendingApprovals.length > 5) {
    alertsAttempted++;
    if (!allowAlerts) {
      const severity = pendingApprovals.length > 10 ? "high" : "medium";
      simulatedAlerts.push({ action: "create", title: "Approval bottleneck detected", severity });
    } else {
      const result = await createOrUpdateAlert({
        alertType: "approval_bottleneck",
        severity: "high",
        title: "Approval bottleneck detected",
        summary: `${pendingApprovals.length} approval-gated tasks are waiting on user approval.`,
        dedupeKey: approvalBottleneckKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    }
  } else {
    alertsAttempted++;
    if (!allowAlerts) {
      simulatedAlerts.push({ action: "resolve", title: "Resolve approval bottleneck", severity: "info" });
    } else {
      await resolveAlertByKey(approvalBottleneckKey);
    }
  }

  const criticalPendingApprovals = pendingApprovals.filter(
    (task) => task.priority === "critical" && hoursSince(task.created_at) > 48
  );

  for (const task of criticalPendingApprovals) {
    const dedupeKey = makeAlertDedupeKey(["approval_bottleneck", "critical", task.id]);
    alertsAttempted++;
    if (!allowAlerts) {
      simulatedAlerts.push({ action: "create", title: `Critical task awaiting approval: ${task.title}`, severity: "critical" });
    } else {
      const result = await createOrUpdateAlert({
        alertType: "approval_bottleneck",
        severity: "critical",
        title: `Critical task awaiting approval: ${task.title}`,
        summary: "Critical approval-gated task has been waiting more than 48 hours.",
        relatedAgentKey: task.agent_key,
        relatedTaskId: task.id,
        dedupeKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    }
  }

  const activeOpportunities = (opportunities as OpportunityRow[]).filter(
    (opp) => !["won", "lost", "parked"].includes(opp.status)
  );

  for (const opp of activeOpportunities) {
    const staleDays = daysSince(opp.updated_at);
    const dedupeKey = makeAlertDedupeKey(["stalled_opportunity", opp.id]);

    if (staleDays > 10) {
      stalledOpportunityIds.push(opp.id);
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "create", title: `Opportunity stalled: ${opp.name ?? opp.id}`, severity: "medium" });
      } else {
        const result = await createOrUpdateAlert({
          alertType: "stalled_opportunity",
          severity: "medium",
          title: `Opportunity stalled: ${opp.name ?? opp.id}`,
          summary: `Opportunity has gone ${Math.floor(staleDays)} day(s) without movement.`,
          relatedAgentKey: opp.owner_agent,
          dedupeKey
        });
        if (result.action !== "unchanged") alertsCreatedOrUpdated++;
      }
    } else {
      alertsAttempted++;
      if (!allowAlerts) {
        simulatedAlerts.push({ action: "resolve", title: `Resolve stalled opportunity: ${opp.name ?? opp.id}`, severity: "info" });
      } else {
        await resolveAlertByKey(dedupeKey);
      }
    }
  }

  return {
    alertsCreatedOrUpdated: allowAlerts ? alertsCreatedOrUpdated : 0,
    alertsAttempted,
    staleAgents,
    staleTaskIds,
    pendingApprovalCount: pendingApprovals.length,
    stalledOpportunityIds,
    simulatedAlerts,
    mode
  };
}
