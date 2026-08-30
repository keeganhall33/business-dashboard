import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProductionHost } from '../../../scripts/orchestration-v4/production/host.mjs';

test('host loops, writes heartbeat, releases lock, and restarts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-'));
  let calls = 0;
  const poll = async () => { calls += 1; };
  try {
    const first = await runProductionHost({ stateRoot: root, poll, maxCycles: 2, intervalMs: 1, sleep: async () => {} });
    assert.equal(first.ok, true);
    assert.equal(first.cycles, 2);
    assert.equal(calls, 2);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.cycles, 2);
    const second = await runProductionHost({ stateRoot: root, poll, maxCycles: 1, intervalMs: 1, sleep: async () => {} });
    assert.equal(second.cycles, 1);
    assert.equal(calls, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('host fails closed when lock already exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-lock-'));
  fs.writeFileSync(path.join(root, 'host.lock'), '123\n');
  try {
    await assert.rejects(() => runProductionHost({ stateRoot: root, poll: async () => {}, maxCycles: 1 }), /V4_HOST_ALREADY_RUNNING/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
