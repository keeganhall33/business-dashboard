import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  QUEUE_WATERMARKS,
  buildQueueWatermarkSnapshot,
  simulateFailureInjectionAcceptance
} from "../scripts/orchestration-v3/queue-watermarks.mjs";

function issue(number, stream, taskId = `task-${number}`) {
  return {
    number,
    title: `Task ${number}`,
    body: [
      "## OrchestrationTaskV1",
      "",
      `**task_id:** ${taskId}`,
      `**stream:** ${stream}`,
      "**priority:** P0"
    ].join("\n")
  };
}

test("queue watermark contract targets six workers and three ready reserve tasks", () => {
  assert.equal(QUEUE_WATERMARKS.targetActiveWorkers, 6);
  assert.equal(QUEUE_WATERMARKS.minReadyReserve, 3);
  assert.equal(QUEUE_WATERMARKS.replenishBelowReady, 2);

  const snapshot = buildQueueWatermarkSnapshot({
    runningIssues: [issue(1, "CORE_INTELLIGENCE"), issue(2, "DISCOVERY_INTELLIGENCE"), issue(3, "INTELLIGENCE_UX")],
    readyIssues: [
      issue(4, "AGENT_ORCHESTRATION"),
      issue(5, "INTEGRATION_RELEASE"),
      issue(6, "QA_EVALUATION"),
      issue(7, "DATA_EVIDENCE_LEARNING")
    ],
    activeLeaseIssueNumbers: [1, 2, 3]
  });

  assert.equal(snapshot.active_count, 3);
  assert.equal(snapshot.ready_reserve_count, 4);
  assert.equal(snapshot.low_watermark_state, "HEALTHY");
  assert.equal(snapshot.safe_to_target_six, true);
  assert.equal(snapshot.replenishment_needed, false);
});

test("queue watermark replenishment is idempotent and rejects duplicate or merged work", () => {
  const snapshot = buildQueueWatermarkSnapshot({
    runningIssues: [issue(10, "CORE_INTELLIGENCE", "shared-task")],
    readyIssues: [
      issue(11, "DISCOVERY_INTELLIGENCE", "shared-task"),
      issue(12, "INTELLIGENCE_UX", "already-main"),
      issue(13, "UNKNOWN_STREAM", "unmapped"),
      issue(14, "QA_EVALUATION", "safe-task")
    ],
    activeLeaseIssueNumbers: [10],
    currentMainIssueNumbers: [12],
    mergedIssueNumbers: []
  });

  assert.deepEqual(snapshot.reserve_issue_numbers, [14]);
  assert.equal(snapshot.low_watermark_state, "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK");
  assert.equal(snapshot.fail_closed_reason, "INSUFFICIENT_DEPENDENCY_SAFE_FILE_ISOLATED_WORK");
  assert.deepEqual(
    snapshot.rejected_issue_numbers.map((item) => [item.number, item.reason]),
    [
      [11, "DUPLICATE_TASK_ID_OR_TITLE"],
      [12, "ALREADY_ON_MAIN_OR_MERGED"],
      [13, "UNMAPPED_STREAM"]
    ]
  );
});

test("queue watermark requests replenishment before reserve falls below two", () => {
  const snapshot = buildQueueWatermarkSnapshot({
    readyIssues: [issue(21, "INTEGRATION_RELEASE"), issue(22, "QA_EVALUATION")],
    runningIssues: [
      issue(23, "CORE_INTELLIGENCE"),
      issue(24, "DISCOVERY_INTELLIGENCE"),
      issue(25, "INTELLIGENCE_UX"),
      issue(26, "AGENT_ORCHESTRATION")
    ],
    activeLeaseIssueNumbers: [23, 24, 25, 26]
  });

  assert.equal(snapshot.ready_reserve_count, 2);
  assert.equal(snapshot.low_watermark_state, "REPLENISHMENT_REQUIRED");
  assert.equal(snapshot.replenishment_needed, true);
  assert.equal(snapshot.safe_to_target_six, true);
});


test("failure-injection harness proves watcher crash, worker crash, stale lease, and empty reserve recovery", () => {
  const before = { active_count: 5, ready_reserve_count: 3, low_watermark_state: "HEALTHY" };
  const recovered = { active_count: 6, ready_reserve_count: 3, low_watermark_state: "HEALTHY", last_recovery_result: "STARTUP_RECONCILIATION_COMPLETE" };
  const result = simulateFailureInjectionAcceptance({
    before,
    afterWatcherRestart: recovered,
    afterWorkerCrash: { ...recovered, last_recovery_result: "WORKER_EXIT" },
    afterStaleLease: { ...recovered, last_recovery_result: "STALE_RUNNING_REQUEUED" },
    afterEmptyReserve: { ...recovered, last_recovery_result: "RESERVE_REPLENISHED" }
  });

  assert.equal(result.status, "PASS");
  assert.deepEqual(result.stages.map((stage) => stage.stage), [
    "WATCHER_RESTART_OR_LOGIN",
    "WORKER_CRASH_BACKFILL",
    "STALE_LEASE_RECONCILIATION",
    "EMPTY_RESERVE_REPLENISHMENT"
  ]);
  assert.equal(result.stages.every((stage) => stage.passed), true);
});

test("failure-injection harness fails closed instead of inventing six safe tasks", () => {
  const result = simulateFailureInjectionAcceptance({
    before: { active_count: 5, ready_reserve_count: 1 },
    afterWatcherRestart: { active_count: 5, ready_reserve_count: 1, low_watermark_state: "FAIL_CLOSED_INSUFFICIENT_SAFE_WORK" }
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.stages[0].passed, false);
});

test("watcher records queue watermark after startup reconciliation and before ready selection", () => {
  const watcher = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.match(watcher, /buildQueueWatermarkSnapshot/);
  assert.match(watcher, /writeQueueWatermarkState/);
  assert.match(watcher, /lastRecoveryResult: \["STARTUP", "SAFETY_TIMER"\]\.includes\(reason\) \? "STARTUP_RECONCILIATION_COMPLETE" : reason/);
  assert.match(watcher, /reconcileRunningClaims\(\);[\s\S]*const claimedWorkersThisPass = new Set\(\);[\s\S]*const ready = readyIssues\(\)[\s\S]*QUEUE_WATERMARK_STATE[\s\S]*for \(const candidate of ready\)/);
});

test("doctor and liveness expose queue watermark acceptance fields", () => {
  const doctor = fs.readFileSync("scripts/orchestration-v3/doctor.mjs", "utf8");
  const liveness = fs.readFileSync("scripts/orchestration-v3/liveness-report.mjs", "utf8");
  for (const field of ["ACTIVE_COUNT", "READY_RESERVE_COUNT", "LOW_WATERMARK_STATE", "LAST_REPLENISH_AT", "LAST_RECOVERY_RESULT"]) {
    assert.match(doctor, new RegExp(field));
  }
  for (const field of ["active_count", "ready_reserve_count", "low_watermark_state", "last_replenish_at", "last_recovery_result"]) {
    assert.match(liveness, new RegExp(field));
  }
});
