import test from "node:test";
import assert from "node:assert/strict";

import type { DurableAction } from "@/lib/actions/action-contract";
import type { ExecutionAdapter } from "@/lib/actions/execution/adapter-contract";
import { orchestrateExecutionAttempt } from "@/lib/actions/execution/execution-orchestrator";
import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

function baseAction(): DurableAction {
  return {
    id: "a1",
    recommendation_id: "r",
    opportunity_id: null,
    title: "t",
    description: null,
    category: "email",
    channel: "email",
    approval_level: "L1_RECOMMENDATION",
    affected_products: ["store"],
    affected_audiences: ["all"],
    current_level: "L4_APPROVED_FOR_EXECUTION",
    status: "approved",
    priority_score: { overallScore: 1 },
    confidence: "possible",
    expected_outcome: null,
    estimated_impact: {},
    estimated_cost: { usd: 0 },
    estimated_effort: {},
    risk: "medium",
    evidence_snapshot_id: "s1",
    evidence_snapshot_hash: "h1",
    evidence_snapshot: null,
    assumptions: [],
    limitations: [],
    prepared_assets: [{ k: 1 }],
    execution_plan: { preview: "p" },
    approval_requirements: {},
    last_idempotency_key: null,
    approved_by: "ceo",
    approved_at: "2026-01-01T00:00:00.000Z",
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    snoozed_until: null,
    expires_at: null,
    executed_at: null,
    measurement_window: {},
    baseline_snapshot: null,
    result_snapshot: null,
    outcome: null,
    lessons: null,
    recommendation_fingerprint: "fp",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };
}

test("lock is released exactly once when adapter throws", async () => {
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";

  const action = baseAction();
  const registry = createMilestone12AdapterRegistry({
    enabledAdapters: new Set(["mock"]),
    enabledCategories: new Set(["email"]),
    emergencyStopActionIds: new Set()
  });
  const memIdem = createInMemoryIdempotency();
  const memLock = createInMemoryLock();

  const adapter: ExecutionAdapter = {
    id: "mock",
    capabilities: () => ({ supportsCancel: true, supportsRollback: true, supportsPartialRollback: true, supportsVerification: true, irreversibleOperations: [] }),
    validate: async () => ({ ok: true, errors: [] }),
    preview: async () => ({ ok: true, summary: "", warnings: [] }),
    estimateImpact: async () => ({}),
    estimateCost: async () => ({}),
    dryRun: async () => {
      throw new Error("not used");
    },
    execute: async () => {
      throw new Error("boom");
    },
    verify: async () => ({ ok: true, details: {} }),
    getRollbackPreview: async () => ({ ok: true, summary: "", warnings: [] }),
    rollback: async () => {
      throw new Error("not used");
    },
    cancel: async () => ({ ok: true, status: "cancelled" }),
    getStatus: async () => ({ status: "unknown", details: {} })
  };

  const req = {
    id: "req1",
    action_id: action.id,
    adapter_id: "mock",
    requested_by: "ceo",
    execution_state: "confirmed",
    payload_hash: "ph",
    payload_json: { mock: { mode: "success" }, dry_run: { expiresAtUtc: new Date(Date.now() + 60_000).toISOString() } },
    action_state_hash: "77943da4489e958151d5b4fa0387ac7a94401e0f1ea572fb1bd624b747826f0f",
    reversibility: "reversible" as const,
    irreversible_reason: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    idempotency_key: "k1"
  };
  const confirmation = {
    id: "c1",
    confirmed_by: "ceo",
    confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload_hash: "ph",
    action_state_hash: req.action_state_hash,
    irreversible_acknowledged: false
  };

  await assert.rejects(
    () =>
      orchestrateExecutionAttempt({
        executionRequestId: req.id,
        operatorId: "ceo",
        idempotencyKey: "IDEM",
        supabaseUrl: "https://staging.supabase.co",
        registry,
        adapter,
        deps: {
          nowUtc: () => new Date().toISOString(),
          idempotency: {
            computeRequestHash: memIdem.computeRequestHash,
            start: async (input) => memIdem.start(input as unknown as {
              operationType: string;
              actionId: string;
              executionRequestId: string;
              idempotencyKey: string;
              requestHash: string;
              responseSnapshot: Record<string, unknown>;
            }),
            complete: memIdem.complete
          },
          getAction: async () => action,
          repo: {
            getExecutionRequestById: async () => req,
            getCurrentConfirmation: async () => confirmation,
            updateExecutionRequestState: async () => {},
            insertAttempt: async (row) => ({ id: "att1", started_at: row.started_at }),
            insertStep: async () => {},
            updateAttempt: async () => {}
          },
          lock: {
            acquire: async () => memLock.acquire(),
            release: async () => memLock.release()
          },
          audit: {
            event: async () => {}
          }
        }
      }),
    /boom/
  );

  const counts = memLock.counts();
  assert.equal(counts.acquireCount, 1);
  assert.equal(counts.releaseCount, 1);
  assert.equal(memLock.isLocked(), false);
});
