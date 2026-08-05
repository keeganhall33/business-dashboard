import test from "node:test";
import assert from "node:assert/strict";

import { evaluateFreshnessWatchdogSnapshot } from "@/lib/external-intelligence/collection/scheduling/freshness-watchdog-report";

test("freshness watchdog: disabled source reports disabled", () => {
  const d = evaluateFreshnessWatchdogSnapshot({
    source_id: "economics.fred",
    source_enabled: false,
    currently_eligible_now: false,
    adapter_operational: false,
    last_collection_attempt_at: null,
    last_successful_collection_at: null,
    last_observed_artifact_at: null,
    freshness_sla: "30d",
    maximum_staleness: "90d",
    consecutive_failures: 0,
    credential_status: "unknown",
    terms_legal_review_expired: true,
    access_revoked: false,
    rate_limit_status: "unknown",
    next_scheduled_collection_at: null,
    now: "2026-08-05T14:00:00.000Z"
  });

  assert.equal(d.output_state, "disabled");
  assert.ok(d.reasons.includes("source_disabled"));
});
