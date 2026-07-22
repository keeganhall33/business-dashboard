import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { ActionQueuePanel } from "@/components/dashboard/ActionQueuePanel";
import type { ActionQueue } from "@/lib/types/dashboard";

function buildActionQueue(): ActionQueue {
  const needsApprovalItems = [
    {
      id: "fb-001",
      itemType: "task" as const,
      title: "Facebook Ads Review – Campaign Alpha – 05/20",
      summary: "Check ad set",
      createdAt: "2026-07-20T08:00:00Z",
      dueAt: "2026-07-21T08:00:00Z",
      actor: "Avery",
      priority: "high"
    },
    {
      id: "fb-002",
      itemType: "task" as const,
      title: "Facebook Ads Review – Campaign Alpha – 05/21",
      summary: "Spend report",
      createdAt: "2026-07-21T09:00:00Z",
      dueAt: "2026-07-22T08:00:00Z",
      actor: "Avery",
      priority: "high"
    },
    {
      id: "unique-approval",
      itemType: "task" as const,
      title: "Approve invoice #443",
      summary: "Wire to foundry",
      createdAt: "2026-07-19T10:00:00Z",
      dueAt: "2026-07-23T10:00:00Z",
      actor: "Finance",
      priority: "medium"
    }
  ];

  const pendingPlans = [
    {
      id: "plan-1",
      itemType: "plan" as const,
      title: "Website conversion sprint",
      summary: "Add two new hero variants",
      createdAt: "2026-07-19T07:00:00Z",
      dueAt: null,
      actor: "Agent Website",
      priority: "low"
    }
  ];

  const decisionsDue = [
    {
      id: "decision-1",
      itemType: "decision" as const,
      title: "Collector outreach slot",
      summary: null,
      createdAt: null,
      dueAt: null,
      actor: null,
      priority: null
    }
  ];

  const invoicesToSend = [
    {
      id: "invoice-1",
      itemType: "invoice" as const,
      title: "Send invoice #238",
      summary: null,
      createdAt: "2026-07-18T08:00:00Z",
      dueAt: null,
      actor: "Studio",
      priority: "medium"
    }
  ];

  return {
    needsApprovalTasks: { label: "Needs approval", count: needsApprovalItems.length, items: needsApprovalItems },
    pendingPlans: { label: "Pending plans", count: pendingPlans.length, items: pendingPlans },
    decisionsDue: { label: "Decisions due", count: decisionsDue.length, items: decisionsDue },
    invoicesToSend: { label: "Invoices", count: invoicesToSend.length, items: invoicesToSend }
  };
}

function renderPanel(queue: ActionQueue = buildActionQueue()) {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ActionQueuePanel data={queue} suppressQuickActions />);
  });
  return renderer!;
}

function findByTestId(renderer: TestRenderer.ReactTestRenderer, testId: string) {
  return renderer.root.findAll((node) => node.props && node.props["data-testid"] === testId);
}

test("groups facebook review tasks with accurate summary metadata", () => {
  const renderer = renderPanel();
  const groups = findByTestId(renderer, "action-queue-group");
  assert.equal(groups.length, 1, "expected one grouped card");

  const toggle = renderer.root.findByProps({ "data-testid": "action-queue-group-toggle" });
  assert.equal(toggle.props["aria-expanded"], false);
  assert.ok(typeof toggle.props["aria-controls"] === "string" && toggle.props["aria-controls"].length > 0);
  assert.equal(toggle.props.onKeyDown, undefined, "native buttons should handle keyboard input");

  const countChip = renderer.root.find((node) => node.props?.title === "2 signals");
  assert.ok(countChip, "group count chip should render");

  const serialized = JSON.stringify(renderer.toJSON());
  assert.ok(serialized.includes("Latest signal"), "latest metadata should be visible");

  assert.equal(findByTestId(renderer, "action-queue-group-items").length, 0, "underlying records hidden by default");
});

test("expands grouped card to reveal underlying tasks with honest labels", () => {
  const renderer = renderPanel();
  const toggle = renderer.root.findByProps({ "data-testid": "action-queue-group-toggle" });

  act(() => toggle.props.onClick());

  assert.equal(toggle.props["aria-expanded"], true);
  const lists = findByTestId(renderer, "action-queue-group-items");
  assert.equal(lists.length, 1);
  const list = lists[0];
  assert.equal(list.props.id, toggle.props["aria-controls"], "aria relationships stay synchronized");
  assert.equal(list.props.children.length, 2, "both facebook review tasks should appear");

  const treeSnapshot = JSON.stringify(renderer.toJSON());
  assert.ok(treeSnapshot.includes("Owner unavailable"), "missing owner label should surface");
});

test("non-facebook tasks remain standalone cards with honest metadata", () => {
  const renderer = renderPanel();
  const cards = findByTestId(renderer, "action-queue-card");
  assert.ok(cards.length >= 1, "should render standalone cards");

  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("Owner unavailable"), "decision item should show owner unavailable label");
  assert.ok(snapshot.includes("Update time unavailable"), "missing timestamp should fall back to honest label");
});
