import "@/lib/server-only";

import fs from "node:fs";

import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import type { SportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import { computeMilestoneCalendarHash } from "@/lib/external-intelligence/milestones/contracts";
import { SportsMilestoneRepository } from "@/lib/external-intelligence/milestones/persistence/milestone.repository";
import { runDailyMilestoneHorizonScanV1 } from "@/lib/external-intelligence/milestones/scheduler/daily-horizon-scan";

type MilestoneHorizonScanDeps = {
  repo: Pick<SportsMilestoneRepository, "listCurrentMilestonesForHorizonScan">;
  runScan: typeof runDailyMilestoneHorizonScanV1;
  loadLeadTimePolicyJson: () => unknown;
};

const DEFAULT_DEPS: MilestoneHorizonScanDeps = {
  repo: new SportsMilestoneRepository(),
  runScan: runDailyMilestoneHorizonScanV1,
  loadLeadTimePolicyJson: () => JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"))
};

export async function runMilestoneHorizonScanV1(input: { now_ymd: string; now_iso: string; signal?: AbortSignal }) {
  return runMilestoneHorizonScanV1WithDeps(input, DEFAULT_DEPS);
}

export async function runMilestoneHorizonScanV1WithDeps(
  input: { now_ymd: string; now_iso: string; signal?: AbortSignal },
  deps: MilestoneHorizonScanDeps
) {
  if (input.signal?.aborted) throw new Error("handler_aborted");

  // Approved lead-time policy.
  const lead_time_policy = parseAlertLeadTimePolicy(deps.loadLeadTimePolicyJson());

  const current = await deps.repo.listCurrentMilestonesForHorizonScan();
  if (input.signal?.aborted) throw new Error("handler_aborted");

  const calendar: SportsMilestoneCalendar = {
    schema_version: "sports_milestone_calendar_v1",
    calendar_version: "production",
    fixture_status: "production",
    calendar_content_hash: computeMilestoneCalendarHash({
      schema_version: "sports_milestone_calendar_v1",
      calendar_version: "production",
      fixture_status: "production",
      milestones: current
    }),
    milestones: current
  };

  const result = await deps.runScan({
    now_ymd: input.now_ymd,
    now_iso: input.now_iso,
    calendar,
    lead_time_policy
  });

  if (input.signal?.aborted) throw new Error("handler_aborted");

  return {
    milestonesEvaluated: current.length,
    alertsInserted: result.inserted_count,
    alertsExisting: result.existing_count,
    alertsInvalidated: result.invalidated_count,
    alertsExpired: result.expired_count
  };
}
