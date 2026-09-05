import assert from 'node:assert/strict';
import test from 'node:test';
import { createCorrectionPacket, CORRECTION_ACTIONS, correctionPrompt } from '../../../scripts/orchestration-v4/policy/correction-loop.mjs';
import { activeConstraints, createLearningConstraint, promoteLearningConstraint } from '../../../scripts/orchestration-v4/policy/learning-constraints.mjs';
import { classifyRiskLane, RISK_LANES } from '../../../scripts/orchestration-v4/policy/risk-lane.mjs';
import { evaluateNodeReadiness, findFalseDependencies, validateWorkGraph } from '../../../scripts/orchestration-v4/policy/work-graph.mjs';
import { createCodeNodeRegistry, executeCodeNode } from '../../../scripts/orchestration-v4/runner/code-node.mjs';
import { snapshotGraphTelemetry, summarizeGraphTelemetry } from '../../../scripts/orchestration-v4/telemetry/work-graph.mjs';

test('graph requires named artifacts, rejects cycles, and releases only satisfied dependencies', () => {
  const graph = validateWorkGraph({
    nodes: [{ id: 'split' }, { id: 'a' }, { id: 'b' }, { id: 'merge' }],
    edges: [
      { from: 'split', to: 'a', artifact: 'slice-a' },
      { from: 'split', to: 'b', artifact: 'slice-b' },
      { from: 'a', to: 'merge', artifact: 'result-a' },
      { from: 'b', to: 'merge', artifact: 'result-b' },
    ],
  });
  assert.equal(evaluateNodeReadiness({ nodeId: 'merge', dependencies: graph.edges, states: { a: 'COMPLETE', b: 'RUNNING' } }).runnable, false);
  assert.equal(evaluateNodeReadiness({ nodeId: 'merge', dependencies: graph.edges, states: { a: 'COMPLETE', b: 'COMPLETE' } }).runnable, true);
  assert.deepEqual(findFalseDependencies({ edges: graph.edges, consumers: { a: [], b: ['slice-b'], merge: ['result-a', 'result-b'] } }), [graph.edges[0]]);
  assert.throws(() => validateWorkGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b', artifact: 'x' }, { from: 'b', to: 'a', artifact: 'y' }] }), /CYCLE/);
  assert.throws(() => validateWorkGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }] }), /ARTIFACT/);
});

test('correction returns one scoped unit and requires replanning on the third failed correction', () => {
  const first = createCorrectionPacket({ unitId: 'handlers', verdict: 'RED', reason: 'test failed', evidence: 'expected 302 got 200', scope: 'handlers/auth.py', attempt: 1 });
  const third = createCorrectionPacket({ ...first, attempt: 3 });
  assert.equal(first.action, CORRECTION_ACTIONS.RETRY_UNIT);
  assert.equal(third.action, CORRECTION_ACTIONS.REPLAN);
  assert.match(correctionPrompt(first), /Change nothing outside SCOPE/);
});

test('risk gates use reversibility and blast radius instead of confidence', () => {
  assert.equal(classifyRiskLane({ mutationKinds: ['COPY'], affectedConsumers: 1, rollbackVerified: true }).lane, RISK_LANES.CONTAINED_REVERSIBLE);
  assert.equal(classifyRiskLane({ mutationKinds: ['SHARED_UTILITY'], affectedConsumers: 8, rollbackVerified: true }).lane, RISK_LANES.WIDE_REVERSIBLE);
  const payment = classifyRiskLane({ mutationKinds: ['PAYMENT'], affectedConsumers: 1, rollbackVerified: true });
  assert.equal(payment.lane, RISK_LANES.HARD_TO_REVERSE);
  assert.equal(payment.autonomous, false);
});

test('learning constraints need evidence, provenance, approval, applicability, and expiry', () => {
  const candidate = createLearningConstraint({
    id: 'preserve-keywords', rule: 'Preserve keyword arguments', appliesWhen: 'adapter', evidence: 'test failed then passed',
    sourceTaskId: 'task-1', sourceCommit: 'a'.repeat(40), expiresAt: '2030-01-01T00:00:00.000Z',
  });
  const active = promoteLearningConstraint(candidate, { approvedBy: 'reviewer', now: '2029-01-01T00:00:00.000Z' });
  assert.deepEqual(activeConstraints([active], { now: '2029-02-01T00:00:00.000Z', context: 'python adapter work' }), [active]);
  assert.deepEqual(activeConstraints([active], { now: '2031-01-01T00:00:00.000Z', context: 'adapter' }), []);
  const high = createLearningConstraint({ ...candidate, id: 'high', impact: 'HIGH' });
  assert.throws(() => promoteLearningConstraint(high, { approvedBy: 'AUTOMATION' }), /HUMAN_REQUIRED/);
});

test('deterministic transforms run as code nodes and graph telemetry reports path health', async () => {
  const registry = createCodeNodeRegistry({ 'dedupe-values': (values) => [...new Set(values)].sort() });
  const result = await executeCodeNode({ registry, name: 'dedupe-values', input: ['b', 'a', 'b'] });
  assert.deepEqual(result.output, ['a', 'b']);
  const summary = summarizeGraphTelemetry({
    nodes: [{ state: 'COMPLETE', attempt: 1 }, { state: 'ACCEPTED', attempt: 2 }, { state: 'REPLAN_REQUIRED' }],
    events: [{ type: 'CORRECTION_ATTEMPT' }, { type: 'FALSE_DEPENDENCY_REMOVED' }, { type: 'HUMAN_WAIT_ENDED', durationMs: 2500 }],
    now: '2029-01-01T00:00:00.000Z',
  });
  assert.equal(summary.firstPassAcceptanceRate, 0.5);
  assert.equal(summary.replanCount, 1);
  assert.equal(summary.humanBlockedMs, 2500);
  const db = { prepare: (sql) => ({ all: () => sql.includes('FROM tasks') ? [{ state: 'COMPLETE', attempt: 1 }] : [{ type: 'HUMAN_WAIT_ENDED', payload_json: '{"durationMs":100}' }] }) };
  assert.equal(snapshotGraphTelemetry(db, { now: '2029-01-01T00:00:00.000Z' }).humanBlockedMs, 100);
});
