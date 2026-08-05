// Phase B1.1: deterministic milestone horizon scanning report (no network).
//
// Run:
//   node --import tsx scripts/milestone-horizon-report.mjs

import fs from "node:fs";

import { buildMilestoneHorizonAlerts, parseMilestoneHorizonPolicy } from "../src/lib/external-intelligence/milestones/milestone-horizon.ts";

export function generateMilestoneHorizonReport(input = { now_ymd: "2026-12-01" }) {
  const calendar = JSON.parse(fs.readFileSync("config/milestones/v1/milestones.wave1.fixture.json", "utf8"));
  const policyJson = JSON.parse(fs.readFileSync("config/milestones/v1/milestone_horizon_policy.v1.json", "utf8"));
  const policy = parseMilestoneHorizonPolicy(policyJson);

  const alerts = buildMilestoneHorizonAlerts({ calendar, policy, now_ymd: input.now_ymd });

  const lines = [];
  lines.push("External Intelligence — Milestone Horizon Report (B1.1)");
  lines.push(`now=${input.now_ymd}`);
  lines.push(`policy_version=${policy.policy_version} policy_hash=${policy.policy_content_hash}`);
  lines.push("");

  for (const a of alerts) {
    lines.push(`- ${a.alert_date} :: ${a.label} :: event=${a.event_date} :: hash=${a.alert_hash}`);
  }

  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(generateMilestoneHorizonReport());
}
