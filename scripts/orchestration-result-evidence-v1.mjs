import { execFileSync } from "node:child_process";

const PLACEHOLDER_PATH_RE = /^(?:path\/to\/|\/path\/to\/|example\/|todo\/|tbd\/)/i;
const PLACEHOLDER_TASK_IDS = new Set(["unknown", "issue-or-task-id", "task-id", "issue-id"]);
const GENERIC_TESTS_RE = /^(?:command\/results|tests?|n\/a|none|unknown|tbd)$/i;

function fail(reason) {
  return { ok: false, kind: "INVALID_STRUCTURED_OUTPUT", reason };
}

function normalizeMergeable(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function verifyOrchestrationResultEvidenceV1({ parsed, taskId }) {
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
  for (const file of files) {
    const path = String(file ?? "").trim();
    if (!path || PLACEHOLDER_PATH_RE.test(path) || path.includes("path/to/")) {
      return fail(`PASS contains placeholder FILES_CHANGED entry: ${path || "<empty>"}`);
    }
  }

  const tests = String(value.TESTS ?? "").trim();
  if (!tests || GENERIC_TESTS_RE.test(tests)) {
    return fail(`PASS lacks concrete test evidence: ${tests || "<empty>"}`);
  }

  const pr = value.PR;
  if (pr && typeof pr === "object") {
    const prUrl = String(pr.url ?? "").trim();
    if (!/^https:\/\/github\.com\//i.test(prUrl)) {
      return fail("PASS claims a PR without a valid GitHub URL");
    }

    let actual;
    try {
      actual = JSON.parse(execFileSync("gh", ["pr", "view", prUrl, "--json", "number,url,state,mergeable"], {
        encoding: "utf8",
        timeout: 30_000
      }));
    } catch (err) {
      return fail(`Could not verify claimed PR: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (Number.isFinite(Number(pr.number)) && Number(pr.number) !== Number(actual.number)) {
      return fail(`Claimed PR number ${pr.number} does not match GitHub PR ${actual.number}`);
    }
    if (String(actual.state ?? "").toUpperCase() !== "OPEN" && String(value.MERGE_STATUS ?? "").toUpperCase() === "MERGEABLE") {
      return fail(`Claimed MERGEABLE but GitHub PR state is ${actual.state}`);
    }

    const claimedMergeable = normalizeMergeable(value.MERGE_STATUS);
    const actualMergeable = normalizeMergeable(actual.mergeable);
    if (claimedMergeable === "MERGEABLE" && actualMergeable !== "MERGEABLE") {
      return fail(`Claimed MERGEABLE but GitHub reports ${actualMergeable || "UNKNOWN"}`);
    }
    if (claimedMergeable === "CONFLICTING" && actualMergeable === "MERGEABLE") {
      return fail("Claimed CONFLICTING but GitHub reports MERGEABLE");
    }
  }

  return { ok: true };
}
