import test from "node:test";
import assert from "node:assert/strict";

import type { ExternalCollectionJobInput } from "@/lib/external-intelligence/orchestration/external-collector-guard";
import { __testOnly } from "@/lib/external-intelligence/orchestration/external-job-boundary";

test("external job boundary: blocks and persists + alerts once; does not invoke any collector", async () => {
  const blocked: Array<{ job_id: string; blocker_codes: string[]; safe_error_summary: string }> = [];
  const alerts: Array<{ dedupeKey: string; title: string; summary: string }> = [];

  const input: ExternalCollectionJobInput = {
    job_id: "job1",
    category: "external_collection",
    environment: "production",
    source_id: "economics.fred",
    source_config_version: "v1.0.0",
    schedule_id: "sched1",
    schedule_enabled: false,
    collection_plan_id: "plan1",
    collection_plan_json: null,
    requested_mode: "automated",
    adapter_source_id: "economics.fred",
    adapter_operational: false,
    governing_registry_hash: "mismatch",
    governing_source_sets_hash: "mismatch",
    governing_policy_refs: [],
    credentials_available: false,
    retention_supported: false,
    legal_review_current: false,
    terms_approved: false,
    environment_approved_for_collection: false,
    input_fingerprint: "fp",
    schedule_identity: "sid"
  };

  const res = await __testOnly.guardAndDispatchWithDeps(input, {
    persistBlocked: async (x) => blocked.push(x),
    alert: async (x) => {
      // simulate dedupe by only allowing one alert per key
      if (!alerts.find((a) => a.dedupeKey === x.dedupeKey)) alerts.push(x);
      return { created: true };
    }
  });

  assert.equal(res.status, "blocked");
  assert.equal(blocked.length, 1);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.dedupeKey, "orchestration:external_collection:unexpected_attempt:economics.fred");
  assert.ok(blocked[0].blocker_codes.includes("external_collection_not_activated"));
});
