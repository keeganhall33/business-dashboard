import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LOCAL_ROUNDS,
  buildContinuationPrompt,
  isConcreteHardBlocker,
  shouldContinueLocalRun
} from "../scripts/orchestration-v3/continuation-policy.mjs";

test("reconnaissance-only evidence rejection continues locally", () => {
  assert.equal(MAX_LOCAL_ROUNDS, 3);
  assert.equal(shouldContinueLocalRun({
    completedRound: 1,
    status: "BLOCKED",
    blockers: ["MISSING_OBSERVED_GIT_DIFF", "NO_REAL_GIT_OR_PR_STATE_MUTATION"]
  }), true);
});

test("continuation prompt carries exact missing evidence and implementation sequence", () => {
  const prompt = buildContinuationPrompt("base", {
    nextRound: 2,
    blockers: ["MISSING_OBSERVED_TEST_BUILD_TYPECHECK", "MISSING_OBSERVED_GIT_DIFF"]
  });
  assert.match(prompt, /MISSING_OBSERVED_TEST_BUILD_TYPECHECK/);
  assert.match(prompt, /MISSING_OBSERVED_GIT_DIFF/);
  assert.match(prompt, /EDIT -> TEST\/BUILD\/TYPECHECK AS REQUIRED -> GIT DIFF/);
  assert.match(prompt, /GIT ADD\/COMMIT -> PUSH/);
});

test("hard safety or external blockers stop continuation immediately", () => {
  assert.equal(isConcreteHardBlocker(["POST_MODEL_WORKTREE_INTEGRITY_FAILED:TRACKED_DELETION"]), true);
  assert.equal(shouldContinueLocalRun({
    completedRound: 1,
    status: "BLOCKED",
    blockers: ["POST_MODEL_WORKTREE_INTEGRITY_FAILED:TRACKED_DELETION"]
  }), false);
});

test("local continuation stops after three total rounds", () => {
  assert.equal(shouldContinueLocalRun({
    completedRound: 3,
    status: "BLOCKED",
    blockers: ["MISSING_OBSERVED_GIT_DIFF"]
  }), false);
});
