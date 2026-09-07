import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasWatcherVisibleLabels,
  SUPPORTED_TASK_STREAMS,
  validateTaskContract,
} from '../../../scripts/orchestration-v4/production/task-contract.mjs';

const FIXED_STREAMS = [
  'CORE_INTELLIGENCE',
  'LEARNING_INTELLIGENCE',
  'FINANCIAL_INTELLIGENCE',
  'DISCOVERY_INTELLIGENCE',
  'DATA_EVIDENCE_LEARNING',
  'INTELLIGENCE_UX',
  'PRODUCTION_VALUE',
  'AGENT_ORCHESTRATION',
  'ORCHESTRATION_SYSTEMS',
  'HIGHEST_VALUE_SPECIALIST',
  'INTEGRATION_RELEASE',
  'QA_EVALUATION',
];

function body(stream) {
  const integrationReference = stream === 'INTEGRATION_RELEASE' ? '\nReferenced PR #42.\n' : '';
  return `## OrchestrationTaskV1

**task_id:** task-${stream.toLowerCase()}
**contract_version:** BUSINESS_VALUE_V2
**stream:** ${stream}
**human_approval_required:** false
**task_mutability:** IMPLEMENTATION_MUTATION_REQUIRED
**file_ownership:** src/example.mjs
**verification_owner:** INDEPENDENT
${integrationReference}
## Business outcome
Deliver useful work.

## Business reason
The roadmap requires it.

## Success metric
The task completes deterministically.

## Proof required
Focused tests and exact-head review.`;
}

test('supported streams are derived from the fixed scheduler registry', () => {
  assert.deepEqual([...SUPPORTED_TASK_STREAMS].sort(), [...FIXED_STREAMS].sort());
  for (const [index, stream] of FIXED_STREAMS.entries()) {
    const result = validateTaskContract({
      number: index + 1,
      title: stream,
      body: body(stream),
    });
    assert.equal(result.ok, true, `${stream}: ${result.errors.join(',')}`);
    assert.equal(result.task.stream, stream);
  }
});

test('unsupported stream fails closed', () => {
  const result = validateTaskContract({
    number: 100,
    title: 'Unsupported',
    body: body('UNSUPPORTED_STREAM'),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('STREAM_UNSUPPORTED'));
  assert.equal(result.task, null);
});

test('watcher visibility requires ready but not agent classification', () => {
  assert.equal(hasWatcherVisibleLabels({ labels: ['orch:ready', 'qa-evaluation'] }), true);
  assert.equal(hasWatcherVisibleLabels({ labels: [{ name: 'orch:ready' }, { name: 'orchestration-systems' }] }), true);
  assert.equal(hasWatcherVisibleLabels({ labels: ['qa-evaluation'] }), false);
});

test('terminal labels override a stale ready label', () => {
  for (const terminal of ['orch:blocked', 'orch:failed', 'orch:complete', 'orch:timed-out']) {
    assert.equal(hasWatcherVisibleLabels({ labels: ['orch:ready', terminal] }), false, terminal);
  }
});
