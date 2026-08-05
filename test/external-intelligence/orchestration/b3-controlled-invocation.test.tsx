import test from "node:test";
import assert from "node:assert/strict";

import type { InternalOrchestrationJobKey } from "@/lib/external-intelligence/orchestration/internal-jobs";
import type { ManualHeartbeatInvocationV1 } from "@/lib/external-intelligence/orchestration/manual-invocation";
import {
  runControlledExternalIntelligenceHeartbeatV1WithDeps,
  type ControlledHeartbeatDeps
} from "@/lib/external-intelligence/orchestration/controlled-heartbeat-operator";

function makeDeps(overrides: Partial<ControlledHeartbeatDeps> = {}): ControlledHeartbeatDeps {
  const base: ControlledHeartbeatDeps = {
    nowIso: () => "2026-08-05T00:00:00.000Z",
    validateInvocation: (x: unknown) => x as ManualHeartbeatInvocationV1,

    claimInvocationOnce: async () => ({ claimed: true, claimed_at: "2026-08-05T00:00:00.000Z" }),

    getSystemState: async () => null as never,
    upsertSystemState: async () => ({}) as never,

    snapshotPreconditions: async () => ({
      ok: true,
      facts: {
        supabase_project_ref: "ibjsjosplgbqevmnvvpf",
        recurring_heartbeat_rows: 0,
        active_heartbeat_leases: 0,
        enabled_external_schedules: 0,
        external_collection_jobs_total: 0,
        external_collection_jobs_active_executable: 0
      },
      a5Counts: { evidence_refs: 10, claims: 20, signals: 30 }
    }),

    readAllInternalJobsForEnv: async () => [],
    upsertGovernedDefinitionsIfMissing: async () => ({ inserted: 0 }),
    enableJobsForOneShot: async () => {},
    assertOnlyApprovedJobsEnabled: async () => ({ ok: true, enabled: [] }),
    restoreJobStates: async () => {},

    runHeartbeat: async () => ({ status: "succeeded", results: {} }),

    getTableCountOrNull: async () => 0,
    getDistinctHealthSourceCount: async () => 0,
    getHealthSourceIds: async () => [],
    getActiveHeartbeatLeaseCount: async () => 0,
    getRecurringHeartbeatRowCount: async () => 0,
    getUnresolvedHighSeverityOrchestrationAlerts: async () => [],
    getCanonicalProductionSourceIds: () => []
  };

  return { ...base, ...overrides };
}

const APPROVED: InternalOrchestrationJobKey[] = [
  "external-source-watchdog-v1",
  "milestone-horizon-scan-v1",
  "expired-lease-recovery-v1",
  "expired-milestone-alert-cleanup-v1"
];

test("b3.1 operator: requires explicit production operator env", async () => {
  const deps = makeDeps({
    snapshotPreconditions: async () => {
      throw new Error("precondition_failed:approval_flag_missing");
    },
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv1",
      environment: "production",
      approved_internal_job_names: APPROVED,
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";

  await assert.rejects(
    () =>
      runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
        expected_project_ref: "ibjsjosplgbqevmnvvpf",
        invocation_json: {}
      }),
    /precondition_failed:approval_flag_missing/
  );
});

test("b3.1 operator: approved job names must match exactly", async () => {
  const deps = makeDeps({
    snapshotPreconditions: async () => ({
      ok: true,
      facts: {
        supabase_project_ref: "ibjsjosplgbqevmnvvpf",
        recurring_heartbeat_rows: 0,
        active_heartbeat_leases: 0,
        enabled_external_schedules: 0,
        external_collection_jobs_total: 0,
        external_collection_jobs_active_executable: 0
      },
      a5Counts: { evidence_refs: 1, claims: 1, signals: 1 }
    }),
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv2",
      environment: "production",
      approved_internal_job_names: ["external-source-watchdog-v1"],
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";
  process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ibjsjosplgbqevmnvvpf.supabase.co";

  await assert.rejects(
    () =>
      runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
        expected_project_ref: "ibjsjosplgbqevmnvvpf",
        invocation_json: {}
      }),
    /precondition_failed:approved_jobs_mismatch/
  );
});

test("b3.1 operator: duplicate invocation id is rejected", async () => {
  const deps = makeDeps({
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv3",
      environment: "production",
      approved_internal_job_names: APPROVED,
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1,
    claimInvocationOnce: async () => ({ claimed: false, claimed_at: "2026-08-05T00:00:00.000Z" })
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";
  process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ibjsjosplgbqevmnvvpf.supabase.co";

  const out = await runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
    expected_project_ref: "ibjsjosplgbqevmnvvpf",
    invocation_json: {}
  });

  assert.deepEqual(out, { ok: false, error: "invocation_already_claimed" });
});

test("b3.1 operator: blocks when external schedules enabled", async () => {
  const deps = makeDeps({
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv4",
      environment: "production",
      approved_internal_job_names: APPROVED,
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1,
    snapshotPreconditions: async () => ({
      ok: false,
      facts: {
        supabase_project_ref: "ibjsjosplgbqevmnvvpf",
        recurring_heartbeat_rows: 0,
        active_heartbeat_leases: 0,
        enabled_external_schedules: 1,
        external_collection_jobs_total: 0,
        external_collection_jobs_active_executable: 0
      },
      a5Counts: { evidence_refs: 1, claims: 1, signals: 1 }
    })
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";
  process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ibjsjosplgbqevmnvvpf.supabase.co";

  const out = await runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
    expected_project_ref: "ibjsjosplgbqevmnvvpf",
    invocation_json: {}
  });

  assert.equal(out.ok, false);
});

test("b3.1 operator: restores state after thrown error", async () => {
  let restored = 0;
  let enabled = 0;

  const deps = makeDeps({
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv5",
      environment: "production",
      approved_internal_job_names: APPROVED,
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1,
    enableJobsForOneShot: async () => {
      enabled += 1;
    },
    runHeartbeat: async () => {
      throw new Error("boom");
    },
    restoreJobStates: async () => {
      restored += 1;
    }
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";
  process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED = "true";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ibjsjosplgbqevmnvvpf.supabase.co";

  await assert.rejects(() =>
    runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
      expected_project_ref: "ibjsjosplgbqevmnvvpf",
      invocation_json: {}
    })
  );

  assert.equal(enabled, 1);
  assert.equal(restored, 1);
});

test("b3.1 operator: no HTTP/Vercel requests are made by the operator wrapper", async () => {
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  // @ts-expect-error test monkeypatch
  globalThis.fetch = async (...args: unknown[]) => {
    void args;
    fetchCalls += 1;
    throw new Error("unexpected_fetch");
  };

  const deps = makeDeps({
    // Run fails at env gate before any DB/network layer.
    validateInvocation: () =>
      ({
      schema_version: "manual_heartbeat_invocation_v1",
      invocation_id: "inv6",
      environment: "production",
      approved_internal_job_names: APPROVED,
      dry_run: false,
      requested_at: "2026-08-05T00:00:00.000Z",
      requested_by: "keegan",
      expires_at: "2026-08-06T00:00:00.000Z",
      configuration_version: "x",
      content_hash: "h"
    }) satisfies ManualHeartbeatInvocationV1
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";
  delete process.env.CONTROLLED_INTERNAL_HEARTBEAT_APPROVED;

  await assert.rejects(() =>
    runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
      expected_project_ref: "ibjsjosplgbqevmnvvpf",
      invocation_json: {}
    })
  );

  assert.equal(fetchCalls, 0);
  globalThis.fetch = originalFetch;
});

test("b3.1 operator: concurrent duplicate invocation_id => exactly one winner", async () => {
  const claimed = new Set<string>();
  let heartbeatCalls = 0;
  let enableCalls = 0;
  let restoreCalls = 0;

  const invocation: ManualHeartbeatInvocationV1 = {
    schema_version: "manual_heartbeat_invocation_v1",
    invocation_id: "same-invocation",
    environment: "production",
    approved_internal_job_names: APPROVED,
    dry_run: false,
    requested_at: "2026-08-05T00:00:00.000Z",
    requested_by: "keegan",
    expires_at: "2026-08-06T00:00:00.000Z",
    configuration_version: "x",
    content_hash: "h"
  };

  const deps = makeDeps({
    validateInvocation: () => invocation,
    claimInvocationOnce: async ({ key }) => {
      if (claimed.has(key)) return { claimed: false, claimed_at: "2026-08-05T00:00:00.000Z" };
      claimed.add(key);
      return { claimed: true, claimed_at: "2026-08-05T00:00:00.000Z" };
    },
    snapshotPreconditions: async () => ({
      ok: true,
      facts: {
        supabase_project_ref: "ibjsjosplgbqevmnvvpf",
        operator_expected_project_ref: "ibjsjosplgbqevmnvvpf",
        recurring_heartbeat_rows: 0,
        active_heartbeat_leases: 0,
        enabled_external_schedules: 0,
        external_collection_jobs_total: 0,
        external_collection_jobs_active_executable: 0
      },
      a5Counts: { evidence_refs: 1, claims: 1, signals: 1 }
    }),
    enableJobsForOneShot: async () => {
      enableCalls += 1;
    },
    restoreJobStates: async () => {
      restoreCalls += 1;
    },
    runHeartbeat: async () => {
      heartbeatCalls += 1;
      return {
        status: "succeeded",
        results: {
          "external-source-watchdog-v1": { status: "succeeded", output: { sourcesEvaluated: 24, healthRowsUpserted: 24 } },
          "milestone-horizon-scan-v1": { status: "succeeded", output: {} },
          "expired-lease-recovery-v1": { status: "succeeded", output: {} },
          "expired-milestone-alert-cleanup-v1": { status: "succeeded", output: {} }
        }
      };
    },
    getTableCountOrNull: async (table) => {
      if (table === "external_collection_health_v1") return 24;
      if (table === "sports_milestones_v1") return 0;
      if (table === "sports_milestone_versions_v1") return 0;
      if (table === "sports_milestone_alerts_v1") return 0;
      if (table === "external_evidence_references_v1") return 1;
      if (table === "external_claims_v1") return 1;
      if (table === "external_signals_v1") return 1;
      return 0;
    },
    getDistinctHealthSourceCount: async () => 24,
    getHealthSourceIds: async () => ["a", "b"],
    getCanonicalProductionSourceIds: () => ["a", "b"],
    getActiveHeartbeatLeaseCount: async () => 0,
    getRecurringHeartbeatRowCount: async () => 0
  });

  process.env.OPERATOR_ENVIRONMENT = "production";
  process.env.OPERATOR_EXPECTED_SUPABASE_PROJECT_REF = "ibjsjosplgbqevmnvvpf";

  const [a, b] = await Promise.all([
    runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
      expected_project_ref: "ibjsjosplgbqevmnvvpf",
      invocation_json: {}
    }),
    runControlledExternalIntelligenceHeartbeatV1WithDeps(deps, {
      expected_project_ref: "ibjsjosplgbqevmnvvpf",
      invocation_json: {}
    })
  ]);

  const okCount = Number(a.ok) + Number(b.ok);
  const claimedCount = [a, b].filter((x) => x.ok === false && x.error === "invocation_already_claimed").length;

  assert.equal(okCount, 1);
  assert.equal(claimedCount, 1);
  assert.equal(heartbeatCalls, 1);
  assert.equal(enableCalls, 1);
  // Only the winning invocation should attempt restoration.
  assert.equal(restoreCalls, 1);
});
