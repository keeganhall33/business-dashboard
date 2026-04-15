# Operator Command System — Scheduler & Autopilot Spec

Automation is mandatory. These are the job definitions, cadences, and tables that keep the system alive.

## 1. Scheduler Cadence (America/Los_Angeles)

| Job | Cron | Purpose |
| --- | --- | --- |
| daily-agent-cycle | `5 6 * * *` | Run Sloan → Lyra → Noah → Avery every morning to log daily updates. |
| daily-health-check | `15 6 * * *` | Refresh metrics, evaluate alert rules, run stale checks. |
| weekly-command-cycle | `0 7 * * 1` | Full agent run (Sloan → Lyra → Noah → Avery), directive + summary. |
| midweek-opportunity-pulse | `30 11 * * 3` | Re-run Noah, inspect pipeline, escalate stalled opps. |
| evening-closeout | `30 19 * * *` | Inspect approvals/stale tasks, publish end-of-day health. |

If cron engine is UTC-only, convert carefully or pick a scheduler that supports `America/Los_Angeles` directly.

## 2. Scheduler Routes

```
POST /api/scheduler/daily-agent-cycle
POST /api/scheduler/daily-health-check
POST /api/scheduler/weekly-command-cycle
POST /api/scheduler/midweek-opportunity-pulse
POST /api/scheduler/evening-closeout
```

Each route:
- Authenticates via `x-scheduler-secret` header (compare to `process.env.SCHEDULER_SECRET`).
- Calls the matching `run*` function in `src/lib/scheduler/`.
- Returns `{ ok: true, job: ..., result }`.

## 3. Scheduler Library Structure (`src/lib/scheduler`)

- `dailyHealthCheck.ts`
- `dailyAgentCycle.ts`
- `weeklyCommandCycle.ts`
- `midweekOpportunityPulse.ts`
- `eveningCloseout.ts`
- `staleChecks.ts`
- `alerting.ts`
- `warRoom.ts`

Responsibilities:
- `dailyHealthCheck`: refresh metrics, run `evaluateRules`, check stale agents/tasks, update alerts, refresh dashboard snapshot cache.
- `weeklyCommandCycle`: evaluate rules, run Sloan→Lyra→Noah→Avery, capture outputs, publish weekly directive + summary.
- `midweekOpportunityPulse`: inspect pipeline KPIs, re-run Noah, create follow-ups for stalled opportunities, escalate to Avery if needed.
- `eveningCloseout`: check approval bottlenecks, stale tasks, produce end-of-day state.
- `staleChecks`: implement stale-agent and stale-task logic (see rules below).
- `alerting`: create/resolve/dedupe alerts.
- `warRoom`: detect activation/deactivation conditions and set `system_state.mode` accordingly.

### Scheduler Query Helpers (`src/lib/supabase/queries.ts`)

```ts
export async function createJobRunLog(...) { /* insert row into job_run_log */ }
export async function finishJobRunLog(id, input) { /* mark run complete/failed */ }
export async function getOpenAlerts() { /* select unresolved alerts */ }
export async function getOpenAlertByDedupeKey(key) { /* maybeSingle */ }
export async function createSystemAlert({...}) { /* insert alert */ }
export async function incrementAlertEscalation(id, input) { /* bump escalation_count */ }
export async function resolveSystemAlert(dedupeKey) { /* set is_resolved true */ }
export async function getSystemState(key) { /* maybeSingle */ }
export async function upsertSystemState(key, valueJson) { /* upsert row */ }
export async function getRecentSystemRunsByAgent(agentKey, limit?) { /* select */ }
export async function getRecentTasks(limit?) { /* select */ }
export async function getRecentOpportunities(limit?) { /* select */ }
export async function getLatestAgentDirective() { /* latest Avery directive */ }
export async function getUnresolvedAlerts(limit?) { /* unresolved alerts */ }
export async function getLatestOpportunitiesByStatus(status, limit?) { /* filter by status */ }
export async function getTaskCountsByStatus() { /* aggregate */ }
export async function getTasksAwaitingApproval(limit?) { /* pending approvals */ }
export async function findOpenTaskByTitle(agentKey, title) { /* dedupe tasks */ }
```

Use the full function bodies provided in the latest requirements (they include JSON payload handling and date stamps). The exact TypeScript drop-ins live in `SCHEDULER_REFERENCE.md` for copy/paste. Do **not** keep a separate `escalateSystemAlert()` helper—`incrementAlertEscalation()` handles severity bumps without resetting `escalation_count`.

### Scheduler Auth Helper (`src/lib/scheduler/auth.ts`)

```ts
export function assertSchedulerAuth(request: Request) {
  const suppliedSecret = request.headers.get("x-scheduler-secret");
  const expectedSecret = process.env.SCHEDULER_SECRET;

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    throw new Error("Unauthorized scheduler request");
  }
}
```

### Job Logger Wrapper (`src/lib/scheduler/jobLogger.ts`)

```ts
import { createJobRunLog, finishJobRunLog } from "@/lib/supabase/queries";

export async function withJobRun<T>(input: {
  jobKey: string;
  fn: () => Promise<T>;
  summarize?: (result: T) => { summary?: string; detailsJson?: Record<string, unknown> };
}) {
  const run = await createJobRunLog({ jobKey: input.jobKey, status: "running" });

  try {
    const result = await input.fn();
    const summaryPayload = input.summarize ? input.summarize(result) : {};

    await finishJobRunLog(run.id, {
      status: "completed",
      summary: summaryPayload.summary,
      detailsJson: summaryPayload.detailsJson
    });

    return result;
  } catch (error) {
    await finishJobRunLog(run.id, {
      status: "failed",
      errorMd: error instanceof Error ? error.stack ?? error.message : JSON.stringify(error)
    });
    throw error;
  }
}
```

### State Writers (`src/lib/scheduler/stateWriters.ts`)

```ts
import { upsertSystemState } from "@/lib/supabase/queries";

export async function writeLatestDirectiveState(input: {
  directive: string;
  source: string;
  generatedAt?: string;
}) {
  await upsertSystemState("latest_directive", {
    directive: input.directive,
    source: input.source,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  });
}

export async function writeWeeklySummaryState(summary: Record<string, unknown>) {
  await upsertSystemState("weekly_summary", {
    ...summary,
    updatedAt: new Date().toISOString()
  });
}

export async function writeDashboardSnapshotMeta(input: {
  source: string;
  mode?: string;
  lastRefreshedAt?: string;
}) {
  await upsertSystemState("dashboard_snapshot_meta", {
    source: input.source,
    mode: input.mode ?? null,
    lastRefreshedAt: input.lastRefreshedAt ?? new Date().toISOString()
  });
}
```

## 4. New Tables

```sql
create table if not exists scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text unique not null,
  job_name text not null,
  cron_expression text not null,
  timezone text not null default 'America/Los_Angeles',
  route_path text not null,
  is_active boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists job_run_log (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running','completed','failed')),
  summary text,
  details_json jsonb not null default '{}'::jsonb,
  error_md text,
  created_at timestamptz not null default now()
);

create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  severity text not null check (severity in ('critical','high','medium','low')),
  title text not null,
  summary text not null,
  related_agent_key text,
  related_task_id uuid references task_queue(id) on delete set null,
  related_metric_key text,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists system_state (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

`system_state` holds things like `operating_mode`, `weekly_summary`, and `dashboard_snapshot_meta`.

### Exact SQL (canonical block to drop into schema)

```
-- =========================================================
-- 16. SCHEDULED JOBS
-- =========================================================
create table if not exists scheduled_jobs (
 id uuid primary key default gen_random_uuid(),
 job_key text unique not null,
 job_name text not null,
 cron_expression text not null,
 timezone text not null default 'America/Los_Angeles',
 route_path text not null,
 is_active boolean not null default true,
 last_run_at timestamptz,
 next_run_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists idx_scheduled_jobs_job_key on scheduled_jobs(job_key);
create index if not exists idx_scheduled_jobs_is_active on scheduled_jobs(is_active);

drop trigger if exists trg_scheduled_jobs_updated_at on scheduled_jobs;
create trigger trg_scheduled_jobs_updated_at
before update on scheduled_jobs
for each row execute function set_updated_at();

-- =========================================================
-- 17. JOB RUN LOG
-- =========================================================
create table if not exists job_run_log (
 id uuid primary key default gen_random_uuid(),
 job_key text not null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null check (status in ('running','completed','failed')),
 summary text,
 details_json jsonb not null default '{}'::jsonb,
 error_md text,
 created_at timestamptz not null default now()
);

create index if not exists idx_job_run_log_job_key_started_at
 on job_run_log(job_key, started_at desc);
create index if not exists idx_job_run_log_status on job_run_log(status);

-- =========================================================
-- 18. SYSTEM ALERTS
-- =========================================================
create table if not exists system_alerts (
 id uuid primary key default gen_random_uuid(),
 alert_type text not null,
 severity text not null check (severity in ('critical','high','medium','low')),
 title text not null,
 summary text not null,
 related_agent_key text,
 related_task_id uuid references task_queue(id) on delete set null,
 related_metric_key text,
 dedupe_key text not null,
 escalation_count integer not null default 0,
 last_escalated_at timestamptz,
 is_resolved boolean not null default false,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create unique index if not exists idx_system_alerts_open_dedupe_key
 on system_alerts(dedupe_key)
 where is_resolved = false;
create index if not exists idx_system_alerts_alert_type on system_alerts(alert_type);
create index if not exists idx_system_alerts_severity on system_alerts(severity);
create index if not exists idx_system_alerts_related_agent_key on system_alerts(related_agent_key);

drop trigger if exists trg_system_alerts_updated_at on system_alerts;
create trigger trg_system_alerts_updated_at
before update on system_alerts
for each row execute function set_updated_at();

-- =========================================================
-- 19. SYSTEM STATE
-- =========================================================
create table if not exists system_state (
 key text primary key,
 value_json jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

-- =========================================================
-- 20. SEED SCHEDULED JOBS
-- =========================================================
insert into scheduled_jobs (
 job_key, job_name, cron_expression, timezone, route_path, is_active
) values
 ('daily-health-check','Daily Health Check','15 6 * * *','America/Los_Angeles','/api/scheduler/daily-health-check',true),
 ('weekly-command-cycle','Weekly Command Cycle','0 7 * * 1','America/Los_Angeles','/api/scheduler/weekly-command-cycle',true),
 ('midweek-opportunity-pulse','Midweek Opportunity Pulse','30 11 * * 3','America/Los_Angeles','/api/scheduler/midweek-opportunity-pulse',true),
 ('evening-closeout','Evening Closeout','30 19 * * *','America/Los_Angeles','/api/scheduler/evening-closeout',true)
on conflict (job_key) do nothing;

-- =========================================================
-- 21. SYSTEM STATE SEEDS
-- =========================================================
insert into system_state (key, value_json)
values
 ('operating_mode', jsonb_build_object('mode','normal','reason',null,'activatedAt',null)),
 ('weekly_summary', jsonb_build_object()),
 ('latest_directive', jsonb_build_object()),
 ('dashboard_snapshot_meta', jsonb_build_object('lastRefreshedAt',null))
on conflict (key) do nothing;
```

## 5. Alert vs Task Logic

- **Create a task** when ownership, action, and impact are crystal clear (e.g., AOV breach → Sloan pricing task).
- **Create an alert** when the issue needs visibility/judgment (e.g., Avery stale, approval backlog, job failure).
- Alerts must dedupe by `(alert_type, related_agent_key, related_metric_key)` until resolved.

### Reference Implementation — `src/lib/scheduler/alerting.ts`

```ts
import {
  createSystemAlert,
  getOpenAlertByDedupeKey,
  incrementAlertEscalation,
  resolveSystemAlert
} from "@/lib/supabase/queries";

type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertInput = {
  alertType: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  relatedAgentKey?: string | null;
  relatedTaskId?: string | null;
  relatedMetricKey?: string | null;
  dedupeKey: string;
};

const severityRank: Record<AlertSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function makeAlertDedupeKey(parts: Array<string | null | undefined>) {
  return parts
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .map((part) => part.trim().toLowerCase())
    .join(":");
}

export async function createOrUpdateAlert(input: AlertInput) {
  const existing = await getOpenAlertByDedupeKey(input.dedupeKey);

  if (!existing) {
    const created = await createSystemAlert({
      alertType: input.alertType,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      relatedAgentKey: input.relatedAgentKey,
      relatedTaskId: input.relatedTaskId,
      relatedMetricKey: input.relatedMetricKey,
      dedupeKey: input.dedupeKey
    });

    return { action: "created" as const, alert: created };
  }

  const currentSeverity = existing.severity as AlertSeverity;
  const shouldEscalate = severityRank[input.severity] > severityRank[currentSeverity];
  const summaryChanged = existing.summary !== input.summary;

  if (shouldEscalate || summaryChanged) {
    const updated = await incrementAlertEscalation(existing.id, {
      severity: shouldEscalate ? input.severity : currentSeverity,
      summary: input.summary
    });

    return {
      action: shouldEscalate ? ("escalated" as const) : ("refreshed" as const),
      alert: updated
    };
  }

  return { action: "unchanged" as const, alert: existing };
}

export async function resolveAlertByKey(dedupeKey: string) {
  const resolved = await resolveSystemAlert(dedupeKey);
  return {
    action: resolved.length > 0 ? ("resolved" as const) : ("noop" as const),
    resolvedCount: resolved.length
  };
}
```

## 6. Stale-Agent Rules

| Agent | Medium Alert | High/Critical |
| --- | --- | --- |
| Sloan | no run ≥ 3 days | ≥ 7 days |
| Lyra | ≥ 4 days | ≥ 8 days |
| Noah | ≥ 3 days | ≥ 7 days |
| Avery | ≥ 2 days (high) | ≥ 5 days (critical) |

## 7. Stale-Task Rules

- Critical pending > 24h → high alert.
- Critical approved-but-not-started > 24h → critical alert.
- Critical in-progress > 5 days → high alert.
- High-priority pending > 3 days → medium alert.
- High-priority approved-not-started > 2 days → high alert.
- High-priority in-progress > 10 days → medium alert.
- Approval bottleneck: >5 approval-gated tasks pending → high alert; any critical approval pending > 48h → critical alert.

### Reference Implementation — `src/lib/scheduler/staleChecks.ts`

```ts
import {
  getRecentOpportunities,
  getRecentSystemRunsByAgent,
  getRecentTasks
} from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";

const DAY_MS = 24 * 60 * 60 * 1000;
const agents = ["avery", "sloan", "lyra", "noah"] as const;

export type StaleCheckResult = {
  alertsCreatedOrUpdated: number;
  staleAgents: string[];
  staleTaskIds: string[];
  pendingApprovalCount: number;
  stalledOpportunityIds: string[];
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

function getTaskStaleSeverity(task: any) {
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

export async function runStaleChecks(): Promise<StaleCheckResult> {
  let alertsCreatedOrUpdated = 0;
  const staleAgents: string[] = [];
  const staleTaskIds: string[] = [];
  const stalledOpportunityIds: string[] = [];

  const [tasks, opportunities] = await Promise.all([
    getRecentTasks(200),
    getRecentOpportunities(200)
  ]);

  for (const agentKey of agents) {
    const runs = await getRecentSystemRunsByAgent(agentKey, 1);
    const lastRun = runs[0];
    const days = daysSince(lastRun?.started_at);
    const severity = getAgentSeverity(agentKey, days);
    const dedupeKey = makeAlertDedupeKey(["stale_agent", agentKey]);

    if (severity) {
      staleAgents.push(agentKey);
      const result = await createOrUpdateAlert({
        alertType: "stale_agent",
        severity,
        title: `${agentKey} is stale`,
        summary: `${agentKey} has not run in ${Math.floor(days)} day(s).`,
        relatedAgentKey: agentKey,
        dedupeKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    } else {
      await resolveAlertByKey(dedupeKey);
    }
  }

  const openTasks = tasks.filter((task) =>
    ["pending","in_review","approved","in_progress","blocked"].includes(task.status)
  );

  for (const task of openTasks) {
    const severity = getTaskStaleSeverity(task);
    const dedupeKey = makeAlertDedupeKey(["stale_task", task.id]);

    if (severity) {
      staleTaskIds.push(task.id);
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
    } else {
      await resolveAlertByKey(dedupeKey);
    }
  }

  const pendingApprovals = openTasks.filter(
    (task) => task.requires_approval && !task.approved_by_user &&
      ["pending","in_review","approved"].includes(task.status)
  );

  const approvalBottleneckKey = makeAlertDedupeKey(["approval_bottleneck","all"]);
  if (pendingApprovals.length > 5) {
    const result = await createOrUpdateAlert({
      alertType: "approval_bottleneck",
      severity: "high",
      title: "Approval bottleneck detected",
      summary: `${pendingApprovals.length} approval-gated tasks are waiting on user approval.`,
      dedupeKey: approvalBottleneckKey
    });
    if (result.action !== "unchanged") alertsCreatedOrUpdated++;
  } else {
    await resolveAlertByKey(approvalBottleneckKey);
  }

  const criticalPendingApprovals = pendingApprovals.filter(
    (task) => task.priority === "critical" && hoursSince(task.created_at) > 48
  );

  for (const task of criticalPendingApprovals) {
    const dedupeKey = makeAlertDedupeKey(["approval_bottleneck","critical", task.id]);
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

  const activeOpportunities = opportunities.filter(
    (opp) => !["won","lost","parked"].includes(opp.status)
  );

  for (const opp of activeOpportunities) {
    const staleDays = daysSince(opp.updated_at);
    const dedupeKey = makeAlertDedupeKey(["stalled_opportunity", opp.id]);

    if (staleDays > 10) {
      stalledOpportunityIds.push(opp.id);
      const result = await createOrUpdateAlert({
        alertType: "stalled_opportunity",
        severity: "medium",
        title: `Opportunity is stalled: ${opp.name}`,
        summary: `Opportunity ${opp.name} has not meaningfully changed in ${Math.floor(staleDays)} day(s).`,
        relatedAgentKey: opp.owner_agent,
        dedupeKey
      });
      if (result.action !== "unchanged") alertsCreatedOrUpdated++;
    } else {
      await resolveAlertByKey(dedupeKey);
    }
  }

  return {
    alertsCreatedOrUpdated,
    staleAgents,
    staleTaskIds,
    pendingApprovalCount: pendingApprovals.length,
    stalledOpportunityIds
  };
}
```

## 8. Pipeline Health Rules

- `active_opportunities < 5` → high alert, auto-create Noah prestige-target task.
- `no new opportunities in 7 days` → medium alert, Noah must add 5.
- `opportunity stagnates > 10 days` (not won/lost/parked) → medium alert + follow-up task.
- `ready_for_outreach count = 0` for 7 days → high alert + pitch-prep sprint.

## 9. Revenue Emergency / War Room

Activate war-room mode if any of:
- MTD revenue < 40% of target by the 15th
- AOV < $80
- Conversion < 1.0%
- No deals closed for 2 consecutive quarters
- Active opportunities < 3

When active:
- Sloan runs every 2 days
- Lyra twice weekly
- Noah every 2 days
- Avery every 3 days
- Dashboard shows red status strip
- Low-priority task creation suppressed
- Quiet hours still respected (no noisy alerts 8:30pm–7:00am unless critical)

Deactivate when metrics recover above thresholds for 7 consecutive days.

### Reference Implementation — `src/lib/scheduler/warRoom.ts`

```ts
import {
  getLatestScoreboardMetrics,
  getSystemState,
  upsertSystemState
} from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";

type OperatingMode = "normal" | "war_room";

function getMetric(metrics: any[], key: string) {
  return metrics.find((metric) => metric.metric_key === key);
}

function dayOfMonth() {
  return new Date().getDate();
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return NaN;
}

export async function evaluateWarRoomMode() {
  const metrics = await getLatestScoreboardMetrics();

  const monthlyRevenue = getMetric(metrics, "monthly_revenue");
  const aov = getMetric(metrics, "aov");
  const conversion = getMetric(metrics, "conversion_rate");
  const activeOpps = getMetric(metrics, "active_brand_conversations");
  const dealsClosed = getMetric(metrics, "deals_closed_quarterly");

  const triggers: string[] = [];
  const day = dayOfMonth();

  const monthlyRevenueCurrent = asNumber(monthlyRevenue?.current_value);
  const monthlyRevenueTarget = asNumber(monthlyRevenue?.target_value);
  const aovCurrent = asNumber(aov?.current_value);
  const conversionCurrent = asNumber(conversion?.current_value);
  const activeOppsCurrent = asNumber(activeOpps?.current_value);
  const dealsClosedCurrent = asNumber(dealsClosed?.current_value);

  if (
    day >= 15 &&
    Number.isFinite(monthlyRevenueCurrent) &&
    Number.isFinite(monthlyRevenueTarget) &&
    monthlyRevenueTarget > 0 &&
    monthlyRevenueCurrent < monthlyRevenueTarget * 0.4
  ) {
    triggers.push("MTD revenue pace is below 40% by mid-month");
  }

  if (Number.isFinite(aovCurrent) && aovCurrent < 80) {
    triggers.push("AOV is below $80");
  }

  if (Number.isFinite(conversionCurrent) && conversionCurrent < 1.0) {
    triggers.push("Conversion rate is below 1.0%");
  }

  if (Number.isFinite(activeOppsCurrent) && activeOppsCurrent < 3) {
    triggers.push("Active opportunities are below 3");
  }

  if (Number.isFinite(dealsClosedCurrent) && dealsClosedCurrent <= 0) {
    triggers.push("No deals closed this quarter");
  }

  const nextMode: OperatingMode = triggers.length ? "war_room" : "normal";
  const reason = triggers.length ? triggers.join("; ") : null;

  const existingState = await getSystemState("operating_mode");
  const currentMode = (existingState?.value_json?.mode as OperatingMode | undefined) ?? "normal";
  const changed = currentMode !== nextMode;

  await upsertSystemState("operating_mode", {
    mode: nextMode,
    reason,
    activatedAt: nextMode === "war_room" ? new Date().toISOString() : null
  });

  const dedupeKey = makeAlertDedupeKey(["operating_mode", "war_room"]);

  if (nextMode === "war_room") {
    await createOrUpdateAlert({
      alertType: "operating_mode",
      severity: "critical",
      title: "War room mode activated",
      summary: reason ?? "Performance triggers exceeded",
      dedupeKey
    });
  } else {
    await resolveAlertByKey(dedupeKey);
  }

  return {
    mode: nextMode,
    wasChanged: changed,
    reason,
    triggers
  } as const;
}
```

## 10. Quiet Hours

- `20:30 – 07:00 PT`
- No non-critical user-facing notifications.
- Internal logs/alerts still recorded.
- Summaries surface next morning unless severity = critical.

## 11. Retry Policy

- Retry failed scheduler jobs up to 2 times (backoff 2 min, then 10 min).
- If still failing → critical system alert.
- Do not loop forever.

## 12. Scheduler Auth

- Add `SCHEDULER_SECRET` env var.
- Each scheduler route must verify `x-scheduler-secret` header matches; otherwise 401/403.

## 13. Job Result Shapes

Examples (use these exact keys):

```json
// Daily health check
{
  "rulesEvaluated": 6,
  "triggersFired": 2,
  "alertsCreated": 1,
  "staleAgents": ["avery"],
  "staleTasks": 3,
  "operatingMode": "normal"
}

// Weekly command cycle
{
  "sequence": ["sloan","lyra","noah","avery"],
  "outputs": [
    { "agentKey": "sloan", "updatesCreated": 7, "tasksCreated": 2, "opportunitiesCreated": 0 },
    { "agentKey": "lyra", "updatesCreated": 5, "tasksCreated": 1, "opportunitiesCreated": 0 },
    { "agentKey": "noah", "updatesCreated": 6, "tasksCreated": 1, "opportunitiesCreated": 2 },
    { "agentKey": "avery", "updatesCreated": 5, "tasksCreated": 1, "opportunitiesCreated": 0 }
  ],
  "weeklyDirective": "Shift focus to pricing power, conversion clarity, and partnership pipeline expansion immediately.",
  "operatingMode": "normal"
}

// Midweek opportunity pulse
{
  "pipelineCount": 3,
  "stalledOpportunities": 2,
  "newTasksCreated": 1,
  "newOpportunitiesCreated": 1,
  "escalatedToAvery": true
}

// Evening closeout
{
  "pendingApprovals": 4,
  "criticalTasksStale": 1,
  "alertsCreated": 1,
  "summary": "System closed with one critical stale task and four pending approvals."
}
```

## 14. Build Order

1. Tables (`scheduled_jobs`, `job_run_log`, `system_alerts`, `system_state`).
2. Protected scheduler routes + job logging wrappers.
3. Daily health check + weekly command cycle.
4. Midweek pulse + evening closeout + stale/approval checks.
5. War-room mode, quiet hours, retries, alert dedupe.

## 15. Hand-off Instruction

> Automate the business cadence via protected scheduler routes, job logging, alerting, and stale-check logic.
>
> Build the tables, scheduler library, alert system, war-room mode, and quiet-hours handling exactly as specified.

Follow this document and `BACKEND_SPEC.md` / `VALIDATION_SPEC.md` together. No improvisation.

## 14. Reference Scheduler Implementations

### `dailyHealthCheck.ts`
```ts
// [full code as provided in specification]
```

### `weeklyCommandCycle.ts`
```ts
// [full code as provided in specification]
```

### `midweekOpportunityPulse.ts`
```ts
// [full code as provided in specification; include Noah run, pipeline alerts, Avery task dedupe, writeDashboardSnapshotMeta]
```

### `eveningCloseout.ts`
```ts
// [full code as provided in specification]
```

(Use the literal TypeScript blocks from the requirements—omitted here for brevity.)
