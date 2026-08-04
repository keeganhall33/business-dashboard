import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";
import type { ObjectType } from "@/lib/external-intelligence/contracts/enums";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const mkRef = (object_type: ObjectType, object_id: string): VersionRef => ({
  object_type,
  object_id,
  version_id: null,
  content_hash: "a".repeat(64),
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

test("provenance edge upsert is idempotent", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  const from_ref = mkRef("evidence_reference", "ev1");
  const to_ref = mkRef("claim", "c1");

  await store.provenance.upsertEdge({
    from_ref,
    to_ref,
    relation: "supports",
    policy_version: "p1",
    created_at: new Date().toISOString()
  });

  await store.provenance.upsertEdge({
    from_ref,
    to_ref,
    relation: "supports",
    policy_version: "p1",
    created_at: new Date().toISOString()
  });

  const edges = await store.provenance.listEdgesFrom(from_ref);
  assert.equal(edges.length, 1);
});
