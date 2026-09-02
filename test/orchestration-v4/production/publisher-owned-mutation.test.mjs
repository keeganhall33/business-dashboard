import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { classifyImplementationMutations } from '../../../scripts/orchestration-v4/production/publisher.mjs';

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-publisher-owned-'));
  git(root, 'init');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'base');
  return root;
}

test('incidental unowned workspace files do not satisfy implementation mutation requirement', () => {
  const root = createRepo();
  try {
    fs.mkdirSync(path.join(root, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(root, 'memory', '2026-09-02.md'), 'runtime memory\n');

    const result = classifyImplementationMutations({
      workspacePath: root,
      fileOwnership: 'src/lib/discovery-intelligence/followup-label.ts, test/discovery-intelligence/followup-label.test.ts',
    });

    assert.deepEqual(result.ownedChangedPaths, []);
    assert.deepEqual(result.unownedChangedPaths, ['memory/2026-09-02.md']);
    assert.deepEqual(result.changedPaths, ['memory/2026-09-02.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('owned mutations are isolated from unrelated workspace noise', () => {
  const root = createRepo();
  try {
    fs.mkdirSync(path.join(root, 'src/lib/discovery-intelligence'), { recursive: true });
    fs.mkdirSync(path.join(root, 'memory'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/discovery-intelligence/followup-label.ts'), 'export const value = 1;\n');
    fs.writeFileSync(path.join(root, 'memory', '2026-09-02.md'), 'runtime memory\n');

    const result = classifyImplementationMutations({
      workspacePath: root,
      fileOwnership: 'src/lib/discovery-intelligence/followup-label.ts',
    });

    assert.deepEqual(result.ownedChangedPaths, ['src/lib/discovery-intelligence/followup-label.ts']);
    assert.deepEqual(result.unownedChangedPaths, ['memory/2026-09-02.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('directory ownership covers descendant mutations without broadening to sibling paths', () => {
  const root = createRepo();
  try {
    fs.mkdirSync(path.join(root, 'test/orchestration-v4/production'), { recursive: true });
    fs.mkdirSync(path.join(root, 'test/orchestration-v4/other'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test/orchestration-v4/production/a.test.mjs'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'test/orchestration-v4/other/b.test.mjs'), 'export {};\n');

    const result = classifyImplementationMutations({
      workspacePath: root,
      fileOwnership: 'test/orchestration-v4/production',
    });

    assert.deepEqual(result.ownedChangedPaths, ['test/orchestration-v4/production/a.test.mjs']);
    assert.deepEqual(result.unownedChangedPaths, ['test/orchestration-v4/other/b.test.mjs']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
