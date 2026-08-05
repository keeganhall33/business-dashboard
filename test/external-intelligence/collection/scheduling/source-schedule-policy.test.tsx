import test from "node:test";
import assert from "node:assert/strict";

import { parseSourceSchedulePolicy, computeSourceSchedulePolicyHash } from "@/lib/external-intelligence/collection/scheduling/source-schedule-policy";

test("source schedule policy: deterministic hash and fail-closed content_hash", () => {
  const base = {
    schema_version: "source_schedule_policy_v1",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    schedule_policy_version: "v1.0.0",
    governing_registry_hash: "a".repeat(64),
    governing_policy_refs: [{ policy_name: "confidence", semantic_version: "v1.0.0", content_hash: "b".repeat(64) }],
    cadence_type: "weekly",
    cadence_interval: 1,
    preferred_collection_window: { start_hour_local: 6, end_hour_local: 10 },
    timezone: "America/Los_Angeles",
    freshness_sla: "30d",
    maximum_staleness: "90d",
    retry_policy: { strategy: "bounded_exponential", maximum_attempts: 3, base_delay_seconds: 30, max_delay_seconds: 900 },
    backoff_policy: { jitter: "full", cooldown_seconds: 900 },
    timeout_seconds: 20,
    rate_limit_budget: { maximum_requests_per_minute: 10, maximum_requests_per_day: 200 },
    overlap_policy: "no_overlap",
    deduplication_window: "24h",
    priority: "medium",
    enabled: false,
    eligibility_fingerprint: "0".repeat(64),
    created_at: "2026-08-05T14:00:00.000Z",
    review_by: "ops"
  };

  const hash = computeSourceSchedulePolicyHash(
    base as unknown as Parameters<typeof computeSourceSchedulePolicyHash>[0]
  );
  const parsed = parseSourceSchedulePolicy({
    ...(base as unknown as Record<string, unknown>),
    schedule_content_hash: hash
  });

  assert.equal(parsed.schedule_content_hash, hash);
  assert.ok(Object.isFrozen(parsed));

  assert.throws(() =>
    parseSourceSchedulePolicy({
      ...(base as unknown as Record<string, unknown>),
      schedule_content_hash: "c".repeat(64)
    })
  );
});
