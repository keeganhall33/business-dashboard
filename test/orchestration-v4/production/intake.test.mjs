import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openV4StateStore, getTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { importReadyIssues } from '../../../scripts/orchestration-v4/production/github-intake.mjs';
import { parseTaskContract, validateTaskContract } from '../../../scripts/orchestration-v4/production/task-contract.mjs';
import { promptForTask, taskAttemptLimit } from '../../../scripts/orchestration-v4/production/daemon.mjs';

function issue(number, overrides = {}) {
  return {
    number,
    title: `Task ${number}`,
    labels: [{ name: 'agent-orchestration' }, { name: 'orch:ready' }],
    body: `## OrchestrationTaskV1\n**task_id:** task-${number}\n**stream:** CORE_INTELLIGENCE\n**human_approval_required:** false\n**task_mutability:** IMPLEMENTATION_MUTATION_REQUIRED\n**file_ownership:** src/example/**\n\n## Acceptance\nCreate the focused implementation and prove it.`,
    ...overrides,
  };
}

test('ready intake is idempotent and preserves immutable admitted SHA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    const first = importReadyIssues({ db, issues: [issue(10)], baseSha: 'a'.repeat(40) });
    assert.equal(first.imported.length, 1);
    assert.equal(getTask(db, 'task-10').base_sha, 'a'.repeat(40));
    const second = importReadyIssues({ db, issues: [issue(10)], baseSha: 'b'.repeat(40) });
    assert.equal(second.imported.length, 0);
    assert.equal(second.duplicates.length, 1);
    assert.equal(getTask(db, 'task-10').base_sha, 'a'.repeat(40));
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('duplicate task id on a different issue is isolated and does not block later intake', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-task-id-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    importReadyIssues({ db, issues: [issue(40)], baseSha: 'a'.repeat(40) });
    const duplicateTaskId = issue(41, {
      body: issue(41).body.replace('task-41', 'task-40'),
    });
    const result = importReadyIssues({
      db,
      issues: [duplicateTaskId, issue(42)],
      baseSha: 'b'.repeat(40),
    });

    assert.equal(result.imported.length, 1);
    assert.equal(result.imported[0].taskId, 'task-42');
    assert.deepEqual(result.duplicates, [{
      issueNumber: 41,
      taskId: 'task-40',
      state: 'READY',
      conflict: 'TASK_ID',
    }]);
    assert.equal(getTask(db, 'task-42').base_sha, 'b'.repeat(40));
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('production worker prompt contains persisted title body ownership and mutability', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-prompt-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    importReadyIssues({ db, issues: [issue(11)], baseSha: 'd'.repeat(40) });
    const prompt = promptForTask(getTask(db, 'task-11'));
    assert.match(prompt, /Title: Task 11/);
    assert.match(prompt, /IMPLEMENTATION_MUTATION_REQUIRED/);
    assert.match(prompt, /src\/example\/\*\*/);
    assert.match(prompt, /Create the focused implementation and prove it/);
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('malformed, human-gated, ambiguous-mutability, and non-watcher-visible tasks fail closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-reject-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    const human = issue(20, { body: issue(20).body.replace('human_approval_required:** false', 'human_approval_required:** true') });
    const unlabeled = issue(21, { labels: [{ name: 'agent-orchestration' }] });
    const missingOwnership = issue(22, { body: issue(22).body.replace('**file_ownership:** src/example/**', '') });
    const ambiguousMutability = issue(23, { body: issue(23).body.replace('IMPLEMENTATION_MUTATION_REQUIRED', 'write') });
    const result = importReadyIssues({ db, issues: [human, unlabeled, missingOwnership, ambiguousMutability], baseSha: 'c'.repeat(40) });
    assert.equal(result.imported.length, 0);
    assert.equal(result.rejected.length, 4);
    assert.ok(result.rejected.find((entry) => entry.issueNumber === 23)?.errors.includes('TASK_MUTABILITY_INVALID'));
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('integration contract requires an explicit referenced PR', () => {
  const noPr = issue(30, { body: issue(30).body.replace('CORE_INTELLIGENCE', 'INTEGRATION_RELEASE') });
  assert.equal(validateTaskContract(noPr).ok, false);
  const withPr = issue(31, { body: `${issue(31).body.replace('CORE_INTELLIGENCE', 'INTEGRATION_RELEASE')}\nTarget PR: #705` });
  assert.equal(validateTaskContract(withPr).ok, true);
});

test('business-value v2 requires outcome reason metric proof and independent verification', () => {
  const incomplete = issue(50, {
    body: `${issue(50).body}\n**contract_version:** BUSINESS_VALUE_V2\n**verification_owner:** SELF`,
  });
  const rejected = validateTaskContract(incomplete);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes('BUSINESS_OUTCOME_REQUIRED'));
  assert.ok(rejected.errors.includes('BUSINESS_REASON_REQUIRED'));
  assert.ok(rejected.errors.includes('SUCCESS_METRIC_REQUIRED'));
  assert.ok(rejected.errors.includes('PROOF_REQUIRED'));
  assert.ok(rejected.errors.includes('INDEPENDENT_VERIFICATION_REQUIRED'));

  const complete = issue(51, {
    body: `${issue(51).body}
**contract_version:** BUSINESS_VALUE_V2
**verification_owner:** INDEPENDENT

## Business outcome
Keegan receives one ranked next action.

## Business reason
Reduce decision time and focus work on revenue.

## Success metric
One action is ranked first with a deterministic score.

## Proof required
Focused tests and a current output fixture.`,
  });
  const accepted = validateTaskContract(complete);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.task.businessOutcome, 'Keegan receives one ranked next action.');
  assert.equal(accepted.task.verificationOwner, 'INDEPENDENT');
});

test('production prompt carries business value and proof without breaking legacy tasks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-business-value-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    const businessIssue = issue(52, {
      body: `${issue(52).body}
**contract_version:** BUSINESS_VALUE_V2
**verification_owner:** INDEPENDENT

## Business outcome
Make the next revenue move visible.

## Business reason
Protect Keegan's attention.

## Success metric
The top move is deterministic.

## Proof required
Current-run test output.`,
    });
    importReadyIssues({ db, issues: [businessIssue], baseSha: 'e'.repeat(40) });
    const prompt = promptForTask(getTask(db, 'task-52'));
    assert.match(prompt, /Business outcome: Make the next revenue move visible/);
    assert.match(prompt, /Success metric: The top move is deterministic/);
    assert.match(prompt, /Verification owner: INDEPENDENT/);
    assert.match(prompt, /Never treat your own confidence as verification/);
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('task-specific attempt ceilings are parsed and enforced by the production runner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-attempt-limit-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    const bounded = issue(53, { body: `${issue(53).body}\n**max_attempts:** 1` });
    const imported = importReadyIssues({ db, issues: [bounded], baseSha: 'f'.repeat(40) });
    assert.equal(imported.imported.length, 1);
    assert.equal(imported.imported[0].maxAttempts, 1);
    assert.equal(taskAttemptLimit(getTask(db, 'task-53')), 1);

    const invalid = validateTaskContract(issue(54, { body: `${issue(54).body}\n**max_attempts:** 0` }));
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.includes('MAX_ATTEMPTS_INVALID'));
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('dependency and risk metadata enter the contract while irreversible work stays closed', () => {
  const dependencyIssue = issue(61, {
    body: `${issue(61).body}
**dependencies_json:** [{"task_id":"task-60","artifact":"verified-plan"}]
**mutation_kinds:** SHARED_UTILITY
**affected_consumers:** 8
**rollback_verified:** true`,
  });
  const parsed = validateTaskContract(dependencyIssue);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.task.dependencies, [{ taskId: 'task-60', artifact: 'verified-plan' }]);
  assert.equal(parsed.task.riskProfile.lane, 'WIDE_REVERSIBLE');

  const paymentIssue = issue(62, {
    body: `${issue(62).body}
**mutation_kinds:** PAYMENT
**affected_consumers:** 1
**rollback_verified:** true`,
  });
  const payment = validateTaskContract(paymentIssue);
  assert.equal(payment.ok, false);
  assert.ok(payment.errors.includes('HARD_TO_REVERSE_HUMAN_APPROVAL_REQUIRED'));
});

test('missing dependency fails closed instead of becoming runnable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-dependency-'));
  const db = openV4StateStore(path.join(root, 'state.sqlite'));
  try {
    const dependent = issue(63, { body: `${issue(63).body}\n**dependencies_json:** [{"task_id":"missing","artifact":"result"}]` });
    const result = importReadyIssues({ db, issues: [dependent], baseSha: 'f'.repeat(40) });
    assert.equal(result.imported.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(getTask(db, 'task-63').state, 'BLOCKED');
    assert.equal(getTask(db, 'task-63').terminal_reason, 'DEPENDENCY_CONTRACT_INVALID');
  } finally { db.close(); fs.rmSync(root, { recursive: true, force: true }); }
});

test('vertical-slice contracts require outcome flow completion and quality evidence', () => {
  const body = `${issue(40).body}
**milestone:** FOLLOWUP_FLOW
**priority:** P1
**delivery_mode:** VERTICAL_SLICE
**slice_id:** relationship-followup-v1
**slice_stage:** IMPLEMENTATION
**feature_name:** Relationship follow-up
**release_target:** V1
**launch_policy:** IMMEDIATE_AFTER_VERIFICATION
**bundle_reason:** NOT_BUNDLED
**rollback_condition:** Rollback if production verification fails.
**depends_on:** NONE
**quality_gates:** DIFF_CHECK,TYPECHECK,TEST,LINT
**outcome:** Keegan sees the correct follow-up at the correct time.
**user_flow:** communication -> current state -> recommendation -> approval -> outcome
**definition_of_done:** Real data persists, appears in the dashboard, informs an agent, and captures the outcome.
**production_evidence:** NOT_THIS_STAGE`;
  const valid = validateTaskContract(issue(40, { body }));
  assert.equal(valid.ok, true);
  assert.equal(valid.task.deliveryMode, 'VERTICAL_SLICE');
  assert.equal(valid.task.sliceId, 'relationship-followup-v1');

  const invalid = validateTaskContract(issue(41, { body: body.replace('**definition_of_done:** Real data persists, appears in the dashboard, informs an agent, and captures the outcome.\n', '').replace('DIFF_CHECK,TYPECHECK,TEST,LINT', 'DIFF_CHECK') }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes('DEFINITION_OF_DONE_REQUIRED'));
  assert.ok(invalid.errors.includes('QUALITY_GATE_TYPECHECK_REQUIRED'));
  assert.ok(invalid.errors.includes('QUALITY_GATE_TEST_REQUIRED'));
});

test('production verification fails closed without named production evidence', () => {
  const body = `${issue(42).body}
**priority:** P1
**delivery_mode:** VERTICAL_SLICE
**slice_id:** executive-brief-v1
**slice_stage:** PRODUCTION_VERIFICATION
**feature_name:** Executive brief
**release_target:** V1
**launch_policy:** IMMEDIATE_AFTER_VERIFICATION
**bundle_reason:** NOT_BUNDLED
**rollback_condition:** Rollback if the live brief is misleading or unavailable.
**depends_on:** implementation-brief
**quality_gates:** DIFF_CHECK,TYPECHECK,TEST
**outcome:** The daily brief reliably identifies the next decision.
**user_flow:** live evidence -> fusion -> brief -> decision
**definition_of_done:** The live production flow is observed end to end.`;
  const result = validateTaskContract(issue(42, { body }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('PRODUCTION_EVIDENCE_REQUIRED'));
});

test('task parser accepts real GitHub issue-form headings and multiline values', () => {
  const parsed = parseTaskContract(`### task_id
form-task-1

### delivery_mode
VERTICAL_SLICE

### definition_of_done
Real data is persisted.
The production outcome is verified.

### quality_gates
DIFF_CHECK,TYPECHECK,TEST`);
  assert.equal(parsed.task_id, 'form-task-1');
  assert.equal(parsed.delivery_mode, 'VERTICAL_SLICE');
  assert.match(parsed.definition_of_done, /production outcome/);
});
