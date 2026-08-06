import test from "node:test";
import assert from "node:assert/strict";

import type { SupabaseServerClient } from "../../../src/lib/external-intelligence/persistence/supabase/client";
import type { B4DisableDeps } from "../../../scripts/b4-disable-recurring-internal-orchestration";

import { disableB4RecurringInternalOrchestration } from "../../../scripts/b4-disable-recurring-internal-orchestration";
import { B4_EXPECTED_PROJECT_REF } from "../../../scripts/b4-activate-recurring-internal-orchestration";

function makeSupabaseStub() {
  const calls: string[] = [];
  const supabase = {
    rpc: async (fn: string, args: unknown) => {
      void args;
      calls.push(`rpc:${fn}`);
      return { data: [{ ok: true }], error: null };
    }
  } as unknown as SupabaseServerClient;
  return { supabase, calls };
}

test("b4 disable: calls exactly one RPC", async () => {
  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${B4_EXPECTED_PROJECT_REF}.supabase.co`;
  process.env.B4_DISABLE_ID = "disable-test-1";
  process.env.B4_REQUESTED_BY = "test";

  const { supabase, calls } = makeSupabaseStub();

  await disableB4RecurringInternalOrchestration({ nowIso: () => "2026-08-05T00:00:00.000Z", supabase } as unknown as B4DisableDeps);
  assert.ok(calls.some((c) => c === "rpc:disable_external_intelligence_internal_orchestration_v1"));
});
