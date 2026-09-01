import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRoadmapCandidate, planRoadmapReplenishment } from "../scripts/orchestration-v3/roadmap-replenisher.mjs";

function issue(number, stream, {
  labels = ["agent-orchestration"],
  approval = "false",
  priority = "P0",
  ownership = null,
  dependsOn = null
} = {}) {
  const body = [
    "## OrchestrationTaskV1",
    "",
    `**task_id:** task-${number}`,
    `**stream:** ${stream}`,
    `**priority:** ${priority}`,
    `**human_approval_required:** ${approval}`,
    dependsOn ? `**depends_on:** ${dependsOn}` : null,
    "",
    ownership ? "### File ownership" : null,
    ownership
  ].filter((value) => value !== null).join("\n");
  return { number, title: `Task ${number}`, body, labels: labels.map((name) => ({ name })) };
}

test("replenishes one safe roadmap task per uncovered product worker", () => {
  const plan = planRoadmapReplenishment({
    uncoveredWorkerIds: ["local-a", "local-b", "local-c", "local-d"],
    openIssues: [
      issue(901, "CORE_INTELLIGENCE", { ownership: "core conflict adapter and focused tests only" }),
      issue(902, "DISCOVERY_INTELLIGENCE", { ownership: "discovery freshness adapter and focused tests only" }),
      issue(903, "INTELLIGENCE_UX", { ownership: "decision room evidence drawer and focused render tests only" }),
      issue(904, "AGENT_ORCHESTRATION", { ownership: "orchestration queue replenishment planner and focused tests only" })
    ]
  });

  assert.deepEqual(plan.selected, [
    { worker_id: "local-a", issue_number: 901, stream: "CORE_INTELLIGENCE" },
    { worker_id: "local-b", issue_number: 902, stream: "DISCOVERY_INTELLIGENCE" },
    { worker_id: "local-c", issue_number: 903, stream: "INTELLIGENCE_UX" },
    { worker_id: "local-d", issue_number: 904, stream: "AGENT_ORCHESTRATION" }
  ]);
  assert.deepEqual(plan.still_uncovered_worker_ids, []);
});

test("never reactivates blocked or approval-gated work", () => {
  const plan = planRoadmapReplenishment({
    uncoveredWorkerIds: ["local-a"],
    openIssues: [
      issue(910, "CORE_INTELLIGENCE", { labels: ["agent-orchestration", "orch:blocked"], ownership: "core adapter only" }),
      issue(911, "CORE_INTELLIGENCE", { approval: "true", ownership: "core adapter two only" })
    ]
  });

  assert.deepEqual(plan.selected, []);
  assert.equal(plan.rejected.some((row) => row.issue_number === 910 && row.reasons.some((reason) => reason.includes("GATED_ORCH_BLOCKED"))), true);
  assert.equal(plan.rejected.some((row) => row.issue_number === 911 && row.reasons.includes("HUMAN_APPROVAL_NOT_EXPLICITLY_FALSE")), true);
});

test("fails closed on unresolved dependencies and missing ownership", () => {
  const plan = planRoadmapReplenishment({
    uncoveredWorkerIds: ["local-a", "local-b"],
    dependencyStates: new Map([[700, "open"]]),
    openIssues: [
      issue(920, "CORE_INTELLIGENCE", { ownership: "core adapter only", dependsOn: "#700" }),
      issue(921, "DISCOVERY_INTELLIGENCE")
    ]
  });

  assert.deepEqual(plan.selected, []);
  assert.equal(plan.rejected.some((row) => row.issue_number === 920 && row.reasons.includes("DEPENDENCY_NOT_CLOSED:#700")), true);
  assert.equal(plan.rejected.some((row) => row.issue_number === 921 && row.reasons.includes("MISSING_EXPLICIT_FILE_OWNERSHIP")), true);
});

test("prevents declared ownership collisions", () => {
  const occupied = issue(930, "CORE_INTELLIGENCE", { labels: ["agent-orchestration", "orch:ready"], ownership: "shared recommendation adapter" });
  const plan = planRoadmapReplenishment({
    uncoveredWorkerIds: ["local-b"],
    occupiedIssues: [occupied],
    openIssues: [
      issue(931, "DISCOVERY_INTELLIGENCE", { ownership: "shared recommendation adapter" })
    ]
  });

  assert.deepEqual(plan.selected, []);
  assert.equal(plan.rejected[0].reasons.includes("FILE_OWNERSHIP_COLLISION:#930"), true);
});

test("does not select non-product lanes during product replenishment", () => {
  const plan = planRoadmapReplenishment({
    uncoveredWorkerIds: ["local-e", "local-f"],
    openIssues: [
      issue(940, "INTEGRATION_RELEASE", { ownership: "integration only" }),
      issue(941, "QA_EVALUATION", { ownership: "qa only" })
    ]
  });

  assert.deepEqual(plan.requested_worker_ids, []);
  assert.deepEqual(plan.selected, []);
});


test("fails closed when a candidate closes before promotion", () => {
  const candidate = issue({
    number: 908,
    stream: "CORE_INTELLIGENCE",
    ownership: "core closed-state adapter only"
  });
  candidate.state = "closed";

  const result = evaluateRoadmapCandidate(candidate, {
    uncoveredWorkerIds: ["local-a"]
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reasons.includes("ISSUE_NOT_OPEN"), true);
});
