import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryExternalIntelligenceStore } from "@/lib/external-intelligence/persistence/in-memory-store";
import { reconstructByVersionRef } from "@/lib/external-intelligence/persistence/reconstruction";
import type { ObjectType } from "@/lib/external-intelligence/contracts/enums";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

const mkRef = (object_type: ObjectType, object_id: string, content_hash: string): VersionRef => ({
  object_type,
  object_id,
  version_id: null,
  content_hash,
  schema_version: "v1",
  policy_version: "p1",
  created_at: new Date().toISOString()
});

test("reconstructByVersionRef fails closed on missing version", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  await assert.rejects(() => reconstructByVersionRef({ store, ref: mkRef("claim", "c1", "a".repeat(64)) }));
});
