import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { taskBranchName } from '../disposable-workspace.mjs';
import { getTaskContract } from '../state-store/sqlite-store.mjs';
import { runRequiredQualityGates } from '../quality-gates.mjs';
import { deliveryMetadata } from '../delivery-policy.mjs';
import { runPrToDeployContinuity } from './autonomous-merge-gate.mjs';

export const PRODUCTION_VERIFICATION_ARTIFACT = '.openclaw/tmp/production-verification-v1.json';
const PRODUCTION_VERIFICATION_VERSION = 'PRODUCTION_VERIFICATION_V1';
const MAX_PRODUCTION_EVIDENCE_BYTES = 64 * 1024;
const GIT_COMMAND_TIMEOUT_MS = 60_000;
const GITHUB_COMMAND_TIMEOUT_MS = 30_000;

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }).trim();
}

function gitMaybe(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: GIT_COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function ghJson(args, gh = 'gh') {
  const raw = execFileSync(gh, args, { encoding: 'utf8', timeout: GITHUB_COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(raw || '[]');
}

function normalizePrObservation({ pr, reviews, reviewThreads }) {
  const headSha = pr?.headRefOid || null;
  const checks = Array.isArray(pr?.statusCheckRollup) ? pr.statusCheckRollup : [];
  const completed = checks.length > 0 && checks.every((check) => String(check?.status || '').toUpperCase() === 'COMPLETED');
  const successful = completed && checks.every((check) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(String(check?.conclusion || '').toUpperCase()));
  const approvals = (Array.isArray(reviews) ? reviews : [])
    .filter((review) => String(review?.state || '').toUpperCase() === 'APPROVED'
      && review?.commit_id === headSha
      && review?.user?.login
      && review.user.login !== pr?.author?.login);
  const exactApproval = approvals.at(-1) || null;
  return {
    pr: {
      state: String(pr?.state || '').toLowerCase(),
      draft: pr?.isDraft === true,
      mergeable: String(pr?.mergeable || '').toUpperCase() === 'MERGEABLE'
        ? true
        : String(pr?.mergeable || '').toUpperCase() === 'CONFLICTING' ? false : null,
      base: pr?.baseRefName || null,
      headSha,
      mergeSha: pr?.mergeCommit?.oid || null,
    },
    ci: { status: completed ? 'completed' : 'pending', conclusion: successful ? 'success' : completed ? 'failure' : null },
    review: {
      independent: Boolean(exactApproval),
      decision: exactApproval ? 'APPROVE' : null,
      reviewedHeadSha: exactApproval?.commit_id || null,
      unresolvedThreads: (reviewThreads?.nodes || []).filter((thread) => thread?.isResolved !== true).length
        + (reviewThreads?.hasNextPage === true ? 1 : 0),
    },
  };
}

function repositoryParts(repoFullName) {
  const [owner, name, ...extra] = String(repoFullName || '').split('/');
  if (!owner || !name || extra.length) throw new Error('V4_REPOSITORY_IDENTITY_INVALID');
  return { owner, name };
}

export function createGithubDeliveryAdapter({
  repoFullName,
  prNumber,
  gh = 'gh',
  exec = execFileSync,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  mergeObservationAttempts = 5,
  mergeObservationPollMs = 1_000,
}) {
  if (!Number.isInteger(mergeObservationAttempts) || mergeObservationAttempts < 1 || mergeObservationAttempts > 20
    || !Number.isInteger(mergeObservationPollMs) || mergeObservationPollMs < 0 || mergeObservationPollMs > 10_000) {
    throw new Error('V4_MERGE_OBSERVATION_BOUNDS_INVALID');
  }
  const { owner, name } = repositoryParts(repoFullName);
  const run = (args) => String(exec(gh, args, { encoding: 'utf8', timeout: GITHUB_COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }));
  const json = (args) => JSON.parse(run(args) || '{}');
  const observePr = async () => {
    const pr = json(['pr', 'view', String(prNumber), '--repo', repoFullName, '--json', 'state,isDraft,mergeable,baseRefName,headRefOid,mergeCommit,statusCheckRollup,author']);
    const reviews = json(['api', '--paginate', `repos/${repoFullName}/pulls/${prNumber}/reviews`]);
    const threads = json(['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `number=${prNumber}`, '-f', 'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved}pageInfo{hasNextPage}}}}}']);
    return normalizePrObservation({ pr, reviews, reviewThreads: threads?.data?.repository?.pullRequest?.reviewThreads || { nodes: [], hasNextPage: false } });
  };
  return Object.freeze({
    observePr,
    async mergePr({ expectedHeadSha }) {
      try {
        run(['pr', 'merge', String(prNumber), '--repo', repoFullName, '--merge', '--match-head-commit', expectedHeadSha]);
      } catch (error) {
        const stderr = String(error?.stderr || error?.message || '');
        if (/rate.?limit/i.test(stderr)) throw Object.assign(error, { code: 'RATE_LIMITED' });
        if (/temporar|try again|merge queue/i.test(stderr)) throw Object.assign(error, { code: 'MERGE_TEMPORARILY_UNAVAILABLE' });
        throw Object.assign(error, { code: 'MERGE_FAILED' });
      }
      // A successful merge command can precede GitHub's mergeCommit field by a
      // few seconds. Poll the already-merged PR instead of issuing a duplicate
      // merge request.
      for (let attempt = 1; attempt <= mergeObservationAttempts; attempt += 1) {
        const observed = await observePr();
        if (observed.pr.state === 'merged' && observed.pr.mergeSha) return { mergeSha: observed.pr.mergeSha };
        if (attempt < mergeObservationAttempts) await sleep(mergeObservationPollMs);
      }
      throw Object.assign(new Error('MERGE_RESULT_MISSING'), { code: 'MERGE_RESULT_MISSING' });
    },
    async observeDeployment({ mergeSha }) {
      const deployments = json(['api', '--method', 'GET', `repos/${repoFullName}/deployments`, '-f', `sha=${mergeSha}`, '-f', 'per_page=100']);
      const production = (Array.isArray(deployments) ? deployments : []).filter((deployment) =>
        deployment?.production_environment === true || String(deployment?.environment || '').toLowerCase() === 'production');
      if (!production.length) return { state: 'DEPLOY_PENDING', deploymentId: null };
      for (const deployment of production) {
        const statuses = json(['api', `repos/${repoFullName}/deployments/${deployment.id}/statuses`]);
        const latest = Array.isArray(statuses) ? statuses[0] : null;
        if (String(latest?.state || '').toLowerCase() === 'success') return { state: 'DEPLOYED', deploymentId: deployment.id, environmentUrl: latest.environment_url || null };
        if (['failure', 'error', 'inactive'].includes(String(latest?.state || '').toLowerCase())) return { state: 'DEPLOY_FAILED', deploymentId: deployment.id };
      }
      return { state: 'DEPLOY_PENDING', deploymentId: production[0]?.id || null };
    },
  });
}

function ensureIdentity(cwd) {
  if (!gitMaybe(cwd, 'config', '--get', 'user.name')) git(cwd, 'config', 'user.name', 'Jeeves Orchestration V4');
  if (!gitMaybe(cwd, 'config', '--get', 'user.email')) git(cwd, 'config', 'user.email', 'jeeves-v4@local.invalid');
}

function normalizeOwnedPath(value) {
  const normalized = path.posix.normalize(String(value || '').trim().replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function ownedPaths(fileOwnership = '') {
  return String(fileOwnership)
    .split(',')
    .map((value) => normalizeOwnedPath(value))
    .filter(Boolean)
    .slice(0, 20);
}

function mutationPaths(workspacePath) {
  const tracked = gitMaybe(workspacePath, 'diff', '--name-only', '--relative', 'HEAD', '--')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  const untracked = gitMaybe(workspacePath, 'ls-files', '--others', '--exclude-standard')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function pathIsOwned(relativePath, ownership) {
  const normalized = normalizeOwnedPath(relativePath);
  if (!normalized) return false;
  return ownership.some((owned) => normalized === owned || normalized.startsWith(`${owned}/`));
}

export function classifyImplementationMutations({ workspacePath, fileOwnership = '' }) {
  const normalizedWorkspace = path.resolve(workspacePath);
  const ownership = ownedPaths(fileOwnership);
  const changedPaths = mutationPaths(normalizedWorkspace);
  const ownedChangedPaths = changedPaths.filter((relativePath) => pathIsOwned(relativePath, ownership));
  const unownedChangedPaths = changedPaths.filter((relativePath) => !pathIsOwned(relativePath, ownership));
  return { changedPaths, ownedChangedPaths, unownedChangedPaths, ownership };
}

function fileSnapshot(workspacePath, relativePath) {
  const absolutePath = path.resolve(workspacePath, relativePath);
  if (!absolutePath.startsWith(`${workspacePath}${path.sep}`) && absolutePath !== workspacePath) {
    return { path: relativePath, outsideWorkspace: true };
  }
  try {
    const stat = fs.statSync(absolutePath);
    return {
      path: relativePath,
      absolutePath,
      exists: true,
      type: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
      size: stat.size,
      mtimeMs: Math.trunc(stat.mtimeMs),
    };
  } catch (error) {
    return {
      path: relativePath,
      absolutePath,
      exists: false,
      error: error instanceof Error ? error.code || error.message : String(error),
    };
  }
}

function recentWorkspaceFiles(workspacePath, limit = 30) {
  const files = [];
  const stack = [workspacePath];
  const skipped = new Set(['.git', 'node_modules', '.next']);
  while (stack.length && files.length < 1000) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (skipped.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = fs.statSync(absolutePath);
        files.push({
          path: path.relative(workspacePath, absolutePath),
          size: stat.size,
          mtimeMs: Math.trunc(stat.mtimeMs),
        });
      } catch {
        // Diagnostic collection must never change publication behavior.
      }
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path)).slice(0, limit);
}

export function collectZeroMutationDiagnostics({ workspacePath, fileOwnership = '' }) {
  const normalizedWorkspace = path.resolve(workspacePath);
  return {
    workspacePath: normalizedWorkspace,
    gitTopLevel: gitMaybe(normalizedWorkspace, 'rev-parse', '--show-toplevel') || null,
    headSha: gitMaybe(normalizedWorkspace, 'rev-parse', 'HEAD') || null,
    gitStatusPorcelain: gitMaybe(normalizedWorkspace, 'status', '--porcelain'),
    mutationClassification: classifyImplementationMutations({ workspacePath: normalizedWorkspace, fileOwnership }),
    ownedPaths: ownedPaths(fileOwnership).map((relativePath) => fileSnapshot(normalizedWorkspace, relativePath)),
    recentWorkspaceFiles: recentWorkspaceFiles(normalizedWorkspace),
  };
}

function isPlainObject(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsSensitiveEvidence(value) {
  const serialized = JSON.stringify(value);
  if (/op:\/\/|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) return true;
  const forbiddenKey = /(password|secret|token|credential|emailAddress|messageId|subject|bodyText|attachmentBytes)/i;
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    if (!isPlainObject(current)) continue;
    for (const [key, nested] of Object.entries(current)) {
      if (forbiddenKey.test(key)) return true;
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
  return false;
}

export function validateProductionVerificationArtifact({ task, workspacePath }) {
  const artifactPath = path.resolve(workspacePath, PRODUCTION_VERIFICATION_ARTIFACT);
  if (!artifactPath.startsWith(`${path.resolve(workspacePath)}${path.sep}`)) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_PATH_INVALID' };
  }
  let raw;
  try {
    raw = fs.readFileSync(artifactPath, 'utf8');
  } catch {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_MISSING' };
  }
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_PRODUCTION_EVIDENCE_BYTES) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_SIZE_INVALID' };
  }
  let evidence;
  try {
    evidence = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_JSON_INVALID' };
  }
  if (!isPlainObject(evidence)
    || evidence.contractVersion !== PRODUCTION_VERIFICATION_VERSION
    || evidence.taskId !== task.task_id
    || evidence.issueNumber !== task.issue_number
    || evidence.verdict !== 'PASS') {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_IDENTITY_INVALID' };
  }
  if (!Number.isFinite(Date.parse(String(evidence.observedAt || '')))) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_TIMESTAMP_INVALID' };
  }
  if (evidence.liveExecution !== true
    || evidence.repositoryClean !== true
    || evidence.privacySafe !== true
    || evidence.externalMutation !== false) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_ASSERTIONS_INVALID' };
  }
  if (!Array.isArray(evidence.checks)
    || evidence.checks.length === 0
    || evidence.checks.some((check) => !isPlainObject(check) || typeof check.id !== 'string' || !check.id.trim() || check.passed !== true)) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_CHECKS_INVALID' };
  }
  if (!isPlainObject(evidence.telemetry) || Object.keys(evidence.telemetry).length === 0) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_TELEMETRY_MISSING' };
  }
  if (containsSensitiveEvidence(evidence)) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_PRIVACY_VIOLATION' };
  }
  const unexpectedMutations = mutationPaths(workspacePath).filter((relativePath) => relativePath !== PRODUCTION_VERIFICATION_ARTIFACT);
  if (unexpectedMutations.length > 0) {
    return { ok: false, reason: 'V4_PRODUCTION_EVIDENCE_REPOSITORY_MUTATED', unexpectedMutations };
  }
  return {
    ok: true,
    productionVerification: {
      verified: true,
      contractVersion: evidence.contractVersion,
      taskId: evidence.taskId,
      issueNumber: evidence.issueNumber,
      observedAt: evidence.observedAt,
      assertionIds: evidence.checks.map((check) => check.id),
      telemetryKeys: Object.keys(evidence.telemetry).sort(),
      artifactSha256: crypto.createHash('sha256').update(raw).digest('hex'),
    },
  };
}

export async function publishImplementationResult({ task, workspace, repoFullName, gh = 'gh', deliveryAdapter = null, continuity = runPrToDeployContinuity }) {
  const contract = getTaskContract(task);
  if (contract?.taskMutability !== 'IMPLEMENTATION_MUTATION_REQUIRED') {
    const delivery = deliveryMetadata(contract);
    if (delivery.stage === 'PRODUCTION_VERIFICATION') {
      const verified = validateProductionVerificationArtifact({ task, workspacePath: workspace.workspacePath });
      if (!verified.ok) return verified;
      return { ok: true, publicationRequired: false, ...verified };
    }
    return { ok: true, publicationRequired: false };
  }

  const cwd = workspace.workspacePath;
  const mutations = classifyImplementationMutations({ workspacePath: cwd, fileOwnership: contract.fileOwnership });
  if (mutations.changedPaths.length === 0) {
    return {
      ok: false,
      reason: 'V4_IMPLEMENTATION_ZERO_EXIT_NO_MUTATION',
      diagnostics: collectZeroMutationDiagnostics({ workspacePath: cwd, fileOwnership: contract.fileOwnership }),
    };
  }
  if (mutations.ownedChangedPaths.length === 0) {
    return {
      ok: false,
      reason: 'V4_IMPLEMENTATION_NO_OWNED_MUTATION',
      diagnostics: collectZeroMutationDiagnostics({ workspacePath: cwd, fileOwnership: contract.fileOwnership }),
    };
  }

  const quality = runRequiredQualityGates({ workspacePath: cwd, contract });
  if (!quality.ok) return { ok: false, reason: quality.reason, quality };

  ensureIdentity(cwd);
  const branch = taskBranchName(task.issue_number, task.task_id);
  git(cwd, 'switch', '-c', branch);
  git(cwd, 'add', '--', ...mutations.ownedChangedPaths);
  git(cwd, 'commit', '-m', `feat(v4-task): complete #${task.issue_number}`);
  const headSha = git(cwd, 'rev-parse', 'HEAD');
  if (headSha === task.base_sha) return { ok: false, reason: 'V4_IMPLEMENTATION_COMMIT_MISSING' };

  const committedPaths = git(cwd, 'diff', '--name-only', `${task.base_sha}..HEAD`, '--')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (committedPaths.length === 0 || committedPaths.some((relativePath) => !pathIsOwned(relativePath, mutations.ownership))) {
    return { ok: false, reason: 'V4_IMPLEMENTATION_COMMIT_OWNERSHIP_VIOLATION', committedPaths, ownership: mutations.ownership };
  }

  git(cwd, 'push', 'origin', `HEAD:refs/heads/${branch}`);

  let matches = ghJson(['pr','list','--repo',repoFullName,'--state','open','--head',branch,'--json','number,url,headRefOid'], gh);
  let pr = matches[0] || null;
  let created = false;
  if (!pr) {
    const delivery = deliveryMetadata(contract);
    const body = [
      `Closes #${task.issue_number}`,
      '',
      '## Delivery outcome',
      `- Mode: ${delivery.mode}`,
      `- Slice: ${delivery.sliceId ?? 'none'}`,
      `- Stage: ${delivery.stage ?? 'none'}`,
      `- Feature: ${delivery.featureName ?? 'none'}`,
      `- Release target: ${delivery.releaseTarget ?? 'unassigned'}`,
      `- Launch policy: ${delivery.launchPolicy ?? 'unspecified'}`,
      `- Outcome: ${delivery.outcome ?? 'legacy task contract'}`,
      `- Operational: ${delivery.stage === 'PRODUCTION_VERIFICATION' ? 'production evidence required by contract' : 'no, this is not the production-verification stage'}`,
      '',
      '## Machine-observed quality gates',
      ...(quality.skipped ? ['- Legacy contract: no declared gates.'] : quality.gates.map((gate) => `- ${gate.gate}: PASS`)),
      '',
      `Created by Orchestration V4 from immutable base ${task.base_sha}.`,
    ].join('\n');
    execFileSync(gh, ['pr','create','--repo',repoFullName,'--base','main','--head',branch,'--title',contract.title || `V4 task #${task.issue_number}`,'--body',body], {
      encoding: 'utf8',
      timeout: GITHUB_COMMAND_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
    created = true;
    matches = ghJson(['pr','list','--repo',repoFullName,'--state','open','--head',branch,'--json','number,url,headRefOid'], gh);
    pr = matches[0] || null;
  }
  if (!pr?.number) return { ok: false, reason: 'V4_IMPLEMENTATION_PR_PUBLICATION_FAILED' };
  if (pr.headRefOid && pr.headRefOid !== headSha) return { ok: false, reason: 'V4_IMPLEMENTATION_PR_HEAD_MISMATCH' };
  const publication = {
    ok: true,
    publicationRequired: true,
    prNumber: Number(pr.number),
    prUrl: pr.url || null,
    headSha,
    branch,
    created,
    committedPaths,
    ignoredUnownedPaths: mutations.unownedChangedPaths,
    quality,
  };
  const adapter = deliveryAdapter || createGithubDeliveryAdapter({ repoFullName, prNumber: publication.prNumber, gh });
  const delivery = await continuity({
    expectedHeadSha: headSha,
    gateInput: {
      changedPaths: committedPaths,
      fileOwnership: mutations.ownership,
      publication: { ownedMutationVerified: mutations.ownedChangedPaths.length > 0, commitOwnershipVerified: true },
      validation: {
        focusedTestsPassed: quality.skipped || quality.gates.some((gate) => gate.gate === 'TEST' && gate.status === 0),
        diffCheckPassed: quality.skipped || quality.gates.some((gate) => gate.gate === 'DIFF_CHECK' && gate.status === 0),
      },
    },
    observePr: adapter.observePr,
    mergePr: adapter.mergePr,
    observeDeployment: adapter.observeDeployment,
  });
  if (delivery.state !== 'DEPLOYED') return { ok: false, reason: `V4_DELIVERY_${delivery.blocker || delivery.state}`, publication, delivery };
  return { ...publication, delivery };
}
