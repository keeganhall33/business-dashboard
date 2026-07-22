import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { buildActionQueueSections } from "@/lib/action-queue-groups";
import type { ActionQueue, ActionQueueItem } from "@/lib/types/dashboard";

test("conservatively groups equivalent Facebook Ads signals", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      needsApprovalTasks: {
        label: "Needs approval",
        count: 3,
        items: [
          buildItem({ id: "fb-1", title: "Facebook Ads Review – Campaign Alpha – 05/20", summary: "Check ad set", createdAt: "2026-07-20T08:00:00Z" }),
          buildItem({ id: "fb-2", title: "Facebook Ads Review – Campaign Alpha – 05/21", summary: "Latest spend report", createdAt: "2026-07-21T09:00:00Z" }),
          buildItem({ id: "unique-1", title: "Approve invoice #443", summary: "Wire to foundry", createdAt: "2026-07-19T10:00:00Z" })
        ]
      }
    })
  );
  const items = sections[0].items;
  assert.equal(items.length, 2);
  const group = items.find((item) => item.kind === "group");
  assert.ok(group && group.kind === "group");
  assert.equal(group.count, 2);
  assert.equal(group.items.length, 2);
  assert.equal(group.timestampLabel.startsWith("Updated"), true);
});

test("distinct campaigns or action types do not merge", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      needsApprovalTasks: {
        label: "Needs approval",
        count: 2,
        items: [
          buildItem({ id: "alpha", title: "Facebook Ads Review – Campaign Alpha" }),
          buildItem({ id: "beta", title: "Facebook Ads Creative Review – Campaign Beta" })
        ]
      }
    })
  );
  assert.equal(sections[0].items.length, 2);
});

test("invalid timestamps degrade honestly", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      pendingPlans: {
        label: "Pending",
        count: 1,
        items: [buildItem({ id: "invalid", title: "Facebook Ads Review", createdAt: "invalid" })]
      }
    })
  );
  const card = sections[1].items[0];
  if (card.kind === "group") {
    assert.equal(card.timestampLabel, "Update time unavailable");
  } else {
    assert.equal(card.data.timestampLabel, "Update time unavailable");
  }
});

test("informational items remain visible", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      decisionsDue: {
        label: "Decisions",
        count: 2,
        items: [
          buildItem({ id: "fb", title: "Facebook Ads Review – Campaign Echo" }),
          buildItem({ id: "inform", title: "Platform telemetry snapshot", summary: "FYI only", itemType: "decision" })
        ]
      }
    })
  );
  assert.equal(sections[2].items.length, 2);
});

test("ordering honors approval, priority, freshness, and stable ties", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      needsApprovalTasks: {
        label: "Needs approval",
        count: 2,
        items: [
          buildItem({ id: "high", title: "Approve high", priority: "high", createdAt: "2026-07-20T09:00:00Z" }),
          buildItem({ id: "critical", title: "Approve critical", priority: "critical", createdAt: "2026-07-20T08:00:00Z" })
        ]
      },
      pendingPlans: {
        label: "Pending",
        count: 3,
        items: [
          buildItem({ id: "low", title: "Plan low", priority: "low", createdAt: "2026-07-20T07:00:00Z" }),
          buildItem({ id: "unknown", title: "Plan unknown", priority: "", createdAt: null }),
          buildItem({ id: "medium", title: "Plan medium", priority: "medium", createdAt: "2026-07-20T10:00:00Z" })
        ]
      }
    })
  );
  const approvalTitles = sections[0].items.map((item) => (item.kind === "group" ? item.title : item.data.original.title));
  assert.deepEqual(approvalTitles, ["Approve critical", "Approve high"]);
  const pendingTitles = sections[1].items.map((item) => (item.kind === "group" ? item.title : item.data.original.title));
  assert.deepEqual(pendingTitles, ["Plan medium", "Plan low", "Plan unknown"]);
});

test("missing owner and priority labels stay honest", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      decisionsDue: {
        label: "Decisions",
        count: 1,
        items: [buildItem({ id: "missing", title: "Decision", priority: null, actor: null })]
      }
    })
  );
  const item = sections[2].items[0];
  assert.equal(item.kind, "single");
  if (item.kind === "single") {
    assert.equal(item.data.ownerLabel, "Owner unavailable");
    assert.equal(item.data.priorityRank, 4);
  }
});

test("timestamp ties preserve input order", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      invoicesToSend: {
        label: "Invoices",
        count: 2,
        items: [
          buildItem({ id: "first", title: "Invoice first", createdAt: "2026-07-20T08:00:00Z" }),
          buildItem({ id: "second", title: "Invoice second", createdAt: "2026-07-20T08:00:00Z" })
        ]
      }
    })
  );
  const titles = sections[3].items.map((item) => (item.kind === "group" ? item.title : item.data.original.title));
  assert.deepEqual(titles, ["Invoice first", "Invoice second"]);
});

test("group metadata exposes accurate counts and newest summary", () => {
  const sections = buildActionQueueSections(
    buildQueue({
      needsApprovalTasks: {
        label: "Needs",
        count: 3,
        items: [
          buildItem({ id: "fb-3", title: "Facebook Ads Review – Campaign Gamma", summary: "older", createdAt: "2026-07-20T06:00:00Z" }),
          buildItem({ id: "fb-4", title: "Facebook Ads Review – Campaign Gamma", summary: "newest", createdAt: "2026-07-21T04:00:00Z" }),
          buildItem({ id: "fb-5", title: "Facebook Ads Review – Campaign Gamma", summary: "middle", createdAt: "2026-07-20T12:00:00Z" })
        ]
      }
    })
  );
  const group = sections[0].items[0];
  assert.equal(group.kind, "group");
  if (group.kind === "group") {
    assert.equal(group.count, 3);
    assert.ok(group.summary?.includes("newest"));
  }
});

function buildQueue(overrides: Partial<ActionQueue>): ActionQueue {
  return {
    needsApprovalTasks: overrides.needsApprovalTasks ?? { label: "Needs approval", count: overrides.needsApprovalTasks?.items?.length ?? 0, items: overrides.needsApprovalTasks?.items ?? [] },
    pendingPlans: overrides.pendingPlans ?? { label: "Pending plans", count: overrides.pendingPlans?.items?.length ?? 0, items: overrides.pendingPlans?.items ?? [] },
    decisionsDue: overrides.decisionsDue ?? { label: "Decisions due", count: overrides.decisionsDue?.items?.length ?? 0, items: overrides.decisionsDue?.items ?? [] },
    invoicesToSend: overrides.invoicesToSend ?? { label: "Invoices", count: overrides.invoicesToSend?.items?.length ?? 0, items: overrides.invoicesToSend?.items ?? [] }
  };
}

function buildItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: overrides.id ?? randomUUID(),
    itemType: overrides.itemType ?? "task",
    title: overrides.title ?? "Item title",
    summary: overrides.summary ?? null,
    createdAt: overrides.createdAt ?? "2026-07-20T12:00:00Z",
    dueAt: overrides.dueAt ?? "2026-07-22T12:00:00Z",
    actor: Object.prototype.hasOwnProperty.call(overrides, "actor") ? overrides.actor ?? null : "Avery",
    priority: Object.prototype.hasOwnProperty.call(overrides, "priority") ? overrides.priority ?? null : "high"
  };
}
