import test from "node:test";
import assert from "node:assert/strict";

import { isExecutableApprovalItem, shouldTriggerTaskAutomation } from "../src/lib/approvals/execution-paths.ts";

test("task approval triggers automation only once", () => {
  const existing = {
    id: "task-1",
    agent_key: "noah",
    requires_approval: true,
    approved_by_user: false
  };
  const updated = { approved_by_user: true };
  assert.equal(shouldTriggerTaskAutomation(existing, updated, true), true);

  const duplicate = { ...existing, approved_by_user: true };
  assert.equal(shouldTriggerTaskAutomation(duplicate, updated, true), false, "duplicate approval should not retrigger automation");
});

test("non-approval tasks do not trigger automation", () => {
  const existing = {
    id: "task-2",
    agent_key: "noah",
    requires_approval: false,
    approved_by_user: false
  };
  const updated = { approved_by_user: true };
  assert.equal(shouldTriggerTaskAutomation(existing, updated, true), false);
});

test("approval items without execution context are hidden", () => {
  const validItem = {
    id: "1",
    itemType: "task" as const,
    title: "Approve drop",
    summary: "Ready to ship",
    createdAt: "2026-07-16T10:00:00.000Z",
    dueAt: null,
    actor: "noah"
  };
  assert.equal(isExecutableApprovalItem(validItem), true);

  const invalidItem = { ...validItem, summary: null } as unknown as typeof validItem;
  assert.equal(isExecutableApprovalItem(invalidItem), false);
});
