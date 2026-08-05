/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { reconstructAtTime, reconstructByVersionRef } from "@/lib/external-intelligence/persistence/reconstruction";
import { PersistenceNotFoundError } from "@/lib/external-intelligence/persistence/errors";

function hex(ch: string) {
  return ch.repeat(64);
}

test("Reads/reconstruction: exact-version success + redacted tombstone + not found", async () => {
  const evRef = {
    object_type: "evidence_reference",
    object_id: "ev1",
    version_id: null,
    content_hash: hex("a"),
    schema_version: "evidence/v1",
    policy_version: "p/v1",
    created_at: "2026-08-05T00:00:00.000Z"
  } as const;

  const store: any = {
    evidence: {
      async fetchVersion(ref: any) {
        if (ref.object_id !== "ev1" || ref.content_hash !== hex("a")) throw new PersistenceNotFoundError("missing");
        return { payload_available: true, payload_json: { evidence_reference_id: "ev1" } };
      }
    },
    claims: {
      async fetchVersion() {
        throw new PersistenceNotFoundError("missing");
      }
    },
    signals: {
      async fetchVersion() {
        return { payload_available: false, redaction_reason: "legal", content_redacted_at: "2026-08-05T00:00:00.000Z" };
      }
    }
  };

  const payload = await reconstructByVersionRef({ store, ref: evRef as any });
  assert.deepEqual(payload, { evidence_reference_id: "ev1" });

  const tomb = await reconstructByVersionRef({
    store,
    ref: { ...evRef, object_type: "signal", object_id: "s1", content_hash: hex("b") } as any
  });
  assert.equal((tomb as any).kind, "redacted_tombstone");

  await assert.rejects(
    () => reconstructByVersionRef({ store, ref: { ...evRef, object_type: "claim", object_id: "c1" } as any }),
    PersistenceNotFoundError
  );
});

test("Reads/reconstruction: reconstructAtTime is version-pinned (no silent latest fallback)", async () => {
  const store: any = {
    evidence: {
      async listVersions() {
        return [
          { content_hash: hex("a"), schema_version: "evidence/v1", created_at: "2026-08-05T00:00:00.000Z", effective_at: "2026-08-05T00:00:00.000Z" },
          { content_hash: hex("b"), schema_version: "evidence/v1", created_at: "2026-08-06T00:00:00.000Z", effective_at: "2026-08-06T00:00:00.000Z" }
        ];
      },
      async fetchVersion(ref: any) {
        if (ref.content_hash !== hex("a")) throw new PersistenceNotFoundError("missing");
        return { payload_available: true, payload_json: { evidence_reference_id: "ev1", v: "a" } };
      }
    },
    claims: { async listVersions() { return []; }, async fetchVersion() { throw new PersistenceNotFoundError("missing"); } },
    signals: { async listVersions() { return []; }, async fetchVersion() { throw new PersistenceNotFoundError("missing"); } }
  };

  const res = await reconstructAtTime({
    store,
    object_type: "evidence_reference",
    object_id: "ev1",
    at: "2026-08-05T12:00:00.000Z"
  });

  assert.deepEqual(res, { evidence_reference_id: "ev1", v: "a" });
});
