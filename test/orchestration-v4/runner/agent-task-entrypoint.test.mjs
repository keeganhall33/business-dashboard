import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const entrypoint = path.resolve('scripts/orchestration-v4/runner/agent-task-entrypoint.mjs');

function makeFake(root, exitCode) {
  const fake = path.join(root, `openclaw-${exitCode}.sh`);
  fs.writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "agent" ] && [ "$2" = "exec" ] && [ "$3" = "--help" ]; then\n  echo 'Usage: openclaw agent exec --config --state-dir --model --local-model-lean --cwd --json --timeout'\n  exit 0\nfi\necho '{"ok":true}'\nexit ${exitCode}\n`);
  fs.chmodSync(fake, 0o755);
  return fake;
}

test('successful adapter emits trusted MODEL_RESULT event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0)], { cwd: root, encoding: 'utf8' });
    assert.match(output, /V4_EVENT \{"kind":"MODEL_RESULT","data":"OPENCLAW_EXIT_0"\}/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('failed adapter does not emit MODEL_RESULT event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-fail-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    let stdout = '';
    try {
      execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 2)], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      stdout = String(error.stdout ?? '');
    }
    assert.doesNotMatch(stdout, /MODEL_RESULT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
