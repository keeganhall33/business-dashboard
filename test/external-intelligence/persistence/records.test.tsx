import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";

// Minimal smoke: same hash must not map to different payload.

test("in-memory store rejects same content_hash with different payload", async () => {
  const store = new InMemoryExternalIntelligenceStore();

  await store.evidence.upsertVersion({
    evidence_reference_id: "ev1",
    object_id: "ev1",
    content_hash: "a".repeat(64),
    schema_version: "evidence_reference_v1",
    policy_refs: [],
    created_at: new Date().toISOString(),
    effective_at: null,
    valid_from: null,
    valid_until: null,
    supersedes_content_hashes: [],
    superseded_by_content_hash: null,
    payload: { evidence_reference_id: "ev1" } as unknown
  });

  await assert.rejects(() =>
    store.evidence.upsertVersion({
      evidence_reference_id: "ev1",
      object_id: "ev1",
      content_hash: "a".repeat(64),
      schema_version: "evidence_reference_v1",
      policy_refs: [],
      created_at: new Date().toISOString(),
      effective_at: null,
      valid_from: null,
      valid_until: null,
      supersedes_content_hashes: [],
      superseded_by_content_hash: null,
      payload: { evidence_reference_id: "ev1", changed: true } as unknown
    })
  );
});
