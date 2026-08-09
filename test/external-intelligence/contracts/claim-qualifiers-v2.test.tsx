import test from "node:test";
import assert from "node:assert/strict";

import { canonicalizeClaimQualifiersV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";

test("claim qualifiers v2: canonicalizes ordering + whitespace and preserves case", () => {
  const out = canonicalizeClaimQualifiersV2([
    { key: "appointment_role", value_type: "string", value: "  lead   Digital   Marketing  " },
    { key: "deal_term", value_type: "number", value: 12 }
  ]);

  assert.deepEqual(out, [
    { key: "appointment_role", value_type: "string", value: "lead Digital Marketing" },
    { key: "deal_term", value_type: "number", value: 12 }
  ]);
});

test("claim qualifiers v2: rejects duplicate keys", () => {
  assert.throws(() =>
    canonicalizeClaimQualifiersV2([
      { key: "appointment_role", value_type: "string", value: "a" },
      { key: "appointment_role", value_type: "string", value: "b" }
    ])
  );
});

test("claim qualifiers v2: rejects invalid keys and empty strings", () => {
  assert.throws(() => canonicalizeClaimQualifiersV2([{ key: "Role", value_type: "string", value: "x" }]));
  assert.throws(() => canonicalizeClaimQualifiersV2([{ key: "appointment_role", value_type: "string", value: "   " }]));
});

test("claim qualifiers v2: rejects too many qualifiers", () => {
  const tooMany = Array.from({ length: 9 }, (_, i) => ({
    key: `k${i}`,
    value_type: "string" as const,
    value: "x"
  }));
  assert.throws(() => canonicalizeClaimQualifiersV2(tooMany));
});

test("claim qualifiers v2: rejects NaN/Infinity", () => {
  const nan: unknown = [{ key: "x", value_type: "number", value: Number.NaN }];
  const inf: unknown = [{ key: "x", value_type: "number", value: Number.POSITIVE_INFINITY }];
  assert.throws(() => canonicalizeClaimQualifiersV2(nan));
  assert.throws(() => canonicalizeClaimQualifiersV2(inf));
});
