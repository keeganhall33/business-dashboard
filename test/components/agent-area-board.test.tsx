import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import TestRenderer, { act } from "react-test-renderer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { AgentAreaBoard } from "@/components/dashboard/AgentAreaBoard";
import { AGENT_OPERATING_MODELS } from "@/lib/agents/operating-model";
import type { AgentDashboardResponse } from "@/lib/types/agent";
import type { AgentSlaSnapshot } from "@/lib/types/dashboard";

function buildAgent(overrides: Partial<AgentDashboardResponse> = {}): AgentDashboardResponse {
  return {
    ok: true,
    agent: {
      agentKey: "avery",
      displayName: "Avery",
      roleTitle: "CEO",
      mandate: "Operate the portfolio",
      decisionScope: "Company"
    },
    ownedMetrics: [],
    recentUpdates: [
      {
        id: "update-1",
        updateType: "insight",
        title: "Collector insight",
        summary: "High affinity in Seattle",
        detailMd: null,
        priority: "high",
        createdAt: "2026-07-20T00:00:00Z"
      }
    ],
    openTasks: [
      {
        id: "task-live",
        title: "Launch commerce drop",
        agentKey: "avery",
        priority: "high",
        status: "in_progress",
        expectedImpact: null,
        impactScore: null,
        requiresApproval: false
      },
      {
        id: "task-blocked",
        title: "Collector follow-up",
        agentKey: "avery",
        priority: "medium",
        status: "blocked",
        expectedImpact: null,
        impactScore: null,
        requiresApproval: false
      }
    ],
    completedTasks: [],
    weeklyOutputRequirements: { weekly: [] },
    planQueue: { pending: null, recent: [] },
    conversation: { threadId: "thread", title: "", messages: [] },
    ...overrides
  };
}

test("agent cards render compact summary by default", () => {
  const { renderer } = renderBoard();
  const summaries = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-summary");
  assert.equal(summaries.length, 1);
  const details = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(details.length, 0);
});

test("expand toggle reveals full detail", () => {
  const { renderer } = renderBoard();
  const toggle = renderer.root.find((node) => node.props?.["data-testid"] === "agent-card-toggle");
  act(() => toggle.props.onClick());
  const details = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(details.length, 1);
});

test("blocker summary falls back when data missing", () => {
  const { renderer } = renderBoard([
    {
      overrides: {
        openTasks: [],
        recentUpdates: [],
        agent: { agentKey: "avery", displayName: "Avery", roleTitle: "CEO", mandate: "", decisionScope: "" }
      }
    }
  ]);
  const snapshot = JSON.stringify(renderer.toJSON());
  assert.ok(snapshot.includes("Blocker status unavailable"));
});

test("summary surfaces plan, tasks, freshness, approvals, and directives", () => {
  const { renderer } = renderBoard([
    {
      overrides: {
        planQueue: {
          pending: {
            id: "plan-1",
            title: "Q3 Incubator",
            status: "pending",
            summary: "Need approval",
            submittedAt: "2026-07-21T00:00:00Z",
            approvedAt: null,
            approvedBy: null
          },
          recent: []
        },
        openTasks: [
          {
            id: "task-live",
            title: "Live",
            agentKey: "avery",
            priority: "high",
            status: "in_progress",
            expectedImpact: null,
            impactScore: null,
            requiresApproval: false
          },
          {
            id: "task-blocked",
            title: "Blocked",
            agentKey: "avery",
            priority: "medium",
            status: "blocked",
            expectedImpact: null,
            impactScore: null,
            requiresApproval: false
          }
        ],
        recentUpdates: [
          {
            id: "directive-1",
            updateType: "directive",
            title: "Push launch",
            summary: "Secure VIP approvals",
            detailMd: null,
            priority: "high",
            createdAt: "2026-07-20T00:00:00Z"
          }
        ]
      }
    }
  ]);
  const text = JSON.stringify(renderer.toJSON());
  assert.ok(text.includes("Awaiting approval"));
  assert.ok(text.includes("Approval required"));
  assert.ok(text.includes("Live"));
  assert.ok(text.includes("Blocked"));
  assert.ok(text.includes("Latest directive"));
  assert.ok(text.includes("Active · refreshed"));
});

test("keyboard toggle handles Enter and Space presses", () => {
  const { renderer } = renderBoard();
  const summaryToggle = renderer.root.find((node) => node.props?.["data-testid"] === "agent-card-toggle");
  act(() => summaryToggle.props.onKeyDown(mockKeyEvent("Enter")));
  const details = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(details.length, 1);
  const collapseToggle = renderer.root.find((node) => node.type === "button" && node.children?.includes("Collapse domain detail"));
  act(() => collapseToggle.props.onKeyDown(mockKeyEvent(" ")));
  const detailsAfterCollapse = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(detailsAfterCollapse.length, 0);
});

test("action buttons persist when expanded and collapse state survives rerender", () => {
  const { renderer, rerender } = renderBoard([
    {
      overrides: {
        planQueue: {
          pending: {
            id: "plan-2",
            title: "Agent plan",
            status: "pending",
            summary: "Need approval",
            submittedAt: "2026-07-21T00:00:00Z",
            approvedAt: null,
            approvedBy: null
          },
          recent: []
        }
      }
    }
  ]);
  const summaryToggle = renderer.root.find((node) => node.props?.["data-testid"] === "agent-card-toggle");
  act(() => summaryToggle.props.onClick());
  const approveButtons = renderer.root.findAll(
    (node) => node.type === "button" && Array.isArray(node.children) && node.children.includes("Approve plan")
  );
  assert.equal(approveButtons.length, 1);
  rerender([
    {
      overrides: {
        planQueue: {
          pending: {
            id: "plan-2",
            title: "Agent plan",
            status: "pending",
            summary: "Updated",
            submittedAt: "2026-07-21T00:00:00Z",
            approvedAt: null,
            approvedBy: null
          },
          recent: []
        }
      }
    }
  ]);
  const details = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(details.length, 1);
});

test("agent summaries follow config order despite severity", () => {
  const { renderer } = renderBoard([
    { overrides: { agent: { agentKey: "avery", displayName: "Avery", roleTitle: "CEO", mandate: "", decisionScope: "" } } },
    {
      overrides: {
        agent: { agentKey: "sloan", displayName: "Sloan", roleTitle: "Product", mandate: "", decisionScope: "" },
        openTasks: [
          {
            id: "task-product",
            title: "Stalled",
            agentKey: "sloan",
            priority: "high",
            status: "blocked",
            expectedImpact: null,
            impactScore: null,
            requiresApproval: false
          }
        ]
      }
    }
  ]);
  const snapshot = JSON.stringify(renderer.toJSON());
  const ceoIndex = snapshot.indexOf("Avery");
  const productIndex = snapshot.indexOf("Sloan");
  assert.ok(ceoIndex > -1);
  assert.ok(productIndex > -1);
  assert.ok(ceoIndex < productIndex);
});

test("agent area board renders canonical operating-model area metadata", () => {
  const { renderer } = renderBoard([
    { overrides: { agent: { agentKey: "avery", displayName: "Avery", roleTitle: "CEO", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "sloan", displayName: "Sloan", roleTitle: "Product", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "lyra", displayName: "Lyra", roleTitle: "Brand", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "noah", displayName: "Noah", roleTitle: "Research", mandate: "", decisionScope: "" } } }
  ]);
  const snapshot = JSON.stringify(renderer.toJSON());

  for (const model of Object.values(AGENT_OPERATING_MODELS)) {
    assert.ok(snapshot.includes(model.area.title), `${model.key} area title should come from canonical model`);
    assert.ok(snapshot.includes(model.area.subtitle), `${model.key} area subtitle should come from canonical model`);
    assert.ok(snapshot.includes(model.roleTitle), `${model.key} role title should come from canonical model`);
    assert.ok(snapshot.includes(model.mandate), `${model.key} mandate should come from canonical model`);
  }

  assert.equal(snapshot.includes("Product & Ecommerce"), false);
  assert.equal(snapshot.includes("Research & Intelligence"), false);
});

test("agent area board keeps canonical order from the operating model", () => {
  const { renderer } = renderBoard([
    { overrides: { agent: { agentKey: "noah", displayName: "Noah", roleTitle: "Research", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "lyra", displayName: "Lyra", roleTitle: "Brand", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "sloan", displayName: "Sloan", roleTitle: "Product", mandate: "", decisionScope: "" } } },
    { overrides: { agent: { agentKey: "avery", displayName: "Avery", roleTitle: "CEO", mandate: "", decisionScope: "" } } }
  ]);
  const snapshot = JSON.stringify(renderer.toJSON());
  const areaIndexes = Object.values(AGENT_OPERATING_MODELS).map((model) => snapshot.indexOf(model.area.title));

  assert.ok(areaIndexes.every((index) => index > -1));
  assert.deepEqual([...areaIndexes].sort((a, b) => a - b), areaIndexes);
});

test("agent area board does not re-hardcode independent role metadata", () => {
  const source = fs.readFileSync("src/components/dashboard/AgentAreaBoard.tsx", "utf8");

  assert.doesNotMatch(source, /const\s+agentAreaConfig\s*:\s*AgentAreaDefinition\[\]\s*=\s*\[/);
  assert.match(source, /AGENT_OPERATING_MODELS/);
  assert.match(source, /AGENT_EXECUTION_SEQUENCE/);
  assert.doesNotMatch(source, /title:\s*"CEO"/);
  assert.doesNotMatch(source, /title:\s*"Product & Ecommerce"/);
  assert.doesNotMatch(source, /title:\s*"Research & Intelligence"/);
});

test("collapse state persists for the current mount", () => {
  const { renderer, rerender } = renderBoard();
  const summaryToggle = renderer.root.find((node) => node.props?.["data-testid"] === "agent-card-toggle");
  act(() => summaryToggle.props.onClick());
  rerender([{ overrides: { recentUpdates: [] } }]);
  const details = renderer.root.findAll((node) => node.props?.["data-testid"] === "agent-card-details");
  assert.equal(details.length, 1);
});

type AgentInput = {
  overrides?: Partial<AgentDashboardResponse>;
  slaOverrides?: Partial<AgentSlaSnapshot>;
};

function renderBoard(inputs: AgentInput[] = [{}]) {
  const router = buildRouter();

  const buildPayload = (data: AgentInput[]) => {
    const agents = data.map((entry) => buildAgent(entry.overrides));
    const slas = data.map((entry, index) =>
      buildSla({ agentKey: agents[index].agent.agentKey, ...(entry.slaOverrides ?? {}) })
    );
    return { agents, slas };
  };

  const initial = buildPayload(inputs);
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AgentAreaBoard agents={initial.agents} agentSla={initial.slas} router={router} />
    );
  });

  return {
    renderer: renderer!,
    rerender(nextInputs: AgentInput[]) {
      const payload = buildPayload(nextInputs);
      act(() => {
        renderer.update(<AgentAreaBoard agents={payload.agents} agentSla={payload.slas} router={router} />);
      });
    }
  };
}

function buildRouter() {
  return {
    refresh: () => {}
  };
}

function buildSla(overrides: Partial<AgentSlaSnapshot> = {}): AgentSlaSnapshot {
  return {
    agentKey: "avery",
    lastRunAt: "2026-07-20T00:00:00Z",
    minutesSinceRun: 60,
    nextRunDueAt: null,
    inProgressShare: 40,
    ...overrides
  };
}

function mockKeyEvent(key: string): ReactKeyboardEvent<HTMLButtonElement> {
  return {
    key,
    preventDefault: () => {},
    stopPropagation: () => {}
  } as unknown as ReactKeyboardEvent<HTMLButtonElement>;
}

export {};
