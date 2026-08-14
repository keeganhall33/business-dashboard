import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

const repo = 'keeganhall33/business-dashboard';
const stamp = Date.now();
const branch = `fix/architect-decision-order-json-runtime-${stamp}`;
const wt = path.join(os.tmpdir(), `jeeves-architect-decision-fix-${stamp}`);

run('git', ['fetch', 'origin', 'main']);
run('git', ['worktree', 'add', '-b', branch, wt, 'origin/main']);

const runnerPath = path.join(wt, 'scripts/orchestration-run-issue-openclaw.mjs');
const testPath = path.join(wt, 'test/orchestration-nl-timeout-regression.test.tsx');
let runner = fs.readFileSync(runnerPath, 'utf8');

const replacement = `function latestApprovedArchitectDecision(comments) {
  const list = Array.isArray(comments) ? comments : [];
  let latestCheckpointId = null;
  const approvalsByCheckpoint = new Map();

  for (const comment of list) {
    const body = String(comment?.body ?? "");
    if (/##\\s+ArchitectCheckpointV1/i.test(body)) {
      const checkpointId = commentCheckpointId(body);
      if (checkpointId) latestCheckpointId = checkpointId;
      continue;
    }

    if (
      /##\\s+ArchitectDecisionV1/i.test(body) &&
      /["']?DECISION["']?\\s*:\\s*["']?(?:APPROVE_AND_PROCEED|APPROVE)\\b/i.test(body)
    ) {
      const checkpointId = commentCheckpointId(body);
      if (checkpointId) approvalsByCheckpoint.set(checkpointId, body);
    }
  }

  return latestCheckpointId ? approvalsByCheckpoint.get(latestCheckpointId) ?? null : null;
}

function reviewIntentText`;

const fnRe = /function latestApprovedArchitectDecision\(comments\) \{[\s\S]*?\n\}\n\nfunction reviewIntentText/;
if (!fnRe.test(runner)) throw new Error('latestApprovedArchitectDecision function shape not found');
runner = runner.replace(fnRe, replacement);
fs.writeFileSync(runnerPath, runner);

let test = fs.readFileSync(testPath, 'utf8');
const marker = 'test("NL adapter still preserves review-sensitive stream gating without a later approval"';
if (!test.includes(marker)) throw new Error('test insertion marker not found');
const regression = `test("NL adapter records matching approvals independent of comment order and accepts JSON decision form", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("const checkpointId = commentCheckpointId(body)"));
  assert.ok(text.includes("if (checkpointId) approvalsByCheckpoint.set(checkpointId, body)"));
  assert.ok(text.includes("DECISION["), "decision parser must accept quoted JSON field names");
  assert.ok(text.includes("APPROVE_AND_PROCEED|APPROVE"));
  assert.equal(text.includes("latestCheckpointId &&\\n      /##\\\\s+ArchitectDecisionV1"), false, "approval must not depend on checkpoint appearing earlier in comment order");
});

`;
test = test.replace(marker, regression + marker);
fs.writeFileSync(testPath, test);

run('node', ['--check', 'scripts/orchestration-run-issue-openclaw.mjs'], { cwd: wt });
run('pnpm', ['exec', 'tsx', '--test', 'test/orchestration-nl-timeout-regression.test.tsx'], { cwd: wt, timeout: 120000 });
run('git', ['diff', '--check'], { cwd: wt });
run('git', ['add', 'scripts/orchestration-run-issue-openclaw.mjs', 'test/orchestration-nl-timeout-regression.test.tsx'], { cwd: wt });
run('git', ['commit', '-m', 'Fix ArchitectDecision approval ordering and JSON parsing'], { cwd: wt });
run('git', ['push', '-u', 'origin', branch], { cwd: wt, timeout: 120000 });
const prUrl = run('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--title', 'Fix ArchitectDecision approval ordering and JSON parsing', '--body', 'P0 orchestration control-plane fix. Records APPROVE decisions by their referenced CHECKPOINT_ID regardless of comment ordering and recognizes both plain-text and JSON DECISION fields. Matching checkpoint ID remains mandatory. Adds focused regression coverage. No business-data or production behavior changes.'], { cwd: wt, timeout: 60000 });
console.log(`PR=${prUrl}`);
