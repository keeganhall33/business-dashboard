import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "keeganhall33/business-dashboard";
const worktree = path.join(os.tmpdir(), `business-dashboard-local-normalize-${Date.now()}`);
const branch = `fix/local-result-normalization-${Date.now()}`;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: opts.capture ? undefined : "inherit", ...opts });
}

try {
  run("git", ["fetch", "origin", "main"]);
  run("git", ["worktree", "add", "-b", branch, worktree, "origin/main"]);

  const runnerPath = path.join(worktree, "scripts/orchestration-run-issue-openclaw.mjs");
  let runner = fs.readFileSync(runnerPath, "utf8");

  const oldParser = `function parseOrchestrationResult(text) {\n  const fenced = String(text ?? \"\").match(/\`\`\`json\\n([\\s\\S]*?)\`\`\`/i);\n  const candidate = fenced ? fenced[1] : String(text ?? \"\");\n  if (!candidate.trim()) {\n    return {\n      kind: \"invalid\",\n      error: \"OpenClaw envelope contained no renderable final text; result.payloads was empty or contained no text payloads\"\n    };\n  }\n  const obj = JSON.parse(candidate.trim());\n\n  if (obj && typeof obj === \"object\") {\n    if (typeof obj.TASK_ID === \"string\" && typeof obj.STATUS === \"string\" && typeof obj.SUMMARY === \"string\") {\n      return { kind: \"result\", value: obj };\n    }\n    if (typeof obj.TASK_ID === \"string\" && typeof obj.CHECKPOINT_ID === \"string\" && typeof obj.QUESTION_OR_DECISION === \"string\") {\n      return { kind: \"checkpoint\", value: obj };\n    }\n  }\n\n  return { kind: \"invalid\", error: \"JSON parsed but did not match known contracts\" };\n}`;

  const newParser = `function parseOrchestrationResult(text, fallbackTaskId = null) {\n  const fenced = String(text ?? \"\").match(/\`\`\`json\\n([\\s\\S]*?)\`\`\`/i);\n  const candidate = fenced ? fenced[1] : String(text ?? \"\");\n  if (!candidate.trim()) {\n    return {\n      kind: \"invalid\",\n      error: \"OpenClaw envelope contained no renderable final text; result.payloads was empty or contained no text payloads\"\n    };\n  }\n  const obj = JSON.parse(candidate.trim());\n\n  if (obj && typeof obj === \"object\") {\n    const resolvedTaskId = typeof obj.TASK_ID === \"string\" && obj.TASK_ID.trim()\n      ? obj.TASK_ID.trim()\n      : (fallbackTaskId ? String(fallbackTaskId) : null);\n    if (resolvedTaskId && typeof obj.STATUS === \"string\" && typeof obj.SUMMARY === \"string\") {\n      return {\n        kind: \"result\",\n        value: { ...resultBase(resolvedTaskId), ...obj, TASK_ID: resolvedTaskId }\n      };\n    }\n    if (resolvedTaskId && typeof obj.CHECKPOINT_ID === \"string\" && typeof obj.QUESTION_OR_DECISION === \"string\") {\n      return { kind: \"checkpoint\", value: { ...obj, TASK_ID: resolvedTaskId } };\n    }\n  }\n\n  return { kind: \"invalid\", error: \"JSON parsed but did not match known contracts\" };\n}`;

  if (!runner.includes(oldParser)) throw new Error("expected parser block not found");
  runner = runner.replace(oldParser, newParser);
  runner = runner.replaceAll("parseOrchestrationResult(text)", "parseOrchestrationResult(text, taskId)");
  runner = runner.replace("parsed = parseOrchestrationResult(finalText);", "parsed = parseOrchestrationResult(finalText, taskId);");
  runner = runner.replace("const cloudParsed = parseOrchestrationResult(cloudFinal);", "const cloudParsed = parseOrchestrationResult(cloudFinal, taskId);");
  fs.writeFileSync(runnerPath, runner);

  const testPath = path.join(worktree, "test/orchestration-nl-timeout-regression.test.tsx");
  let testText = fs.readFileSync(testPath, "utf8");
  if (!testText.includes("normalizes missing TASK_ID from authoritative task context")) {
    testText += `\n\ntest(\"NL adapter normalizes missing TASK_ID from authoritative task context\", () => {\n  const text = fs.readFileSync(\"scripts/orchestration-run-issue-openclaw.mjs\", \"utf8\");\n  assert.ok(text.includes(\"function parseOrchestrationResult(text, fallbackTaskId = null)\"));\n  assert.ok(text.includes(\"fallbackTaskId ? String(fallbackTaskId) : null\"));\n  assert.ok(text.includes(\"value: { ...resultBase(resolvedTaskId), ...obj, TASK_ID: resolvedTaskId }\"));\n  assert.ok(text.includes(\"parseStructured: (text) => parseOrchestrationResult(text, taskId)\"));\n});\n`;
  }
  fs.writeFileSync(testPath, testText);

  run(process.execPath, ["--check", "scripts/orchestration-run-issue-openclaw.mjs"], { cwd: worktree, capture: true });
  const hostTsx = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  if (!fs.existsSync(hostTsx)) throw new Error(`host tsx binary not found at ${hostTsx}`);
  run(hostTsx, ["--test", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree, capture: true });
  run("git", ["diff", "--check"], { cwd: worktree, capture: true });

  run("git", ["add", "scripts/orchestration-run-issue-openclaw.mjs", "test/orchestration-nl-timeout-regression.test.tsx"], { cwd: worktree });
  run("git", ["commit", "-m", "Normalize local orchestration result task ids"], { cwd: worktree });
  run("git", ["push", "-u", "origin", branch], { cwd: worktree });
  const pr = run("gh", ["pr", "create", "--repo", repo, "--base", "main", "--head", branch, "--title", "Normalize Ollama result contracts with authoritative task id", "--body", "P0 routing repair: local Ollama often returns valid STATUS/SUMMARY JSON but omits TASK_ID, even though the runner already has the authoritative task id. Normalize that known field and fill standard result defaults before declaring structured output invalid, preventing unnecessary cloud fallback. Adds focused regression. Refs #294 #337 #365."], { cwd: worktree, capture: true }).trim();
  console.log(`PR=${pr}`);
} finally {
  try { run("git", ["worktree", "remove", "--force", worktree]); } catch {}
}
