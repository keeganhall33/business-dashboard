import { evaluateRules } from "@/lib/automation/evaluateRules";
import { withJobRun } from "./jobLogger";
import { runStaleChecks } from "./staleChecks";
import { evaluateWarRoomMode } from "./warRoom";
import { writeDashboardSnapshotMeta } from "./stateWriters";
import { publishAgentStatusSnapshot } from "@/lib/agents/shared";
import { agentKeys } from "@/lib/types/requests";
import { enforceDailyIdeaQuotas } from "./ideaQuota";
import {
  describeMode,
  getEnforcementMode,
  modeAllowsTasks,
  modeIsDisabled
} from "./enforcement";
import { writeObserveReport } from "./observeReports";
import { createOrUpdateAlert, makeAlertDedupeKey } from "./alerting";
import { getOpenAlertByDedupeKey } from "@/lib/supabase/queries";
import { isOnCooldown, recordAlertTrigger } from "./alertCooldown";
import { getAlertLifecycleEntry, markAlertStatus } from "./alertLifecycle";
import { createClient } from "@supabase/supabase-js";

const ALERT_ONLY_MAX = 3;
const ALERT_ONLY_COOLDOWN_HOURS = 24;
const pilotSupabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

export async function runDailyHealthCheck() {
  const mode = await getEnforcementMode("daily-health-check");
  if (modeIsDisabled(mode)) {
    return withJobRun({
      jobKey: "daily-health-check",
      fn: async () => ({ skipped: true, mode }),
      summarize: () => ({ summary: `Skipped (${describeMode(mode)})`, detailsJson: { skipped: true, mode } })
    });
  }

  const allowAlerts = mode === "active";
  const allowTasks = modeAllowsTasks(mode);

  return withJobRun({
    jobKey: "daily-health-check",
    fn: async () => {
      const rules = await evaluateRules({ mode });
      const simulatedTasks = rules.triggersFired
        .filter((trigger) => trigger.taskPlanned && !trigger.taskCreated)
        .map((trigger) => ({
          title: `Task: ${trigger.metricKey}`,
          reason: trigger.skippedReason ?? "task creation disabled",
          severity: trigger.severity ?? undefined
        }));
      const stale = await runStaleChecks({ mode });
      const warRoom = await evaluateWarRoomMode();
      const ideaQuota = await enforceDailyIdeaQuotas({ source: "daily-health-check", mode });

      if (mode === "active") {
        await writeDashboardSnapshotMeta({
          source: "daily-health-check",
          mode: warRoom.mode,
          lastRefreshedAt: new Date().toISOString()
        });
        await Promise.all(agentKeys.map((agentKey) => publishAgentStatusSnapshot(agentKey)));
      }

      const output = {
        skipped: false,
        mode,
        rulesEvaluated: rules.rulesEvaluated,
        triggersFired: rules.triggersFired.length,
        alertsCreated: stale.alertsCreatedOrUpdated + (ideaQuota.alertsCreatedOrUpdated ?? 0),
        ideaQuotaAlertsCreated: ideaQuota.alertsCreatedOrUpdated,
        agentsMissingIdeaQuota: ideaQuota.missingAgents,
        staleAgents: stale.staleAgents,
        staleTasks: stale.staleTaskIds.length,
        operatingMode: warRoom.mode,
        allowAlerts,
        allowTasks,
        simulatedAlerts: [...stale.simulatedAlerts, ...(ideaQuota.simulatedAlerts ?? [])],
        simulatedTasks
      };

      const observeReport =
        mode !== "active"
          ? await writeObserveReport("daily-health-check", {
              mode,
              alerts: output.simulatedAlerts,
              tasks: output.simulatedTasks,
              notes: [
                "Observe-only run; no alerts or tasks were created.",
                output.simulatedAlerts.length > 0
                  ? `${output.simulatedAlerts.length} simulated alerts logged.`
                  : "No simulated alerts."
              ]
            })
          : null;

      const alertOnlyDispatch =
        mode === "alert_only"
          ? await dispatchAlertOnlyAlerts("daily-health-check", observeReport?.eligibleAlerts ?? [])
          : { created: [], skipped: [] };

      if (mode === "alert_only") {
        await recordPilotRunSummary("daily-health-check", {
          mode,
          generatedAt: new Date().toISOString(),
          alertCap: ALERT_ONLY_MAX,
          cooldownHours: ALERT_ONLY_COOLDOWN_HOURS,
          created: alertOnlyDispatch.created,
          skipped: alertOnlyDispatch.skipped
        });
      }

      return {
        ...output,
        simulatedAlerts: observeReport?.sampleAlerts ?? [],
        suppressedAlerts: observeReport?.suppressedBySeverity ?? undefined,
        observeReportKey: observeReport ? "scheduler_observe_daily-health-check" : undefined,
        topIssues: observeReport?.topIssues ?? [],
        eligibleAlerts: observeReport?.eligibleAlerts ?? [],
        groupedAlerts: observeReport?.groupedAlerts ?? [],
        manualReviewAlerts: observeReport?.manualReviewAlerts ?? [],
        blockedAlerts: observeReport?.blockedAlerts ?? [],
        suppressedSummary: observeReport?.suppressedSummary,
        alertOnlyCreated: alertOnlyDispatch.created,
        alertOnlySkipped: alertOnlyDispatch.skipped
      };
    },
    summarize: (result) => ({
      summary: result.skipped
        ? `Skipped (${describeMode(mode)})`
        : `Rules: ${result.rulesEvaluated}, fired: ${result.triggersFired}, alerts: ${result.alertsCreated} (+idea quota: ${result.agentsMissingIdeaQuota.length} missing)${
            result.alertOnlyCreated?.length
              ? ` | alert-only created ${result.alertOnlyCreated.length}`
              : ""
          }`,
      detailsJson: result
    })
  });
}

type AlertOnlyDispatch = {
  created: Array<{ id: string; title: string }>;
  skipped: Array<{ title: string; reason: string }>;
};

async function dispatchAlertOnlyAlerts(
  jobKey: string,
  candidates: Array<{ title: string; severity: string; reason?: string }>
): Promise<AlertOnlyDispatch> {
  const result: AlertOnlyDispatch = { created: [], skipped: [] };
  if (!candidates?.length) return result;

  for (const candidate of candidates) {
    const severity = candidate.severity?.toLowerCase();
    if (severity !== "high" && severity !== "critical") {
      result.skipped.push({ title: candidate.title, reason: "insufficient_severity" });
      continue;
    }

    if (result.created.length >= ALERT_ONLY_MAX) {
      result.skipped.push({ title: candidate.title, reason: "cap_reached" });
      continue;
    }

    const dedupeKey = makeAlertDedupeKey([jobKey, "alert_only", candidate.title]);
    const lifecycle = await getAlertLifecycleEntry(dedupeKey);
    if (lifecycle?.status === "suppressed") {
      result.skipped.push({ title: candidate.title, reason: "suppressed" });
      continue;
    }
    if (lifecycle?.status === "acknowledged") {
      result.skipped.push({ title: candidate.title, reason: "acknowledged" });
      continue;
    }
    if (await isOnCooldown(dedupeKey, ALERT_ONLY_COOLDOWN_HOURS)) {
      result.skipped.push({ title: candidate.title, reason: "cooldown_active" });
      continue;
    }

    const existingAlert = await getOpenAlertByDedupeKey(dedupeKey);
    if (existingAlert && lifecycle?.status !== "resolved") {
      result.skipped.push({ title: candidate.title, reason: "existing_alert" });
      continue;
    }

    const createResult = await createOrUpdateAlert({
      alertType: `${jobKey}_alert_only`,
      severity: severity === "critical" ? "critical" : "high",
      title: candidate.title,
      summary: candidate.reason ?? "Alert-only pilot candidate",
      dedupeKey
    });

    await recordAlertTrigger(dedupeKey);
    await markAlertStatus({
      dedupeKey,
      alertId: String(createResult.alert.id ?? ""),
      status: "unresolved",
      source: jobKey
    });
    result.created.push({ id: String(createResult.alert.id ?? createResult.alert?.id ?? ""), title: candidate.title });
  }

  return result;
}

async function recordPilotRunSummary(
  jobKey: string,
  summary: {
    mode: string;
    generatedAt: string;
    alertCap: number;
    cooldownHours: number;
    created: Array<{ id: string; title: string }>;
    skipped: Array<{ title: string; reason: string }>;
  }
) {
  const skippedByReason = summary.skipped.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.reason] = (acc[entry.reason] ?? 0) + 1;
    return acc;
  }, {});

  if (!pilotSupabase) return;
  await pilotSupabase
    .from("system_state")
    .upsert(
      {
        key: `scheduler_pilot_${jobKey}`,
        value_json: {
          ...summary,
          createdCount: summary.created.length,
          skippedByReason
        }
      },
      { onConflict: "key" }
    );
}
