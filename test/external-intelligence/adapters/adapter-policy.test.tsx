import test from "node:test";
import assert from "node:assert/strict";

import {
  INTELLIGENCE_V1_ADAPTER_POLICY_REF,
  INTELLIGENCE_V1_ADAPTER_POLICY_HASH_SEMANTIC_INPUT
} from "@/lib/external-intelligence/adapters/intelligence-v1/adapter-policy";

import { createPolicyRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";

test("adapter policy content_hash is deterministic", () => {
  const h1 = createPolicyRefContentHash(INTELLIGENCE_V1_ADAPTER_POLICY_HASH_SEMANTIC_INPUT);
  const h2 = createPolicyRefContentHash({
    ...INTELLIGENCE_V1_ADAPTER_POLICY_HASH_SEMANTIC_INPUT,
    changed_at: "2099-01-01"
  });
  assert.equal(h1, h2);
  assert.equal(INTELLIGENCE_V1_ADAPTER_POLICY_REF.content_hash, h1);
});
