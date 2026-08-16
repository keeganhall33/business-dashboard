import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function resolveExecutable(name) {
  try {
    return execFileSync("/usr/bin/which", [name], { encoding: "utf8", timeout: 5_000 }).trim();
  } catch {
    return null;
  }
}

export function createObservedExecutionHarness({ issue, workerId }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `jeeves-v3-evidence-${issue}-${workerId}-`));
  const shimRoot = path.join(root, "bin");
  const journalPath = path.join(root, "commands.tsv");
  fs.mkdirSync(shimRoot, { recursive: true });
  fs.writeFileSync(journalPath, "", "utf8");

  const commands = ["git", "pnpm", "npm", "npx"];
  const resolved = {};
  for (const command of commands) {
    const real = resolveExecutable(command);
    if (!real) continue;
    resolved[command] = real;
    const shim = [
      "#!/bin/sh",
      `REAL=${shellQuote(real)}`,
      '"$REAL" "$@"',
      "status=$?",
      `printf '%s\\t%s\\t%s\\t%s\\n' "$(date +%s)" ${shellQuote(command)} "$status" "$*" >> "$ORCH_EXECUTION_JOURNAL"`,
      "exit $status",
      ""
    ].join("\n");
    const shimPath = path.join(shimRoot, command);
    fs.writeFileSync(shimPath, shim, "utf8");
    fs.chmodSync(shimPath, 0o755);
  }

  return {
    root,
    shimRoot,
    journalPath,
    resolved,
    envPatch: {
      PATH: `${shimRoot}:${process.env.PATH ?? ""}`,
      ORCH_EXECUTION_JOURNAL: journalPath
    }
  };
}

export function readObservedExecutionEvidence(journalPath) {
  let raw = "";
  try { raw = fs.readFileSync(journalPath, "utf8"); } catch {}
  const events = raw.split("\n").filter(Boolean).map((line) => {
    const [timestamp, command, statusText, ...rest] = line.split("\t");
    return {
      timestamp: Number(timestamp) || null,
      command,
      status: Number(statusText),
      args: rest.join("\t")
    };
  });
  const succeeded = (command, pattern) => events.some((event) => event.command === command && event.status === 0 && pattern.test(event.args));
  const gitEvents = events.filter((event) => event.command === "git");
  const testEvents = events.filter((event) => ["pnpm", "npm", "npx"].includes(event.command));

  const evidence = {
    toolCallCount: events.length,
    repoToolExecutionObserved: gitEvents.length > 0,
    repoPreflightObserved:
      succeeded("git", /\brev-parse\s+--show-toplevel\b/) &&
      succeeded("git", /\bstatus\s+--short\s+--branch\b/) &&
      succeeded("git", /\bremote\s+-v\b/),
    testExecutionObserved: testEvents.some((event) => event.status === 0 && /\b(test|build|typecheck|tsx\s+--test)\b/i.test(event.args)),
    gitDiffObserved: succeeded("git", /\bdiff\b/),
    gitDiffCheckObserved: succeeded("git", /\bdiff\s+--check\b/),
    gitMutationCommandObserved: gitEvents.some((event) => event.status === 0 && /\b(add|commit|push|merge|rebase|cherry-pick|checkout|switch)\b/i.test(event.args)),
    successfulCommands: events.filter((event) => event.status === 0).map((event) => `${event.command} ${event.args}`),
    failedCommands: events.filter((event) => event.status !== 0).map((event) => `${event.command} ${event.args} [exit ${event.status}]`)
  };
  return evidence;
}

export function requiresTestExecution(body) {
  return /\b(test|tests|build|typecheck|validation)\b/i.test(String(body ?? ""));
}

export function requiresDiffCheck(body) {
  return /git\s+diff\s+--check|diff[- ]check/i.test(String(body ?? ""));
}
