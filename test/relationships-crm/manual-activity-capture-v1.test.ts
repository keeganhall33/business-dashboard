import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  captureManualCrmActivityV1,
  ManualCrmCaptureConflictErrorV1,
  manualCrmActivityCaptureSchemaV1
} from "@/lib/relationships-crm/manual-activity-capture-v1";

const value = {
  contactEntityId: "person:michelle-bevilacqua",
  opportunityId: "419101f6-b1d6-426e-a414-63defa9ae5a2",
  threadId: "manual:mercedes-masters",
  activityType: "EMAIL" as const,
  direction: "OUTBOUND" as const,
  summary: "Keegan confirmed a manual follow-up.",
  occurredAt: "2026-09-14T16:00:00.000Z",
  evidenceRefs: ["user:crm-update:2026-09-14"],
  followUpDueAt: "2026-09-22T16:00:00.000Z"
};

test("captures normalized manual CRM activity through the single transaction RPC", async () => {
  let call: { name: string; args: Record<string, unknown> } | null = null;
  const result = await captureManualCrmActivityV1({
    value,
    idempotencyKey: "manual-capture:test",
    rpc: async (name, args) => {
      call = { name, args };
      return { data: { ok: true }, error: null };
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(call?.name, "capture_crm_manual_activity_v1");
  assert.equal(call?.args.p_idempotency_key, "manual-capture:test");
  assert.match(String(call?.args.p_request_hash), /^[a-f0-9]{64}$/);
  assert.match(String((call?.args.p_payload as { activityId: string }).activityId), /^activity:manual:/);
});

test("rejects follow-ups without a thread or opportunity", () => {
  const result = manualCrmActivityCaptureSchemaV1.safeParse({
    ...value,
    opportunityId: null,
    threadId: null
  });
  assert.equal(result.success, false);
});

test("maps database idempotency conflicts to a stable domain error", async () => {
  await assert.rejects(
    captureManualCrmActivityV1({
      value,
      idempotencyKey: "manual-capture:test",
      rpc: async () => ({ data: null, error: { message: "CRM_IDEMPOTENCY_CONFLICT" } })
    }),
    ManualCrmCaptureConflictErrorV1
  );
});

test("migration is atomic, service-role-only, and contains no send surface", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260914165342_crm_manual_capture_boundary_v1.sql"),
    "utf8"
  );
  assert.match(sql, /begin;/i);
  assert.match(sql, /commit;/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /smtp|send_email|mailbox_mutation/i);
});

test("API route enforces dashboard auth and idempotency", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/api/relationships/manual-activity/route.ts"),
    "utf8"
  );
  assert.match(source, /enforceDashboardAuth/);
  assert.match(source, /x-idempotency-key/);
  assert.match(source, /idempotency_conflict/);
});
