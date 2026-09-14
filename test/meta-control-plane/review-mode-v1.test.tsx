/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";
import { createMetaMarketingClient, createReviewModeService, validateBoundedChange } from "../../scripts/meta-control-plane/review-mode-v1.mjs";

function repository() {
  const rows = new Map<string, Record<string, any>>();
  let sequence = 0;
  return {
    rows,
    async list() { return [...rows.values()]; },
    async get(id: string) { return rows.get(id) ?? null; },
    async findByIdempotencyKey(key: string) { return [...rows.values()].find((row) => row.idempotency_key === key) ?? null; },
    async create(value: Record<string, any>) { const row = { id: `p-${++sequence}`, ...structuredClone(value) }; rows.set(row.id, row); return row; },
    async update(id: string, value: Record<string, any>) { const row = { ...rows.get(id), ...structuredClone(value) }; rows.set(id, row); return row; }
  };
}

function harness(overrides: Record<string, any> = {}) {
  const repo = repository();
  const writes: unknown[] = [];
  let live: Record<string, any> = { id: "123", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1500" };
  const metaClient = {
    async readObject() { return structuredClone(live); },
    async writeObject(_type: string, _id: string, patch: unknown) { writes.push(patch); return { success: true }; },
    ...overrides
  };
  const service = createReviewModeService({ repository: repo, metaClient, now: () => "2026-09-14T22:30:00.000Z" });
  const observe = () => service.observe({ objectType: "campaign", objectId: "123", proposedState: { ...live, daily_budget: "1650" }, rationale: "Bounded efficiency test", supportingMetrics: { roas: 2.1 }, confidence: "high", riskTier: "low", proposer: "analyst", idempotencyKey: "idem-1" });
  return { repo, writes, service, observe, setLive(value: Record<string, any>) { live = value; } };
}

test("proposal creation is idempotent and preserves before state", async () => {
  const h = harness();
  const first = await h.observe();
  const second = await h.observe();
  assert.equal(first.id, second.id);
  assert.equal(h.repo.rows.size, 1);
  assert.equal(first.before_state.daily_budget, "1500");
});

test("execution requires explicit approval and separate live confirmation", async () => {
  const h = harness();
  const proposal = await h.observe();
  await assert.rejects(h.service.execute(proposal.id, { dryRun: false, confirmLiveWrite: true }), /explicit approval/);
  await h.service.approve(proposal.id, "keegan");
  await assert.rejects(h.service.execute(proposal.id, { dryRun: false }), /separate confirmation/);
  assert.equal(h.writes.length, 0);
});

test("dry run is audited without a Meta write", async () => {
  const h = harness();
  const proposal = await h.observe();
  await h.service.approve(proposal.id, "keegan");
  const result = await h.service.execute(proposal.id);
  assert.equal(result.execution_state, "DRY_RUN");
  assert.equal(h.writes.length, 0);
});

test("stale proposal fails closed", async () => {
  const h = harness();
  const proposal = await h.observe();
  await h.service.approve(proposal.id, "keegan");
  h.setLive({ id: "123", status: "PAUSED", effective_status: "PAUSED", daily_budget: "1500" });
  const result = await h.service.execute(proposal.id, { dryRun: false, confirmLiveWrite: true });
  assert.equal(result.execution_state, "STALE");
  assert.equal(h.writes.length, 0);
});

test("approved bounded write executes once and supports rollback", async () => {
  const h = harness();
  const proposal = await h.observe();
  await h.service.approve(proposal.id, "keegan");
  const executed = await h.service.execute(proposal.id, { dryRun: false, confirmLiveWrite: true });
  assert.equal(executed.execution_state, "SUCCEEDED");
  assert.deepEqual(h.writes, [{ daily_budget: "1650" }]);
  await h.service.execute(proposal.id, { dryRun: false, confirmLiveWrite: true });
  assert.equal(h.writes.length, 1);
  const rolledBack = await h.service.rollback(proposal.id, { dryRun: false, confirmLiveWrite: true });
  assert.equal(rolledBack.rollback_state, "SUCCEEDED");
  assert.deepEqual(h.writes[1], { daily_budget: "1500" });
});

test("reject prevents approval and execution", async () => {
  const h = harness();
  const proposal = await h.observe();
  await h.service.reject(proposal.id, "keegan", "Evidence is insufficient");
  await assert.rejects(h.service.approve(proposal.id, "keegan"), /cannot be approved/);
  await assert.rejects(h.service.execute(proposal.id), /explicit approval/);
});

test("budget guardrail rejects changes over 20 percent and unsupported fields", () => {
  assert.throws(() => validateBoundedChange({ daily_budget: 100 }, { daily_budget: 121 }), /cannot exceed 20%/);
  assert.throws(() => validateBoundedChange({ name: "A" }, { name: "B" }), /Only budget and status/);
});

test("Meta permission and API errors redact the token", async () => {
  const token = "top-secret-meta-token";
  const client = createMetaMarketingClient({
    accessToken: token,
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: `denied ${token}` } }), { status: 403, headers: { "content-type": "application/json" } })
  });
  await assert.rejects(client.readObject("campaign", "123"), (error: any) => {
    assert.equal(error.code, "META_PERMISSION_DENIED");
    assert.equal(error.message.includes(token), false);
    assert.match(error.message, /\[REDACTED\]/);
    return true;
  });
});

test("Meta API failure is audited", async () => {
  const h = harness({ async writeObject() { throw Object.assign(new Error("Meta unavailable"), { code: "META_API_ERROR" }); } });
  const proposal = await h.observe();
  await h.service.approve(proposal.id, "keegan");
  await assert.rejects(h.service.execute(proposal.id, { dryRun: false, confirmLiveWrite: true }), /Meta unavailable/);
  assert.equal((await h.repo.get(proposal.id))?.execution_state, "FAILED");
});
