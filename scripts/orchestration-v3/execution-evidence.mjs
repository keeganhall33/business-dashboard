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

function referencedPrNumber(body) {
  const text = String(body ?? "");
  const direct = text.match(/\bPR\s*#\s*(\d+)\b/i) ?? text.match(/\bpull\s*request\s*#\s*(\d+)\b/i);
  if (direct) return Number(direct[1]);
  const url = text.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  return url ? Number(url[1]) : null;
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
  const baselineFailures = [];

  if (!gitExe || !ghExe) {
    return { attempted: true, verified: false, errors: ["HOST_VERIFY_REQUIRED_EXECUTABLE_MISSING"], successfulCommands, failedCommands };
  }

  const record = (result) => {
    if (result.ok) successfulCommands.push(result.command);
    else failedCommands.push(`${result.command} [exit ${String(result.status)}] ${result.stderr || result.error || ""}`.trim());
    return result;
  };
  const runAt = (cwd, command, args, timeout = 180_000) => record(runChecked(command, args, cwd, timeout));
  const run = (command, args, timeout = 180_000) => runAt(repoRoot, command, args, timeout);

  const branchRes = run(gitExe, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headRes = run(gitExe, ["rev-parse", "HEAD"]);
  const baseRes = run(gitExe, ["rev-parse", "refs/remotes/origin/main"]);
  if (!branchRes.ok || !headRes.ok || !baseRes.ok) errors.push("HOST_VERIFY_GIT_IDENTITY_FAILED");

  const branch = branchRes.stdout;
  const persistentHead = headRes.stdout;
  const base = baseRes.stdout;

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
  const mutationRequired = explicitMutationRequired || !(explicitEvidenceOnly || qaEvaluationStream || inferredEvidenceOnly);

  if (mutationRequired && (!branch || branch === "HEAD")) errors.push("HOST_VERIFY_BRANCH_REQUIRED");
  if (mutationRequired && (!persistentHead || !base || persistentHead === base)) errors.push("HOST_VERIFY_REAL_MUTATION_REQUIRED");

  let matchingPr = null;
  let targetHead = persistentHead;
  let targetRoot = repoRoot;
  let temporaryWorktree = null;

  if (mutationRequired) {
    let prs = [];
    if (branch && branch !== "HEAD") {
      const prRes = run(ghExe, ["pr", "list", "--repo", ORCHESTRATION_V3.repo, "--head", branch, "--state", "open", "--limit", "10", "--json", "number,headRefName,headRefOid,baseRefName,url"]);
      if (prRes.ok) {
        try { prs = JSON.parse(prRes.stdout || "[]"); } catch { errors.push("HOST_VERIFY_PR_JSON_INVALID"); }
      } else {
        errors.push("HOST_VERIFY_PR_LOOKUP_FAILED");
      }
    }
    matchingPr = prs.find((pr) => String(pr.headRefOid ?? "") === persistentHead && String(pr.headRefName ?? "") === branch) ?? null;
    if (!matchingPr) errors.push("HOST_VERIFY_MATCHING_PR_REQUIRED");
  } else {
    const prNumber = referencedPrNumber(issueBody);
    if (!prNumber) {
      errors.push("HOST_VERIFY_REFERENCED_PR_REQUIRED");
    } else {
      const prRes = run(ghExe, ["pr", "view", String(prNumber), "--repo", ORCHESTRATION_V3.repo, "--json", "number,headRefName,headRefOid,baseRefName,url"]);
      if (!prRes.ok) {
        errors.push("HOST_VERIFY_REFERENCED_PR_LOOKUP_FAILED");
      } else {
        try {
          matchingPr = JSON.parse(prRes.stdout);
          targetHead = String(matchingPr?.headRefOid ?? "");
        } catch {
          errors.push("HOST_VERIFY_REFERENCED_PR_JSON_INVALID");
        }
      }
      if (targetHead) {
        const fetchRes = run(gitExe, ["fetch", "--no-tags", "origin", `pull/${prNumber}/head`], 180_000);
        if (!fetchRes.ok) errors.push("HOST_VERIFY_REFERENCED_PR_FETCH_FAILED");
        const targetRes = run(gitExe, ["cat-file", "-e", `${targetHead}^{commit}`]);
        if (!targetRes.ok) errors.push("HOST_VERIFY_REFERENCED_PR_HEAD_UNAVAILABLE");
      }
    }
  }

  const changedRes = targetHead && base && targetHead !== base
    ? run(gitExe, ["diff", "--name-only", `${base}...${targetHead}`])
    : { ok: false, stdout: "" };
  const changedFiles = changedRes.ok ? changedRes.stdout.split("\n").filter(Boolean) : [];
  if (changedFiles.length === 0) errors.push(mutationRequired ? "HOST_VERIFY_CHANGED_FILES_REQUIRED" : "HOST_VERIFY_REFERENCED_PR_CHANGED_FILES_REQUIRED");

  const diffCheckRes = targetHead && base && targetHead !== base
    ? run(gitExe, ["diff", "--check", `${base}...${targetHead}`])
    : run(gitExe, ["diff", "--check"]);
  if (!diffCheckRes.ok) errors.push("HOST_VERIFY_DIFF_CHECK_FAILED");

  if (!mutationRequired && targetHead && errors.every((error) => !error.startsWith("HOST_VERIFY_REFERENCED_PR_"))) {
    temporaryWorktree = fs.mkdtempSync(path.join(os.tmpdir(), `jeeves-v3-qa-${identity.issue}-`));
    const addRes = run(gitExe, ["worktree", "add", "--detach", temporaryWorktree, targetHead], 180_000);
    if (!addRes.ok) {
      errors.push("HOST_VERIFY_QA_WORKTREE_CREATE_FAILED");
      temporaryWorktree = null;
    } else {
      targetRoot = temporaryWorktree;
      const sourceNodeModules = path.join(repoRoot, "node_modules");
      const targetNodeModules = path.join(targetRoot, "node_modules");
      if (fs.existsSync(sourceNodeModules) && !fs.existsSync(targetNodeModules)) {
        try { fs.symlinkSync(sourceNodeModules, targetNodeModules, "dir"); } catch {}
      }
    }
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
      result = runAt(targetRoot, npxExe, ["tsx", "--test", testFile], 300_000);
    } else {
      result = runAt(targetRoot, nodeExe, ["--test", testFile], 300_000);
    }
    if (!result.ok) {
      focusedTestsOk = false;
      errors.push(`HOST_VERIFY_FOCUSED_TEST_FAILED:${testFile}`);
    }
  }

  const testRequired = requiresTestExecution(issueBody);
  const scripts = packageScripts(targetRoot);
  let typecheckOk = true;
  let buildOk = true;
  let supplementalValidationObserved = changedTestFiles.length > 0 && focusedTestsOk;

  if (testRequired && fs.existsSync(path.join(targetRoot, "tsconfig.json")) && npxExe) {
    const typecheck = runAt(targetRoot, npxExe, ["tsc", "--noEmit"], 300_000);
    supplementalValidationObserved = true;
    if (!typecheck.ok && !mutationRequired) {
      const baseline = runAt(repoRoot, npxExe, ["tsc", "--noEmit"], 300_000);
      if (!baseline.ok) baselineFailures.push("HOST_VERIFY_BASELINE_TYPECHECK_FAILED");
      else {
        typecheckOk = false;
        errors.push("HOST_VERIFY_TYPECHECK_REGRESSION");
      }
    } else if (!typecheck.ok) {
      typecheckOk = false;
      errors.push("HOST_VERIFY_TYPECHECK_FAILED");
    }
  }

  if (testRequired && scripts.build && npmExe) {
    const build = runAt(targetRoot, npmExe, ["run", "build"], 600_000);
    supplementalValidationObserved = true;
    if (!build.ok && !mutationRequired) {
      const baseline = runAt(repoRoot, npmExe, ["run", "build"], 600_000);
      if (!baseline.ok) baselineFailures.push("HOST_VERIFY_BASELINE_BUILD_FAILED");
      else {
        buildOk = false;
        errors.push("HOST_VERIFY_BUILD_REGRESSION");
      }
    } else if (!build.ok) {
      buildOk = false;
      errors.push("HOST_VERIFY_BUILD_FAILED");
    }
  }

  if (testRequired && !supplementalValidationObserved) errors.push("HOST_VERIFY_TEST_BUILD_TYPECHECK_NOT_DERIVABLE");

  if (temporaryWorktree) {
    const cleanup = run(gitExe, ["worktree", "remove", "--force", temporaryWorktree], 180_000);
    if (!cleanup.ok) errors.push("HOST_VERIFY_QA_WORKTREE_CLEANUP_FAILED");
  }

  const cleanRes = run(gitExe, ["status", "--porcelain"]);
  const clean = cleanRes.ok && cleanRes.stdout.trim() === "";
  if (!clean) errors.push("HOST_VERIFY_WORKTREE_NOT_CLEAN");

  const verified = errors.length === 0 && Boolean(matchingPr) && changedFiles.length > 0 && diffCheckRes.ok && focusedTestsOk && typecheckOk && buildOk && clean;

  return {
    attempted: true,
    verified,
    issue: identity.issue,
    workerId: identity.workerId,
    repoRoot,
    branch,
    head: targetHead,
    persistentHead,
    base,
    prNumber: matchingPr?.number ?? null,
    prUrl: matchingPr?.url ?? null,
    changedFiles,
    changedTestFiles,
    diffCheckPassed: Boolean(diffCheckRes.ok),
    focusedTestsPassed: focusedTestsOk,
    typecheckPassed: typecheckOk,
    buildPassed: buildOk,
    baselineFailures,
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
    const qaReadOnlyGuard = command === "git" && workerId === "local-f" ? [
      'case "$1" in',
      '  add|commit|push|merge|rebase|cherry-pick|checkout|switch|reset|clean)',
      '    printf \'%s\\tgit\\t95\\tGUARD_QA_READ_ONLY blocked=%s\\n\' "$(date +%s)" "$*" >> "$ORCH_EXECUTION_JOURNAL"',
      '    echo "V3_GUARD_QA_READ_ONLY: local-f may validate but may not mutate the persistent QA worktree" >&2',
      '    exit 95',
      '    ;;',
      'esac'
    ] : [];
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
      ...qaReadOnlyGuard,
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
    qaReadOnlyGuardTriggered: gitEvents.some((event) => event.status === 95 && /GUARD_QA_READ_ONLY/.test(event.args)),
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
