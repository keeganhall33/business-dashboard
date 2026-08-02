import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAuditMetadata } from "@/lib/actions/execution/audit-sanitize";

test("audit metadata sanitizer strips secret-like and personal keys", () => {
  const input = {
    authorization: "Bearer abc",
    cookie: "x=y",
    apiKey: "k",
    serviceRoleToken: "t",
    recipientEmail: "person@example.com",
    safe: "ok",
    nested: {
      token: "t2",
      ok: 1
    }
  };
  const out = sanitizeAuditMetadata(input);
  assert.equal(out.safe, "ok");
  assert.ok(!("authorization" in out));
  assert.ok(!("cookie" in out));
  assert.ok(!("apiKey" in out));
  assert.ok(!("serviceRoleToken" in out));
  assert.ok(!("recipientEmail" in out));
  assert.deepEqual(out.nested, { ok: 1 });
});
