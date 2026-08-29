import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ORCHESTRATION_V3 } from "./config.mjs";

const evidenceReadCounts = new Map();

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

function runChecked(command, args, cwd, timeout = 180_000) {
  const res = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: String(res.stdout ?? "").trim(),
    stderr: String(res.stderr ?? "").trim(),
    error: res.error?.message ?? null,
    command: [command, ...args].join(" ")
  };
}

function parseHarnessIdentity(journalPath) {
  const match = String(journalPath ?? "").match(/jeeves-v3-evidence-(\d+)-(local-[abcdef])-/);
  if (!match) return null;
  return { issue: Number(match[1]), workerId: match[2] };
}

export function classifyChangedTestFiles(files) {
  return (files ?? []).filter((file) =>
    /(?:^|\/)(?:test|tests)\/.*\.(?:mjs|js|ts|tsx)$/i.test(file) ||
    /\.(?:test|spec)\.(?:mjs|js|ts|tsx)$/i.test(file)
  );
}

export function shouldAttemptCloudHostVerification(readCount) {
  return Number(readCount) >= 2;
}

function packageScripts(repoRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts ?? {};
  } catch {
    return {};
  }
}

function hostVerifyCloudFallback(journalPath) {
  const identity = parseHarnessIdentity(journalPath);
  if (!identity) return { attempted: false, verified: false, errors: ["HOST_VERIFY_IDENTITY_UNAVAILABLE"], successfulCommands: [], failedCommands: [] };

  const cfg = ORCHESTRATION_V3.workers[identity.workerId];
  if (!cfg) return { attempted: false, verified: false, errors: ["HOST_VERIFY_WORKER_UNMAPPED"], successfulCommands: [], failedCommands: [] };

  const repoRoot = path.resolve(cfg.worktree);
  const gitExe = resolveExecutable("git");
  const ghExe = resolveExecutable("gh");
  const nodeExe = process.execPath;
  const npxExe = resolveExecutable("npx");
  const npmExe = resolveExecutable("npm");
  const successfulCommands = [];
  const failedCommands = [];
  const errors = [];

  if (!gitExe || !ghExe) {
    return { attempted: true, verified: false, errors: ["HOST_VERIFY_REQUIRED_EXECUTABLE_MISSING"], successfulCommands, failedCommands };
  }

  const run = (command, args, timeout = 180_000) => {
    const result = runChecked(command, args, repoRoot, timeout);
    if (result.ok) successfulCommands.push(result.command);
    else failedCommands.push(`${result.command} [exit ${String(result.status)}] ${result.stderr || result.error || ""}`.trim());
    return result;
  };

  const branchRes = run(gitExe, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headRes = run(gitExe, ["rev-parse", "HEAD"]);
  const baseRes = run(gitExe, ["rev-parse", "refs/remotes/origin/main"]);
  if (!branchRes.ok || !headRes.ok || !baseRes.ok) errors.push("HOST_VERIFY_GIT_IDENTITY_FAILED");

  const branch = branchRes.stdout;
  const head = headRes.stdout;
  const base = baseRes.stdout;
  if (!branch || branch === "HEAD") errors.push("HOST_VERIFY_BRANCH_REQUIRED");
  // Mutation requirements are evaluated after reading task mutability.
  let issueBody = "";
  const issueRes = run(ghExe, ["issue", "view", String(identity.issue), "--repo", ORCHESTRATION_V3.repo, "--json", "body", "--jq", ".body"]);
  if (issueRes.ok) issueBody = issueRes.stdout;
  else errors.push("HOST_VERIFY_ISSUE_READ_FAILED");

  const explicitEvidenceOnly =
    /(?:^|\n)\s*(?:\*\*)?task_mutability(?:\*\*)?\s*:\s*VALIDATION_EVIDENCE_ONLY\b/im.test(issueBody);

  const explicitMutationRequired =
    /(?:^|\n)\s*(?:\*\*)?task_mutability(?:\*\*)?\s*:\s*IMPLEMENTATION_MUTATION_REQUIRED\b/im.test(issueBody);

  const qaEvaluationStream =
    /(?:^|\n)\s*(?:\*\*)?stream(?:\*\*)?\s*:\s*QA_EVALUATION\b/im.test(issueBody);

  const inferredEvidenceOnly =
    /\b(evidence[- ]only|validation[- ]only|tests?\/evidence[- ]only|QA tests?\/evidence[- ]only)\b/i.test(issueBody) &&
    /\b(no (?:product |repository |code )?mutation|zero repository mutation|without (?:a )?(?:git |repository )?mutation|do not (?:require|fabricate) (?:a )?git mutation)\b/i.test(issueBody);

  const mutationRequired =
    explicitMutationRequired ||
    !(explicitEvidenceOnly || qaEvaluationStream || inferredEvidenceOnly);

  if (mutationRequired && (!head || !base || head === base)) {
    errors.push("HOST_VERIFY_REAL_MUTATION_REQUIRED");
  }


  let prs = [];
  if (branch && branch !== "HEAD") {
    const prRes = run(ghExe, ["pr", "list", "--repo", ORCHESTRATION_V3.repo, "--head", branch, "--state", "open", "--limit", "10", "--json", "number,headRefName,headRefOid,baseRefName,url"]);
    if (prRes.ok) {
      try { prs = JSON.parse(prRes.stdout || "[]"); } catch { errors.push("HOST_VERIFY_PR_JSON_INVALID"); }
    } else {
      errors.push("HOST_VERIFY_PR_LOOKUP_FAILED");
    }
  }
  const matchingPr = prs.find((pr) => String(pr.headRefOid ?? "") === head && String(pr.headRefName ?? "") === branch);
  if (mutationRequired && !matchingPr) {
    errors.push("HOST_VERIFY_MATCHING_PR_REQUIRED");
  }
  const changedRes = head && base && head !== base
    ? run(gitExe, ["diff", "--name-only", `${base}...${head}`])
    : { ok: false, stdout: "" };
  const changedFiles = changedRes.ok ? changedRes.stdout.split("\n").filter(Boolean) : [];
  if (mutationRequired && changedFiles.length === 0) {
    errors.push("HOST_VERIFY_CHANGED_FILES_REQUIRED");
  }
  const diffCheckRes =
    mutationRequired && head && base && head !== base
      ? run(gitExe, ["diff", "--check", `${base}...${head}`])
      : run(gitExe, ["diff", "--check"]);

  if (!diffCheckRes.ok) {
    errors.push("HOST_VERIFY_DIFF_CHECK_FAILED");
  }

  const changedTestFiles = classifyChangedTestFiles(changedFiles);
  let focusedTestsOk = true;
  for (const testFile of changedTestFiles) {
    const ext = path.extname(testFile).toLowerCase();
    let result;
    if ([".ts", ".tsx"].includes(ext)) {
      if (!npxExe) {
        focusedTestsOk = false;
        errors.push("HOST_VERIFY_NPX_REQUIRED_FOR_TS_TEST");
        break;
      }
      result = run(npxExe, ["tsx", "--test", testFile], 300_000);
    } else {
      result = run(nodeExe, ["--test", testFile], 300_000);
    }
    if (!result.ok) {
      focusedTestsOk = false;
      errors.push(`HOST_VERIFY_FOCUSED_TEST_FAILED:${testFile}`);
    }
  }

  const testRequired = requiresTestExecution(issueBody);
  const scripts = packageScripts(repoRoot);
  let typecheckOk = true;
  let buildOk = true;
  let supplementalValidationObserved = changedTestFiles.length > 0 && focusedTestsOk;

  if (testRequired && fs.existsSync(path.join(repoRoot, "tsconfig.json")) && npxExe) {
    const typecheck = run(npxExe, ["tsc", "--noEmit"], 300_000);
    typecheckOk = typecheck.ok;
    supplementalValidationObserved = true;
    if (!typecheck.ok) errors.push("HOST_VERIFY_TYPECHECK_FAILED");
  }

  if (testRequired && scripts.build && npmExe) {
    const build = run(npmExe, ["run", "build"], 600_000);
    buildOk = build.ok;
    supplementalValidationObserved = true;
    if (!build.ok) errors.push("HOST_VERIFY_BUILD_FAILED");
  }

  if (testRequired && !supplementalValidationObserved) errors.push("HOST_VERIFY_TEST_BUILD_TYPECHECK_NOT_DERIVABLE");

  const cleanRes = run(gitExe, ["status", "--porcelain"]);
  const clean = cleanRes.ok && cleanRes.stdout.trim() === "";
  if (!clean) errors.push("HOST_VERIFY_WORKTREE_NOT_CLEAN");

  const verified =
    errors.length === 0 &&
    (!mutationRequired || Boolean(matchingPr)) &&
    (!mutationRequired || changedFiles.length > 0) &&
    diffCheckRes.ok &&
    focusedTestsOk &&
    typecheckOk &&
    buildOk &&
    clean;

  return {
    attempted: true,
    verified,
    issue: identity.issue,
    workerId: identity.workerId,
    repoRoot,
    branch,
    head,
    base,
    prNumber: matchingPr?.number ?? null,
    prUrl: matchingPr?.url ?? null,
    changedFiles,
    changedTestFiles,
    diffCheckPassed: Boolean(diffCheckRes.ok),
    focusedTestsPassed: focusedTestsOk,
    typecheckPassed: typecheckOk,
    buildPassed: buildOk,
    worktreeClean: clean,
    errors,
    successfulCommands,
    failedCommands
  };
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
    const guard = command === "git" ? [
      'if "$REAL" rev-parse --is-inside-work-tree >/dev/null 2>&1; then',
      '  worktree_deletions=$("$REAL" diff --name-only --diff-filter=D | /usr/bin/wc -l | /usr/bin/tr -d " ")',
      '  staged_deletions=$("$REAL" diff --cached --name-only --diff-filter=D | /usr/bin/wc -l | /usr/bin/tr -d " ")',
      '  total_deletions=$(( ${worktree_deletions:-0} + ${staged_deletions:-0} ))',
      '  case "$1" in reset|clean) ;;',
      '    *) if [ "$total_deletions" -ge 25 ]; then',
      '      printf \'%s\\tgit\\t96\\tGUARD_MASS_TRACKED_DELETION autoheal deletions=%s args=%s\\n\' "$(date +%s)" "$total_deletions" "$*" >> "$ORCH_EXECUTION_JOURNAL"',
      '      "$REAL" reset --hard HEAD >/dev/null 2>&1 || true',
      '      "$REAL" clean -fd >/dev/null 2>&1 || true',
      '      echo "V3_GUARD_MASS_TRACKED_DELETION: auto-healed disposable worktree after $total_deletions deletions" >&2',
      '      exit 96',
      '    fi ;;',
      '  esac',
      'fi',
      'if [ "$1" = "commit" ]; then',
      '  deletions=$("$REAL" diff --cached --name-only --diff-filter=D | /usr/bin/wc -l | /usr/bin/tr -d " ")',
      '  if [ "${deletions:-0}" -ge 25 ]; then',
      '    printf \'%s\\tgit\\t97\\tGUARD_MASS_TRACKED_DELETION commit staged_deletions=%s args=%s\\n\' "$(date +%s)" "$deletions" "$*" >> "$ORCH_EXECUTION_JOURNAL"',
      '    "$REAL" reset --hard HEAD >/dev/null 2>&1 || true',
      '    "$REAL" clean -fd >/dev/null 2>&1 || true',
      '    echo "V3_GUARD_MASS_TRACKED_DELETION: refusing git commit with $deletions staged deletions" >&2',
      '    exit 97',
      '  fi',
      'fi',
      'if [ "$1" = "push" ]; then',
      '  if "$REAL" rev-parse --verify refs/remotes/origin/main >/dev/null 2>&1; then',
      '    deletions=$("$REAL" diff --name-only --diff-filter=D refs/remotes/origin/main...HEAD | /usr/bin/wc -l | /usr/bin/tr -d " ")',
      '    if [ "${deletions:-0}" -ge 25 ]; then',
      '      printf \'%s\\tgit\\t98\\tGUARD_MASS_TRACKED_DELETION push deletions_vs_origin_main=%s args=%s\\n\' "$(date +%s)" "$deletions" "$*" >> "$ORCH_EXECUTION_JOURNAL"',
      '      echo "V3_GUARD_MASS_TRACKED_DELETION: refusing git push with $deletions deletions vs refs/remotes/origin/main" >&2',
      '      exit 98',
      '    fi',
      '  fi',
      'fi'
    ] : [];
    const shim = [
      "#!/bin/sh",
      `REAL=${shellQuote(real)}`,
      ...guard,
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

export function observedExecutionJournalLineCount(journalPath) {
  let raw = "";
  try { raw = fs.readFileSync(journalPath, "utf8"); } catch {}
  return raw.split("\n").filter(Boolean).length;
}

export function readObservedExecutionEvidence(journalPath, { startLine = 0 } = {}) {
  const readCount = (evidenceReadCounts.get(journalPath) ?? 0) + 1;
  evidenceReadCounts.set(journalPath, readCount);

  let raw = "";
  try { raw = fs.readFileSync(journalPath, "utf8"); } catch {}
  const lines = raw.split("\n").filter(Boolean).slice(Math.max(0, Number(startLine) || 0));
  const events = lines.map((line) => {
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
    massDeletionGuardTriggered: gitEvents.some((event) => [96, 97, 98].includes(event.status) && /GUARD_MASS_TRACKED_DELETION/.test(event.args)),
    massDeletionAutoHealed: gitEvents.some((event) => event.status === 96 && /autoheal/.test(event.args)),
    successfulCommands: events.filter((event) => event.status === 0).map((event) => `${event.command} ${event.args}`),
    failedCommands: events.filter((event) => event.status !== 0).map((event) => `${event.command} ${event.args} [exit ${event.status}]`),
    evidenceReadCount: readCount,
    hostVerification: null
  };

  if (shouldAttemptCloudHostVerification(readCount)) {
    const hostVerification = hostVerifyCloudFallback(journalPath);
    evidence.hostVerification = hostVerification;
    if (hostVerification.attempted && hostVerification.verified) {
      evidence.repoToolExecutionObserved = true;
      evidence.repoPreflightObserved = true;
      evidence.testExecutionObserved = true;
      evidence.gitDiffObserved = true;
      evidence.gitDiffCheckObserved = true;
      evidence.gitMutationCommandObserved = true;
      evidence.successfulCommands = [...evidence.successfulCommands, ...hostVerification.successfulCommands];
      evidence.failedCommands = [...evidence.failedCommands, ...hostVerification.failedCommands];
    } else if (hostVerification.attempted) {
      evidence.failedCommands = [...evidence.failedCommands, ...hostVerification.failedCommands, ...hostVerification.errors];
    }
  }

  return evidence;
}

export function requiresTestExecution(body) {
  return /\b(test|tests|build|typecheck|validation)\b/i.test(String(body ?? ""));
}

export function requiresDiffCheck(body) {
  return /git\s+diff\s+--check|diff[- ]check/i.test(String(body ?? ""));
}
