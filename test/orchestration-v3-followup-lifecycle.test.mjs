import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildFollowupBody,
  findCanonicalFollowupIssue,
  followupIdentity,
  planFollowupMaterialization
} from "../scripts/orchestration-v3/followup-materializer.mjs";

function work(partial = {}) {
  return {
    issueNumber: 626,
    stream: "INTEGRATION_RELEASE",
    reason: "MERGE_CONFLICT_RECONCILIATION_REQUIRED",
    prNumber: 638,
    headRefName: "issue-626-scheduled-external-fusion",
    title: "Reconcile merge conflict for PR #638",
    sourceReasons: ["NOT_MERGEABLE:CONFLICTING"],
    ...partial
  };
}

function canonicalIssue(partial = {}) {
  return {
    number: 860,
    title: "[P0 Integration] Reconcile merge conflict for PR #638",
    body: [
      "Source: orchestration-v3 integration release train follow-up.",
      "Original issue: #626",
      "PR: #638 (`issue-626-scheduled-external-fusion`)",
      "",
      "**stream:** INTEGRATION_RELEASE",
      "**priority:** P0",
      "**human_approval_required:** false",
      "**file_ownership:** src/example.ts"
    ].join("\n"),
    labels: [{ name: "agent-orchestration" }],
    state: "open",
    ...partial
  };
}

test("follow-up identity includes PR + reason + stream", () => {
  assert.equal(
    followupIdentity(work()),
    "638:MERGE_CONFLICT_RECONCILIATION_REQUIRED:INTEGRATION_RELEASE"
  );
});

test("manual canonical bootstrap issue is reused instead of duplicated", () => {
  const existing = canonicalIssue();

  assert.equal(
    findCanonicalFollowupIssue(work(), [existing])?.number,
    860
  );

  const plan = planFollowupMaterialization(work(), [existing]);

  assert.equal(plan.action, "REUSE_AND_READY");
  assert.equal(plan.issue?.number, 860);
});

test("identical polls remain idempotent once canonical issue is ready", () => {
  const existing = canonicalIssue({
    labels: [
      { name: "agent-orchestration" },
      { name: "orch:ready" }
    ]
  });

  const first = planFollowupMaterialization(work(), [existing]);
  const second = planFollowupMaterialization(work(), [existing]);

  assert.equal(first.action, "REUSE_NO_CHANGE");
  assert.equal(second.action, "REUSE_NO_CHANGE");
  assert.equal(first.issue?.number, 860);
  assert.equal(second.issue?.number, 860);
});

test("blocked canonical follow-up remains blocked until explicitly changed", () => {
  const existing = canonicalIssue({
    labels: [
      { name: "agent-orchestration" },
      { name: "orch:blocked" }
    ]
  });

  const plan = planFollowupMaterialization(work(), [existing]);

  assert.equal(plan.action, "REUSE_NO_CHANGE");
  assert.equal(plan.reason, "BLOCKED_CANONICAL_FOLLOWUP_PRESERVED");
  assert.equal(plan.issue?.number, 860);
});

test("closed canonical follow-up suppresses duplicate regeneration", () => {
  const existing = canonicalIssue({
    state: "closed",
    labels: [{ name: "agent-orchestration" }]
  });

  const plan = planFollowupMaterialization(work(), [existing]);

  assert.equal(plan.action, "REUSE_NO_CHANGE");
  assert.equal(plan.reason, "CLOSED_CANONICAL_FOLLOWUP_SUPPRESSES_REGENERATION");
  assert.equal(plan.issue?.number, 860);
});

test("blocked canonical follow-up remains blocked when human approval is required", () => {
  const existing = canonicalIssue({
    body: [
      "Original issue: #626",
      "PR: #638 (`issue-626-scheduled-external-fusion`)",
      "",
      "**stream:** INTEGRATION_RELEASE",
      "**priority:** P0",
      "**human_approval_required:** true",
      "**file_ownership:** src/example.ts"
    ].join("\n"),
    labels: [
      { name: "agent-orchestration" },
      { name: "orch:blocked" }
    ]
  });

  const plan = planFollowupMaterialization(work(), [existing]);

  assert.equal(plan.action, "REUSE_NO_CHANGE");
  assert.equal(plan.reason, "EXISTING_HUMAN_APPROVAL_GATE");
  assert.equal(plan.issue?.number, 860);
});

test("stale and human/production gated follow-ups are skipped", () => {
  assert.equal(
    planFollowupMaterialization(
      work({
        sourceReasons: [
          "STALE_HISTORICAL_PR",
          "NOT_MERGEABLE:CONFLICTING"
        ]
      }),
      []
    ).reason,
    "STALE_HISTORICAL_PR"
  );

  assert.equal(
    planFollowupMaterialization(
      work({
        sourceReasons: [
          "HUMAN_OR_PRODUCTION_GATE",
          "NOT_MERGEABLE:CONFLICTING"
        ]
      }),
      []
    ).reason,
    "HUMAN_OR_PRODUCTION_GATE"
  );
});

test("generated integration body declares mutation requirement", () => {
  const body = buildFollowupBody(work({ fileOwnership: "src/example.ts" }));
  assert.equal(body.includes("**task_mutability:** IMPLEMENTATION_MUTATION_REQUIRED"), true);
});

test("QA work has distinct stable identity and evidence-only body", () => {
  const qa = work({
    issueNumber: 678,
    prNumber: 702,
    headRefName: "issue-678-validation-evidence",
    stream: "QA_EVALUATION",
    reason: "MISSING_VALIDATION_EVIDENCE",
    title: "Collect validation evidence for PR #702",
    sourceReasons: ["MISSING_VALIDATION_EVIDENCE"],
    fileOwnership: "test/example.test.ts"
  });

  assert.equal(
    followupIdentity(qa),
    "702:MISSING_VALIDATION_EVIDENCE:QA_EVALUATION"
  );

  const body = buildFollowupBody(qa);

  assert.equal(body.includes("**stream:** QA_EVALUATION"), true);
  assert.equal(body.includes("**task_mutability:** EVIDENCE_ONLY"), true);
  assert.equal(body.includes("Original issue: #678"), true);
  assert.equal(body.includes("PR: #702"), true);
});

test("watcher materializes against open and closed canonical follow-ups before refreshing ready set", () => {
  const source = fs.readFileSync(
    "scripts/orchestration-v3/watcher.mjs",
    "utf8"
  );

  assert.equal(source.includes("materializeIntegrationFollowups"), true);
  assert.equal(source.includes("INTEGRATION_FOLLOWUP_ENQUEUED"), true);
  assert.equal(source.includes("INTEGRATION_FOLLOWUP_REUSED"), true);
  assert.equal(source.includes("INTEGRATION_FOLLOWUP_SKIPPED"), true);
  assert.equal(source.includes('issuesWithLabels("__all_states__", ORCHESTRATION_V3.queue.base)'), true);
  assert.equal(source.includes("const currentIssues = allOrchestrationIssues();"), true);

  const materializeAt = source.indexOf(
    "materializeIntegrationFollowups(integration.followupWork ?? [])"
  );
  const readyAt = source.indexOf("const ready = readyIssues()");

  assert.ok(materializeAt >= 0);
  assert.ok(readyAt >= 0);
  assert.ok(materializeAt < readyAt);
});

test("watcher revalidates candidate immediately before claim", () => {
  const source = fs.readFileSync(
    "scripts/orchestration-v3/watcher.mjs",
    "utf8"
  );

  assert.equal(source.includes("function revalidateClaim(issueNumber)"), true);
  assert.equal(source.includes("READY_LABEL_MISSING"), true);
  assert.equal(source.includes('reasons.push("BLOCKED")'), true);
  assert.equal(source.includes('reasons.push("AWAITING_HUMAN_APPROVAL")'), true);
  assert.equal(source.includes("CLAIM_REVALIDATION_SKIPPED"), true);
  assert.equal(source.includes("if (!claim(snapshot.number)) continue;"), true);
});

test("stale running reconciliation does not requeue a currently blocked issue", () => {
  const source = fs.readFileSync(
    "scripts/orchestration-v3/watcher.mjs",
    "utf8"
  );

  assert.equal(source.includes("STALE_RUNNING_DEQUEUED_GATED"), true);
  assert.equal(source.includes("NO_AUTHORITATIVE_LIVE_LEASE_AND_CURRENTLY_GATED"), true);
  assert.equal(source.includes("labels.has(ORCHESTRATION_V3.queue.blocked)"), true);
});

test("worker model execution is asynchronous so lease heartbeat timer can fire", () => {
  const worker = fs.readFileSync(
    "scripts/orchestration-v3/worker.mjs",
    "utf8"
  );

  assert.equal(worker.includes("spawnSync("), false);
  assert.equal(worker.includes("await runBufferedChild(openclaw"), true);
  assert.equal(worker.includes("leaseHeartbeatTimer = setInterval"), true);
});
