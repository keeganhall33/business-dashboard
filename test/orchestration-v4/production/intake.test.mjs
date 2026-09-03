import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openV4StateStore, getTask } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';
import { importReadyIssues } from '../../../scripts/orchestration-v4/production/github-intake.mjs';
import { validateTaskContract } from '../../../scripts/orchestration-v4/production/task-contract.mjs';
import { promptForTask } from '../../../scripts/orchestration-v4/production/daemon.mjs';

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
    const unlabeled = issue(21, { labels: [{ name: 'orch:ready' }] });
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
