import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

async function loadRunner() {
  const mod = (await import("@/lib/external-intelligence/orchestration/handlers/milestone-horizon-scan-v1")) as unknown as {
    runMilestoneHorizonScanV1WithDeps?: Function;
    default?: { runMilestoneHorizonScanV1WithDeps?: Function };
  };
  const fn = mod.runMilestoneHorizonScanV1WithDeps ?? mod.default?.runMilestoneHorizonScanV1WithDeps;
  if (typeof fn !== "function") throw new Error("missing_runMilestoneHorizonScanV1WithDeps");
  return fn as (
    input: { now_ymd: string; now_iso: string },
    deps: {
      repo: { listCurrentMilestonesForHorizonScan: () => Promise<unknown[]> };
      loadLeadTimePolicyJson: () => unknown;
      runScan: (input: any) => Promise<any>;
    }
  ) => Promise<any>;
}

test("milestone-horizon-scan-v1: production-shaped zero-milestone run completes and reports zero alert generation", async () => {
  const runMilestoneHorizonScanV1WithDeps = await loadRunner();

  const out = await runMilestoneHorizonScanV1WithDeps(
    { now_ymd: "2026-08-05", now_iso: "2026-08-05T12:00:00.000Z" },
    {
      repo: { listCurrentMilestonesForHorizonScan: async () => [] },
      loadLeadTimePolicyJson: () =>
        JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8")),
      runScan: async ({ calendar, lead_time_policy }) => {
        // Calendar is valid and hashed.
        assert.equal(calendar.schema_version, "sports_milestone_calendar_v1");
        assert.equal(calendar.fixture_status, "production");
        assert.equal(calendar.milestones.length, 0);
        assert.match(calendar.calendar_content_hash, /^[0-9a-f]{64}$/);

        // Policy present (not omitted on empty state).
        assert.equal(lead_time_policy.schema_version, "alert_lead_time_policy_v1");
        assert.match(lead_time_policy.policy_content_hash, /^[0-9a-f]{64}$/);

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
