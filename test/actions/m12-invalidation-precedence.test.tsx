import test from "node:test";
import assert from "node:assert/strict";

import type { DurableAction } from "@/lib/actions/action-contract";
import { orchestrateExecutionAttempt } from "@/lib/actions/execution/execution-orchestrator";
import type { ExecutionOrchestratorDeps } from "@/lib/actions/execution/execution-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";

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

test("payload hash mismatch returns EXECUTION_PAYLOAD_CHANGED even when dry-run is present", async () => {
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
  const adapter = getMockExecutionAdapter();

  const reqRow = {
    id: "req1",
    action_id: action.id,
    adapter_id: "mock",
    requested_by: "ceo",
    execution_state: "confirmed",
    payload_hash: "hash-B",
    payload_json: { dry_run: { expiresAtUtc: new Date(Date.now() + 60_000).toISOString() } },
    action_state_hash: "ash",
    reversibility: "reversible" as const,
    irreversible_reason: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    idempotency_key: "k1"
  };
  const confirmation = {
    id: "c1",
    confirmed_by: "ceo",
    confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload_hash: "hash-A",
    action_state_hash: "ash",
    irreversible_acknowledged: false
  };

  const deps: ExecutionOrchestratorDeps = {
    nowUtc: () => new Date().toISOString(),
    idempotency: {
      computeRequestHash: (v) => JSON.stringify(v),
      start: async () => ({ replay: false, id: "idem1", response_snapshot: {} }),
      complete: async () => {}
    },
    getAction: async () => action,
    repo: {
      getExecutionRequestById: async () => reqRow,
      getCurrentConfirmation: async () => confirmation,
      updateExecutionRequestState: async () => {},
      insertAttempt: async (row) => ({ id: "att1", started_at: row.started_at }),
      insertStep: async () => {},
      updateAttempt: async () => {}
    },
    lock: {
      acquire: async () => ({ ok: true } as const),
      release: async () => {}
    },
    audit: {
      event: async () => {}
    }
  };

  await assert.rejects(
    () =>
      orchestrateExecutionAttempt({
        executionRequestId: reqRow.id,
        operatorId: "ceo",
        idempotencyKey: "idem",
        supabaseUrl: "https://staging.supabase.co",
        registry,
        adapter,
        deps
      }),
    (e: unknown) => (e instanceof ExecutionDomainError) && e.code === "EXECUTION_PAYLOAD_CHANGED"
  );
});

test("action-state mismatch returns EXECUTION_ACTION_STATE_CHANGED", async () => {
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";

  const action = { ...baseAction(), prepared_assets: [{ k: 999 }] };
  const registry = createMilestone12AdapterRegistry({
    enabledAdapters: new Set(["mock"]),
    enabledCategories: new Set(["email"]),
    emergencyStopActionIds: new Set()
  });
  const adapter = getMockExecutionAdapter();

  const reqRow = {
    id: "req1",
    action_id: action.id,
    adapter_id: "mock",
    requested_by: "ceo",
    execution_state: "confirmed",
    payload_hash: "hash-A",
    payload_json: { dry_run: { expiresAtUtc: new Date(Date.now() + 60_000).toISOString() } },
    action_state_hash: "ash-old",
    reversibility: "reversible" as const,
    irreversible_reason: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    idempotency_key: "k1"
  };
  const confirmation = {
    id: "c1",
    confirmed_by: "ceo",
    confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(),
    payload_hash: "hash-A",
    action_state_hash: "ash-old",
    irreversible_acknowledged: false
  };

  const deps: ExecutionOrchestratorDeps = {
    nowUtc: () => new Date().toISOString(),
    idempotency: {
      computeRequestHash: (v) => JSON.stringify(v),
      start: async () => ({ replay: false, id: "idem1", response_snapshot: {} }),
      complete: async () => {}
    },
    getAction: async () => action,
    repo: {
      getExecutionRequestById: async () => reqRow,
      getCurrentConfirmation: async () => confirmation,
      updateExecutionRequestState: async () => {},
      insertAttempt: async (row) => ({ id: "att1", started_at: row.started_at }),
      insertStep: async () => {},
      updateAttempt: async () => {}
    },
    lock: {
      acquire: async () => ({ ok: true } as const),
      release: async () => {}
    },
    audit: {
      event: async () => {}
    }
  };

  await assert.rejects(
    () =>
      orchestrateExecutionAttempt({
        executionRequestId: reqRow.id,
        operatorId: "ceo",
        idempotencyKey: "idem",
        supabaseUrl: "https://staging.supabase.co",
        registry,
        adapter,
        deps
      }),
    (e: unknown) => (e instanceof ExecutionDomainError) && e.code === "EXECUTION_ACTION_STATE_CHANGED"
  );
});
