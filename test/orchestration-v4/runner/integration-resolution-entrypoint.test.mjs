import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const entrypoint = path.resolve('scripts/orchestration-v4/runner/integration-resolution-entrypoint.mjs');

function git(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || '').trim());
  return String(result.stdout || '').trim();
}

function conflictedRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-resolution-entrypoint-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'v4@test.invalid');
  git(root, 'config', 'user.name', 'V4 Test');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const baseBranch = git(root, 'branch', '--show-current');
  git(root, 'checkout', '-b', 'pr');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'pr\n');
  git(root, 'commit', '-am', 'pr');
  git(root, 'checkout', baseBranch);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'main\n');
  git(root, 'commit', '-am', 'main');
  git(root, 'checkout', 'pr');
  const merge = spawnSync('git', ['-C', root, 'merge', baseBranch], { encoding: 'utf8' });
  assert.notEqual(merge.status, 0);
  return root;
}

function fakeOllama(root, output) {
  const script = path.join(root, 'fake-ollama');
  fs.writeFileSync(script, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(output)});\n`, { mode: 0o755 });
  fs.chmodSync(script, 0o755);
  return script;
}

function runWithOutput(root, output) {
  const ollama = fakeOllama(root, output);
  return spawnSync(process.execPath, [entrypoint, 'resolve', '30', ollama, 'fake-model'], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('integration proposal runner accepts one outer JSON markdown fence', () => {
  const root = conflictedRepo();
  try {
    const payload = { files: [{ path: 'shared.txt', content: 'resolved\n' }] };
    const result = runWithOutput(root, `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^V4_RESOLUTION /);
    const parsed = JSON.parse(result.stdout.replace(/^V4_RESOLUTION /, '').trim());
    assert.deepEqual(parsed, payload);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('integration proposal runner accepts CRLF and whitespace on outer JSON fence', () => {
  const root = conflictedRepo();
  try {
    const payload = { files: [{ path: 'shared.txt', content: 'resolved\n' }] };
    const result = runWithOutput(root, `\`\`\`json   \r\n${JSON.stringify(payload, null, 2).replace(/\n/g, '\r\n')}\r\n\`\`\`   \r\n`);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.replace(/^V4_RESOLUTION /, '').trim());
    assert.deepEqual(parsed, payload);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('integration proposal runner accepts nonbreaking indentation outside JSON strings without mutating string content', () => {
  const root = conflictedRepo();
  try {
    const payload = { files: [{ path: 'shared.txt', content: 'keep\u00a0this\n' }] };
    const pretty = JSON.stringify(payload, null, 2).replace(/^ +/gm, (spaces) => '\u00a0'.repeat(spaces.length));
    const result = runWithOutput(root, `\`\`\`json\n${pretty}\n\`\`\`\n`);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.replace(/^V4_RESOLUTION /, '').trim());
    assert.deepEqual(parsed, payload);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('integration proposal runner repairs illegal JSON backslash escapes inside content strings', () => {
  const root = conflictedRepo();
  try {
    const invalidJson = '{"files":[{"path":"shared.txt","content":"const FIELD = /^\\*\\*$/gm;\\n"}]}';
    const expected = { files: [{ path: 'shared.txt', content: 'const FIELD = /^\\*\\*$/gm;\n' }] };
    const result = runWithOutput(root, `\`\`\`json\n${invalidJson}\n\`\`\`\n`);
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.replace(/^V4_RESOLUTION /, '').trim());
    assert.deepEqual(parsed, expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('integration proposal runner still rejects commentary around fenced JSON', () => {
  const root = conflictedRepo();
  try {
    const result = runWithOutput(root, 'Here is the resolution:\n```json\n{"files":[]}\n```\n');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /V4_INTEGRATION_PROPOSAL_INVALID_JSON/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
