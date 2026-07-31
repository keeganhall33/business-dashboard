import test from "node:test";
import assert from "node:assert/strict";

import { getMockExecutionAdapter } from "@/lib/actions/execution/adapters/mock/mock-adapter";

function baseCtx(mode: string) {
  return {
    actionId: "a1",
    operatorId: "ceo",
    idempotencyKey: "k1",
    timeoutMs: 30_000,
    retryPolicy: { maxAttempts: 1, backoffMs: 0 },
    env: {
      supabaseUrl: "https://staging.supabase.co",
      category: "email",
      adapterEnabled: true,
      categoryEnabled: true,
      emergencyStop: false
    },
    approval: { approvedAt: "2026-01-01T00:00:00.000Z", approvedBy: "ceo", auditIds: [] },
    evidence: { snapshotId: "s1", hash: "h1", expiresAt: null },
    payload: { hash: "ph", summary: "", raw: { mock: { mode } } },
    rollbackPlan: { required: true, hash: null, summary: "", raw: null },
    reversibility: "reversible" as const,
    irreversibilityExplanation: null,
    auditMetadata: {}
  };
}

test("mock adapter executes deterministically with externalSideEffects=0", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const res = await adapter.execute(baseCtx("success"));
  assert.equal(res.externalSideEffects, 0);
  assert.equal(res.status, "succeeded");
  assert.ok(res.providerExecutionId);
});

test("mock adapter timeout is deterministic (no sleep) and reports timeout", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const res = await adapter.execute(baseCtx("timeout"));
  assert.equal(res.externalSideEffects, 0);
  assert.equal(res.status, "timeout");
});

test("mock adapter deterministic failure and partial success preserve step sets", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const failed = await adapter.execute(baseCtx("failure"));
  assert.equal(failed.externalSideEffects, 0);
  assert.equal(failed.status, "failed");
  assert.ok(failed.failedSteps.length > 0);

  const partial = await adapter.execute(baseCtx("partial_success"));
  assert.equal(partial.externalSideEffects, 0);
  assert.equal(partial.status, "partial_succeeded");
  assert.ok(partial.completedSteps.length > 0);
  assert.ok(partial.failedSteps.length > 0);
  assert.equal(partial.rollbackEligible, true);
});

test("mock adapter verification success and failure are deterministic", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const ok = await adapter.verify(baseCtx("verification_success"));
  assert.equal(ok.ok, true);
  const bad = await adapter.verify(baseCtx("verification_failure"));
  assert.equal(bad.ok, false);
});

test("mock adapter blocked by default when flags missing", async () => {
  const adapter = getMockExecutionAdapter();
  delete process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY;
  delete process.env.ACTIONS_ENABLE_MOCK_EXECUTION;
  process.env.NODE_ENV = "test";
  const validated = await adapter.validate(baseCtx("success"));
  assert.equal(validated.ok, false);
});

test("mock adapter production hard block", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "production";
  const validated = await adapter.validate(baseCtx("success"));
  assert.equal(validated.ok, false);
});

test("mock adapter blocks missing/malformed supabase URL with stable gate error (no raw Invalid URL)", async () => {
  const adapter = getMockExecutionAdapter();
  process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY = "1";
  process.env.ACTIONS_ENABLE_MOCK_EXECUTION = "1";
  process.env.NODE_ENV = "test";
  const ctx = baseCtx("success");
  const badCtx = { ...ctx, env: { ...ctx.env, supabaseUrl: "" } };
  const validated = await adapter.validate(badCtx);
  assert.equal(validated.ok, false);
  assert.ok(validated.errors.join(" ").includes("Invalid Supabase URL"));
  assert.ok(!validated.errors.join(" ").includes("Invalid URL"));
});

test("mock adapter rejects missing payload.mock.mode", async () => {
  const adapter = getMockExecutionAdapter();
  const ctx = baseCtx("success");
  const badCtx = { ...ctx, payload: { ...ctx.payload, raw: {} as Record<string, unknown> } };
  const validated = await adapter.validate(badCtx);
  assert.equal(validated.ok, false);
});
