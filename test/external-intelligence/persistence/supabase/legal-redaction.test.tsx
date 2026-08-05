/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";

import { LegalRedactionRepository } from "@/lib/external-intelligence/persistence/supabase/legal-redaction.repository";
import { EXTERNAL_INTELLIGENCE_RPCS } from "@/lib/external-intelligence/persistence/supabase/transactions";
import { PersistenceLegalHoldBlockedError } from "@/lib/external-intelligence/persistence/errors";
import { MockSupabaseClient } from "./_mock-supabase";

function hex(ch: string) {
  return ch.repeat(64);
}

test("Redaction: empty reason rejected before RPC", async () => {
  const mock = new MockSupabaseClient();
  const repo = new LegalRedactionRepository();

  await assert.rejects(() =>
    repo.redactEvidencePayload({ evidence_reference_id: "ev1", content_hash: hex("a"), reason: " ", opts: { client: mock as any } })
  );

  assert.equal(mock.rpcCalls.length, 0);
});

test("Redaction: legal_hold_block mapped + tombstone result returned", async () => {
  const mock = new MockSupabaseClient();
  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.redactEvidence, () => ({ error: { message: "legal_hold_block" }, data: null }));

  const repo = new LegalRedactionRepository();
  await assert.rejects(
    () => repo.redactEvidencePayload({ evidence_reference_id: "ev1", content_hash: hex("a"), reason: "policy", opts: { client: mock as any } }),
    (err: any) => err instanceof PersistenceLegalHoldBlockedError
  );

  mock.onRpc(EXTERNAL_INTELLIGENCE_RPCS.redactEvidence, (args) => ({
    error: null,
    data: [
      {
        evidence_reference_id: String(args.in_evidence_reference_id),
        content_hash: String(args.in_content_hash),
        content_redacted_at: "2026-08-05T00:00:00.000Z",
        redaction_reason: String(args.in_reason)
      }
    ]
  }));

  const tomb = await repo.redactEvidencePayload({
    evidence_reference_id: "ev1",
    content_hash: hex("a"),
    reason: "policy",
    opts: { client: mock as any }
  });

  assert.equal(tomb.kind, "redaction_tombstone");
  assert.equal(tomb.payload_available, false);
  assert.ok(Object.isFrozen(tomb));
});
