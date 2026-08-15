import { execFileSync } from "node:child_process";
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

function gitNameSet(workspace, args) {
  try {
    const out = execFileSync("git", ["-C", workspace, ...args], {
      encoding: "utf8",
      timeout: 30_000
    });
    return new Set(String(out ?? "").split("\n").map((s) => s.trim()).filter(Boolean));
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
    for (const name of set) names.add(normalizeRepoPath(name));
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

export function verifyOrchestrationResultEvidenceV1({ parsed, taskId, localAgentId }) {
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

  const workspace = resolveAgentWorkspace(localAgentId);
  if (workspace && normalizedFiles.length > 0) {
    const evidenceNames = collectWorkspaceEvidence(workspace);
    for (const filePath of normalizedFiles) {
      if (!evidenceNames.has(filePath)) {
        return fail(`PASS claims changed file not present in actual git evidence for ${localAgentId}: ${filePath}`);
      }
    }
  }

  const claimedPr = parseClaimedPr(value.PR);
  if (value.PR && !claimedPr) {
    return fail("PASS claims a PR but it is not machine-verifiable (use PR object with number/url or a #number/URL string)");
  }

  if (claimedPr) {
    let actual;
    try {
      actual = JSON.parse(execFileSync("gh", ["pr", "view", claimedPr.locator, "--json", "number,url,state,mergeable"], {
        encoding: "utf8",
        timeout: 30_000
      }));
    } catch (err) {
      return fail(`Could not verify claimed PR: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (claimedPr.claimedNumber !== null && claimedPr.claimedNumber !== Number(actual.number)) {
      return fail(`Claimed PR number ${claimedPr.claimedNumber} does not match GitHub PR ${actual.number}`);
    }

    const claimedMergeable = normalizeMergeable(value.MERGE_STATUS);
    const actualMergeable = normalizeMergeable(actual.mergeable);
    if (String(actual.state ?? "").toUpperCase() === "OPEN" && ["MERGEABLE", "CONFLICTING"].includes(actualMergeable)) {
      if (claimedMergeable !== actualMergeable) {
        return fail(`Claimed MERGE_STATUS ${claimedMergeable || "<empty>"} but GitHub reports ${actualMergeable}`);
      }
    }
  }

  return { ok: true };
}
