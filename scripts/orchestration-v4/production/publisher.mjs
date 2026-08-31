import { execFileSync, spawnSync } from 'node:child_process';
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

export function publishImplementationResult({ task, workspace, repoFullName, gh = 'gh' }) {
  const contract = getTaskContract(task);
  if (contract?.taskMutability !== 'IMPLEMENTATION_MUTATION_REQUIRED') {
    return { ok: true, publicationRequired: false };
  }

  const cwd = workspace.workspacePath;
  const status = git(cwd, 'status', '--porcelain');
  if (!status) return { ok: false, reason: 'V4_IMPLEMENTATION_ZERO_EXIT_NO_MUTATION' };

  ensureIdentity(cwd);
  const branch = taskBranchName(task.issue_number, task.task_id);
  git(cwd, 'switch', '-c', branch);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', `feat(v4-task): complete #${task.issue_number}`);
  const headSha = git(cwd, 'rev-parse', 'HEAD');
  if (headSha === task.base_sha) return { ok: false, reason: 'V4_IMPLEMENTATION_COMMIT_MISSING' };
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
  };
}
