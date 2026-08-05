import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { parseSportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import { buildMilestoneHorizonAlertsV2 } from "@/lib/external-intelligence/milestones/horizon-engine";

test("milestone horizon engine: detects multiple horizons deterministically", () => {
  const calendarJson = JSON.parse(
    fs.readFileSync("config/milestones/v1/fixtures/milestones.wave1.synthetic.v2.json", "utf8")
  );
  const leadTimeJson = JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"));

  const calendar = parseSportsMilestoneCalendar(calendarJson);
  const policy = parseAlertLeadTimePolicy(leadTimeJson);

  const a1 = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy: policy, now_ymd: "2025-01-01" });
  const a2 = buildMilestoneHorizonAlertsV2({ calendar, lead_time_policy: policy, now_ymd: "2025-01-01" });

  assert.deepEqual(a1, a2);

  // Long horizons included for high partnership potential.
  assert.ok(a1.some((a) => a.project_class === "major_institutional_partnership" && a.horizon_days >= 365));

  // Suppression identity is stable.
  assert.match(a1[0]!.suppression_identity, /^[a-f0-9]{64}$/);
  assert.match(a1[0]!.alert_hash, /^[a-f0-9]{64}$/);
});
