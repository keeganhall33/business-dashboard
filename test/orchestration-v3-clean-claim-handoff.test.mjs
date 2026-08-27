import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  branchMatchesIssue,
  prepareCleanWorktreeForIssue
} from "../scripts/orchestration-v3/preflight.mjs";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v3-clean-claim-"));
  const origin = path.join(root, "origin.git");
  const seed = path.join(root, "seed");
  const worker = path.join(root, "worker");

  fs.mkdirSync(seed);
  git(root, ["init", "--bare", origin]);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.email", "test@example.com"]);
  git(seed, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(seed, "README.md"), "base\n");
  git(seed, ["add", "README.md"]);
  git(seed, ["commit", "-m", "base"]);
  git(seed, ["remote", "add", "origin", origin]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(root, ["clone", origin, worker]);
  git(worker, ["switch", "main"]);
  git(worker, ["config", "user.email", "test@example.com"]);
  git(worker, ["config", "user.name", "Test"]);

  return { root, origin, seed, worker };
}

test("branchMatchesIssue rejects another issue and accepts issue-specific branches", () => {
  assert.equal(branchMatchesIssue("issue-845-worker", 845), true);
  assert.equal(branchMatchesIssue("issue-845-recommendation-contradiction", 845), true);
  assert.equal(branchMatchesIssue("issue-844-worker", 845), false);
  assert.equal(branchMatchesIssue("HEAD", 845), false);
});

test("clean detached/stale lane is moved to the claimed issue branch from canonical main", () => {
  const { worker } = fixture();
  const canonical = git(worker, ["rev-parse", "origin/main"]);
  git(worker, ["checkout", "--detach", canonical]);

  const result = prepareCleanWorktreeForIssue({ cwd: worker, issueNumber: 845, canonicalRef: "origin/main" });

  assert.equal(result.prepared, true);
  assert.equal(result.branch, "issue-845-worker");
  assert.equal(git(worker, ["rev-parse", "HEAD"]), canonical);
  assert.equal(git(worker, ["status", "--porcelain"]), "");
});

test("existing remote branch for the same issue is reused", () => {
  const { seed, worker } = fixture();
  git(seed, ["switch", "-c", "issue-845-existing"]);
  fs.writeFileSync(path.join(seed, "existing.txt"), "preserved\n");
  git(seed, ["add", "existing.txt"]);
  git(seed, ["commit", "-m", "existing issue work"]);
  git(seed, ["push", "-u", "origin", "issue-845-existing"]);

  const result = prepareCleanWorktreeForIssue({ cwd: worker, issueNumber: 845, canonicalRef: "origin/main" });

  assert.equal(result.reusedRemoteBranch, true);
  assert.equal(result.branch, "issue-845-existing");
  assert.equal(fs.readFileSync(path.join(worker, "existing.txt"), "utf8"), "preserved\n");
});

test("unpreserved committed work on a stale lane fails closed", () => {
  const { worker } = fixture();
  git(worker, ["switch", "-c", "issue-790-stale"]);
  fs.writeFileSync(path.join(worker, "local-only.txt"), "do not lose\n");
  git(worker, ["add", "local-only.txt"]);
  git(worker, ["commit", "-m", "local only"]);

  assert.throws(
    () => prepareCleanWorktreeForIssue({ cwd: worker, issueNumber: 845, canonicalRef: "origin/main" }),
    /STALE_BRANCH_HAS_UNPRESERVED_COMMITS/
  );
  assert.equal(fs.readFileSync(path.join(worker, "local-only.txt"), "utf8"), "do not lose\n");
  assert.equal(git(worker, ["rev-parse", "--abbrev-ref", "HEAD"]), "issue-790-stale");
});
