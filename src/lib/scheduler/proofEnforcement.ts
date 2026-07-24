import { createTask, findOpenTaskByTitle, getRecentTasks, upsertSystemState } from "@/lib/supabase/queries";
import { createOrUpdateAlert, makeAlertDedupeKey, resolveAlertByKey } from "./alerting";
import { withJobRun } from "./jobLogger";
import {
  describeMode,
  getEnforcementMode,
  modeAllowsAlerts,
  modeAllowsTasks,
  modeIsDisabled
} from "./enforcement";
import type { EnforcementMode } from "./enforcement";

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(dateString?: string | null) {
  if (!dateString) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateString).getTime()) / HOUR_MS;
}

function isMissingProof(task: Record<string, unknown>) {
  const summaryMissing = !task.result_summary || String(task.result_summary).trim().length === 0;
  const links = Array.isArray(task.deliverable_links) ? task.deliverable_links : [];
  const linksMissing = links.length === 0;
  return summaryMissing || linksMissing;
}

export type ProofEnforcementResult = {
  mode: EnforcementMode;
  scanned: number;
  missingProofCount: number;
  missingProofTaskIds: string[];
  alertsCreatedOrUpdated: number;
  averyFollowupTasksCreated: number;
  simulatedTasks: Array<{ title: string; reason: string }>;
  simulatedAlerts: Array<{ action: "create" | "resolve"; title: string }>;
};

/**
 * Proof enforcement (Avery OS):
 * - Find completed tasks missing `result_summary` and/or `deliverable_links`.
 * - If completed >= 24h ago, raise alert + create an Avery follow-up task (deduped).
 * - Mirror a rollup into system_state so the dashboard can show a single “needs proof” widget.
 *
 * Source: ops/strategy/avery_operating_system.md ("Missing proof for 24h = freeze + reassignment.")
 */
const MAX_FOLLOWUPS_PER_RUN = 5;

export async function runProofEnforcementChecks(): Promise<ProofEnforcementResult> {
  const mode = await getEnforcementMode("proof-enforcement");
  if (modeIsDisabled(mode)) {
    return withJobRun({
      jobKey: "proof-enforcement",
      fn: async () => ({
        mode,
        skipped: true,
        scanned: 0,
        missingProofCount: 0,
        missingProofTaskIds: [],
        alertsCreatedOrUpdated: 0,
        averyFollowupTasksCreated: 0,
        simulatedTasks: [],
        simulatedAlerts: []
      }),
      summarize: () => ({ summary: `Skipped (${describeMode(mode)})`, detailsJson: { mode, skipped: true } })
    });
  }

  const allowAlerts = modeAllowsAlerts(mode);
  const allowTasks = modeAllowsTasks(mode);

  return withJobRun({
    jobKey: "proof-enforcement",
    fn: async () => {
      const tasks = await getRecentTasks(500);
      const completed = (tasks ?? []).filter((task) => task.status === "completed");

      let alertsCreatedOrUpdated = 0;
      let averyFollowupTasksCreated = 0;
      const missingProofTaskIds: string[] = [];
      const simulatedTasks: Array<{ title: string; reason: string }> = [];
      const simulatedAlerts: Array<{ action: "create" | "resolve"; title: string }> = [];

      for (const task of completed) {
        const dedupeKey = makeAlertDedupeKey(["missing_proof", task.id]);

        if (!isMissingProof(task)) {
          if (allowAlerts) {
            await resolveAlertByKey(dedupeKey);
          } else {
            simulatedAlerts.push({ action: "resolve", title: `Resolve missing proof alert: ${task.title}` });
          }
          continue;
        }

        const completedHours = hoursSince(task.completed_at);
        // Soft grace window: let the agent log proof same-day.
        if (completedHours < 24) {
          missingProofTaskIds.push(task.id);
          continue;
        }

        missingProofTaskIds.push(task.id);
        if (allowAlerts) {
          const result = await createOrUpdateAlert({
            alertType: "missing_proof",
            severity: "high",
            title: `Missing proof: ${task.title}`,
            summary:
              `Task was completed ${Math.floor(completedHours)}h ago but is missing deliverable proof. ` +
              `Add result_summary + deliverable_links in task_queue.`,
            relatedAgentKey: task.agent_key,
            relatedTaskId: task.id,
            dedupeKey
          });
          if (result.action !== "unchanged") alertsCreatedOrUpdated++;
        } else {
          simulatedAlerts.push({ action: "create", title: `Missing proof: ${task.title}` });
        }

        // Create a follow-up for Avery (system operator) to harvest/log proof.
        const followupTitle = `[PROOF] Log deliverables for: ${task.title}`;
        const existing = await findOpenTaskByTitle("avery", followupTitle);
        if (!existing) {
          if (allowTasks && averyFollowupTasksCreated < MAX_FOLLOWUPS_PER_RUN) {
            await createTask({
              title: followupTitle,
              description:
                `This task was marked completed but is missing proof in Supabase.\n\n` +
                `Original task id: ${task.id}\n` +
                `Owner agent: ${task.agent_key}\n\n` +
                `Required: add a 2–3 sentence result_summary and at least one deliverable link.`,
              agentKey: "avery",
              priority: "high",
              executionType: "strategy",
              requiresApproval: false
            });
            averyFollowupTasksCreated++;
          } else {
            simulatedTasks.push({ title: followupTitle, reason: allowTasks ? "per-run cap reached" : "task creation disabled" });
          }
        }
      }

      const rollupKey = makeAlertDedupeKey(["missing_proof", "rollup"]);
      if (missingProofTaskIds.length === 0) {
        if (allowAlerts) {
          await resolveAlertByKey(rollupKey);
        } else {
          simulatedAlerts.push({ action: "resolve", title: "Resolve missing proof rollup" });
        }
      } else if (allowAlerts) {
        const result = await createOrUpdateAlert({
          alertType: "missing_proof",
          severity: "high",
          title: "Missing proof on completed tasks",
          summary: `${missingProofTaskIds.length} completed task(s) are missing deliverable proof.`,
          dedupeKey: rollupKey
        });
        if (result.action !== "unchanged") alertsCreatedOrUpdated++;
      } else {
        simulatedAlerts.push({ action: "create", title: "Missing proof on completed tasks" });
      }

      if (mode === "active") {
        await upsertSystemState("missing_proof", {
          missingProofCount: missingProofTaskIds.length,
          missingProofTaskIds,
          updatedAt: new Date().toISOString()
        });
      }

      return {
        mode,
        scanned: completed.length,
        missingProofCount: missingProofTaskIds.length,
        missingProofTaskIds,
        alertsCreatedOrUpdated: allowAlerts ? alertsCreatedOrUpdated : 0,
        averyFollowupTasksCreated,
        simulatedTasks,
        simulatedAlerts
      };
    },
    summarize: (result) => ({
      summary: `${result.missingProofCount} missing proof entries`,
      detailsJson: result
    })
  });
}
