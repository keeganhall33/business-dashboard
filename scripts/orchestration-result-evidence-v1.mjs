import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PLACEHOLDER_PATH_RE = /^(?:path\/to\/|\/path\/to\/|example\/|todo\/|tbd\/)/i;
const PLACEHOLDER_TASK_IDS = new Set(["unknown", "issue-or-task-id", "task-id", "issue-id"]);
const GENERIC_TESTS_RE = /^(?:command\/results|tests?|n\/a|none|unknown|tbd)$/i;

function fail(reason) {
  return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT", reason };
}

function normalizeMergeable(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeRepoPath(value) {
  return String(value ?? "").trim().replace(/^\.\//, "");
}

function resolveAgentWorkspace(localAgentId) {
  if (!localAgentId) return null;
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const agents = config?.agents;
    if (Array.isArray(agents?.list)) {
      const entry = agents.list.find((item) => (item?.id ?? item?.name) === localAgentId);
      return typeof entry?.workspace === "string" ? entry.workspace : null;
    }
    if (agents?.entries && typeof agents.entries === "object") {
      const entry = agents.entries[localAgentId];
      return typeof entry?.workspace === "string" ? entry.workspace : null;
    }
  } catch {}
  return null;
}

function git(workspace, args, opts = {}) {
  return execFileSync("git", ["-C", workspace, ...args], {
    encoding: "utf8",
    timeout: opts.timeout ?? 30_000,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function gitOk(workspace, args) {
  const out = spawnSync("git", ["-C", workspace, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    stdio: "ignore"
  });
  return out.status === 0;
}

function gitNameSet(workspace, args) {
  try {
    return new Set(git(workspace, args).split("\n").map((s) => normalizeRepoPath(s)).filter(Boolean));
  } catch {
    return new Set();
  }
}

function collectWorkspaceEvidence(workspace) {
  const names = new Set();
  for (const set of [
    gitNameSet(workspace, ["diff", "--name-only"]),
    gitNameSet(workspace, ["diff", "--cached", "--name-only"]),
    gitNameSet(workspace, ["diff", "--name-only", "origin/main...HEAD"])
  ]) {
    for (const name of set) names.add(name);
  }
  return names;
}

function parseClaimedPr(pr) {
  if (!pr) return null;
  if (typeof pr === "object") {
    const url = String(pr.url ?? "").trim();
    const number = Number(pr.number);
    if (url) return { locator: url, claimedNumber: Number.isFinite(number) ? number : null };
    if (Number.isFinite(number)) return { locator: String(number), claimedNumber: number };
    return null;
  }
  if (typeof pr === "string") {
    const text = pr.trim();
    const urlMatch = text.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/i);
    if (urlMatch) return { locator: urlMatch[0], claimedNumber: Number(urlMatch[1]) };
    const numberMatch = text.match(/#(\d+)\b/);
    if (numberMatch) return { locator: numberMatch[1], claimedNumber: Number(numberMatch[1]) };
  }
  return null;
}

function parseTaskPrNumber(taskBody) {
  const text = String(taskBody ?? "");
  const explicit = text.match(/\bPR\s*#(\d+)\b/i);
  if (explicit) return Number(explicit[1]);
  const url = text.match(/github\.com\/[^\s]+\/pull\/(\d+)/i);
  return url ? Number(url[1]) : null;
}

function readPr(locator) {
  return JSON.parse(execFileSync("gh", [
    "pr", "view", String(locator),
    "--json", "number,url,state,mergeable,headRefName,headRefOid,baseRefName"
  ], {
    encoding: "utf8",
    timeout: 30_000
  }));
}

function taskRequiresCurrentMainReconcile(taskBody) {
  const text = String(taskBody ?? "");
  return /\bcurrent\s+(?:origin\/)?main\b/i.test(text) && /\b(?:reconcil|rebase|merge|conflict)\w*\b/i.test(text);
}

export function verifyOrchestrationResultEvidenceV1({ parsed, taskId, taskBody, localAgentId }) {
  if (!parsed || parsed.kind !== "result" || !parsed.value || typeof parsed.value !== "object") {
    return { ok: true };
  }

  const value = parsed.value;
  const expectedTaskId = String(taskId ?? "").trim();
  const actualTaskId = String(value.TASK_ID ?? "").trim();

  if (!actualTaskId || PLACEHOLDER_TASK_IDS.has(actualTaskId.toLowerCase())) {
    return fail(`TASK_ID is missing or placeholder: ${actualTaskId || "<empty>"}`);
  }
  if (expectedTaskId && actualTaskId !== expectedTaskId) {
    return fail(`TASK_ID mismatch: expected ${expectedTaskId}, got ${actualTaskId}`);
  }

  const status = String(value.STATUS ?? "").trim().toUpperCase();
  if (status !== "PASS") return { ok: true };

  const workspace = resolveAgentWorkspace(localAgentId);
  if (!workspace) return fail(`Could not resolve workspace for ${localAgentId || "<none>"}`);

  let repoRoot;
  let headSha;
  try {
    repoRoot = git(workspace, ["rev-parse", "--show-toplevel"]);
    headSha = git(workspace, ["rev-parse", "HEAD"]);
  } catch (err) {
    return fail(`PASS cannot be accepted because workspace is not a valid git worktree: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (path.resolve(repoRoot) !== path.resolve(workspace)) {
    return fail(`Configured workspace is not the git root: workspace=${workspace}, gitRoot=${repoRoot}`);
  }

  try {
    git(workspace, ["fetch", "origin", "main"], { timeout: 60_000 });
  } catch (err) {
    return fail(`Could not refresh origin/main for machine evidence: ${err instanceof Error ? err.message : String(err)}`);
  }

  const files = Array.isArray(value.FILES_CHANGED) ? value.FILES_CHANGED : [];
  const normalizedFiles = files.map(normalizeRepoPath);
  for (const filePath of normalizedFiles) {
    if (!filePath || filePath.startsWith("/") || PLACEHOLDER_PATH_RE.test(filePath) || filePath.includes("path/to/")) {
      return fail(`PASS contains invalid or placeholder FILES_CHANGED entry: ${filePath || "<empty>"}`);
    }
  }

  const tests = String(value.TESTS ?? "").trim();
  if (!tests || GENERIC_TESTS_RE.test(tests)) {
    return fail(`PASS lacks concrete test evidence: ${tests || "<empty>"}`);
  }

  const evidenceNames = collectWorkspaceEvidence(workspace);
  for (const filePath of normalizedFiles) {
    if (!evidenceNames.has(filePath)) {
      return fail(`PASS claims changed file not present in machine git evidence for ${localAgentId}: ${filePath}`);
    }
  }

  const claimedPr = parseClaimedPr(value.PR);
  const taskPrNumber = parseTaskPrNumber(taskBody);
  if (value.PR && !claimedPr) {
    return fail("PASS claims a PR but it is not machine-verifiable (use PR object with number/url or a #number/URL string)");
  }

  const prLocator = claimedPr?.locator ?? (Number.isFinite(taskPrNumber) ? String(taskPrNumber) : null);
  if (prLocator) {
    let actual;
    try {
      actual = readPr(prLocator);
    } catch (err) {
      return fail(`Could not verify PR ${prLocator}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (claimedPr?.claimedNumber !== null && claimedPr?.claimedNumber !== undefined && claimedPr.claimedNumber !== Number(actual.number)) {
      return fail(`Claimed PR number ${claimedPr.claimedNumber} does not match GitHub PR ${actual.number}`);
    }
    if (Number.isFinite(taskPrNumber) && Number(actual.number) !== taskPrNumber) {
      return fail(`Task targets PR #${taskPrNumber} but result/GitHub resolved PR #${actual.number}`);
    }
    if (String(actual.state ?? "").toUpperCase() !== "OPEN") {
      return fail(`Task PR #${actual.number} is not OPEN (state=${actual.state})`);
    }

    const actualHead = String(actual.headRefOid ?? "").trim();
    if (actualHead && actualHead !== headSha) {
      return fail(`Worker HEAD ${headSha} does not match GitHub PR head ${actualHead}`);
    }

    const claimedMergeable = normalizeMergeable(value.MERGE_STATUS);
    const actualMergeable = normalizeMergeable(actual.mergeable);
    if (["MERGEABLE", "CONFLICTING"].includes(claimedMergeable) && claimedMergeable !== actualMergeable) {
      return fail(`Claimed MERGE_STATUS ${claimedMergeable} but GitHub reports ${actualMergeable || "UNKNOWN"}`);
    }

    if (taskRequiresCurrentMainReconcile(taskBody)) {
      const containsCurrentMain = gitOk(workspace, ["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
      if (!containsCurrentMain) {
        return fail(`Task requires reconciliation with current main, but origin/main is not an ancestor of worker/PR HEAD ${headSha}`);
      }
    }

    value.PR = {
      number: Number(actual.number),
      url: String(actual.url),
      headRefName: String(actual.headRefName ?? ""),
      headRefOid: actualHead,
      baseRefName: String(actual.baseRefName ?? "")
    };
    value.MERGE_STATUS = actualMergeable || "UNKNOWN";
  }

  value.FILES_CHANGED = Array.from(evidenceNames).sort();
  value.LOCAL_RESULT = "SUCCESS";
  value.ESCALATED_TO_CLOUD = false;
  value.CLOUD_USAGE = null;
  value.CLOUD_COST = null;

  return {
    ok: true,
    machineEvidence: {
      workspace,
      headSha,
      files: value.FILES_CHANGED
    }
  };
}
