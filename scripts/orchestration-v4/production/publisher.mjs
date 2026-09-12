import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { taskBranchName } from '../disposable-workspace.mjs';
import { getTaskContract } from '../state-store/sqlite-store.mjs';
import { runRequiredQualityGates } from '../quality-gates.mjs';
import { deliveryMetadata } from '../delivery-policy.mjs';

export const PRODUCTION_VERIFICATION_ARTIFACT = '.openclaw/tmp/production-verification-v1.json';
const PRODUCTION_VERIFICATION_VERSION = 'PRODUCTION_VERIFICATION_V1';
const MAX_PRODUCTION_EVIDENCE_BYTES = 64 * 1024;

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function gitMaybe(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function ghJson(args, gh = 'gh') {
  const raw = execFileSync(gh, args, { encoding: 'utf8' });
  return JSON.parse(raw || '[]');
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

export function publishImplementationResult({ task, workspace, repoFullName, gh = 'gh' }) {
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
    execFileSync(gh, ['pr','create','--repo',repoFullName,'--base','main','--head',branch,'--title',contract.title || `V4 task #${task.issue_number}`,'--body',body], { encoding: 'utf8' });
    created = true;
    matches = ghJson(['pr','list','--repo',repoFullName,'--state','open','--head',branch,'--json','number,url,headRefOid'], gh);
    pr = matches[0] || null;
  }
  if (!pr?.number) return { ok: false, reason: 'V4_IMPLEMENTATION_PR_PUBLICATION_FAILED' };
  if (pr.headRefOid && pr.headRefOid !== headSha) return { ok: false, reason: 'V4_IMPLEMENTATION_PR_HEAD_MISMATCH' };
  return {
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
}
