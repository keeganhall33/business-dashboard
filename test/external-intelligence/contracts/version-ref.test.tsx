import test from "node:test";
import assert from "node:assert/strict";

import { VersionRefSchema } from "@/lib/external-intelligence/contracts/version-ref";

test("VersionRefSchema rejects id-only reference without content_hash", () => {
  assert.throws(() =>
    VersionRefSchema.parse({
      object_type: "signal",
      object_id: "sig_1",
      version_id: null,
      content_hash: "",
      schema_version: "v1",
      policy_version: "p1",
      created_at: new Date().toISOString()
    })
  );
});

test("VersionRefSchema rejects unknown object_type", () => {
  assert.throws(() =>
    VersionRefSchema.parse({
      object_type: "made_up",
      object_id: "x",
      version_id: null,
      content_hash: "a".repeat(64),
      schema_version: "v1",
      policy_version: "p1",
      created_at: new Date().toISOString()
    })
  );
});

test("VersionRefSchema accepts valid content_hash", () => {
  const ok = VersionRefSchema.parse({
    object_type: "signal",
    object_id: "sig_1",
    version_id: null,
    content_hash: "a".repeat(64),
    schema_version: "v1",
    policy_version: "p1",
    created_at: new Date().toISOString()
  });
  assert.equal(ok.object_id, "sig_1");
});
