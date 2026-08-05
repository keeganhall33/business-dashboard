import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { buildMilestoneHorizonAlerts, parseMilestoneHorizonPolicy } from "@/lib/external-intelligence/milestones/milestone-horizon";

test("milestone horizon: deterministic alerts and hashes", () => {
  const calendar = JSON.parse(fs.readFileSync("config/milestones/v1/milestones.wave1.fixture.json", "utf8"));
  const policyJson = JSON.parse(fs.readFileSync("config/milestones/v1/milestone_horizon_policy.v1.json", "utf8"));
  const policy = parseMilestoneHorizonPolicy(policyJson);

  const a1 = buildMilestoneHorizonAlerts({ calendar, policy, now_ymd: "2026-12-01" });
  const a2 = buildMilestoneHorizonAlerts({ calendar, policy, now_ymd: "2026-12-01" });

  assert.deepEqual(a1, a2);
  if (a1.length > 0) assert.match(a1[0]!.alert_hash, /^[a-f0-9]{64}$/);
});
