import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";

test("milestone lead-time policy: production file parses and hash validates", () => {
  const json = JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"));
  const policy = parseAlertLeadTimePolicy(json);

  assert.equal(policy.schema_version, "alert_lead_time_policy_v1");
  assert.ok(policy.policy_version.length > 0);
  assert.ok(policy.horizons_days.length >= 1);
  assert.match(policy.policy_content_hash, /^[0-9a-f]{64}$/);
});
