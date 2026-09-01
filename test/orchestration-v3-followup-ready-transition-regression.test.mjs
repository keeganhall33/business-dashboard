import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("REUSE_AND_READY clears stale blocked before adding ready", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  const reuseStart = source.indexOf('if (plan.action === "REUSE_AND_READY")');
  const reuseEnd = source.indexOf('console.log(JSON.stringify({', reuseStart);

  assert.ok(reuseStart >= 0, "REUSE_AND_READY branch must exist");
  assert.ok(reuseEnd > reuseStart, "REUSE_AND_READY transition must precede logging");

  const transition = source.slice(reuseStart, reuseEnd);
  assert.match(
    transition,
    /remove:\s*\[ORCHESTRATION_V3\.queue\.blocked\]/,
    "actionable blocked canonical follow-up must drop orch:blocked"
  );
  assert.match(
    transition,
    /add:\s*\[ORCHESTRATION_V3\.queue\.ready\]/,
    "actionable canonical follow-up must gain orch:ready"
  );
  assert.doesNotMatch(transition, /remove:\s*\[\s*\]/);
});

test("claim revalidation still rejects blocked work", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/watcher.mjs", "utf8");
  assert.equal(source.includes('reasons.push("BLOCKED")'), true);
});

test("human-gated blocked follow-ups remain fail closed in planner coverage", () => {
  const lifecycleTest = fs.readFileSync(
    "test/orchestration-v3-followup-lifecycle.test.mjs",
    "utf8"
  );

  assert.equal(
    lifecycleTest.includes("blocked canonical follow-up remains blocked when human approval is required"),
    true
  );
  assert.equal(lifecycleTest.includes("EXISTING_HUMAN_APPROVAL_GATE"), true);
});
