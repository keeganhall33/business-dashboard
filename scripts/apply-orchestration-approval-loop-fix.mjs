import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const worktree = path.join(os.tmpdir(), `business-dashboard-approval-loop-${Date.now()}`);
const branch = `fix/approval-consumption-loop-${Date.now()}`;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: opts.capture ? undefined : "inherit", ...opts });
}

run("git", ["fetch", "origin", "main"]);
run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

try {
  const runnerPath = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
  let runner = fs.readFileSync(runnerPath, "utf8");

  const oldDecision = `function latestApprovedArchitectDecision(comments) {\n  const list = Array.isArray(comments) ? comments : [];\n  let latestCheckpointId = null;\n  let latestApprovalBody = null;\n\n  for (const comment of list) {\n    const body = String(comment?.body ?? \"\");\n    if (/##\\s+ArchitectCheckpointV1/i.test(body)) {\n      latestCheckpointId = commentCheckpointId(body);\n      latestApprovalBody = null;\n      continue;\n    }\n\n    if (\n      latestCheckpointId &&\n      /##\\s+ArchitectDecisionV1/i.test(body) &&\n      /DECISION:\\s*(?:APPROVE_AND_PROCEED|APPROVE)\\b/i.test(body) &&\n      commentCheckpointId(body) === latestCheckpointId\n    ) {\n      latestApprovalBody = body;\n    }\n  }\n\n  return latestApprovalBody;\n}`;

  const newDecision = `function latestApprovedArchitectDecision(comments) {\n  const list = Array.isArray(comments) ? comments : [];\n  let latestCheckpointId = null;\n  const approvalsByCheckpoint = new Map();\n\n  for (const comment of list) {\n    const body = String(comment?.body ?? \"\");\n    if (/##\\s+ArchitectCheckpointV1/i.test(body)) {\n      const checkpointId = commentCheckpointId(body);\n      if (checkpointId) latestCheckpointId = checkpointId;\n      continue;\n    }\n\n    if (\n      /##\\s+ArchitectDecisionV1/i.test(body) &&\n      /DECISION:\\s*(?:APPROVE_AND_PROCEED|APPROVE)\\b/i.test(body)\n    ) {\n      const checkpointId = commentCheckpointId(body);\n      if (checkpointId) approvalsByCheckpoint.set(checkpointId, body);\n    }\n  }\n\n  return latestCheckpointId ? approvalsByCheckpoint.get(latestCheckpointId) ?? null : null;\n}`;

  if (!runner.includes(oldDecision)) throw new Error("Expected latestApprovedArchitectDecision block not found");
  runner = runner.replace(oldDecision, newDecision);

  const oldPrompt = `      : [\n          \`Return ONLY OrchestrationResultContractV1 as strict JSON (no prose).\`,\n          approvedDecision\n            ? \`An architect approval is already recorded above. Proceed only within that approved scope; do not ask the same approval question again.\`\n            : \`Do not run tools unless explicitly required; prefer a concise result.\`\n        ].join(\"\\n\");`;
  const newPrompt = `      : [\n          \`EXECUTE IMPLEMENTATION NOW within the task Delta and any recorded ArchitectDecisionV1.\`,\n          \`Use repository tools as required to implement, test, commit, push, and open the focused PR requested by the task. Do not merely review, approve, summarize, or restate the task.\`,\n          \`Return ONLY OrchestrationResultContractV1 as strict JSON (no prose) after the bounded implementation attempt completes.\`,\n          approvedDecision\n            ? \`An architect approval is already recorded above and remains authoritative for an identical repeated checkpoint. Do not ask the same approval question again.\`\n            : \`Proceed only within AUTO_CONTINUE scope and preserve all safety gates.\`\n        ].join(\"\\n\");`;

  if (!runner.includes(oldPrompt)) throw new Error("Expected AUTO_CONTINUE prompt block not found");
  runner = runner.replace(oldPrompt, newPrompt);
  fs.writeFileSync(runnerPath, runner);

  const testPath = path.join(worktree, "test/orchestration-nl-timeout-regression.test.tsx");
  let testText = fs.readFileSync(testPath, "utf8");
  testText += `\n\ntest(\"NL adapter keeps approval authoritative across duplicate identical checkpoints\", () => {\n  const text = fs.readFileSync(\"scripts/orchestration-run-issue-openclaw.mjs\", \"utf8\");\n  assert.ok(text.includes(\"const approvalsByCheckpoint = new Map()\"));\n  assert.ok(text.includes(\"approvalsByCheckpoint.set(checkpointId, body)\"));\n  assert.ok(text.includes(\"approvalsByCheckpoint.get(latestCheckpointId) ?? null\"));\n  assert.equal(text.includes(\"latestApprovalBody = null\"), false, \"duplicate checkpoint must not erase an existing matching approval\");\n});\n\ntest(\"AUTO_CONTINUE prompt explicitly executes implementation instead of re-reviewing\", () => {\n  const text = fs.readFileSync(\"scripts/orchestration-run-issue-openclaw.mjs\", \"utf8\");\n  assert.ok(text.includes(\"EXECUTE IMPLEMENTATION NOW\"));\n  assert.ok(text.includes(\"Do not merely review, approve, summarize, or restate the task\"));\n  assert.equal(text.includes(\"Do not run tools unless explicitly required; prefer a concise result.\"), false);\n});\n`;
  fs.writeFileSync(testPath, testText);

  run("pnpm", ["exec", "tsx", "--test", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree });
  run("git", ["diff", "--check"], { cwd: worktree });
  run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree });
  run("git", ["commit", "-m", "Fix architect approval consumption loop"], { cwd: worktree });
  run("git", ["push", "-u", "origin", branch], { cwd: worktree });
  const url = run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch, "--title", "Fix AUTO_CONTINUE architect approval loop", "--body", "P0 orchestration repair: preserve a matching ArchitectDecisionV1 across duplicate identical checkpoints and explicitly instruct AUTO_CONTINUE workers to execute implementation rather than re-review. Adds focused regressions. Refs #365."], { cwd: worktree, capture: true }).trim();
  console.log(`PR=${url}`);
} finally {
  try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
}
