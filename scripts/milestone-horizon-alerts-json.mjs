// Emit a small deterministic JSON payload of milestone horizon alerts for DB upsert validation.
//
// Run:
//   node --import tsx scripts/milestone-horizon-alerts-json.mjs

import fs from "node:fs";

import { parseSportsMilestoneCalendar } from "../src/lib/external-intelligence/milestones/contracts.ts";
import { parseAlertLeadTimePolicy } from "../src/lib/external-intelligence/milestones/alert-policy.ts";
import { buildMilestoneHorizonAlertsV2 } from "../src/lib/external-intelligence/milestones/horizon-engine.ts";

const calendar = parseSportsMilestoneCalendar(
  JSON.parse(fs.readFileSync("config/milestones/v1/fixtures/milestones.wave1.synthetic.v2.json", "utf8"))
);
const policy = parseAlertLeadTimePolicy(JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8")));

const now_ymd = process.env.MILESTONE_NOW_YMD ?? "2026-08-05";
const max = Number(process.env.MILESTONE_ALERT_LIMIT ?? "3");

const alerts = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy: policy, now_ymd });

const rows = alerts.slice(0, max).map((a) => ({
  alert_id: a.alert_hash,
  milestone_id: a.milestone_id,
  milestone_content_hash: a.milestone_content_hash,
  horizon_days: a.horizon_days,
  policy_version: policy.policy_version,
  suppression_policy_version: policy.suppression_policy.policy_version,
  suppression_identity: a.suppression_identity,
  alert_hash: a.alert_hash,
  project_class: a.project_class,
  planning_stage: a.planning_stage,
  milestone_date: a.milestone_date,
  days_remaining_at_creation: a.days_remaining,
  status: "pending",
  reason_codes: ["lead_time"],
  expires_at: null
}));

process.stdout.write(JSON.stringify(rows));
