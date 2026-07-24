import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { IdeaBoardPanel } from "@/components/dashboard/IdeaBoardPanel";
import type { IdeaBoard, IdeaCard, IdeaComment } from "@/lib/types/dashboard";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
  var fetch: typeof globalThis.fetch;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) }) as Response;

function buildIdea(overrides: Partial<IdeaCard> = {}): IdeaCard {
  return {
    id: overrides.id ?? randomUUID(),
    agentKey: overrides.agentKey ?? "avery",
    agentName: overrides.agentName ?? "Avery",
    ideaType: overrides.ideaType ?? "major",
    title: overrides.title ?? "Idea title",
    summary: overrides.summary ?? "Idea summary details",
    expectedImpact: overrides.expectedImpact ?? 1200,
    requiresCeoApproval: overrides.requiresCeoApproval ?? true,
    linkedTaskId: overrides.linkedTaskId ?? null,
    approvedAt: overrides.approvedAt ?? null,
    approver: overrides.approver ?? null,
    updatedAt: overrides.updatedAt ?? "2026-07-20T00:00:00Z",
    createdAt: overrides.createdAt ?? "2026-07-19T00:00:00Z"
  };
}

function buildBoard(partial: Partial<IdeaBoard>): IdeaBoard {
  return {
    columns: partial.columns ?? {
      proposed: [buildIdea({ id: "idea-1" })]
    },
    recentComments: partial.recentComments ?? [],
    linkedTasks: partial.linkedTasks ?? {}
  };
}

function render(board: IdeaBoard) {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<IdeaBoardPanel board={board} />);
  });
  return {
    renderer: renderer!,
    update(next: IdeaBoard) {
      act(() => {
        renderer!.update(<IdeaBoardPanel board={next} />);
      });
    }
  };
}

test("agent tallies remain stable and unknown ownership is labeled", () => {
  const board = buildBoard({
    columns: {
      proposed: [buildIdea({ id: "a", agentKey: "avery", agentName: "Avery" })],
      shipped: [buildIdea({ id: "b", agentKey: "sloan", agentName: "Sloan", approvedAt: "2026-07-18T00:00:00Z" })],
      approved: [buildIdea({ id: "c", agentKey: "", agentName: "" })]
    }
  });
  const { renderer } = render(board);
  const selects = renderer.root.findAll((node) => node.type === "select");
  act(() => selects[0].props.onChange({ target: { value: "avery" } }));
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("Avery"));
  assert.ok(snapshot.includes("Sloan"));
  assert.ok(snapshot.includes("Unknown agent"));
});

test("filters combine with AND semantics and hide empty statuses", () => {
  const board = buildBoard({
    columns: {
      proposed: [buildIdea({ id: "a", agentKey: "avery", agentName: "Avery", title: "Idea Alpha" })],
      approved: [buildIdea({ id: "b", agentKey: "sloan", agentName: "Sloan", title: "Idea Beta", approvedAt: "2026-07-18T00:00:00Z" })]
    }
  });
  const { renderer } = render(board);
  const getSelects = () => renderer.root.findAll((node) => node.type === "select");
  const searchInput = renderer.root.find((node) => node.type === "input");
  act(() => getSelects()[0].props.onChange({ target: { value: "avery" } }));
  act(() => searchInput.props.onChange({ target: { value: "Beta" } }));
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("No matching cards"));
  assert.ok(!snapshot.includes("Idea Alpha"));
});

test("empty boards show honest state", () => {
  const board = buildBoard({ columns: { proposed: [], shipped: [] } });
  const { renderer } = render(board);
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("Idea board unavailable"));
});

test("show more toggles additional cards", () => {
  const columnIdeas = Array.from({ length: 5 }).map((_, index) => buildIdea({ id: `idea-${index}`, title: `Idea ${index}` }));
  const board = buildBoard({ columns: { proposed: columnIdeas } });
  const { renderer } = render(board);
  const showMoreButton = renderer.root.find((node) => node.type === "button" && typeof node.children?.[0] === "string" && node.children[0].includes("Show 2 more"));
  const before = JSON.stringify(renderer.toJSON());
  assert.ok(before.includes("Show 2 more"));
  act(() => showMoreButton.props.onClick());
  const after = JSON.stringify(renderer.toJSON());
  assert.ok(!after.includes("Show 2 more"));
  assert.ok(after.includes("Idea 4"));
});

test("card metadata exposes comment counts and linked tasks", () => {
  const board = buildBoard({
    columns: {
      proposed: [
        buildIdea({
          id: "idea-meta",
          title: "Idea meta",
          linkedTaskId: "task-123",
          updatedAt: "invalid"
        })
      ]
    },
    linkedTasks: {
      "task-123": {
        id: "task-123",
        title: "Linked",
        status: "open",
        priority: "high",
        requiresApproval: false
      }
    },
    recentComments: [{ id: "comment-1", ideaId: "idea-meta", commenter: "Mae", comment: "note", createdAt: "2026-07-21T00:00:00Z" }]
  });
  const { renderer } = render(board);
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("1 comments"));
  const taskBadge = renderer.root.findAll(
    (node) => node.type === "span" && Array.isArray(node.children) && node.children.join("") === "Task task-123"
  );
  assert.ok(taskBadge.length === 1);
  const updateBadge = renderer.root.findAll(
    (node) =>
      node.type === "span" &&
      Array.isArray(node.children) &&
      node.children.some((child) => typeof child === "string" && child.includes("Update time unavailable"))
  );
  assert.ok(updateBadge.length === 1);
});

test("comments feed orders newest first with fallbacks", () => {
  const comments: IdeaComment[] = [
    { id: "c1", ideaId: "idea-a", commenter: "Audrey", comment: "Newest", createdAt: "2026-07-22T12:00:00Z" },
    { id: "c2", ideaId: "idea-b", commenter: "", comment: "Hidden idea", createdAt: "2026-07-22T00:00:00Z" },
    { id: "c3", ideaId: "missing", commenter: "Zed", comment: "Missing idea", createdAt: "2026-07-21T00:00:00Z" },
    { id: "c4", ideaId: "", commenter: "Eve", comment: "Unlinked", createdAt: "" },
    { id: "c5", ideaId: "idea-extra", commenter: "Dan", comment: "Extra", createdAt: "2026-07-20T00:00:00Z" },
    { id: "c6", ideaId: "idea-extra", commenter: "Kay", comment: "Overflow", createdAt: "2026-07-19T00:00:00Z" }
  ];
  const board = buildBoard({
    columns: {
      proposed: [buildIdea({ id: "idea-a", agentKey: "avery" })],
      approved: [buildIdea({ id: "idea-b", agentKey: "sloan" })],
      shipped: [buildIdea({ id: "idea-extra", agentKey: "lyra" })]
    },
    recentComments: comments
  });
  const { renderer } = render(board);
  const selects = renderer.root.findAll((node) => node.type === "select");
  act(() => selects[0].props.onChange({ target: { value: "avery" } }));
  const showMore = renderer.root.find((node) => node.type === "button" && node.children?.[0] === `Show ${comments.length - 5} more`);
  act(() => showMore.props.onClick());
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.indexOf("Newest") < snapshot.indexOf("Overflow"));
  assert.ok(snapshot.includes("Unknown commenter"));
  assert.ok(snapshot.includes("Comment time unavailable"));
  assert.ok(snapshot.includes("Idea hidden by current filters"));
  assert.ok(snapshot.includes("Idea unavailable"));
  assert.ok(snapshot.includes("Unlinked comment"));
});
