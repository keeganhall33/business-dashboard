import fs from 'node:fs';
import path from 'node:path';
import { openV4StateStore } from '../state-store/sqlite-store.mjs';
import { runProductionPoll } from './daemon.mjs';

export async function runProductionHost({ stateRoot, intervalMs = 20_000, poll = runProductionPoll, pollArgs = {}, maxCycles = Infinity, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!path.isAbsolute(stateRoot)) throw new Error('V4_HOST_STATE_ROOT_REQUIRED');
  fs.mkdirSync(stateRoot, { recursive: true });
  const lockPath = path.join(stateRoot, 'host.lock');
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('V4_HOST_ALREADY_RUNNING');
    throw error;
  }
  fs.writeFileSync(lockFd, `${process.pid}\n`);
  const db = openV4StateStore(path.join(stateRoot, 'state.sqlite'));
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  let cycles = 0;
  let lastPollError = null;
  const inFlightPolls = new Set();

  const launchPoll = () => {
    let tracked;
    tracked = Promise.resolve()
      .then(() => poll({ db, ...pollArgs }))
      .then(
        () => ({ ok: true }),
        (error) => {
          lastPollError = String(error?.message || error);
          return { ok: false, error: lastPollError };
        },
      )
      .finally(() => inFlightPolls.delete(tracked));
    inFlightPolls.add(tracked);
    return tracked;
  };

  try {
    while (!stopped && cycles < maxCycles) {
      cycles += 1;
      launchPoll();
      fs.writeFileSync(path.join(stateRoot, 'heartbeat.json'), `${JSON.stringify({
        pid: process.pid,
        cycles,
        inFlightPolls: inFlightPolls.size,
        lastPollError,
        generatedAt: new Date().toISOString(),
      })}\n`);
      if (!stopped && cycles < maxCycles) await sleep(intervalMs);
    }
    if (inFlightPolls.size) await Promise.allSettled([...inFlightPolls]);
    return { ok: true, cycles, stopped, lastPollError };
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    db.close();
    try { fs.closeSync(lockFd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stateRoot = path.resolve(process.env.JEEVES_V4_STATE_ROOT || path.join(process.env.HOME || '.', '.openclaw/state/orchestration-v4'));
  const repoRoot = path.resolve(process.env.JEEVES_V4_REPO_ROOT || path.join(process.env.HOME || '.', '.openclaw/runtime-v4/business-dashboard'));
  const workspaceRoot = path.resolve(process.env.JEEVES_V4_WORKSPACE_ROOT || path.join(process.env.HOME || '.', '.openclaw/workspaces-v4'));
  const configPath = path.resolve(process.env.JEEVES_V4_CONFIG || process.env.OPENCLAW_CONFIG_PATH || path.join(process.env.HOME || '.', '.openclaw/openclaw.json'));
  await runProductionHost({ stateRoot, pollArgs: { repoRoot, repoFullName: 'keeganhall33/business-dashboard', workspaceRoot, configPath } });
}
