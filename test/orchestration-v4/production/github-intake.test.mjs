import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listReadyIssues, importReadyIssues } from '../../../scripts/orchestration-v4/production/github-intake.mjs';
import { openV4StateStore } from '../../../scripts/orchestration-v4/state-store/sqlite-store.mjs';

const BASE_SHA = 'a'.repeat(40);

function issue(number, taskId, stream, labels = ['orch:ready']) {
  return {
    number,
    title: `Task ${number}`,
    labels,
    body: `## OrchestrationTaskV1

**task_id:** ${taskId}
**contract_version:** BUSINESS_VALUE_V2
**stream:** ${stream}
**human_approval_required:** false
**task_mutability:** IMPLEMENTATION_MUTATION_REQUIRED
**file_ownership:** src/example-${number}.mjs
**verification_owner:** INDEPENDENT

## Business outcome
Deliver useful work.

## Business reason
The roadmap requires it.

## Success metric
The bounded task completes deterministically.

## Proof required
Focused tests and exact-head review.`,
  };
}

test('GitHub discovery queries orch:ready without agent-orchestration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-gh-'));
  const argsPath = path.join(dir, 'args.json');
  const ghPath = path.join(dir, 'gh');
  fs.writeFileSync(ghPath, `#!/bin/sh
printf '%s\\n' "$@" | node -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify(fs.readFileSync(0,'utf8').trim().split(/\\n/)))" "${argsPath}"
printf '[]'
`);
  fs.chmodSync(ghPath, 0o755);
  try {
    assert.deepEqual(listReadyIssues({ repoFullName: 'owner/repo', gh: ghPath }), []);
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    assert.equal(args.filter((value) => value === '--label').length, 1);
    assert.ok(args.includes('orch:ready'));
    assert.ok(!args.includes('agent-orchestration'));
    assert.ok(args.includes('open'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('imports QA and orchestration tasks without agent-orchestration label', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-db-'));
  const db = openV4StateStore(path.join(dir, 'state.sqlite'));
  try {
    const result = importReadyIssues({
      db,
      baseSha: BASE_SHA,
      issues: [
        issue(1, 'qa-task', 'QA_EVALUATION', ['orch:ready', 'qa-evaluation']),
        issue(2, 'system-task', 'ORCHESTRATION_SYSTEMS', ['orch:ready', 'orchestration-systems']),
      ],
    });
    assert.deepEqual(result.rejected, []);
    assert.equal(result.imported.length, 2);
    assert.deepEqual(
      db.prepare('SELECT issue_number,stream,state FROM tasks ORDER BY issue_number').all(),
      [
        { issue_number: 1, stream: 'QA_EVALUATION', state: 'READY' },
        { issue_number: 2, stream: 'ORCHESTRATION_SYSTEMS', state: 'READY' },
      ],
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects non-ready, terminal, unsupported, and duplicate contracts deterministically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-intake-reject-'));
  const db = openV4StateStore(path.join(dir, 'state.sqlite'));
  try {
    const first = importReadyIssues({
      db,
      baseSha: BASE_SHA,
      issues: [issue(10, 'first-task', 'QA_EVALUATION')],
    });
    assert.equal(first.imported.length, 1);

    const result = importReadyIssues({
      db,
      baseSha: BASE_SHA,
      issues: [
        issue(11, 'missing-ready', 'QA_EVALUATION', ['qa-evaluation']),
        issue(12, 'terminal-task', 'QA_EVALUATION', ['orch:ready', 'orch:blocked']),
        issue(13, 'unsupported-task', 'NOT_A_REAL_STREAM'),
        issue(10, 'new-task-id', 'QA_EVALUATION'),
        issue(14, 'first-task', 'QA_EVALUATION'),
      ],
    });

    assert.deepEqual(result.rejected.map((entry) => entry.issueNumber), [11, 12, 13]);
    assert.deepEqual(result.rejected[2].errors, ['STREAM_UNSUPPORTED']);
    assert.deepEqual(
      result.duplicates.map(({ issueNumber, conflict }) => ({ issueNumber, conflict })),
      [
        { issueNumber: 10, conflict: 'ISSUE_NUMBER' },
        { issueNumber: 14, conflict: 'TASK_ID' },
      ],
    );
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
