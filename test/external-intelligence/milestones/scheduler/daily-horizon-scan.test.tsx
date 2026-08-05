import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { computeMilestoneCalendarHash, parseSportsMilestoneCalendar } from "@/lib/external-intelligence/milestones/contracts";
import { parseAlertLeadTimePolicy } from "@/lib/external-intelligence/milestones/alert-policy";
import { runDailyMilestoneHorizonScanV1 } from "@/lib/external-intelligence/milestones/scheduler/daily-horizon-scan";
import type { SportsMilestoneAlertsRepository } from "@/lib/external-intelligence/milestones/persistence/milestone-alerts.repository";

class FakeRepo {
  calls: Array<string> = [];
  lastAlertsCount: number | null = null;
  async upsertFromHorizonAlerts() {
    this.calls.push("upsert");
    return { inserted_count: 2, existing_count: 0, skipped_count: 0 };
  }
  async invalidateObsoletePending() {
    this.calls.push("invalidate");
    return 1;
  }
  async expirePending() {
    this.calls.push("expire");
    return 3;
  }
}

test("daily horizon scan: calls upsert + invalidation + expiry in order and returns counts", async () => {
  const cal = parseSportsMilestoneCalendar(
    JSON.parse(fs.readFileSync("config/milestones/v1/fixtures/milestones.wave1.synthetic.v2.json", "utf8"))
  );
  const pol = parseAlertLeadTimePolicy(
    JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"))
  );

  const repo = new FakeRepo();
  const res = await runDailyMilestoneHorizonScanV1({
    now_ymd: "2026-08-05",
    now_iso: "2026-08-05T12:00:00.000Z",
    calendar: cal,
    lead_time_policy: pol,
    repo: repo as unknown as SportsMilestoneAlertsRepository
  });

  assert.deepEqual(repo.calls, ["upsert", "invalidate", "expire"]);
  assert.deepEqual(res, { inserted_count: 2, existing_count: 0, invalidated_count: 1, expired_count: 3 });
});

test("daily horizon scan: zero milestones is valid and yields zero inserted/existing", async () => {
  const base = {
    schema_version: "sports_milestone_calendar_v1",
    calendar_version: "production",
    fixture_status: "production",
    milestones: []
  } as const;

  const cal = parseSportsMilestoneCalendar({
    ...base,
    calendar_content_hash: computeMilestoneCalendarHash(base)
  });
  const pol = parseAlertLeadTimePolicy(
    JSON.parse(fs.readFileSync("config/milestones/v1/alert_lead_time_policy.v1.json", "utf8"))
  );

  const repo = new FakeRepo();
  // Override upsert to assert we saw zero alerts.
  repo.upsertFromHorizonAlerts = async (input: unknown) => {
    const alerts = (input as { alerts: unknown[] }).alerts;
    repo.lastAlertsCount = alerts.length;
    repo.calls.push("upsert");
    return { inserted_count: 0, existing_count: 0, skipped_count: 0 };
  };

  const res = await runDailyMilestoneHorizonScanV1({
    now_ymd: "2026-08-05",
    now_iso: "2026-08-05T12:00:00.000Z",
    calendar: cal,
    lead_time_policy: pol,
    repo: repo as unknown as SportsMilestoneAlertsRepository
  });

  assert.deepEqual(repo.calls, ["upsert", "invalidate", "expire"]);
  assert.equal(repo.lastAlertsCount, 0);
  assert.deepEqual(res, { inserted_count: 0, existing_count: 0, invalidated_count: 1, expired_count: 3 });
});
