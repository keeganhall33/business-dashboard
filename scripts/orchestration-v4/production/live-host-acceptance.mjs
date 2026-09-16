import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runProductionHost } from './host.mjs';
import { runPrToDeployContinuity } from './autonomous-merge-gate.mjs';

export async function runDeliveryCanaryAcceptance() {
  const headSha = 'a'.repeat(40);
  const mergeSha = 'b'.repeat(40);
  const transitions = ['READY', 'RUNNING', 'PR_OPEN'];
  let observation = 0;
  let deployment = 0;
  let nextTaskStarted = false;
  const healthy = {
    pr: { state: 'open', draft: false, mergeable: true, base: 'main', headSha },
    changedPaths: ['src/canary.mjs'],
    fileOwnership: ['src/canary.mjs'],
    publication: { ownedMutationVerified: true, commitOwnershipVerified: true },
    validation: { focusedTestsPassed: true, diffCheckPassed: true },
  };
  const result = await runPrToDeployContinuity({
    expectedHeadSha: headSha,
    gateInput: healthy,
    observePr: async () => {
      observation += 1;
      if (observation === 1) return { ...healthy, ci: { status: 'pending' }, review: {} };
      if (observation === 2) return { ...healthy, ci: { status: 'completed', conclusion: 'success' }, review: {} };
      return { ...healthy, ci: { status: 'completed', conclusion: 'success' }, review: { independent: true, decision: 'APPROVE', reviewedHeadSha: headSha, unresolvedThreads: 0 } };
    },
    mergePr: async () => ({ mergeSha }),
    observeDeployment: async () => {
      deployment += 1;
      return deployment === 1 ? { state: 'DEPLOY_PENDING' } : { state: 'DEPLOYED', deploymentId: 1 };
    },
    pollMs: 1,
    sleep: async () => {},
    onState: ({ state }) => transitions.push(state),
  });
  if (result.state === 'DEPLOYED') {
    transitions.push('COMPLETE');
    nextTaskStarted = true;
    transitions.push('NEXT_TASK_RUNNING');
  }
  return Object.freeze({ ok: result.state === 'DEPLOYED' && nextTaskStarted, result, transitions: Object.freeze(transitions), nextTaskStarted });
}

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
