import test from "node:test";
import assert from "node:assert/strict";

import {
  activateB4RecurringInternalOrchestration,
  B4_HEARTBEAT_JOB_KEY,
  B4_HEARTBEAT_ROUTE_PATH,
  DEFAULT_B4_CONFIG,
  requireB4ApprovalFlags,
  snapshotB4SafetyGates
} from "@/scripts/b4-activate-recurring-internal-orchestration";

function makeSupabaseCountStub(counts: Record<string, number>) {
  const calls: string[] = [];

  function countResult(table: string) {
    return Promise.resolve({ count: counts[table] ?? 0, error: null });
  }

  const supabase: any = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: () => countResult(table)
            }),
            or: () => countResult(table),
            then: undefined
          }),
          gt: () => countResult(table),
          or: () => countResult(table),
          then: undefined
        }),
        upsert: async (_row: any, _opts: any) => {
          calls.push(`upsert:${table}`);
          return { error: null };
        },
        update: () => ({
          eq: () => ({
            in: async () => {
              calls.push(`update:${table}`);
              return { error: null };
            }
          })
        })
      };
    }
  };

  return { supabase, calls };
}

test("b4 activation: approval flags required", () => {
  delete process.env.OPERATOR_ENVIRONMENT;
  delete process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED;
  assert.throws(() => requireB4ApprovalFlags(), /operator_env_not_production/);

  process.env.OPERATOR_ENVIRONMENT = "production";
  assert.throws(() => requireB4ApprovalFlags(), /missing_b4_approval_flag/);
});

test("b4 activation: safety snapshot counts are read", async () => {
  const { supabase } = makeSupabaseCountStub({
    scheduled_jobs: 0,
    internal_orchestration_locks_v1: 0,
    external_collection_schedules_v1: 0,
    external_collection_jobs_v1: 0
  });

  const out = await snapshotB4SafetyGates({ nowIso: () => "2026-08-05T00:00:00.000Z", supabase } as any);
  assert.deepEqual(out, {
    recurring_heartbeat_rows: 0,
    active_heartbeat_leases: 0,
    enabled_external_schedules: 0,
    active_external_jobs: 0
  });
});

test("b4 activation: safety gates block when any gate is nonzero", async () => {
  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED = "true";

  const { supabase } = makeSupabaseCountStub({
    scheduled_jobs: 1,
    internal_orchestration_locks_v1: 0,
    external_collection_schedules_v1: 0,
    external_collection_jobs_v1: 0
  });

  await assert.rejects(
    () => activateB4RecurringInternalOrchestration({ nowIso: () => "2026-08-05T00:00:00.000Z", supabase } as any),
    /b4_safety_gate_blocked/
  );
});

test("b4 activation: config uses one heartbeat job_key and the tick route", () => {
  assert.equal(DEFAULT_B4_CONFIG.job_key, B4_HEARTBEAT_JOB_KEY);
  assert.equal(DEFAULT_B4_CONFIG.route_path, B4_HEARTBEAT_ROUTE_PATH);
  assert.equal(DEFAULT_B4_CONFIG.cron_expression, "0 * * * *");
});
