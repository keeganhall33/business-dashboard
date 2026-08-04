import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";

const mkVersion = (id: string, hash: string) => ({
  evidence_reference_id: id,
  object_id: id,
  content_hash: hash,
  schema_version: "evidence_reference_v1",
  policy_refs: [],
  created_at: new Date().toISOString(),
  effective_at: null,
  valid_from: null,
  valid_until: null,
  supersedes_content_hashes: [],
  superseded_by_content_hash: null,
  payload: { evidence_reference_id: id } as unknown
});

test("listVersions returns immutable history", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  await store.evidence.upsertVersion(mkVersion("ev1", "a".repeat(64)) as any);
  await store.evidence.upsertVersion(mkVersion("ev1", "b".repeat(64)) as any);

  const versions = await store.evidence.listVersions("ev1");
  assert.equal(versions.length, 2);
});
