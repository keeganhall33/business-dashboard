// Phase B2: deterministic milestone orchestration readiness report (no network).
//
// Run:
//   node --import tsx scripts/milestone-orchestration-readiness-report.mjs

import fs from "node:fs";

import { parseSportsMilestoneCalendar } from "../src/lib/external-intelligence/milestones/contracts.ts";
import { parseAlertLeadTimePolicy } from "../src/lib/external-intelligence/milestones/alert-policy.ts";
import { buildMilestoneHorizonAlertsV2 } from "../src/lib/external-intelligence/milestones/horizon-engine.ts";

export function generateMilestoneOrchestrationReadinessReport(input = { now_ymd: "2026-08-05" }) {
  const calendarJson = JSON.parse(
    fs.readFileSync("config/milestones/v1/fixtures/milestones.wave1.synthetic.v2.json", "utf8")
  );
  const leadTimeJson = JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"));

  const calendar = parseSportsMilestoneCalendar(calendarJson);
  const lead_time_policy = parseAlertLeadTimePolicy(leadTimeJson);

  const alerts = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy, now_ymd: input.now_ymd });

  const lines = [];
  lines.push("External Intelligence — Milestone Orchestration Readiness Report (B2)");
  lines.push("");
  lines.push(`now=${input.now_ymd}`);
  lines.push(`calendar_version=${calendar.calendar_version} calendar_hash=${calendar.calendar_content_hash}`);
  lines.push(
    `lead_time_policy_version=${lead_time_policy.policy_version} policy_hash=${lead_time_policy.policy_content_hash} suppression_policy_version=${lead_time_policy.suppression_policy.policy_version}`
  );
  lines.push("");
  lines.push(`calendar_milestones=${calendar.milestones.length}`);
  lines.push(`planned_alerts_now_or_future=${alerts.length}`);
  lines.push("\nSample (first 10)");

  for (const a of alerts.slice(0, 10)) {
    lines.push(
      `- ${a.alert_date} :: milestone=${a.milestone_id} :: horizon=${a.horizon_days}d :: class=${a.project_class} :: stage=${a.planning_stage} :: suppression=${a.suppression_identity} :: hash=${a.alert_hash}`
    );
  }

  lines.push("\nSummary");
  lines.push("  daily_scan_enabled=false (B2 must not activate scheduling)");
  lines.push("  notifications_enabled=false");

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateMilestoneOrchestrationReadinessReport());
}
