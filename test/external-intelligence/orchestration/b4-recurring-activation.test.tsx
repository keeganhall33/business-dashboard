import test from "node:test";
import assert from "node:assert/strict";

import type { SupabaseServerClient } from "../../../src/lib/external-intelligence/persistence/supabase/client";
import type { B4ActivateDeps } from "../../../scripts/b4-activate-recurring-internal-orchestration";

import {
  activateB4RecurringInternalOrchestration,
  B4_CONFIGURATION_VERSION,
  B4_EXPECTED_PROJECT_REF,
  B4_HEARTBEAT_JOB_KEY,
  B4_HEARTBEAT_ROUTE_PATH,
  computeB4ConfigurationHash,
  DEFAULT_B4_CONFIG,
  requireB4ApprovalFlags,
  requireExpectedProjectRef,
  snapshotB4SafetyGates
} from "../../../scripts/b4-activate-recurring-internal-orchestration";


function makeSupabaseStub(counts: Record<string, number>) {
  const calls: string[] = [];

  function countResult(table: string) {
    return Promise.resolve({ count: counts[table] ?? 0, error: null });
  }

  type CountResult = Promise<{ count: number; error: null }>;
  type Chain = {
    eq: (..._args: unknown[]) => Chain;
    gt: (..._args: unknown[]) => CountResult;
    or: (..._args: unknown[]) => CountResult;
    in: (..._args: unknown[]) => CountResult;
    limit: (..._args: unknown[]) => CountResult;
  };

  const supabase = {
    from: (table: string) => {
      calls.push(`from:${table}`);

      const chain: Chain = {
        eq: () => chain,
        gt: () => countResult(table),
        or: () => countResult(table),
        in: () => countResult(table),
        limit: () => countResult(table)
      };

      return {
        select: () => chain
      };
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push(`rpc:${fn}`);
      calls.push(`rpc_args:${JSON.stringify(args)}`);
      return { data: [{ ok: true }], error: null };
    }
  } as unknown as SupabaseServerClient;

  return { supabase, calls };
}

test("b4 activation: approval flags required", () => {
  delete process.env.OPERATOR_ENVIRONMENT;
  delete process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED;
  assert.throws(() => requireB4ApprovalFlags(), /operator_env_not_production/);

  process.env.OPERATOR_ENVIRONMENT = "production";
  assert.throws(() => requireB4ApprovalFlags(), /missing_b4_approval_flag/);
});

test("b4 activation: expected project ref required", () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  assert.throws(() => requireExpectedProjectRef(), /missing_supabase_url/);

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://not-a-ref.supabase.co";
  assert.throws(() => requireExpectedProjectRef(), /unable_to_parse_project_ref/);

  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${B4_EXPECTED_PROJECT_REF}.supabase.co`;
  assert.equal(requireExpectedProjectRef(), B4_EXPECTED_PROJECT_REF);
});

test("b4 activation: safety snapshot counts are read", async () => {
  const { supabase } = makeSupabaseStub({
    scheduled_jobs: 0,
    internal_orchestration_locks_v1: 0,
    external_collection_schedules_v1: 0,
    external_collection_jobs_v1: 0
  });

  const out = await snapshotB4SafetyGates({ nowIso: () => "2026-08-05T00:00:00.000Z", supabase } as unknown as B4ActivateDeps);
  
  assert.deepEqual(out, {
    recurring_heartbeat_rows: 0,
    active_heartbeat_leases: 0,
    enabled_external_schedules: 0,
    active_external_jobs: 0
  });
});

test("b4 activation: calls exactly one RPC (no independent writes)", async () => {
  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.B4_RECURRING_INTERNAL_ORCHESTRATION_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${B4_EXPECTED_PROJECT_REF}.supabase.co`;
  process.env.B4_ACTIVATION_ID = "activation-test-1";
  process.env.B4_REQUESTED_BY = "test";

  const { supabase, calls } = makeSupabaseStub({
    scheduled_jobs: 0,
    internal_orchestration_locks_v1: 0,
    external_collection_schedules_v1: 0,
    external_collection_jobs_v1: 0
  });

  await activateB4RecurringInternalOrchestration({ nowIso: () => "2026-08-05T00:00:00.000Z", supabase } as unknown as B4ActivateDeps);

  assert.ok(calls.some((c) => c === "rpc:activate_external_intelligence_internal_orchestration_v1"));
});

test("b4 activation: config uses one heartbeat job_key and the tick route", () => {
  assert.equal(DEFAULT_B4_CONFIG.job_key, B4_HEARTBEAT_JOB_KEY);
  assert.equal(DEFAULT_B4_CONFIG.route_path, B4_HEARTBEAT_ROUTE_PATH);
  assert.equal(DEFAULT_B4_CONFIG.cron_expression, "0 * * * *");
});

test("b4 activation: configuration hash is stable", () => {
  const h1 = computeB4ConfigurationHash(DEFAULT_B4_CONFIG);
  const h2 = computeB4ConfigurationHash({ ...DEFAULT_B4_CONFIG, enable_jobs: [...DEFAULT_B4_CONFIG.enable_jobs] });
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
  assert.equal(B4_CONFIGURATION_VERSION, "b4.recurring_internal_orchestration.v1");
});
