import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";

const mkRef = (object_type: any, object_id: string, content_hash: string) => ({
  object_type,
  object_id,
  version_id: null,
  content_hash,
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

test("verifyWriteSetComplete fails closed on missing versions", async () => {
  const store = new InMemoryExternalIntelligenceStore();

  await assert.rejects(() =>
    store.verifyWriteSetComplete({
      expected_version_refs: [mkRef("evidence_reference", "ev1", "a".repeat(64)) as any]
    })
  );
});
