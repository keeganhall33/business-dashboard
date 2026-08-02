import test from "node:test";
import assert from "node:assert/strict";

import type { DurableAction } from "@/lib/actions/action-contract";
import { orchestrateExecutionAttempt } from "@/lib/actions/execution/execution-orchestrator";
import type { ExecutionOrchestratorDeps } from "@/lib/actions/execution/execution-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
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

test("execution replay idempotent: no duplicate attempt/steps/audit", async () => {
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";

  const action = baseAction();
  const adapter = getMockExecutionAdapter();
  const registry = createMilestone12AdapterRegistry({
    enabledAdapters: new Set(["mock"]),
    enabledCategories: new Set(["email"]),
    emergencyStopActionIds: new Set()
  });

  const memIdem = createInMemoryIdempotency();
  const memLock = createInMemoryLock();

  const state = {
    request: {
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
    },
    confirmation: {
      id: "c1",
      confirmed_by: "ceo",
      confirmation_expires_at: new Date(Date.now() + 60_000).toISOString(),
      payload_hash: "ph",
      action_state_hash: "77943da4489e958151d5b4fa0387ac7a94401e0f1ea572fb1bd624b747826f0f",
      irreversible_acknowledged: false
    },
    attempts: 0,
    steps: 0,
    audits: 0
  };

  const deps: ExecutionOrchestratorDeps = {
    nowUtc: () => new Date().toISOString(),
    idempotency: {
      computeRequestHash: memIdem.computeRequestHash,
      start: async (input) => memIdem.start(input),
      complete: memIdem.complete
    },
    getAction: async () => action,
    repo: {
      getExecutionRequestById: async () => state.request,
      getCurrentConfirmation: async () => state.confirmation,
      updateExecutionRequestState: async () => {
        // no-op for this test; replay proof focuses on duplicate rows.
      },
      insertAttempt: async (row) => {
        state.attempts += 1;
        return { id: `att-${state.attempts}`, started_at: row.started_at };
      },
      insertStep: async () => {
        state.steps += 1;
      },
      updateAttempt: async () => {}
    },
    lock: {
      acquire: async () => memLock.acquire(),
      release: async () => memLock.release()
    },
    audit: {
      event: async () => {
        state.audits += 1;
      }
    }
  };

  const r1 = await orchestrateExecutionAttempt({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "IDEM",
    supabaseUrl: "https://staging.supabase.co",
    registry,
    adapter,
    deps
  });
  const attemptsAfterFirst = state.attempts;
  const stepsAfterFirst = state.steps;
  const auditsAfterFirst = state.audits;

  const r2 = await orchestrateExecutionAttempt({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "IDEM",
    supabaseUrl: "https://staging.supabase.co",
    registry,
    adapter,
    deps
  });

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(state.attempts, attemptsAfterFirst);
  assert.equal(state.steps, stepsAfterFirst);
  // Replay emits a single deterministic replay audit event.
  assert.equal(state.audits, auditsAfterFirst + 1);
});
