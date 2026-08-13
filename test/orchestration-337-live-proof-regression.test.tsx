import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#337 regression: AUTO_CONTINUE must not fall back to coding and must enable local routing when local agent is provided", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  // local routing enabled when ORCH_LOCAL_AGENT_ID is set (launcher provides it).
  assert.match(text, /ORCH_LOCAL_ROUTING_ENABLED[\s\S]*ORCH_LOCAL_AGENT_ID/);
  // coding fallback is gated to non-AUTO_CONTINUE only.
  assert.match(text, /classified\.executionClass !== \"AUTO_CONTINUE\"[\s\S]*runOpenclaw\(\"coding\"\)/);
});

test("#294 routing: adapter posts first-class routing fields", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("ROUTING_TIER"));
  assert.ok(text.includes("MODEL_USED"));
  assert.ok(text.includes("LOCAL_ATTEMPTED"));
  assert.ok(text.includes("ESCALATED_TO_CLOUD"));
  assert.ok(text.includes("CLOUD_USAGE"));
  assert.ok(text.includes("CLOUD_COST"));
});

