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

test("reconstructByVersionRef returns explicit tombstone when payload is redacted", async () => {
  const store = new InMemoryExternalIntelligenceStore();
  const now = new Date().toISOString();

  await store.evidence.upsertStable({
    object_id: "ev1",
    evidence_reference_id: "ev1",
    current_content_hash: "a".repeat(64),
    lifecycle_status: "active",
    correction_status: "none",
    source_id: "source1",
    source_config_version: "v1.0.0",
    legal_policy_version: "legal/v1.0.0",
    created_at: now,
    updated_at: now
  });

  await store.evidence.upsertVersion({
    object_id: "ev1",
    evidence_reference_id: "ev1",
    content_hash: "a".repeat(64),
    schema_version: "v1",
    policy_refs: [],
    created_at: now,
    effective_at: null,
    valid_from: null,
    valid_until: null,
    supersedes_content_hashes: [],
    superseded_by_content_hash: null,
    payload_available: false,
    payload_json: null,
    retention_policy: "tombstone",
    retention_expires_at: null,
    legal_hold: false,
    access_revoked_at: now,
    content_redacted_at: now,
    redaction_reason: "source revoked",
    source_id: "source1",
    source_config_version: "v1.0.0",
    legal_policy_version: "legal/v1.0.0"
  });

  const res = await reconstructByVersionRef({ store, ref: mkRef("evidence_reference", "ev1", "a".repeat(64)) });
  assert.equal((res as { kind?: string }).kind, "redacted_tombstone");
  assert.equal((res as { object_id?: string }).object_id, "ev1");
  assert.equal((res as { content_hash?: string }).content_hash, "a".repeat(64));
});
