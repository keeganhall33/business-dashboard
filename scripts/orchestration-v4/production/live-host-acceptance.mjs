import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProductionHost } from './host.mjs';

export async function runLiveHostAcceptance({ stateRoot = null } = {}) {
  const root = stateRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'jeeves-v4-host-live-'));
  const createdTemp = !stateRoot;
  const observations = [];
  try {
    const first = await runProductionHost({
      stateRoot: root,
      intervalMs: 1,
      maxCycles: 1,
      poll: async ({ db }) => {
        observations.push({ phase: 'first', taskCount: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n });
      },
    });
    const heartbeat1 = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    const lockGoneAfterFirst = !fs.existsSync(path.join(root, 'host.lock'));

    const second = await runProductionHost({
      stateRoot: root,
      intervalMs: 1,
      maxCycles: 1,
      poll: async ({ db }) => {
        observations.push({ phase: 'second', taskCount: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n });
      },
    });
    const heartbeat2 = JSON.parse(fs.readFileSync(path.join(root, 'heartbeat.json'), 'utf8'));
    const lockGoneAfterSecond = !fs.existsSync(path.join(root, 'host.lock'));
    const dbExists = fs.existsSync(path.join(root, 'state.sqlite'));

    return {
      ok: first.ok === true
        && second.ok === true
        && first.cycles === 1
        && second.cycles === 1
        && heartbeat1.cycles === 1
        && heartbeat2.cycles === 1
        && lockGoneAfterFirst
        && lockGoneAfterSecond
        && dbExists
        && observations.length === 2,
      first,
      second,
      lockGoneAfterFirst,
      lockGoneAfterSecond,
      dbExists,
      observations,
    };
  } finally {
    if (createdTemp) fs.rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runLiveHostAcceptance();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
