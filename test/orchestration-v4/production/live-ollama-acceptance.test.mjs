import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runLiveOllamaAcceptance } from '../../../scripts/orchestration-v4/production/live-ollama-acceptance.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

test('live Ollama acceptance uses disposable exact-base workspace and fake local adapter', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-live-ollama-test-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repo, 'README.md'), 'base\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'base');
  const baseSha = git(repo, 'rev-parse', 'HEAD');

  const fake = path.join(root, 'openclaw');
  fs.writeFileSync(fake, `#!/bin/sh\nif [ "$3" = "--help" ] || [ "$2" = "--help" ]; then\n  echo 'Usage: openclaw agent exec [prompt] --config <path> --state-dir <path> --model <model> --cwd <path> --json --timeout <seconds>'\n  exit 0\nfi\nprintf '%s\\n' '{"provider":"ollama","model":"qwen3.5:9b","result":{"STATUS":"PASS"}}'\n`, { mode: 0o755 });

  const report = await runLiveOllamaAcceptance({ repoRoot: repo, baseSha, openclaw: fake, timeoutSeconds: 5 });
  assert.equal(report.ok, true);
  assert.equal(report.model, 'ollama/qwen3.5:9b');
  assert.equal(report.exitCode, 0);
  assert.equal(report.githubMutationPerformed, false);
  assert.equal(report.stdout.jsonLineCount, 1);
  assert.ok(report.stdout.topLevelKeys.includes('provider'));
  assert.equal(git(repo, 'worktree', 'list', '--porcelain').includes('v4-live-ollama'), false);
  fs.rmSync(root, { recursive: true, force: true });
});
