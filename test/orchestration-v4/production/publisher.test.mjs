import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGithubDeliveryAdapter } from '../../../scripts/orchestration-v4/production/publisher.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function fakeExecFactory({ mergeLag = 0, deploymentState = 'success' } = {}) {
  const calls = [];
  let merged = false;
  let postMergeObservations = 0;
  const headSha = 'a'.repeat(40);
  const mergeSha = 'b'.repeat(40);
  const exec = (_command, args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'merge') {
      assert.equal(args.at(-1), headSha);
      merged = true;
      return '';
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      if (merged) postMergeObservations += 1;
      const visible = merged && postMergeObservations > mergeLag;
      return JSON.stringify({
        state: visible ? 'MERGED' : 'OPEN',
        isDraft: false,
        mergeable: visible ? 'UNKNOWN' : 'MERGEABLE',
        baseRefName: 'main',
        headRefOid: headSha,
        mergeCommit: visible ? { oid: mergeSha } : null,
        statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }],
        author: { login: 'jeeves' },
      });
    }
    if (args[0] === 'api' && args.at(-1) === 'repos/owner/repo/pulls/42/reviews') {
      return JSON.stringify([{ state: 'APPROVED', commit_id: headSha, user: { login: 'reviewer' } }]);
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [{ isResolved: true }], pageInfo: { hasNextPage: false } } } } } });
    }
    if (args[0] === 'api' && args.includes('repos/owner/repo/deployments')) {
      return JSON.stringify([{ id: 77, environment: 'Production', production_environment: true }]);
    }
    if (args[0] === 'api' && args.includes('repos/owner/repo/deployments/77/statuses')) {
      return JSON.stringify([{ state: deploymentState, environment_url: 'https://dashboard.example' }]);
    }
    throw new Error(`UNEXPECTED_COMMAND:${args.join(' ')}`);
  };
  return { calls, exec, headSha, mergeSha };
}

test('GitHub delivery adapter binds CI and independent review to the exact PR head', async () => {
  const fake = fakeExecFactory();
  const adapter = createGithubDeliveryAdapter({ repoFullName: 'owner/repo', prNumber: 42, exec: fake.exec });
  const observed = await adapter.observePr();
  assert.deepEqual(observed, {
    pr: { state: 'open', draft: false, mergeable: true, base: 'main', headSha: fake.headSha, mergeSha: null },
    ci: { status: 'completed', conclusion: 'success' },
    review: { independent: true, decision: 'APPROVE', reviewedHeadSha: fake.headSha, unresolvedThreads: 0 },
  });
});

test('successful merge waits for GitHub visibility without submitting a duplicate merge', async () => {
  const fake = fakeExecFactory({ mergeLag: 2 });
  const adapter = createGithubDeliveryAdapter({
    repoFullName: 'owner/repo',
    prNumber: 42,
    exec: fake.exec,
    sleep: async () => {},
    mergeObservationAttempts: 4,
  });
  const result = await adapter.mergePr({ expectedHeadSha: fake.headSha });
  assert.equal(result.mergeSha, fake.mergeSha);
  assert.equal(fake.calls.filter((args) => args[0] === 'pr' && args[1] === 'merge').length, 1);
});

test('production deployment status is sourced from the merge SHA deployment', async () => {
  const fake = fakeExecFactory();
  const adapter = createGithubDeliveryAdapter({ repoFullName: 'owner/repo', prNumber: 42, exec: fake.exec });
  const deployment = await adapter.observeDeployment({ mergeSha: fake.mergeSha });
  assert.deepEqual(deployment, { state: 'DEPLOYED', deploymentId: 77, environmentUrl: 'https://dashboard.example' });
  const request = fake.calls.find((args) => args.includes('repos/owner/repo/deployments'));
  assert.ok(request.includes(`sha=${fake.mergeSha}`));
});

test('validated-main workflow uses bounded Vercel Git propagation polling only', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/validated-main-deploy.yml'), 'utf8');
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /for attempt in \$\(seq 1 30\)/);
  assert.match(workflow, /EXPECTED_RELEASE_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /Vercel Git integration is the only production deployment path/);
  assert.doesNotMatch(workflow, /vercel\s+(deploy|--prod)/i);
});
