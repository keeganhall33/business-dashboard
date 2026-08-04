import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const mkRef = (object_type: VersionRef["object_type"], object_id: string, content_hash: string): VersionRef => ({
  object_type,
  object_id,
  version_id: null,
  content_hash,
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

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
    expected_output_count: 0,
    output_refs: [],
    persisted_output_count: 0,
    required_provenance_edges: [],
    persistence_complete: false,
    validation_complete: false,
    validation_result: "ok",
    persistence_completeness: "incomplete",
    error_summary: null,
    retry_of_run_id: null
  });

  const run = await store.runs.fetchRun("run1");
  assert.equal(run.run_id, "run1");
});

test("processing run cannot complete if outputs or required provenance are missing", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  const now = new Date().toISOString();

  const outRef = mkRef("evidence_reference", "ev1", "a".repeat(64));

  await assert.rejects(() =>
    store.runs.upsertRun({
      run_id: "run2",
      input_set_fingerprint: "e".repeat(64),
      source_registry_hash: "f".repeat(64),
      source_sets_hash: "g".repeat(64),
      policy_bundle_hash: "h".repeat(64),
      policy_refs: [],
      engine_version: "engine_v1",
      started_at: now,
      completed_at: now,
      status: "completed",
      reason_codes: [],
      input_refs: [],
      expected_output_count: 1,
      output_refs: [outRef],
      persisted_output_count: 1,
      required_provenance_edges: [
        {
          from_ref: mkRef("claim", "c1", "b".repeat(64)),
          to_ref: outRef,
          relation: "supported_by",
          policy_version: "provenance/v1.0.0"
        }
      ],
      persistence_complete: true,
      validation_complete: true,
      validation_result: "ok",
      persistence_completeness: "complete",
      error_summary: null,
      retry_of_run_id: null
    })
  );
});
