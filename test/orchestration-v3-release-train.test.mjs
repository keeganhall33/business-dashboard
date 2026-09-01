import assert from "node:assert/strict";
import test from "node:test";

import { classifyIntegrationCandidate } from "../scripts/orchestration-v3/integration-queue.mjs";
import { buildReleaseTrainSnapshot, RELEASE_TRAIN_CONTRACT_VERSION } from "../scripts/orchestration-v3/release-train.mjs";

const validationBody = [
  "human_approval_required: false",
  "Validation:",
  "- npm test -- test/example.test.ts",
  "- npx tsc --noEmit",
  "- npm run build",
  "- git diff --check",
  '"PRODUCTION_CHANGE":"NO"',
  "KEEGAN_ACTION_REQUIRED=NO"
].join("\n");

function pr(partial = {}) {
  return {
    number: 710,
    title: "Validated current PR",
    body: validationBody,
    headRefName: "issue-710-six-worker-expansion",
    baseRefName: "main",
    isDraft: false,
    mergeable: "MERGEABLE",
    createdAt: "2026-08-20T12:00:00Z",
    statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
    url: "https://github.com/keeganhall33/business-dashboard/pull/710",
    ...partial
  };
}

test("release train orders validated current PRs sequentially and requires read-only production verification", () => {
  const snapshot = buildReleaseTrainSnapshot({
    nowIso: "2026-08-21T12:00:00Z",
    evaluatedCandidates: [
      classifyIntegrationCandidate(pr({ number: 720, headRefName: "issue-720-second" })),
      classifyIntegrationCandidate(pr({ number: 714, headRefName: "issue-714-release-train" }))
    ]
  });

  assert.equal(snapshot.contractVersion, RELEASE_TRAIN_CONTRACT_VERSION);
  assert.equal(snapshot.queueMode, "DEPENDENCY_SAFE_SEQUENTIAL");
  assert.deepEqual(snapshot.mergeQueue.map((item) => item.issueNumber), [714, 720]);
  assert.ok(snapshot.mergeQueue.every((item) => item.action === "MERGE_THEN_REFRESH_MERGEABILITY"));
  assert.ok(snapshot.mergeQueue.every((item) => item.productionVerification.requiredChecks.routeAvailability));
  assert.ok(snapshot.mergeQueue.every((item) => item.productionVerification.requiredChecks.readOnly));
  assert.equal(snapshot.safety.productionVerificationIsReadOnly, true);
  assert.equal(snapshot.safety.humanProductionGatesUnchanged, true);
});

test("conflicts, missing evidence, and stacked PRs become bounded lane work instead of product-lane blockers", () => {
  const snapshot = buildReleaseTrainSnapshot({
    evaluatedCandidates: [
      classifyIntegrationCandidate(pr({ number: 721, headRefName: "issue-721-conflict", mergeable: "CONFLICTING" })),
      classifyIntegrationCandidate(pr({ number: 722, headRefName: "issue-722-no-evidence", body: "Validation: git diff --check only" })),
      classifyIntegrationCandidate(pr({ number: 723, headRefName: "issue-723-stacked", baseRefName: "issue-722-no-evidence" }))
    ]
  });

  assert.equal(snapshot.releaseTrainState, "RECONCILIATION_REQUIRED");
  assert.deepEqual(
    snapshot.followupWork.map((item) => [item.stream, item.reason, item.blocksOriginalProductLane]),
    [
      ["INTEGRATION_RELEASE", "MERGE_CONFLICT_RECONCILIATION_REQUIRED", false],
      ["QA_EVALUATION", "MISSING_VALIDATION_EVIDENCE", false],
      ["INTEGRATION_RELEASE", "STACKED_PR_FLATTEN_AFTER_PARENT", false]
    ]
  );
});

test("stale historical PRs stay out of the current train unless explicitly revived", () => {
  const snapshot = buildReleaseTrainSnapshot({
    evaluatedCandidates: [
      classifyIntegrationCandidate(pr({ number: 530, headRefName: "issue-530-old", createdAt: "2026-08-14T12:00:00Z" })),
      classifyIntegrationCandidate(pr({ number: 714, headRefName: "issue-714-release-train" }))
    ]
  });

  assert.deepEqual(snapshot.mergeQueue.map((item) => item.issueNumber), [714]);
  assert.deepEqual(snapshot.excludedHistoricalPrs, [
    {
      prNumber: 530,
      issueNumber: 530,
      reason: "STALE_HISTORICAL_PR_EXCLUDED_UNLESS_EXPLICITLY_REVIVED"
    }
  ]);
  assert.equal(snapshot.safety.staleHistoricalPrsExcluded, true);
});

test("merged PRs are not complete until separate production verification can pass", () => {
  const merged = classifyIntegrationCandidate(pr({ number: 714, headRefName: "issue-714-release-train" }));
  const snapshot = buildReleaseTrainSnapshot({ evaluatedCandidates: [merged], mergedCandidates: [merged] });
  const verification = snapshot.merged[0].productionVerification;

  assert.equal(snapshot.merged[0].closeOriginalTaskAfterVerification, true);
  assert.ok(verification.stopRules.includes("ROUTE_UNAVAILABLE"));
  assert.ok(verification.stopRules.includes("DATA_CONTRACT_MISMATCH"));
  assert.equal(verification.failureAction.stream, "QA_EVALUATION");
  assert.equal(verification.failureAction.reason, "POST_MERGE_PRODUCTION_VERIFICATION_FAILED");
  assert.equal(snapshot.safety.failedVerificationPreventsFalseCompletion, true);
});
