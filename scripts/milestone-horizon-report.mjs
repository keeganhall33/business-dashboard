// Phase B1.1: deterministic milestone horizon scanning report (no network).
//
// Run:
//   node --import tsx scripts/milestone-horizon-report.mjs

import fs from "node:fs";

import { parseSportsMilestoneCalendar } from "../src/lib/external-intelligence/milestones/contracts.ts";
import { parseAlertLeadTimePolicy } from "../src/lib/external-intelligence/milestones/alert-policy.ts";
import { buildMilestoneHorizonAlertsV2 } from "../src/lib/external-intelligence/milestones/horizon-engine.ts";

export function generateMilestoneHorizonReport(input = { now_ymd: "2026-12-01" }) {
  const calendarJson = JSON.parse(
    fs.readFileSync("config/milestones/v1/fixtures/milestones.wave1.synthetic.v2.json", "utf8")
  );
  const leadTimeJson = JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"));

  const calendar = parseSportsMilestoneCalendar(calendarJson);
  const lead_time_policy = parseAlertLeadTimePolicy(leadTimeJson);

  const alerts = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy, now_ymd: input.now_ymd });

  const lines = [];
  lines.push("External Intelligence — Milestone Horizon Report (B1.1)");
  lines.push(`now=${input.now_ymd}`);
  lines.push(
    `lead_time_policy_version=${lead_time_policy.policy_version} policy_hash=${lead_time_policy.policy_content_hash}`
  );
  lines.push(`calendar_version=${calendar.calendar_version} calendar_hash=${calendar.calendar_content_hash}`);
  lines.push("");

  for (const a of alerts) {
    lines.push(
      `- ${a.alert_date} :: milestone=${a.milestone_id} :: horizon=${a.horizon_days}d :: class=${a.project_class} :: stage=${a.planning_stage} :: event=${a.milestone_date} :: suppression=${a.suppression_identity} :: hash=${a.alert_hash}`
    );
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateMilestoneHorizonReport());
}
