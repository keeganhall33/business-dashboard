import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { taskBranchName } from '../disposable-workspace.mjs';
import { getTaskContract } from '../state-store/sqlite-store.mjs';

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

export function publishImplementationResult({ task, workspace, repoFullName, gh = 'gh' }) {
  const contract = getTaskContract(task);
  if (contract?.taskMutability !== 'IMPLEMENTATION_MUTATION_REQUIRED') {
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
    execFileSync(gh, ['pr','create','--repo',repoFullName,'--base','main','--head',branch,'--title',contract.title || `V4 task #${task.issue_number}`,'--body',`Closes #${task.issue_number}\n\nCreated by Orchestration V4 from immutable base ${task.base_sha}.`], { encoding: 'utf8' });
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
  };
}
