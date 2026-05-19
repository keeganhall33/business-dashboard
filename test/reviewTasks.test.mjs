import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCeoReviewTaskDescription,
  buildCeoReviewTaskTitle,
  shouldEnsureCeoReviewTask
} from "../src/lib/idea-board/reviewTasks.mjs";

test("buildCeoReviewTaskTitle is deterministic and non-empty", () => {
  assert.equal(buildCeoReviewTaskTitle("My Idea"), "CEO Review: My Idea");
  assert.equal(buildCeoReviewTaskTitle("   "), "CEO Review: Untitled idea");
});

test("shouldEnsureCeoReviewTask gates correctly", () => {
  const base = {
    id: "1",
    agent_key: "avery",
    idea_type: "major",
    title: "Test",
    summary: null,
    expected_impact: null,
    status: "proposed",
    requires_ceo_approval: true,
    approved_at: null,
    linked_task_id: null
  };

  assert.equal(shouldEnsureCeoReviewTask(base), true);
  assert.equal(shouldEnsureCeoReviewTask({ ...base, approved_at: "2026-01-01" }), false);
  assert.equal(shouldEnsureCeoReviewTask({ ...base, linked_task_id: "task-1" }), false);
  assert.equal(shouldEnsureCeoReviewTask({ ...base, requires_ceo_approval: false }), false);
});

test("buildCeoReviewTaskDescription includes key fields", () => {
  const desc = buildCeoReviewTaskDescription({
    id: "idea-123",
    agentKey: "noah",
    ideaType: "minor",
    title: "Ship the thing",
    summary: "Short summary",
    expectedImpact: 5
  });

  assert.ok(desc.includes("Idea ID: idea-123"));
  assert.ok(desc.includes("Agent: noah"));
  assert.ok(desc.includes("Type: minor"));
  assert.ok(desc.includes("Title: Ship the thing"));
  assert.ok(desc.includes("Summary: Short summary"));
  assert.ok(desc.includes("Expected impact: 5"));
});

