import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { runMilestoneHorizonScanV1WithDeps } from "@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1";

test("milestone-horizon-scan-v1: production-shaped zero-milestone run completes and reports zero alert generation", async () => {
  const out = await runMilestoneHorizonScanV1WithDeps(
    { now_ymd: "2026-08-05", now_iso: "2026-08-05T12:00:00.000Z" },
    {
      repo: { listCurrentMilestonesForHorizonScan: async () => [] },
      loadLeadTimePolicyJson: () =>
        JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8")),
      runScan: async ({ calendar, lead_time_policy }: { calendar: unknown; lead_time_policy: unknown }) => {
        const c = calendar as unknown as {
          schema_version: string;
          fixture_status: string;
          milestones: unknown[];
          calendar_content_hash: string;
        };
        const p = lead_time_policy as unknown as { schema_version: string; policy_content_hash: string };
        // Calendar is valid and hashed.
        assert.equal(c.schema_version, "sports_milestone_calendar_v1");
        assert.equal(c.fixture_status, "production");
        assert.equal(c.milestones.length, 0);
        assert.match(c.calendar_content_hash, /^[0-9a-f]{64}$/);

        // Policy present (not omitted on empty state).
        assert.equal(p.schema_version, "alert_lead_time_policy_v1");
        assert.match(p.policy_content_hash, /^[0-9a-f]{64}$/);

        return { inserted_count: 0, existing_count: 0, skipped_count: 0, invalidated_count: 0, expired_count: 0 };
      }
    }
  );

  assert.deepEqual(out, {
    milestonesEvaluated: 0,
    alertsInserted: 0,
    alertsExisting: 0,
    alertsInvalidated: 0,
    alertsExpired: 0
  });
});
