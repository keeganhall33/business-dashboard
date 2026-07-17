import type {
  ActionQueue,
  ActionQueueItem,
  AgentStatusPanelEntry,
  AutomationStatusEntry,
  CloudflareTelemetrySnapshot,
  DashboardOverviewResponse,
  ProofOfWorkEntry,
  SchedulerJobHealth
} from "@/lib/types/dashboard";
import { isExecutableApprovalItem } from "./approvals/execution-paths.ts";

const MS_IN_HOUR = 60 * 60 * 1000;
const MINUTES_GRACE = 15 * 60 * 1000;
const MAX_EXEC_ACTIONS = 5;
const DEFAULT_CADENCE_HOURS = 72;

const EXECUTION_PATH_BY_TYPE: Record<ActionQueueItem["itemType"], string> = {
  task: "Approval notifies the assigned agent, starts execution, and logs future proof-of-work evidence.",
  plan: "Approval promotes the plan into the command queue and schedules downstream automation.",
  decision: "Recording the decision updates the executive log and re-runs dependent automations.",
  invoice: "Approval alerts finance automation to send the invoice and capture payment evidence."
};

const AUTOMATION_DEFINITIONS: AutomationDefinition[] = [
  {
    id: "noah",
    label: "Partnership intelligence",
    alias: "Noah",
    type: "agent",
    agentKeys: ["noah"],
    jobKey: "daily-agent-cycle",
    owner: "Pipeline Ops",
    schedule: "Daily cadence",
    businessPurpose: "Keeps the prestige partnership pipeline full with researched targets and plans.",
    downstreamEffect: "Feeds opportunity drafts, research briefs, and approvals for outreach.",
    failureBehavior: "Pipeline stalls and partnership outreach loses momentum.",
    importance: "high",
    expectedCadenceHours: 24
  },
  {
    id: "lyra",
    label: "Brand narrative intelligence",
    alias: "Lyra",
    type: "agent",
    agentKeys: ["lyra"],
    jobKey: "daily-agent-cycle",
    owner: "Brand",
    schedule: "Daily cadence",
    businessPurpose: "Diagnoses brand engagement and narrative strength, surfacing campaigns and directives.",
    downstreamEffect: "Creates marketing plans, messaging tasks, and KPI updates.",
    failureBehavior: "Brand positioning drifts and marketing backlog loses clear priorities.",
    importance: "medium",
    expectedCadenceHours: 24
  },
  {
    id: "sloan",
    label: "Commerce diagnostics",
    alias: "Sloan",
    type: "agent",
    agentKeys: ["sloan"],
    jobKey: "daily-agent-cycle",
    owner: "Revenue Ops",
    schedule: "Daily cadence",
    businessPurpose: "Audits conversion, AOV, and checkout leaks to keep the store reliable.",
    downstreamEffect: "Generates remediation tasks and approvals tied to revenue metrics.",
    failureBehavior: "Revenue regressions go unnoticed and checkout issues persist.",
    importance: "high",
    expectedCadenceHours: 24
  },
  {
    id: "avery",
    label: "Executive directives",
    alias: "Avery",
    type: "agent",
    agentKeys: ["avery"],
    jobKey: "daily-agent-cycle",
    owner: "Executive",
    schedule: "Daily cadence",
    businessPurpose: "Synthesises cross-agent signals into CEO directives, escalations, and war room notes.",
    downstreamEffect: "Populates the executive brief, war room log, and decision queues.",
    failureBehavior: "Executive actions drift and escalations go stale.",
    importance: "high",
    expectedCadenceHours: 24
  },
  {
    id: "war-room",
    label: "CEO War Room digest",
    type: "warroom",
    jobKey: "war-room-digest",
    owner: "Executive",
    schedule: "Triggered during incidents",
    businessPurpose: "Escalates critical incidents into a dedicated war room stream.",
    downstreamEffect: "Publishes auditable war room entries and directives.",
    failureBehavior: "Incidents linger without a dedicated command focus.",
    importance: "medium",
    expectedCadenceHours: null
  },
  {
    id: "ceo-digest",
    label: "CEO digest",
    type: "job",
    jobKey: "ceo-digest",
    owner: "Executive Communications",
    schedule: "Scheduled",
    businessPurpose: "Summarises operations for the CEO and archives the decision log.",
    downstreamEffect: "Sends digest notes and updates the executive brief.",
    failureBehavior: "Executive visibility drops and approvals lack context.",
    importance: "medium",
    expectedCadenceHours: 168
  },
  {
    id: "weekly-command",
    label: "Weekly command summary",
    type: "job",
    jobKey: "weekly-command-cycle",
    owner: "Executive Ops",
    schedule: "Weekly",
    businessPurpose: "Compiles the weekly command cycle and action plan.",
    downstreamEffect: "Publishes the command summary and tasks for the week.",
    failureBehavior: "Weekly cadence slips and priorities go undocumented.",
    importance: "medium",
    expectedCadenceHours: 168
  },
  {
    id: "proof-enforcement",
    label: "Proof enforcement",
    type: "job",
    jobKey: "proof-enforcement",
    owner: "Quality & Finance",
    schedule: "Daily",
    businessPurpose: "Validates evidence for completed work before invoices go out.",
    downstreamEffect: "Flags missing proof-of-work and blocks releases until fixed.",
    failureBehavior: "Deliverables ship without evidence and finance exposure increases.",
    importance: "high",
    expectedCadenceHours: 24
  },
  {
    id: "deliverable-harvest",
    label: "Deliverable harvest",
    type: "job",
    jobKey: "deliverable-harvest",
    owner: "Finance & Ops",
    schedule: "Daily",
    businessPurpose: "Collects deliverables and supporting docs for billing and archives.",
    downstreamEffect: "Feeds invoices, proof-of-work, and customer handoffs.",
    failureBehavior: "Completed work never lands in finance or archives.",
    importance: "medium",
    expectedCadenceHours: 24
  },
  {
    id: "telemetry-health-monitor",
    label: "Telemetry health monitor",
    type: "job",
    jobKey: "telemetry-health-monitor",
    owner: "Telemetry",
    schedule: "Hourly",
    businessPurpose: "Checks data feeds, raises alerts, and resolves stale telemetry.",
    downstreamEffect: "Keeps data sources fresh for every dashboard slice.",
    failureBehavior: "Broken data sources stay undetected, eroding trust.",
    importance: "high",
    expectedCadenceHours: 1
  },
  {
    id: "task-approval-queue",
    label: "Task approval queue",
    type: "queue",
    queue: "needsApprovalTasks",
    owner: "Executive",
    schedule: "Continuous",
    businessPurpose: "Ensures blocking tasks receive manual approval before execution.",
    downstreamEffect: "Releases critical work to agents once approved.",
    failureBehavior: "Critical work idles and deliverables miss deadlines.",
    importance: "high",
    expectedCadenceHours: 0
  },
  {
    id: "plan-approval-queue",
    label: "Plan approval queue",
    type: "queue",
    queue: "pendingPlans",
    owner: "Executive",
    schedule: "Continuous",
    businessPurpose: "Routes strategic plans for approval before resources spin up.",
    downstreamEffect: "Publishes plans into the weekly command cycle on approval.",
    failureBehavior: "Strategic work remains pending and automation never runs.",
    importance: "medium",
    expectedCadenceHours: 0
  }
];

type AutomationDefinition = {
  id: string;
  label: string;
  alias?: string;
  type: "agent" | "job" | "queue" | "warroom";
  jobKey?: string;
  agentKeys?: string[];
  queue?: keyof ActionQueue;
  owner: string;
  schedule: string;
  businessPurpose: string;
  downstreamEffect: string;
  failureBehavior: string;
  importance: "high" | "medium" | "low";
  expectedCadenceHours?: number | null;
};

export type OperationsIntel = {
  overall: OperationsStatusCard;
  site: OperationsSiteHealth;
  incidents: OperationsIncident[];
  failedJobs: OperationsJob[];
  overdueJobs: OperationsJob[];
  humanIntervention: OperationsIntervention[];
  deliverables: OperationsDeliverable[];
  actions: OperationsAction[];
  automationAudits: AutomationAudit[];
  staleWorkflows: StaleWorkflow[];
  telemetryStatus: "healthy" | "unknown";
};

type OperationsStatusCard = {
  label: string;
  tone: "emerald" | "amber" | "rose";
  detail: string;
  updatedAt: string | null;
};

type OperationsSiteHealth = {
  status: "healthy" | "degraded" | "incident" | "unknown";
  detail: string;
  issues: string[];
  availability: string;
  performance: string;
  security: string;
  lastChecked: string | null;
};

type OperationsIncident = {
  id: string;
  title: string;
  detail: string;
  severity: "warning" | "critical";
  detectedAt: string | null;
};

type OperationsJob = {
  id: string;
  title: string;
  detail: string;
  owner: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

type OperationsIntervention = {
  id: string;
  label: string;
  title: string;
  summary: string;
  owner: string;
  dueAt: string | null;
  createdAt: string | null;
  executionPath: string;
};

type OperationsDeliverable = {
  id: string;
  title: string;
  owner: string;
  summary: string;
  completedAt: string | null;
};

type OperationsAction = {
  id: string;
  title: string;
  detail: string;
  owner: string;
  urgency: "today" | "this week" | "soon";
};

type AutomationAudit = {
  id: string;
  label: string;
  alias?: string;
  owner: string;
  classification: AutomationClassification;
  businessPurpose: string;
  downstreamEffect: string;
  failureBehavior: string;
  schedule: string;
  lastRunAt: string | null;
  lastResult: string | null;
  outputSummary: string | null;
  evidenceLink: string | null;
  reason: string;
  shouldDisplay: boolean;
  expectedCadenceHours?: number | null;
};

type AutomationClassification = "valuable" | "useful" | "stale" | "low_value" | "inactive" | "broken" | "unknown";

type StaleWorkflow = {
  id: string;
  label: string;
  owner: string;
  reason: string;
  lastRunAt: string | null;
  expectedCadenceHours?: number | null;
  importance: "high" | "medium" | "low";
};

type BuildContext = {
  now: number;
  jobByKey: Map<string, SchedulerJobHealth>;
  agentStatusByKey: Map<string, AgentStatusPanelEntry>;
  agentUpdatesByKey: Map<string, AgentUpdate>;
  actionQueue: ActionQueue;
  proofOfWork: ProofOfWorkEntry[];
  automationStatusPanel: AutomationStatusEntry[];
  warRoomMode: "normal" | "war_room";
  warRoomEntries: number;
  warRoomEligible: boolean;
};

type AgentUpdate = {
  summary: string;
  createdAt: string;
};

export function buildOperationsIntel(data: DashboardOverviewResponse): OperationsIntel {
  const now = Date.now();
  const schedulerJobs = Array.isArray(data.schedulerJobs) ? data.schedulerJobs : [];
  const jobByKey = new Map(schedulerJobs.map((job) => [job.jobKey, job]));
  const agentStatusByKey = new Map(
    (data.agentStatusPanel ?? []).map((entry) => [entry.agentName.toLowerCase(), entry])
  );
  const agentUpdatesByKey = buildAgentUpdateMap(data.agentUpdateFeed ?? []);

  const context: BuildContext = {
    now,
    jobByKey,
    agentStatusByKey,
    agentUpdatesByKey,
    actionQueue: data.actionQueue,
    proofOfWork: data.proofOfWork ?? [],
    automationStatusPanel: data.automationStatusPanel ?? [],
    warRoomMode: data.warRoom?.mode ?? "normal",
    warRoomEntries: data.warRoom?.entries?.length ?? 0,
    warRoomEligible: isWarRoomEligible(data.warRoom ?? null)
  };

  const automationAudits = AUTOMATION_DEFINITIONS.map((definition) => auditAutomation(definition, context));
  const staleWorkflows = automationAudits
    .filter((audit) => audit.classification === "stale")
    .map((audit) => ({
      id: audit.id,
      label: audit.label,
      owner: audit.owner,
      reason: audit.reason,
      lastRunAt: audit.lastRunAt,
      expectedCadenceHours: audit.expectedCadenceHours,
      importance: AUTOMATION_DEFINITIONS.find((def) => def.id === audit.id)?.importance ?? "medium"
    } satisfies StaleWorkflow));

  const telemetryUnknown = schedulerJobs.length === 0 && (data.schedulerSummary?.jobCount ?? 0) === 0;

  const site = buildSiteHealth(data.cloudflare);
  const incidents = buildIncidents({
    schedulerSummary: data.schedulerSummary,
    schedulerJobs,
    automationAudits,
    site,
    systemHealth: data.systemHealth,
    warRoomMode: data.warRoom?.mode ?? "normal",
    warRoomEntries: data.warRoom?.entries?.length ?? 0,
    telemetryUnknown
  });
  const failedJobs = schedulerJobs
    .filter((job) => (job.lastStatus ?? "").toLowerCase() === "failed")
    .map((job) => mapJob(job));
  const overdueJobs = schedulerJobs
    .filter((job) => isJobOverdue(job, now))
    .map((job) => mapJob(job));
  const humanIntervention = buildHumanIntervention(data.actionQueue);
  const deliverables = buildDeliverables(data.proofOfWork ?? []);
  const actions = buildOperationsActions({
    incidents,
    automationAudits,
    staleWorkflows,
    humanIntervention,
    overdueJobs,
    schedulerSummary: data.schedulerSummary,
    site,
    telemetryUnknown
  });
  const overall = buildOverallStatus({
    incidents,
    schedulerSummary: data.schedulerSummary,
    failedJobs,
    overdueJobs,
    site,
    timestamp: data.timestamp,
    telemetryUnknown
  });

  return {
    overall,
    site,
    incidents,
    failedJobs,
    overdueJobs,
    humanIntervention,
    deliverables,
    actions: actions.slice(0, MAX_EXEC_ACTIONS),
    automationAudits,
    staleWorkflows,
    telemetryStatus: telemetryUnknown ? "unknown" : "healthy"
  };
}

function auditAutomation(definition: AutomationDefinition, context: BuildContext): AutomationAudit {
  const job = definition.jobKey ? context.jobByKey.get(definition.jobKey) ?? null : null;
  const agentStatus = selectAgentStatus(definition, context.agentStatusByKey);
  const agentUpdate = definition.agentKeys ? latestAgentUpdate(definition.agentKeys, context.agentUpdatesByKey) : null;
  const queue = definition.queue ? context.actionQueue?.[definition.queue] : undefined;
  const automationMeta = context.automationStatusPanel.find((row) => matchesAutomationRow(row, definition));

  const { classification, reason, shouldDisplay } = classifyAutomation({
    definition,
    job,
    agentStatus,
    agentUpdate,
    queue,
    warRoomMode: context.warRoomMode,
    warRoomEntries: context.warRoomEntries,
    warRoomEligible: context.warRoomEligible,
    now: context.now
  });

  const businessPurpose = definition.businessPurpose;
  const downstreamEffect = definition.downstreamEffect;
  const failureBehavior = definition.failureBehavior;
  const schedule = definition.schedule;
  const lastRunAt = agentStatus?.lastRunAt ?? job?.lastRunAt ?? automationMeta?.lastRunAt ?? null;
  const lastResult = agentStatus?.runStatus ?? job?.lastStatus ?? automationMeta?.lastResult ?? null;
  const outputSummary = agentUpdate?.summary ?? job?.lastSummary ?? automationMeta?.notes ?? null;
  const evidenceLink = automationMeta?.logLink ?? null;

  return {
    id: definition.id,
    label: definition.label,
    alias: definition.alias,
    owner: definition.owner,
    classification,
    businessPurpose,
    downstreamEffect,
    failureBehavior,
    schedule,
    lastRunAt,
    lastResult,
    outputSummary,
    evidenceLink,
    reason,
    shouldDisplay,
    expectedCadenceHours: definition.expectedCadenceHours
  };
}

type ClassificationInput = {
  definition: AutomationDefinition;
  job: SchedulerJobHealth | null;
  agentStatus: AgentStatusPanelEntry | null;
  agentUpdate: AgentUpdate | null;
  queue?: ActionQueue["needsApprovalTasks"] | ActionQueue["pendingPlans"] | undefined;
  warRoomMode: "normal" | "war_room";
  warRoomEntries: number;
  warRoomEligible: boolean;
  now: number;
};

function classifyAutomation(input: ClassificationInput): { classification: AutomationClassification; reason: string; shouldDisplay: boolean } {
  const { definition, job, agentStatus, agentUpdate, queue, warRoomMode, warRoomEntries, warRoomEligible } = input;
  const runStatus = (agentStatus?.runStatus ?? job?.lastStatus ?? "")?.toLowerCase();
  const lastRunAt = agentStatus?.lastRunAt ?? job?.lastRunAt ?? null;
  const hoursSinceRun = hoursSince(lastRunAt);
  const expectedCadence = normalizeCadence(definition.expectedCadenceHours);
  const staleThreshold = expectedCadence * 1.5;
  const inactiveThreshold = Math.max(expectedCadence * 5, 168);

  if (definition.type === "queue" && queue) {
    const hasItems = queue.items.length > 0;
    const classification: AutomationClassification = hasItems ? "valuable" : "low_value";
    const reason = hasItems
      ? `${queue.items.length} approval${queue.items.length === 1 ? "" : "s"} waiting.`
      : "Queue is empty or already processed.";
    return { classification, reason, shouldDisplay: hasItems };
  }

  if (definition.type === "warroom") {
    if (!warRoomEligible || warRoomMode !== "war_room" || warRoomEntries === 0) {
      return {
        classification: "low_value",
        reason: "War room has no fresh directives; suppress the surface.",
        shouldDisplay: false
      };
    }
    return {
      classification: "useful",
      reason: `War room active with ${warRoomEntries} directive${warRoomEntries === 1 ? "" : "s"}.`,
      shouldDisplay: true
    };
  }

  const hasEvidence = Boolean(agentUpdate?.summary ?? job?.lastSummary ?? job?.lastStatus?.toLowerCase() === "succeeded");

  if (definition.type === "agent") {
    if (!agentStatus?.lastRunAt && !hasEvidence) {
      return {
        classification: "unknown",
        reason: "No verifiable agent telemetry available.",
        shouldDisplay: false
      };
    }

    if (runStatus === "failed") {
      return {
        classification: "broken",
        reason: "Most recent agent run failed.",
        shouldDisplay: true
      };
    }

    if (hoursSinceRun != null && hoursSinceRun > inactiveThreshold) {
      return {
        classification: "inactive",
        reason: "Agent has been idle for multiple cadences.",
        shouldDisplay: false
      };
    }

    if (hoursSinceRun != null && hoursSinceRun > staleThreshold) {
      return {
        classification: "stale",
        reason: `Expected within ${expectedCadence.toFixed(0)}h but last run ${Math.round(hoursSinceRun)}h ago.`,
        shouldDisplay: true
      };
    }

    if (!hasEvidence) {
      return {
        classification: "low_value",
        reason: "Agent ran but produced no verified outputs.",
        shouldDisplay: false
      };
    }

    return {
      classification: definition.importance === "high" ? "valuable" : "useful",
      reason: agentUpdate?.summary ?? "Agent cadence on schedule.",
      shouldDisplay: true
    };
  }

  if (!job) {
    return {
      classification: "unknown",
      reason: "Scheduler has no telemetry for this job.",
      shouldDisplay: false
    };
  }

  if (job.isActive === false) {
    return {
      classification: "inactive",
      reason: "Job marked inactive in scheduler.",
      shouldDisplay: false
    };
  }

  if ((job.lastStatus ?? "").toLowerCase() === "failed") {
    return {
      classification: "broken",
      reason: job.lastError ?? "Scheduler reported a failure.",
      shouldDisplay: true
    };
  }

  if (hoursSinceRun != null && hoursSinceRun > inactiveThreshold) {
    return {
      classification: "inactive",
      reason: "Job has not reported a run in multiple cadences.",
      shouldDisplay: false
    };
  }

  if (hoursSinceRun != null && hoursSinceRun > staleThreshold) {
    return {
      classification: "stale",
      reason: `Expected every ${expectedCadence.toFixed(0)}h; last run ${Math.round(hoursSinceRun)}h ago.`,
      shouldDisplay: true
    };
  }

  if (!hasEvidence) {
    return {
      classification: "low_value",
      reason: "Job ran but produced no consumable output.",
      shouldDisplay: false
    };
  }

  return {
    classification: definition.importance === "high" ? "valuable" : "useful",
    reason: job.lastSummary ?? `Last run ${Math.round(hoursSinceRun ?? 0)}h ago.`,
    shouldDisplay: true
  };
}

function buildAgentUpdateMap(entries: DashboardOverviewResponse["agentUpdateFeed"]): Map<string, AgentUpdate> {
  const map = new Map<string, AgentUpdate>();
  (entries ?? []).forEach((entry) => {
    if (!entry.agentKey) return;
    if (!map.has(entry.agentKey)) {
      map.set(entry.agentKey, { summary: entry.summary ?? entry.title ?? "", createdAt: entry.createdAt });
    }
  });
  return map;
}

function selectAgentStatus(definition: AutomationDefinition, map: Map<string, AgentStatusPanelEntry>): AgentStatusPanelEntry | null {
  if (!definition.agentKeys?.length) return null;
  for (const key of definition.agentKeys) {
    const entry = map.get(key.toLowerCase());
    if (entry) return entry;
  }
  return null;
}

function latestAgentUpdate(agentKeys: string[], map: Map<string, AgentUpdate>): AgentUpdate | null {
  for (const key of agentKeys) {
    const update = map.get(key);
    if (update) return update;
  }
  return null;
}

function matchesAutomationRow(row: AutomationStatusEntry, definition: AutomationDefinition) {
  if (!row.jobName) return false;
  const normalized = row.jobName.trim().toLowerCase();
  if (definition.jobKey && normalized.includes(definition.jobKey)) return true;
  if (definition.alias && normalized.includes(definition.alias.toLowerCase())) return true;
  return normalized.includes(definition.label.toLowerCase());
}

function buildSiteHealth(snapshot?: CloudflareTelemetrySnapshot | null): OperationsSiteHealth {
  if (!snapshot) {
    return {
      status: "unknown",
      detail: "No Cloudflare telemetry for this range.",
      issues: ["Site telemetry unavailable"],
      availability: "Unknown",
      performance: "Unknown",
      security: "Unknown",
      lastChecked: null
    };
  }

  const issues: string[] = [];
  let status: OperationsSiteHealth["status"] = "healthy";
  const availability = snapshot.summary?.trafficHealth ?? "unknown";
  const cacheHealth = snapshot.summary?.cacheHealth ?? "unknown";
  const securityPressure = snapshot.summary?.securityPressure ?? null;
  const perfWarning = snapshot.performance?.latencyWarning || snapshot.performance?.cacheHitWarning;

  if (availability !== "active") {
    status = "degraded";
    issues.push("Traffic is quiet or unavailable.");
  }
  if (cacheHealth === "needs attention") {
    status = status === "healthy" ? "degraded" : status;
    issues.push("Cache hit rate below target.");
  }
  if (perfWarning) {
    status = status === "healthy" ? "degraded" : status;
    issues.push("Performance warning from Cloudflare.");
  }
  if ((snapshot.security?.threats ?? 0) > 0 && (snapshot.security?.threatChangePct ?? 0) > 50) {
    status = "incident";
    issues.push("Security pressure spiked.");
  }
  if (snapshot.warnings?.length) {
    issues.push(...snapshot.warnings);
    status = status === "healthy" ? "degraded" : status;
  }

  const detail =
    status === "healthy"
      ? "Site telemetry healthy."
      : issues[0] ?? "Site telemetry degraded.";

  return {
    status,
    detail,
    issues,
    availability: availability === "active" ? "Healthy" : availability === "quiet" ? "Quiet" : "Unknown",
    performance: perfWarning ? "Warning" : "Healthy",
    security: securityPressure != null ? `${securityPressure.toFixed(1)} pressure` : "No incidents",
    lastChecked: snapshot.generatedAt ?? null
  };
}

function buildIncidents(args: {
  schedulerSummary?: DashboardOverviewResponse["schedulerSummary"];
  schedulerJobs: SchedulerJobHealth[];
  automationAudits: AutomationAudit[];
  site: OperationsSiteHealth;
  systemHealth?: DashboardOverviewResponse["systemHealth"];
  warRoomMode: "normal" | "war_room";
  warRoomEntries: number;
  telemetryUnknown: boolean;
}): OperationsIncident[] {
  const incidents: OperationsIncident[] = [];

  if (args.telemetryUnknown) {
    incidents.push({
      id: "ops-telemetry",
      title: "Operations telemetry unavailable",
      detail: "Scheduler diagnostics are unavailable. Verify observability before taking action.",
      severity: "warning",
      detectedAt: args.schedulerSummary?.lastUpdatedAt ?? null
    });
  }

  if (args.schedulerSummary?.status === "BROKEN") {
    incidents.push({
      id: "scheduler",
      title: "Scheduler offline",
      detail: `${args.schedulerSummary.failingCount} failing, ${args.schedulerSummary.missingTelemetryCount} missing telemetry.`,
      severity: "critical",
      detectedAt: args.schedulerSummary.lastUpdatedAt ?? null
    });
  }

  args.schedulerJobs
    .filter((job) => (job.lastStatus ?? "").toLowerCase() === "failed")
    .forEach((job) => {
      incidents.push({
        id: `job-${job.jobKey}`,
        title: `${job.jobName} failed`,
        detail: job.lastError ?? "Scheduler reported a failure.",
        severity: "critical",
        detectedAt: job.lastRunAt ?? null
      });
    });

  if (args.systemHealth?.dataFreshnessHours != null && args.systemHealth.dataFreshnessHours > 6) {
    incidents.push({
      id: "data-freshness",
      title: "Telemetry stale",
      detail: `Scoreboard data is ${args.systemHealth.dataFreshnessHours}h old.`,
      severity: "warning",
      detectedAt: null
    });
  }

  if (args.site.status === "incident") {
    incidents.push({
      id: "site",
      title: "Site reliability incident",
      detail: args.site.detail,
      severity: "critical",
      detectedAt: args.site.lastChecked
    });
  } else if (args.site.status === "degraded") {
    incidents.push({
      id: "site-degraded",
      title: "Site reliability degraded",
      detail: args.site.detail,
      severity: "warning",
      detectedAt: args.site.lastChecked
    });
  }

  args.automationAudits
    .filter((audit) => audit.classification === "broken")
    .forEach((audit) => {
      incidents.push({
        id: `audit-${audit.id}`,
        title: `${audit.label} is broken`,
        detail: audit.reason,
        severity: "critical",
        detectedAt: audit.lastRunAt
      });
    });

  const warRoomAudit = args.automationAudits.find((audit) => audit.id === "war-room");
  if (args.warRoomMode === "war_room" && args.warRoomEntries > 0 && warRoomAudit && warRoomAudit.classification !== "low_value") {
    incidents.push({
      id: "war-room",
      title: "War room active",
      detail: `${args.warRoomEntries} entry${args.warRoomEntries === 1 ? "" : "ies"} logged.`,
      severity: "warning",
      detectedAt: null
    });
  }

  return incidents.slice(0, 6);
}

function buildHumanIntervention(actionQueue: ActionQueue): OperationsIntervention[] {
  const sections: Array<{ label: string; items: ActionQueueItem[] }> = [
    actionQueue.needsApprovalTasks,
    actionQueue.pendingPlans,
    actionQueue.decisionsDue,
    actionQueue.invoicesToSend
  ]
    .filter(Boolean)
    .map((section) => ({ label: section.label, items: dedupeItems(section.items ?? []) }));

  const entries: OperationsIntervention[] = [];
  sections.forEach((section) => {
    section.items.forEach((item) => {
      if (!isExecutableApprovalItem(item)) return;
      const executionPath = EXECUTION_PATH_BY_TYPE[item.itemType];
      if (!executionPath) return;
      entries.push({
        id: `${item.itemType}:${item.id}`,
        label: section.label,
        title: item.title,
        summary: item.summary,
        owner: item.actor,
        dueAt: item.dueAt ?? null,
        createdAt: item.createdAt ?? null,
        executionPath
      });
    });
  });

  return entries.slice(0, 5);
}

function dedupeItems(items: ActionQueueItem[]): ActionQueueItem[] {
  const result: ActionQueueItem[] = [];
  const seen = new Set<string>();
  items.forEach((item) => {
    const key = `${item.itemType}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function buildDeliverables(entries: ProofOfWorkEntry[]): OperationsDeliverable[] {
  return (entries ?? [])
    .filter((entry) => entry.summary || (entry.deliverableLinks?.length ?? 0) > 0)
    .sort((a, b) => dateDesc(a.completedAt ?? a.taskId, b.completedAt ?? b.taskId))
    .slice(0, 4)
    .map((entry) => ({
      id: entry.taskId,
      title: entry.taskTitle,
      owner: entry.agentKey ?? "Unassigned",
      summary: entry.summary ?? "Deliverable attached.",
      completedAt: entry.completedAt ?? null
    }));
}

function buildOperationsActions(args: {
  incidents: OperationsIncident[];
  automationAudits: AutomationAudit[];
  staleWorkflows: StaleWorkflow[];
  humanIntervention: OperationsIntervention[];
  overdueJobs: OperationsJob[];
  schedulerSummary?: DashboardOverviewResponse["schedulerSummary"];
  site: OperationsSiteHealth;
  telemetryUnknown: boolean;
}): OperationsAction[] {
  const actions: OperationsAction[] = [];

  args.automationAudits
    .filter((audit) => audit.classification === "broken")
    .forEach((audit) => {
      actions.push({
        id: `repair-${audit.id}`,
        title: `Repair ${audit.label}`,
        detail: audit.reason,
        owner: audit.owner,
        urgency: "today"
      });
    });

  args.staleWorkflows.slice(0, 2).forEach((workflow) => {
    actions.push({
      id: `stale-${workflow.id}`,
      title: `Resume ${workflow.label}`,
      detail: workflow.reason,
      owner: workflow.owner,
      urgency: workflow.importance === "high" ? "today" : "this week"
    });
  });

  const staleQueue = args.humanIntervention.find((item) => {
    const created = parseDate(item.createdAt);
    if (!created) return false;
    return Date.now() - created.getTime() > 48 * MS_IN_HOUR;
  });
  if (staleQueue) {
    actions.push({
      id: `approval-${staleQueue.id}`,
      title: `Unblock ${staleQueue.title}`,
      detail: `${staleQueue.label} has been waiting since ${staleQueue.createdAt ?? "submission"}.`,
      owner: staleQueue.owner,
      urgency: "today"
    });
  }

  if (args.overdueJobs.length) {
    const job = args.overdueJobs[0];
    actions.push({
      id: `overdue-${job.id}`,
      title: `Restart ${job.title}`,
      detail: job.detail,
      owner: job.owner,
      urgency: "this week"
    });
  }

  if (args.site.status === "incident") {
    actions.push({
      id: "site-action",
      title: "Resolve site incident",
      detail: args.site.detail,
      owner: "Infra",
      urgency: "today"
    });
  }

  if (args.schedulerSummary?.status === "BROKEN") {
    actions.push({
      id: "scheduler-action",
      title: "Restore scheduler",
      detail: "Scheduler telemetry reports BROKEN; confirm cron and rerun critical jobs.",
      owner: "Ops",
      urgency: "today"
    });
  }

  if (args.telemetryUnknown) {
    actions.push({
      id: "verify-telemetry",
      title: "Verify operations telemetry",
      detail: "Diagnostics are unavailable; ensure the scheduler data source is reachable before taking action.",
      owner: "Ops",
      urgency: "this week"
    });
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: OperationsAction[]): OperationsAction[] {
  const seen = new Set<string>();
  const result: OperationsAction[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    result.push(action);
    if (result.length >= MAX_EXEC_ACTIONS) break;
  }
  return result;
}

function buildOverallStatus(args: {
  incidents: OperationsIncident[];
  schedulerSummary?: DashboardOverviewResponse["schedulerSummary"];
  failedJobs: OperationsJob[];
  overdueJobs: OperationsJob[];
  site: OperationsSiteHealth;
  timestamp?: string;
  telemetryUnknown: boolean;
}): OperationsStatusCard {
  const hasCriticalIncident = args.incidents.some((incident) => incident.severity === "critical");
  const hasWarningIncident = args.incidents.some((incident) => incident.severity === "warning");
  const schedulerBroken = args.schedulerSummary?.status === "BROKEN";
  const overdue = args.overdueJobs.length > 0;
  const failed = args.failedJobs.length > 0;

  let tone: OperationsStatusCard["tone"] = "emerald";
  let label = "Operations stable";
  let detail = "All automation reporting.";

  if (schedulerBroken || hasCriticalIncident || args.site.status === "incident") {
    tone = "rose";
    label = "Operations incident";
    detail = args.incidents[0]?.detail ?? "Scheduler offline.";
  } else if (args.telemetryUnknown || failed || overdue || hasWarningIncident || args.site.status === "degraded") {
    tone = "amber";
    label = args.telemetryUnknown ? "Operations visibility unknown" : "Operations at risk";
    detail = args.telemetryUnknown
      ? "Scheduler diagnostics unavailable; verify telemetry."
      : args.incidents[0]?.detail ?? (failed ? "Automation failures detected." : "Attention required.");
  }

  return {
    label,
    tone,
    detail,
    updatedAt: args.schedulerSummary?.lastUpdatedAt ?? args.timestamp ?? null
  };
}

function mapJob(job: SchedulerJobHealth): OperationsJob {
  return {
    id: job.jobKey,
    title: job.jobName,
    detail: job.lastSummary ?? job.lastError ?? job.routePath ?? "",
    owner: job.source ?? "Scheduler",
    lastRunAt: job.lastRunAt ?? null,
    nextRunAt: job.nextRunAt ?? null
  };
}

function isJobOverdue(job: SchedulerJobHealth, now: number) {
  if (job.nextRunAt) {
    const nextRun = Date.parse(job.nextRunAt);
    if (!Number.isNaN(nextRun) && nextRun + MINUTES_GRACE < now) {
      return true;
    }
  }
  const lastRun = job.lastRunAt ? Date.parse(job.lastRunAt) : NaN;
  if (Number.isNaN(lastRun)) return false;
  const hoursSinceRun = (now - lastRun) / MS_IN_HOUR;
  return job.isActive !== false && hoursSinceRun > 48;
}

function hoursSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return (Date.now() - date) / MS_IN_HOUR;
}

function normalizeCadence(value?: number | null) {
  if (typeof value === "number" && value > 0) {
    return value;
  }
  return DEFAULT_CADENCE_HOURS;
}

function isWarRoomEligible(warRoom: DashboardOverviewResponse["warRoom"] | null | undefined) {
  if (!warRoom || warRoom.mode !== "war_room") return false;
  if (!Array.isArray(warRoom.entries) || warRoom.entries.length === 0) return false;
  const recentEntry = warRoom.entries.find((entry) => Boolean(entry.summary) && Boolean(entry.createdAt) && Boolean(entry.title));
  if (!recentEntry) return false;
  if (!warRoom.lastUpdated) return false;
  const hours = hoursSince(warRoom.lastUpdated);
  if (hours != null && hours > 48) return false;
  return true;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function dateDesc(a: string | null, b: string | null) {
  const aTime = a ? Date.parse(a) : 0;
  const bTime = b ? Date.parse(b) : 0;
  return (bTime || 0) - (aTime || 0);
}
