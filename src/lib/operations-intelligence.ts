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

const MS_IN_HOUR = 60 * 60 * 1000;
const MINUTES_GRACE = 15 * 60 * 1000;
const MAX_EXEC_ACTIONS = 5;

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
    importance: "high"
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
    importance: "medium"
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
    importance: "high"
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
    importance: "high"
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
    importance: "medium"
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
    importance: "medium"
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
    importance: "medium"
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
    importance: "high"
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
    importance: "medium"
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
    importance: "high"
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
    importance: "high"
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
    importance: "medium"
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
  links: number;
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
};

type AutomationClassification = "valuable" | "useful" | "low_value" | "inactive" | "broken" | "unknown";

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
    warRoomEntries: data.warRoom?.entries?.length ?? 0
  };

  const automationAudits = AUTOMATION_DEFINITIONS.map((definition) => auditAutomation(definition, context));
  const visibleAutomationAudits = automationAudits.filter((audit) => audit.shouldDisplay);

  const site = buildSiteHealth(data.cloudflare);
  const incidents = buildIncidents({
    schedulerSummary: data.schedulerSummary,
    schedulerJobs,
    automationAudits,
    site,
    systemHealth: data.systemHealth,
    warRoomMode: data.warRoom?.mode ?? "normal",
    warRoomEntries: data.warRoom?.entries?.length ?? 0
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
    humanIntervention,
    overdueJobs,
    schedulerSummary: data.schedulerSummary,
    site
  });
  const overall = buildOverallStatus({
    incidents,
    schedulerSummary: data.schedulerSummary,
    failedJobs,
    overdueJobs,
    site,
    timestamp: data.timestamp
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
    automationAudits: visibleAutomationAudits
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
    warRoomEntries: context.warRoomEntries
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
    shouldDisplay
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
};

function classifyAutomation(input: ClassificationInput): { classification: AutomationClassification; reason: string; shouldDisplay: boolean } {
  const { definition, job, agentStatus, agentUpdate, queue, warRoomMode, warRoomEntries } = input;
  const runStatus = (agentStatus?.runStatus ?? job?.lastStatus ?? "")?.toLowerCase();
  const hoursSinceRun = hoursSince(agentStatus?.lastRunAt ?? job?.lastRunAt ?? null);

  if (definition.type === "queue" && queue) {
    const hasItems = queue.items.length > 0;
    const classification: AutomationClassification = hasItems ? "useful" : "low_value";
    const reason = hasItems
      ? `${queue.items.length} item${queue.items.length === 1 ? " needs" : " need"} review.`
      : "Queue is empty; hide from the executive surface until work appears.";
    const shouldDisplay = hasItems;
    return { classification, reason, shouldDisplay };
  }

  if (definition.type === "warroom") {
    const isActive = warRoomMode === "war_room" && warRoomEntries > 0;
    if (!isActive) {
      return {
        classification: "low_value",
        reason: "No unique war room entries were produced; suppress on the executive dashboard.",
        shouldDisplay: false
      };
    }
    return {
      classification: "useful",
      reason: `War room contains ${warRoomEntries} entry${warRoomEntries === 1 ? "" : "ies"}.`,
      shouldDisplay: true
    };
  }

  if (definition.type === "agent") {
    const hasEvidence = Boolean(agentUpdate);
    if (!agentStatus?.lastRunAt && !hasEvidence) {
      return {
        classification: "unknown",
        reason: "No verifiable runs or outputs were recorded recently.",
        shouldDisplay: false
      };
    }

    if (runStatus === "failed") {
      return {
        classification: "broken",
        reason: "Most recent run failed; investigate agent logs.",
        shouldDisplay: true
      };
    }

    if (hoursSinceRun == null) {
      return {
        classification: "unknown",
        reason: "Run cadence unknown; confirm scheduler telemetry.",
        shouldDisplay: hasEvidence
      };
    }

    if (hoursSinceRun > 120) {
      return {
        classification: "inactive",
        reason: "No runs within five days; hide until the workflow restarts.",
        shouldDisplay: false
      };
    }

    if (hoursSinceRun > 72 || !hasEvidence) {
      return {
        classification: "low_value",
        reason: "Agent has not produced usable outputs in the last 72h.",
        shouldDisplay: false
      };
    }

    const classification: AutomationClassification = definition.importance === "high" ? "valuable" : "useful";
    return {
      classification,
      reason: hasEvidence ? `Latest output: ${agentUpdate?.summary ?? "Summary unavailable"}` : "Evidence recorded via scheduler run.",
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

  if (!job.lastRunAt) {
    return {
      classification: "unknown",
      reason: "Job has never run successfully.",
      shouldDisplay: false
    };
  }

  const jobHoursSinceRun = hoursSince(job.lastRunAt);
  if (jobHoursSinceRun == null) {
    return {
      classification: "unknown",
      reason: "Unable to parse last run date.",
      shouldDisplay: false
    };
  }

  if (jobHoursSinceRun > 240) {
    return {
      classification: "inactive",
      reason: "No successful runs within ten days.",
      shouldDisplay: false
    };
  }

  if (jobHoursSinceRun > 96) {
    return {
      classification: "low_value",
      reason: "Job is configured but has not produced outputs this week.",
      shouldDisplay: false
    };
  }

  const classification: AutomationClassification = jobHoursSinceRun <= 48 ? "valuable" : "useful";
  const reason = job.lastSummary ?? `Last ran ${Math.round(jobHoursSinceRun)}h ago.`;
  return { classification, reason, shouldDisplay: true };
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
}): OperationsIncident[] {
  const incidents: OperationsIncident[] = [];

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

  if (args.warRoomMode === "war_room" && args.warRoomEntries > 0) {
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
      if (!item.title || !item.summary || !item.actor) return;
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
      completedAt: entry.completedAt ?? null,
      links: entry.deliverableLinks?.length ?? 0
    }));
}

function buildOperationsActions(args: {
  incidents: OperationsIncident[];
  automationAudits: AutomationAudit[];
  humanIntervention: OperationsIntervention[];
  overdueJobs: OperationsJob[];
  schedulerSummary?: DashboardOverviewResponse["schedulerSummary"];
  site: OperationsSiteHealth;
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
  } else if (failed || overdue || hasWarningIncident || args.site.status === "degraded") {
    tone = "amber";
    label = "Operations at risk";
    detail = args.incidents[0]?.detail ?? (failed ? "Automation failures detected." : "Attention required.");
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
