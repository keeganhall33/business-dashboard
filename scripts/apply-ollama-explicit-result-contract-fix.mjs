import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const worktree = path.join(os.tmpdir(), `business-dashboard-ollama-contract-${Date.now()}`);
const branch = `fix/ollama-result-contract-${Date.now()}`;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: opts.capture ? undefined : "inherit", ...opts });
}

try {
  run("git", ["fetch", "origin", "main"]);
  run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

  const runnerPath = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
  let runner = fs.readFileSync(runnerPath, "utf8");

  const resultLine = "`Return ONLY OrchestrationResultContractV1 as strict JSON (no prose) after the bounded implementation attempt completes.`,";
  if (!runner.includes(resultLine)) throw new Error("AUTO_CONTINUE result line not found");
  runner = runner.replace(
    resultLine,
    `${resultLine}\n          \`Use EXACT uppercase keys and this complete shape: {\\\"TASK_ID\\\":\\\"${'${issueNumber}'}\\\",\\\"STATUS\\\":\\\"PASS|BLOCKED|FAILED\\\",\\\"SUMMARY\\\":\\\"concise outcome\\\",\\\"CHANGES\\\":[],\\\"FILES_CHANGED\\\":[],\\\"DB_CHANGES\\\":\\\"NO\\\",\\\"MIGRATION\\\":null,\\\"TESTS\\\":\\\"command/results\\\",\\\"PR\\\":null,\\\"MERGE_STATUS\\\":\\\"N/A\\\",\\\"PRODUCTION_CHANGE\\\":\\\"NO\\\",\\\"UNEXPECTED_RESULTS\\\":[],\\\"DECISIONS_REQUIRED\\\":[],\\\"BLOCKERS\\\":[],\\\"NEXT_RECOMMENDED_TASK\\\":null,\\\"SESSION_HEALTH\\\":\\\"GOOD\\\",\\\"SESSION_CONTEXT\\\":\\\"branch/session\\\"}. Never return a DECISION-only object.\`,`
  );

  const retryOld = `  return [\n    "STRICT_JSON_ONLY_RETRY:",\n    "Return ONLY the required strict JSON object and nothing else.",\n    "No prose. No code fences. No tool mentions.",\n    "Your entire response must be a single JSON object starting with '{' and ending with '}'.",\n    "",\n    "Context (do not repeat):",\n    safeTrunc(String(basePrompt ?? ""), 800)\n  ].join("\\n");`;
  if (!runner.includes(retryOld)) throw new Error("strict retry block not found");
  const retryNew = `  return [\n    "STRICT_JSON_ONLY_RETRY:",\n    "Return ONLY one OrchestrationResultContractV1 JSON object and nothing else.",\n    "No prose. No code fences. No DECISION-only object. No ArchitectCheckpointV1.",\n    "Use EXACT uppercase keys. Minimum valid complete shape:",\n    '{"TASK_ID":"issue-or-task-id","STATUS":"PASS|BLOCKED|FAILED","SUMMARY":"concise outcome","CHANGES":[],"FILES_CHANGED":[],"DB_CHANGES":"NO","MIGRATION":null,"TESTS":"command/results","PR":null,"MERGE_STATUS":"N/A","PRODUCTION_CHANGE":"NO","UNEXPECTED_RESULTS":[],"DECISIONS_REQUIRED":[],"BLOCKERS":[],"NEXT_RECOMMENDED_TASK":null,"SESSION_HEALTH":"GOOD","SESSION_CONTEXT":"branch/session"}',\n    "If implementation succeeded, report the actual files/tests/PR. If it failed, use BLOCKED or FAILED and state the blocker.",\n    "Your entire response must be a single JSON object starting with '{' and ending with '}'.",\n    "",\n    "Task context (do not repeat):",\n    safeTrunc(String(basePrompt ?? ""), 1400)\n  ].join("\\n");`;
  runner = runner.replace(retryOld, retryNew);
  fs.writeFileSync(runnerPath, runner);

  const testPath = path.join(worktree, "test/orchestration-nl-timeout-regression.test.tsx");
  let tests = fs.readFileSync(testPath, "utf8");
  if (!tests.includes("Ollama prompts include explicit OrchestrationResultContractV1 schema")) {
    tests += `\n\ntest("Ollama prompts include explicit OrchestrationResultContractV1 schema", () => {\n  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");\n  assert.ok(text.includes("Use EXACT uppercase keys and this complete shape"));\n  assert.ok(text.includes("No DECISION-only object"));\n  assert.ok(text.includes("\\\"TASK_ID\\\":\\\"issue-or-task-id\\\""));\n  assert.ok(text.includes("\\\"FILES_CHANGED\\\":[]"));\n  assert.ok(text.includes("safeTrunc(String(basePrompt ?? \\\"\\\"), 1400)"));\n});\n`;
    fs.writeFileSync(testPath, tests);
  }

  run(process.execPath, ["--check", "scripts/orchestration-run-issue-openclaw.mjs"], { cwd: worktree, capture: true });
  run("git", ["diff", "--check"], { cwd: worktree, capture: true });

  const tsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  if (fs.existsSync(tsx)) {
    run(tsx, ["--test", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree, capture: true });
  }

  run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree });
  run("git", ["commit", "-m", "Give Ollama explicit orchestration result schema"], { cwd: worktree });
  run("git", ["push", "-u", "origin", branch], { cwd: worktree });

  const url = run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch, "--title", "Give Ollama explicit result-contract schema", "--body", "P0 local-routing repair. Ollama currently receives only the contract name, not the required JSON fields, so valid local work drifts into compact/decision-shaped JSON and triggers cloud fallback. This patch supplies an explicit uppercase OrchestrationResultContractV1 shape in both AUTO_CONTINUE and strict retry prompts, forbids DECISION-only output, increases retry task context, and adds regression coverage. Refs #294 #337 #365."], { cwd: worktree, capture: true }).trim();
  console.log(`PR=${url}`);
} finally {
  try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
}
