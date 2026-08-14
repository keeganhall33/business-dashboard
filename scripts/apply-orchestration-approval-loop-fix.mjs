import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const worktree = path.join(os.tmpdir(), `business-dashboard-approval-loop-${Date.now()}`);
const branch = `fix/approval-consumption-loop-${Date.now()}`;
let stage = "startup";

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: opts.capture ? undefined : "inherit", ...opts });
}

function diagnostic(err) {
  const message = err instanceof Error ? err.message : String(err);
  const stdout = typeof err?.stdout === "string" ? err.stdout : "";
  const stderr = typeof err?.stderr === "string" ? err.stderr : "";
  return `${message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`.slice(0, 5000);
}

function reportFailure(err) {
  const body = `DETERMINISTIC_HELPER_FAILURE stage=${stage}\n${diagnostic(err)}`;
  for (const issue of [366, 368]) {
    try { run("gh", ["issue", "comment", String(issue), "--repo", repo, "--body", body]); } catch {}
  }
}

try {
  stage = "fetch-main";
  run("git", ["fetch", "origin", "main"]);

  stage = "create-worktree";
  run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

  stage = "patch-runner";
  const runnerPath = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
  let runner = fs.readFileSync(runnerPath, "utf8");

  const decisionPattern = /function latestApprovedArchitectDecision\(comments\) \{[\s\S]*?\n\}\n\nfunction reviewIntentText/;
  if (!decisionPattern.test(runner)) throw new Error("latestApprovedArchitectDecision function boundary not found");
  const newDecision = `function latestApprovedArchitectDecision(comments) {\n  const list = Array.isArray(comments) ? comments : [];\n  let latestCheckpointId = null;\n  const approvalsByCheckpoint = new Map();\n\n  for (const comment of list) {\n    const body = String(comment?.body ?? \"\");\n    if (/##\\s+ArchitectCheckpointV1/i.test(body)) {\n      const checkpointId = commentCheckpointId(body);\n      if (checkpointId) latestCheckpointId = checkpointId;\n      continue;\n    }\n\n    if (\n      /##\\s+ArchitectDecisionV1/i.test(body) &&\n      /DECISION:\\s*(?:APPROVE_AND_PROCEED|APPROVE)\\b/i.test(body)\n    ) {\n      const checkpointId = commentCheckpointId(body);\n      if (checkpointId) approvalsByCheckpoint.set(checkpointId, body);\n    }\n  }\n\n  return latestCheckpointId ? approvalsByCheckpoint.get(latestCheckpointId) ?? null : null;\n}\n\nfunction reviewIntentText`;
  runner = runner.replace(decisionPattern, newDecision);

  const contractLine = "`Return ONLY OrchestrationResultContractV1 as strict JSON (no prose).`,";
  if (!runner.includes(contractLine)) throw new Error("AUTO_CONTINUE result-contract line not found");
  runner = runner.replace(
    contractLine,
    "`EXECUTE IMPLEMENTATION NOW. Use repository tools as required to implement, test, commit, push, and open the focused PR requested by the task. Do not merely review, approve, summarize, or restate the task.`,\n          `Return ONLY OrchestrationResultContractV1 as strict JSON (no prose) after the bounded implementation attempt completes.`,"
  );

  const approvedLine = "? `An architect approval is already recorded above. Proceed only within that approved scope; do not ask the same approval question again.`";
  if (!runner.includes(approvedLine)) throw new Error("approved-decision prompt line not found");
  runner = runner.replace(
    approvedLine,
    "? `An architect approval is already recorded above and remains authoritative for an identical repeated checkpoint. Proceed within that approved scope; do not ask the same approval question again.`"
  );

  const discouragedLine = ": `Do not run tools unless explicitly required; prefer a concise result.`";
  if (!runner.includes(discouragedLine)) throw new Error("non-approved AUTO_CONTINUE prompt line not found");
  runner = runner.replace(
    discouragedLine,
    ": `Proceed only within AUTO_CONTINUE scope and preserve all safety gates.`"
  );

  fs.writeFileSync(runnerPath, runner);

  stage = "patch-test";
  const testPath = path.join(worktree, "test/orchestration-nl-timeout-regression.test.tsx");
  let testText = fs.readFileSync(testPath, "utf8");
  if (!testText.includes("keeps approval authoritative across duplicate identical checkpoints")) {
    testText += `\n\ntest(\"NL adapter keeps approval authoritative across duplicate identical checkpoints\", () => {\n  const text = fs.readFileSync(\"scripts/orchestration-run-issue-openclaw.mjs\", \"utf8\");\n  assert.ok(text.includes(\"const approvalsByCheckpoint = new Map()\"));\n  assert.ok(text.includes(\"approvalsByCheckpoint.set(checkpointId, body)\"));\n  assert.ok(text.includes(\"approvalsByCheckpoint.get(latestCheckpointId) ?? null\"));\n});\n\ntest(\"AUTO_CONTINUE prompt explicitly executes implementation instead of re-reviewing\", () => {\n  const text = fs.readFileSync(\"scripts/orchestration-run-issue-openclaw.mjs\", \"utf8\");\n  assert.ok(text.includes(\"EXECUTE IMPLEMENTATION NOW\"));\n  assert.ok(text.includes(\"Do not merely review, approve, summarize, or restate the task\"));\n  assert.equal(text.includes(\"Do not run tools unless explicitly required; prefer a concise result.\"), false);\n});\n`;
    fs.writeFileSync(testPath, testText);
  }

  stage = "syntax-check";
  run(process.execPath, ["--check", "scripts/orchestration-run-issue-openclaw.mjs"], { cwd: worktree, capture: true });

  stage = "diff-check";
  run("git", ["diff", "--check"], { cwd: worktree, capture: true });

  stage = "commit";
  run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree });
  run("git", ["commit", "-m", "Fix architect approval consumption loop"], { cwd: worktree });

  stage = "push";
  run("git", ["push", "-u", "origin", branch], { cwd: worktree });

  stage = "create-pr";
  const url = run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch, "--title", "Fix AUTO_CONTINUE architect approval loop", "--body", "P0 orchestration repair: preserve a matching ArchitectDecisionV1 across duplicate identical checkpoints and explicitly instruct AUTO_CONTINUE workers to execute implementation rather than re-review. Adds focused regressions. Emergency helper performs deterministic Node syntax check + git diff --check; normal PR CI remains authoritative for the TSX regression suite. Refs #365 #366."], { cwd: worktree, capture: true }).trim();
  console.log(`PR=${url}`);
} catch (err) {
  reportFailure(err);
  throw err;
} finally {
  try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
}
