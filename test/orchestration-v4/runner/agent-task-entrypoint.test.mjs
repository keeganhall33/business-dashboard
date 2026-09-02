import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const entrypoint = path.resolve('scripts/orchestration-v4/runner/agent-task-entrypoint.mjs');

function makeFake(root, exitCode, capturePath = null) {
  const fake = path.join(root, `openclaw-${exitCode}.sh`);
  const capture = capturePath ? `printf '%s\n' "$@" > ${JSON.stringify(capturePath)}\n` : '';
  fs.writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "agent" ] && [ "$2" = "exec" ] && [ "$3" = "--help" ]; then\n  echo 'Usage: openclaw agent exec --config --state-dir --model --local-model-lean --cwd --json --timeout'\n  exit 0\nfi\n${capture}echo '{"ok":true}'\nexit ${exitCode}\n`);
  fs.chmodSync(fake, 0o755);
  return fake;
}

test('successful adapter emits trusted MODEL_RESULT event and injects exact absolute workspace mutation guidance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });
    assert.match(output, /V4_EVENT \{"kind":"MODEL_RESULT","data":"OPENCLAW_EXIT_0"\}/);
    const args = fs.readFileSync(capture, 'utf8');
    assert.match(args, new RegExp(`V4_RUNTIME_WORKSPACE_ROOT: ${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(args, /Use exec for pwd, git status, ls, find, directory inspection/i);
    assert.match(args, /Use read only for a specific file path that you already know exists/i);
    assert.match(args, /Never use read on a directory, on pwd, or as a substitute for ls\/find/i);
    assert.match(args, /target file does not exist yet, create it with apply_patch or exec/i);
    assert.match(args, /After any tool failure, inspect the failure and switch strategy/i);
    assert.match(args, /Do not repeat the same invalid read or path pattern/i);
    assert.match(args, /Native write and edit tools are intentionally disabled/i);
    assert.match(args, /Perform file mutations only with apply_patch or exec/i);
    assert.match(args, /verify pwd equals V4_RUNTIME_WORKSPACE_ROOT/i);
    assert.match(args, /confirm git status shows the intended change/i);
    assert.match(args, /IMPLEMENTATION_MUTATION_REQUIRED tasks, do not finish successfully until the workspace contains an intended mutation/i);
    assert.match(args, /test prompt/);
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
