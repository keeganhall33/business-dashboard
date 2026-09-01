import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  checkRollupState,
  classifyIntegrationCandidate,
  hasHumanOrProductionGate,
  hasRequiredValidationEvidence,
  integrationFollowupWork,
  isNonAuthoritativeVercelQuotaFailure,
  isTransientGhError,
  orderIntegrationCandidates,
  recoverStaleIntegrationLock,
  reconciliationWorkForCandidate,
  successfulIntegrationLabelEdits
} from "../scripts/orchestration-v3/integration-queue.mjs";

const validationBody = [
  "human_approval_required: false",
  "Validation:",
  "- npx tsx --test test/learning-engine/decision-record-v1.test.tsx",
  "- npx tsc --noEmit",
  "- npm run build",
  "- git diff --check",
  '"PRODUCTION_CHANGE":"NO"',
  "KEEGAN_ACTION_REQUIRED=NO"
].join("\n");

function pr(partial = {}) {
  return {
    number: 589,
    title: "[Learning] Decision-learning record V1",
    body: validationBody,
    headRefName: "issue-538-learning-decision-record",
    baseRefName: "main",
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: "2026-08-17T23:15:28Z",
    statusCheckRollup: [
      { __typename: "StatusContext", context: "Vercel", state: "SUCCESS" },
      { __typename: "CheckRun", name: "Vercel Preview Comments", status: "COMPLETED", conclusion: "SUCCESS" }
    ],
    url: "https://github.com/keeganhall33/business-dashboard/pull/589",
    ...partial
  };
}

test("integration queue accepts only focused validated mergeable product PRs", () => {
  const candidate = classifyIntegrationCandidate(pr(), "2026-08-17T23:30:00.000Z");

  assert.equal(candidate.eligible, true);
  assert.equal(candidate.issueNumber, 538);
  assert.equal(candidate.checkState, "GREEN");
  assert.deepEqual(candidate.reasons, []);
});

test("integration queue skips pending checks and conflicting PRs without deleting branches", () => {
  const pending = classifyIntegrationCandidate(pr({ statusCheckRollup: [{ __typename: "StatusContext", state: "PENDING" }] }));
  const conflicting = classifyIntegrationCandidate(pr({ mergeable: "CONFLICTING" }));

  assert.equal(pending.eligible, false);
  assert.ok(pending.reasons.includes("CHECKS_PENDING"));
  assert.equal(conflicting.eligible, false);
  assert.ok(conflicting.reasons.includes("NOT_MERGEABLE:CONFLICTING"));
});

test("conflicting PRs create bounded Integration/Release reconciliation work", () => {
  const conflicting = classifyIntegrationCandidate(pr({ mergeable: "CONFLICTING" }));
  const work = reconciliationWorkForCandidate(conflicting);

  assert.equal(work?.stream, "INTEGRATION_RELEASE");
  assert.equal(work?.reason, "MERGE_CONFLICT_RECONCILIATION_REQUIRED");
  assert.equal(work?.prNumber, 589);
  assert.equal(work?.issueNumber, 538);
});

test("missing validation evidence creates bounded QA/Evaluation evidence work", () => {
  const missingEvidence = classifyIntegrationCandidate(pr({ body: "Validation: git diff --check only" }));
  const work = reconciliationWorkForCandidate(missingEvidence);

  assert.equal(work?.stream, "QA_EVALUATION");
  assert.equal(work?.reason, "MISSING_VALIDATION_EVIDENCE");
  assert.deepEqual(integrationFollowupWork([missingEvidence]), [work]);
});

test("integration queue rejects stale historical PRs, unverified branches, and missing evidence", () => {
  const stale = classifyIntegrationCandidate(pr({ createdAt: "2026-08-14T00:00:00Z" }));
  const branch = classifyIntegrationCandidate(pr({ headRefName: "feature/random-work" }));
  const missingEvidence = classifyIntegrationCandidate(pr({ body: "Validation: git diff --check only" }));

  assert.ok(stale.reasons.includes("STALE_HISTORICAL_PR"));
  assert.ok(branch.reasons.includes("UNVERIFIED_BRANCH_IDENTITY"));
  assert.ok(missingEvidence.reasons.includes("MISSING_VALIDATION_EVIDENCE"));
});

test("integration queue handles stacked PRs by requiring parent first", () => {
  const stacked = classifyIntegrationCandidate(pr({ baseRefName: "issue-560-creative-direction-refresh", headRefName: "issue-561-creative-visualization" }));

  assert.equal(stacked.eligible, false);
  assert.ok(stacked.reasons.includes("STACKED_PR_REQUIRES_PARENT_FIRST"));
});

test("validation evidence requires test typecheck build and diff check", () => {
  assert.equal(hasRequiredValidationEvidence(validationBody), true);
  assert.equal(hasRequiredValidationEvidence("npx tsx --test only"), false);
});

test("business-action gate does not reject software contract wording", () => {
  assert.equal(hasHumanOrProductionGate("Adds a dashboard contract/view-model. PRODUCTION_CHANGE=NO"), false);
  assert.equal(hasHumanOrProductionGate("Includes public publishing and ad spend."), true);
});

test("status rollup distinguishes green pending and failed checks", () => {
  assert.equal(checkRollupState([{ __typename: "StatusContext", state: "SUCCESS" }]), "GREEN");
  assert.equal(checkRollupState([{ __typename: "StatusContext", state: "PENDING" }]), "PENDING");
  assert.equal(checkRollupState([{ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" }]), "FAILED");
});

test("successful validated PR integration removes stale terminal queue labels", () => {
  assert.deepEqual(
    successfulIntegrationLabelEdits(new Set(["agent-orchestration", "orch:blocked", "orch:running", "orch:ready"])),
    ["orch:ready", "orch:running", "orch:blocked"]
  );
  assert.deepEqual(successfulIntegrationLabelEdits(new Set(["agent-orchestration"])), []);
});

test("non-authoritative Vercel quota failures do not block otherwise green validated PRs", () => {
  const candidate = classifyIntegrationCandidate(pr({
    statusCheckRollup: [
      { __typename: "StatusContext", context: "GitHub Actions", state: "SUCCESS" },
      { __typename: "CheckRun", name: "Vercel Preview Comments quota exceeded", status: "COMPLETED", conclusion: "FAILURE" }
    ]
  }));

  assert.equal(isNonAuthoritativeVercelQuotaFailure({ name: "Vercel Preview Comments quota exceeded", conclusion: "FAILURE" }), true);
  assert.equal(candidate.checkState, "GREEN");
  assert.equal(candidate.eligible, true);
  assert.deepEqual(candidate.reasons, []);
});

test("real technical check failures still block integration with machine evidence", () => {
  const candidate = classifyIntegrationCandidate(pr({
    statusCheckRollup: [
      { __typename: "StatusContext", context: "GitHub Actions", state: "SUCCESS" },
      { __typename: "CheckRun", name: "unit tests", status: "COMPLETED", conclusion: "FAILURE" }
    ]
  }));

  assert.equal(candidate.checkState, "FAILED");
  assert.equal(candidate.eligible, false);
  assert.ok(candidate.reasons.includes("CHECKS_FAILED"));
});

test("eligible candidates are ordered dependency-safely by issue number", () => {
  assert.deepEqual(
    orderIntegrationCandidates([
      classifyIntegrationCandidate(pr({ number: 590, headRefName: "issue-542-financial-intelligence" })),
      classifyIntegrationCandidate(pr({ number: 589, headRefName: "issue-538-learning-decision-record" }))
    ]).map((candidate) => candidate.issueNumber),
    [538, 542]
  );
});

test("watcher invokes the validated integration queue before claim reconciliation", () => {
  const watcherSource = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");

  assert.match(watcherSource, /integrateValidatedPrQueue/);
  assert.match(watcherSource, /INTEGRATION_QUEUE_DEFERRED_GITHUB_TRANSIENT/);
  assert.ok(watcherSource.indexOf("integrateValidatedPrQueue") < watcherSource.indexOf("reconcileRunningClaims"));
});

test("integration lock recovery is guarded by pid liveness and age checks", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/integration-queue.mjs", "utf8");

  assert.match(source, /LOCK_STALE_MS/);
  assert.match(source, /function alive\(pid\)/);
  assert.match(source, /inspectIntegrationLock/);
  assert.match(source, /!pidAlive && ageMs >= LOCK_STALE_MS/);
  assert.match(source, /recoverStaleIntegrationLock/);
  assert.match(source, /fs\.rmSync\(LOCK_PATH, \{ force: true \}\)/);
  assert.equal(typeof recoverStaleIntegrationLock, "function");
});

test("GitHub transient classifier covers TLS handshake and connection reset failures", () => {
  assert.equal(isTransientGhError({ message: "net/http: TLS handshake timeout" }), true);
  assert.equal(isTransientGhError({ stderr: "read ECONNRESET" }), true);
  assert.equal(isTransientGhError({ stderr: "GraphQL: rate limit exceeded" }), true);
  assert.equal(isTransientGhError({ stderr: "validation failed: permanent" }), false);
});
