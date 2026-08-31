import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProductionHost } from '../../../scripts/orchestration-v4/production/host.mjs';

test('host advances intake cycles and heartbeat while an earlier poll is still in flight', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-nonblocking-'));
  let calls = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const poll = async () => {
    calls += 1;
    if (calls === 1) await firstGate;
  };

  try {
    const run = runProductionHost({
      stateRoot: root,
      poll,
      maxCycles: 2,
      intervalMs: 1,
      sleep: async () => {},
    });

    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls, 2, 'second poll must launch without waiting for the first poll');
    const heartbeat = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    assert.equal(heartbeat.cycles, 2);
    assert.ok(heartbeat.inFlightPolls >= 1, 'heartbeat should expose active in-flight polling');

    releaseFirst();
    const result = await run;
    assert.equal(result.ok, true);
    assert.equal(result.cycles, 2);
    assert.equal(result.lastPollError, null);
    assert.equal(fs.existsSync(path.join(root, 'host.lock')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('poll failure is captured without becoming an unhandled host failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-host-poll-error-'));
  let calls = 0;
  const poll = async () => {
    calls += 1;
    if (calls === 1) throw new Error('EXPECTED_POLL_FAILURE');
  };

  try {
    const result = await runProductionHost({
      stateRoot: root,
      poll,
      maxCycles: 2,
      intervalMs: 1,
      sleep: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.lastPollError, 'EXPECTED_POLL_FAILURE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
