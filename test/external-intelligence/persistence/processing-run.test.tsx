import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";

test("processing run upsert/fetch is stable", async () => {
  const store = new InMemoryExternalIntelligenceStore();

  await store.runs.upsertRun({
    run_id: "run1",
    input_set_fingerprint: "a".repeat(64),
    source_registry_hash: "b".repeat(64),
    source_sets_hash: "c".repeat(64),
    policy_bundle_hash: "d".repeat(64),
    policy_refs: [],
    engine_version: "engine_v1",
    started_at: new Date().toISOString(),
    completed_at: null,
    status: "started",
    reason_codes: [],
    input_refs: [],
    output_refs: [],
    counts: {},
    validation_result: "ok",
    persistence_completeness: "incomplete",
    error_summary: null,
    retry_of_run_id: null
  });

  const run = await store.runs.fetchRun("run1");
  assert.equal(run.run_id, "run1");
});
