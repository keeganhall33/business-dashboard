import test from "node:test";
import assert from "node:assert/strict";

import type { DurableAction } from "@/lib/actions/action-contract";
import { orchestrateExecutionAttempt } from "@/lib/actions/execution/execution-orchestrator";
import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";
import { createMilestone12AdapterRegistry } from "@/lib/actions/execution/adapters/mock/mock-adapter-registry";
import { createInMemoryIdempotency, createInMemoryLock } from "./m12-test-doubles";

function assertSubsequence(haystack: string[], subseq: string[]) {
  let i = 0;
  for (const item of haystack) {
    if (item === subseq[i]) i += 1;
    if (i >= subseq.length) return;
  }
  throw new Error(`Expected subsequence not found: ${subseq.join(" -> ")}`);
}

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

test("orchestrator runs mock execution from confirmed -> terminal with persisted attempt/steps", async () => {
  const prevBoundary = process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY;
  const prevMock = process.env.ACTIONS_ENABLE_MOCK_EXECUTION;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.supabase.co";

  try {
    const action = baseAction();
    const adapter = getMockExecutionAdapter();
    const registry = createMilestone12AdapterRegistry({
      enabledAdapters: new Set(["mock"]),
      enabledCategories: new Set(["email"]),
      emergencyStopActionIds: new Set()
    });

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
    attempts: [] as Array<Record<string, unknown>>,
    steps: [] as Array<Record<string, unknown>>,
    audit: [] as Array<Record<string, unknown>>,
    locked: false
  };

    const memIdem = createInMemoryIdempotency();
    const memLock = createInMemoryLock();

    const res = await orchestrateExecutionAttempt({
    executionRequestId: state.request.id,
    operatorId: "ceo",
    idempotencyKey: "idem",
    supabaseUrl: "https://staging.supabase.co",
    registry,
    adapter,
      deps: {
        nowUtc: () => new Date().toISOString(),
        idempotency: {
          computeRequestHash: memIdem.computeRequestHash,
          start: memIdem.start,
          complete: memIdem.complete
        },
        getAction: async () => action,
        repo: {
        getExecutionRequestById: async () => state.request,
        getCurrentConfirmation: async () => state.confirmation,
        updateExecutionRequestState: async ({ execution_state }) => {
          state.request.execution_state = execution_state;
        },
        insertAttempt: async (row) => {
          const id = `att-${state.attempts.length + 1}`;
          state.attempts.push({ id, ...row });
          return { id, started_at: row.started_at };
        },
        insertStep: async (row) => {
          state.steps.push(row);
        },
        updateAttempt: async (input) => {
          const att = state.attempts.find((a) => a["id"] === input.id);
          if (att) Object.assign(att, input);
        }
      },
      lock: {
        acquire: async () => {
          const r = await memLock.acquire();
          state.locked = memLock.isLocked();
          return r;
        },
        release: async () => {
          await memLock.release();
          state.locked = memLock.isLocked();
        }
      },
        audit: {
          event: async (e) => {
            state.audit.push(e);
          }
        }
      }
    });

    assert.equal(res.ok, true);
    assert.equal(res.result.externalSideEffects, 0);
    assert.equal(state.request.execution_state, "succeeded");
    assert.equal(state.attempts.length, 1);
    const stepNames = state.steps.map((s) => String(s["name"]));
    const expectedOrder = [
      "preflight",
      "lock_acquired",
      "idempotency_checked",
      "confirmation_verified",
      "payload_verified",
      "action_state_verified",
      "queued",
      "started",
      "adapter_invoked",
      "result_persisted",
      "verification_completed",
      "lock_released"
    ];
    // Adapter-reported steps may appear between adapter_invoked and verification_completed.
    assertSubsequence(stepNames, expectedOrder);
    assert.ok(stepNames.includes("preflight"));
    assert.ok(stepNames.includes("lock_acquired"));
    assert.ok(stepNames.includes("queued"));
    assert.ok(stepNames.includes("started"));
    assert.ok(stepNames.includes("adapter_invoked"));
    assert.ok(stepNames.includes("verification_completed"));
    assert.equal(state.locked, false);

    // Audit proof: queued + started + completed.
    const auditTypes = state.audit.map((a) => String(a["event_type"]));
    assert.ok(auditTypes.includes("execution_queued"));
    assert.ok(auditTypes.includes("execution_started"));
    assert.ok(auditTypes.includes("execution_attempt_completed"));
  } finally {
    process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = prevBoundary;
    process.env.ACTIONS_ENABLE_MOCK_EXECUTION = prevMock;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});
