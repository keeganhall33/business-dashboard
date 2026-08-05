import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";

import { runMilestoneHorizonScanV1WithDeps } from "@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1";

test("milestone-horizon-scan-v1: zero milestones constructs valid calendar and completes successfully", async () => {
  const out = await runMilestoneHorizonScanV1WithDeps(
    {
      now_ymd: "2026-08-05",
      now_iso: "2026-08-05T12:00:00.000Z"
    },
    {
      repo: {
        listCurrentMilestonesForHorizonScan: async () => []
      },
      loadLeadTimePolicyJson: () =>
        JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8")),
      runScan: async ({ calendar }) => {
        // calendar_content_hash must be 64 lowercase hex.
        assert.match(calendar.calendar_content_hash, /^[0-9a-f]{64}$/);
        assert.equal(calendar.milestones.length, 0);
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
