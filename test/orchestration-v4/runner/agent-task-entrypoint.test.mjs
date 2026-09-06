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
    assert.ok(args.includes('*** Delete File:'), 'runtime prompt must show *** Delete File:');
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

test('runtime prompt contains concrete Add File + line grammar', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-add-grammar-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Add File grammar: every content line MUST begin with +
    assert.ok(args.includes('Add File: every content line MUST begin with +'), 'Add File directive must specify + prefix requirement');
    assert.ok(args.includes('*** Add File: relative-or-absolute-path'), 'Add File header pattern documented');
    assert.ok(args.includes('+ new line one'), 'Example Add File content shows + prefixed lines');
    assert.ok(args.includes('*** End Patch)'), 'Add File example includes proper terminator');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt contains Update File @@ hunk grammar', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-update-grammar-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Update File grammar: use @@ hunks with context and +/- lines; never emit empty hunk
    assert.ok(args.includes('Update File: use @@ hunks with context and +/- lines;'), 'Update File directive must specify hunk format');
    assert.ok(args.includes('never emit an empty Update File directive'), 'Update File must not be empty');
    assert.ok(args.includes('@@ -1,3 +1,4 @@'), 'Example shows proper hunk header with context and additions');
    assert.ok(args.includes('- removed line'), 'Hunk example shows removal lines');
    assert.ok(args.includes('+ added line'), 'Hunk example shows addition lines');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt contains Delete File versus Remove File behavior', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-delete-grammar-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Delete File rules
    assert.ok(args.includes('Delete File: use only the supported Delete File directive'), 'Delete File directive documented');
    assert.ok(args.includes('never emit Remove File or unsupported syntax'), 'Remove File must not be used');
    assert.ok(args.includes('*** Delete File: relative-or-absolute-path'), 'Example shows proper Delete File header');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt prohibits conflicting directives for same path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-conflicting-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // One path must NOT receive conflicting Add, Update, or Delete directives
    assert.ok(args.includes('One path must NOT receive conflicting Add, Update, or Delete directives in one payload'), 'Conflicting directive prohibition documented');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt states End Patch must be final line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-terminator-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // End Patch must be final line
    assert.ok(args.includes('*** End Patch MUST be the final line of the payload'), 'End Patch final-line rule documented');
    assert.ok(args.includes('no content may follow'), 'No content after End Patch documented');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt documents malformed Add File example with failover behavior', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-malformed-add-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Malformed Add File example
    assert.ok(args.includes('Example 1: Malformed Add File'), 'Malformed Add File example documented');
    assert.ok(args.includes('raw line without prefix'), 'Example shows raw content without + prefix');
    assert.ok(args.includes('Parser error. Failover: use shell exec'), 'Failover behavior documented');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt documents missing End Patch terminator example', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-missing-terminator-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Missing End Patch example
    assert.ok(args.includes('Example 2: Missing End Patch terminator'), 'Missing terminator example documented');
    assert.ok(args.includes('stray content after hunk'), 'Example shows stray content');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt documents conflicting directives example', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-conflicting-2'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Conflicting directives example
    assert.ok(args.includes('Example 3: Conflicting directives for same path'), 'Conflicting directives example documented');
    assert.ok(args.includes('*** Update File: file.txt'), 'Update File directive in example');
    assert.ok(args.includes('*** Add File: file.txt'), 'Add File directive conflicting with Update');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt documents empty hunk example', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-empty-hunk-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Empty hunk example
    assert.ok(args.includes('Example 4: Empty Update File hunk'), 'Empty hunk example documented');
    assert.ok(args.includes('@@ -0,0 +0,0 @@'), 'Example shows empty hunk header');
    assert.ok(args.includes('Not allowed. Failover: use shell exec'), 'Failover for empty hunk documented');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime prompt documents unsupported Remove File syntax example', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-remove-file-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // Remove File unsupported example
    assert.ok(args.includes('Example 5: Unsupported Remove File syntax'), 'Remove File unsupported example documented');
    assert.ok(args.includes('*** Remove File: old-file.txt'), 'Example shows unsupported Remove File directive');
    assert.ok(args.includes('Parser error (Remove File unsupported)'), 'Parser error for Remove File documented');

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workspace mutation guidance includes git status verification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-agent-entrypoint-git-check-'));
  try {
    const config = path.join(root, 'config.json');
    const state = path.join(root, 'state');
    const capture = path.join(root, 'args.txt');
    fs.writeFileSync(config, '{}\n');
    fs.mkdirSync(state);
    const output = execFileSync(process.execPath, [entrypoint, 'test prompt', config, state, '5', makeFake(root, 0, capture)], { cwd: root, encoding: 'utf8' });

    const args = fs.readFileSync(capture, 'utf8');

    // git status verification
    assert.match(args, /confirm git status shows the intended owned-path change/i);

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
