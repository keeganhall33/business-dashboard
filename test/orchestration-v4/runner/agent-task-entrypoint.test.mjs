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
  fs.writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "agent" ] && [ "$2" = "exec" ] && [ "$3" = "--help" ]; then\n  echo 'Usage: openclaw agent exec --config --state-dir --model --code-mode --local-model-lean --cwd --json --timeout'\n  exit 0\nfi\n${capture}echo '{"ok":true}'\nexit ${exitCode}\n`);
  fs.chmodSync(fake, 0o755);
  return fake;
}

test('successful adapter emits trusted MODEL_RESULT event and injects direct-shell workspace mutation guidance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-'));
  try {
    const canonicalRoot = fs.realpathSync(root);
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });
    assert.match(output, /V4_EVENT \{"kind":"MODEL_RESULT","data":"OPENCLAW_EXIT_0"\}/);
    const args = fs.readFileSync(capture, 'utf8');

    // Workspace-root and direct-shell safety rules
    assert.match(args, new RegExp(`V4_RUNTIME_WORKSPACE_ROOT: ${canonicalRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(args, /normal direct coding tools, not OpenClaw Code Mode/i);
    assert.match(args, /exec tool runs shell commands/i);
    assert.match(args, /Use exec for pwd, git status, ls, find, directory inspection/i);
    assert.match(args, /Use read only for a specific file path that you already know exists/i);
    assert.match(args, /Never use read on a directory, on pwd, or as a substitute for ls\/find/i);
    assert.match(args, /target file does not exist yet, create it immediately with shell exec/i);
    assert.match(args, /mkdir -p/i);
    assert.match(args, /Do not search for a separate write tool/i);
    assert.match(args, /After any tool failure, inspect the failure and switch strategy/i);
    assert.match(args, /Do not repeat the same invalid read, code-mode, or path pattern/i);
    assert.match(args, /Perform file mutations only with apply_patch or shell exec/i);
    assert.match(args, /verify pwd equals V4_RUNTIME_WORKSPACE_ROOT/i);
    assert.match(args, /confirm git status shows the intended owned-path change/i);
    assert.match(args, /IMPLEMENTATION_MUTATION_REQUIRED tasks, do not finish successfully until the workspace contains the intended mutation/i);
    assert.doesNotMatch(args, /^--code-mode$/m);
    assert.match(args, /test prompt/);

    // Apply patch header grammar guidance (new requirements)
    assert.match(args, /apply_patch header grammar/i);
    assert.match(args, /\*\*\* Begin Patch/i);
    assert.match(args, /\*\*\* Update File:/i);
    assert.match(args, /\*\*\* Add File:/i);
    assert.match(args, /\*\*\* Delete File:/i);
    assert.match(args, /\*\*\* End Patch/i);
    assert.match(args, /Bare paths immediately after \*\*\* Begin Patch are rejected/i);
    assert.match(args, /Do not emit malformed apply_patch payloads/i);
    assert.match(args, /Repository-relative paths are preferred for apply_patch/i);
    assert.match(args, /Absolute paths remain allowed only when expressed in a valid patch header/i);
    assert.match(args, /After the first apply_patch format\/parser failure/i);
    assert.match(args, /do not retry the same patch shape/i);
    assert.match(args, /Correct the header grammar once or immediately switch to deterministic shell exec mutation/i);
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

test('runtime prompt contains all required apply_patch safety and grammar guidance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-grammar-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Verify all acceptance criteria for apply_patch guidance
    assert.ok(args.includes('apply_patch header grammar'), 'runtime prompt must contain "apply_patch header grammar" section');
    assert.ok(args.includes('*** Begin Patch'), 'runtime prompt must show valid *** Begin Patch header');
    assert.ok(args.includes('*** Update File:'), 'runtime prompt must show *** Update File: header pattern');
    assert.ok(args.includes('*** Add File:'), 'runtime patch must mention *** Add File:');
    assert.ok(args.includes('*** Delete File:'), 'runtime patch must mention *** Delete File:');
    assert.ok(args.includes('*** End Patch'), 'runtime prompt must show *** End Patch header');
    assert.ok(/Bare paths immediately after \*\*\* Begin Patch are rejected/i.test(args), 'bare path rejection guidance present');
    assert.ok(/Do not emit malformed apply_patch payloads/i.test(args), 'malformed payload prohibition present');
    assert.ok(/Repository-relative paths are preferred for apply_patch/i.test(args), 'relative-path preference documented');
    assert.ok(/Absolute paths remain allowed only when expressed in a valid patch header/i.test(args), 'absolute path restriction clearly stated');
    assert.ok(/After the first apply_patch format\/parser failure/i.test(args), 'one-error failover documented');
    assert.ok(/do not retry the same patch shape/i.test(args), 'no retry on malformed patch documented');
    assert.ok(/Correct the header grammar once or immediately switch to deterministic shell exec mutation/i.test(args), 'correction path described');

    // Verify existing workspace/direct-shell safety guidance preserved
    assert.match(args, /V4_RUNTIME_WORKSPACE_ROOT:/i);
    assert.match(args, /authoritative workspace/i);
    assert.match(args, /normal direct coding tools, not OpenClaw Code Mode/i);
    assert.match(args, /Do not write into the OpenClaw state directory/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
