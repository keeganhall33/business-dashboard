import assert from "node:assert/strict";
import test from "node:test";

import {
  planWorkflowGraphV1,
  type WorkflowGraphPlanningInputV1,
  type WorkflowNodePlanningConstraintV1
} from "@/lib/intelligence/workflow-graph/workflow-graph-plan-v1";
import type {
  WorkflowBudgetV1,
  WorkflowDataEdgeV1,
  WorkflowGraphV1,
  WorkflowNodeKindV1,
  WorkflowNodeV1
} from "@/lib/intelligence/workflow-graph/workflow-graph-v1";

function budget(): WorkflowBudgetV1 {
  return {
    maxRuntimeMs: 60_000,
    maxRetries: 1,
    maxContextTokens: 8_000,
    maxOutputTokens: 2_000,
    maxCostUsd: 2
  };
}

function node(
  id: string,
  kind: WorkflowNodeKindV1,
  inputSchemaIds: string[],
  outputSchemaIds: string[],
  options: Partial<WorkflowNodeV1> = {}
): WorkflowNodeV1 {
  return {
    id,
    kind,
    contextId: `context:${id}`,
    inputSchemaIds,
    outputSchemaIds,
    readResources: [],
    mutableWriteResources: [`result:${id}`],
    evidenceAnchors: [],
    budget: budget(),
    approvalClass: "ARCHITECT_REVIEW_REQUIRED",
    resultState: "PENDING",
    truthState: "UNKNOWN",
    ...options
  };
}

function dataEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  schemaId: string
): WorkflowDataEdgeV1 {
  return {
    id,
    kind: "DATA",
    fromNodeId,
    toNodeId,
    dataRef: `data:${id}`,
    producerOutputSchemaId: schemaId,
    consumerInputSchemaId: schemaId
  };
}

function diamondGraph(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1",
    id: "graph:revenue-diamond",
    objective: "Explain revenue evidence through independent traffic and commerce branches.",
    executionMode: "GRAPH",
    approvalClass: "ARCHITECT_REVIEW_REQUIRED",
    budget: budget(),
    nodes: [
      node("source", "DETERMINISTIC", ["request.v1"], ["observation.v1"], {
        evidenceAnchors: [
          {
            anchorClass: "CANONICAL_CONNECTOR_OBSERVATION",
            canonicalRef: "woo:orders-window",
            mandatory: true
          }
        ]
      }),
      node("commerce", "WORKER", ["observation.v1"], ["commerce.v1"]),
      node("traffic", "WORKER", ["observation.v1"], ["traffic.v1"]),
      node("reduce", "REDUCE", ["commerce.v1", "traffic.v1"], ["combined.v1"], {
        expectedOutputCardinality: 1
      }),
      node("verify", "VERIFY", ["combined.v1"], ["verified.v1"], {
        verifier: {
          producerNodeId: "reduce",
          verifierContextId: "context:verify",
          lenses: ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"]
        }
      }),
      node("synthesize", "SYNTHESIZE", ["verified.v1"], ["explanation.v1"])
    ],
    edges: [
      dataEdge("source-commerce", "source", "commerce", "observation.v1"),
      dataEdge("source-traffic", "source", "traffic", "observation.v1"),
      dataEdge("commerce-reduce", "commerce", "reduce", "commerce.v1"),
      dataEdge("traffic-reduce", "traffic", "reduce", "traffic.v1"),
      dataEdge("reduce-verify", "reduce", "verify", "combined.v1"),
      dataEdge("verify-synthesize", "verify", "synthesize", "verified.v1")
    ]
  };
}

function chainGraph(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1",
    id: "graph:chain",
    objective: "Run a genuinely sequential deterministic chain.",
    executionMode: "SINGLE",
    approvalClass: "AUTO_CONTINUE",
    budget: budget(),
    nodes: [
      node("read", "DETERMINISTIC", ["request.v1"], ["observation.v1"], { approvalClass: "AUTO_CONTINUE" }),
      node("derive", "DETERMINISTIC", ["observation.v1"], ["derived.v1"], { approvalClass: "AUTO_CONTINUE" }),
      node("format", "DETERMINISTIC", ["derived.v1"], ["result.v1"], { approvalClass: "AUTO_CONTINUE" })
    ],
    edges: [
      dataEdge("read-derive", "read", "derive", "observation.v1"),
      dataEdge("derive-format", "derive", "format", "derived.v1")
    ]
  };
}

function constraintsFor(graph: WorkflowGraphV1): WorkflowNodePlanningConstraintV1[] {
  return graph.nodes.map((candidate) => ({
    nodeId: candidate.id,
    consumedDataRefs: graph.edges
      .filter((edge) => edge.kind === "DATA" && edge.toNodeId === candidate.id)
      .map((edge) => edge.dataRef),
    semanticOwnership: [`semantic:${candidate.id}`],
    connectorAccesses: []
  }));
}

function inputFor(graph: WorkflowGraphV1 = diamondGraph()): WorkflowGraphPlanningInputV1 {
  return { graph, nodeConstraints: constraintsFor(graph) };
}

function waveIndex(result: ReturnType<typeof planWorkflowGraphV1>, nodeId: string): number {
  assert.ok(result.plan);
  return result.plan.waves.find((wave) => wave.nodeIds.includes(nodeId))?.index ?? -1;
}

test("compiles a valid diamond into stable fan-out, reduce, verify, and synthesis waves", () => {
  const result = planWorkflowGraphV1(inputFor());
  assert.equal(result.status, "GRAPH_READY");
  assert.deepEqual(result.plan?.waves, [
    { index: 0, nodeIds: ["source"] },
    { index: 1, nodeIds: ["commerce", "traffic"] },
    { index: 2, nodeIds: ["reduce"] },
    { index: 3, nodeIds: ["verify"] },
    { index: 4, nodeIds: ["synthesize"] }
  ]);
  assert.deepEqual(result.plan?.estimates, {
    totalNodeCount: 6,
    criticalPathNodeCount: 5,
    maximumParallelWidth: 2
  });
});

test("keeps independent branches together while preserving true data dependencies", () => {
  const result = planWorkflowGraphV1(inputFor());
  assert.equal(waveIndex(result, "commerce"), waveIndex(result, "traffic"));
  assert.ok(waveIndex(result, "source") < waveIndex(result, "commerce"));
  assert.ok(waveIndex(result, "traffic") < waveIndex(result, "reduce"));
});

test("surfaces an unconsumed ordering-only data edge without deleting it", () => {
  const input = inputFor();
  input.nodeConstraints.find((constraint) => constraint.nodeId === "commerce")!.consumedDataRefs = [];
  const result = planWorkflowGraphV1(input);

  assert.deepEqual(result.plan?.fakeEdgeCandidates, [
    {
      edgeId: "source-commerce",
      fromNodeId: "source",
      toNodeId: "commerce",
      reason: "DATA_REFERENCE_NOT_DECLARED_CONSUMED"
    }
  ]);
  assert.ok(waveIndex(result, "source") < waveIndex(result, "commerce"));
});

test("does not flag an unused data edge when the same pair has a justified approval gate", () => {
  const input = inputFor();
  input.nodeConstraints.find((constraint) => constraint.nodeId === "commerce")!.consumedDataRefs = [];
  input.graph.nodes.find((candidate) => candidate.id === "commerce")!.expectedOutputCardinality = 1;
  input.graph.edges.push({
    id: "source-commerce-approval",
    kind: "CONTROL",
    fromNodeId: "source",
    toNodeId: "commerce",
    controlGate: "APPROVAL",
    reason: "Architect approval is required before the commerce branch."
  });
  const result = planWorkflowGraphV1(input);
  assert.deepEqual(result.plan?.fakeEdgeCandidates, []);
  assert.ok(waveIndex(result, "source") < waveIndex(result, "commerce"));
});

test("serializes shared mutable resource access deterministically", () => {
  const input = inputFor();
  input.graph.nodes.find((candidate) => candidate.id === "commerce")!.mutableWriteResources = ["file:shared"];
  input.graph.nodes.find((candidate) => candidate.id === "traffic")!.readResources = ["file:shared"];
  const result = planWorkflowGraphV1(input);

  assert.deepEqual(result.plan?.hiddenDependencies, [
    {
      fromNodeId: "commerce",
      toNodeId: "traffic",
      reasons: ["MUTABLE_RESOURCE_ACCESS"]
    }
  ]);
  assert.ok(waveIndex(result, "commerce") < waveIndex(result, "traffic"));
});

test("serializes overlapping semantic ownership", () => {
  const input = inputFor();
  input.nodeConstraints.find((constraint) => constraint.nodeId === "commerce")!.semanticOwnership = ["decision:revenue"];
  input.nodeConstraints.find((constraint) => constraint.nodeId === "traffic")!.semanticOwnership = ["decision:revenue"];
  const result = planWorkflowGraphV1(input);
  assert.deepEqual(result.plan?.hiddenDependencies[0]?.reasons, ["SEMANTIC_OWNERSHIP"]);
  assert.ok(waveIndex(result, "commerce") < waveIndex(result, "traffic"));
});

test("serializes exclusive connector access but permits shared connector access", () => {
  const exclusive = inputFor();
  exclusive.nodeConstraints.find((constraint) => constraint.nodeId === "commerce")!.connectorAccesses = [
    { groupId: "connector:ga4", mode: "EXCLUSIVE" }
  ];
  exclusive.nodeConstraints.find((constraint) => constraint.nodeId === "traffic")!.connectorAccesses = [
    { groupId: "connector:ga4", mode: "SHARED" }
  ];
  const exclusiveResult = planWorkflowGraphV1(exclusive);
  assert.deepEqual(exclusiveResult.plan?.hiddenDependencies[0]?.reasons, ["EXCLUSIVE_CONNECTOR_GROUP"]);
  assert.ok(waveIndex(exclusiveResult, "commerce") < waveIndex(exclusiveResult, "traffic"));

  const shared = inputFor();
  for (const nodeId of ["commerce", "traffic"]) {
    shared.nodeConstraints.find((constraint) => constraint.nodeId === nodeId)!.connectorAccesses = [
      { groupId: "connector:ga4", mode: "SHARED" }
    ];
  }
  const sharedResult = planWorkflowGraphV1(shared);
  assert.deepEqual(sharedResult.plan?.hiddenDependencies, []);
  assert.equal(waveIndex(sharedResult, "commerce"), waveIndex(sharedResult, "traffic"));
});

test("permits parallel read-only access to a shared resource", () => {
  const input = inputFor();
  for (const nodeId of ["commerce", "traffic"]) {
    input.graph.nodes.find((candidate) => candidate.id === nodeId)!.readResources = ["file:shared"];
  }
  const result = planWorkflowGraphV1(input);
  assert.deepEqual(result.plan?.hiddenDependencies, []);
  assert.equal(waveIndex(result, "commerce"), waveIndex(result, "traffic"));
});

test("preserves approval ordering and cannot bypass a human gate", () => {
  const input = inputFor();
  const edgeIndex = input.graph.edges.findIndex((edge) => edge.id === "source-traffic");
  input.graph.edges[edgeIndex] = {
    id: "source-traffic-human-gate",
    kind: "CONTROL",
    fromNodeId: "source",
    toNodeId: "traffic",
    controlGate: "APPROVAL",
    reason: "Keegan approval must be observed before traffic analysis."
  };
  const result = planWorkflowGraphV1(input);
  assert.ok(waveIndex(result, "source") < waveIndex(result, "traffic"));
});

test("recommends SINGLE for a true chain instead of manufacturing graph width", () => {
  const result = planWorkflowGraphV1(inputFor(chainGraph()));
  assert.equal(result.status, "SINGLE_RECOMMENDED");
  assert.deepEqual(result.plan?.estimates, {
    totalNodeCount: 3,
    criticalPathNodeCount: 3,
    maximumParallelWidth: 1
  });
});

test("returns no plan for cycles or other invalid graphs", () => {
  const graph = diamondGraph();
  graph.edges.push(dataEdge("synthesize-source", "synthesize", "source", "explanation.v1"));
  const cyclic = planWorkflowGraphV1(inputFor(graph));
  assert.equal(cyclic.status, "INVALID_GRAPH");
  assert.equal(cyclic.plan, null);
  assert.ok(cyclic.graphValidationErrors.some((error) => error.code === "CYCLE"));

  const malformed = structuredClone(inputFor()) as unknown as { graph: Record<string, unknown>; nodeConstraints: unknown[] };
  malformed.graph.nodes = [];
  const invalid = planWorkflowGraphV1(malformed);
  assert.equal(invalid.status, "INVALID_GRAPH");
  assert.equal(invalid.plan, null);
});

test("rejects incomplete, duplicate, unknown, or unbounded planning constraints without a partial plan", () => {
  const missing = inputFor();
  missing.nodeConstraints.pop();
  const missingResult = planWorkflowGraphV1(missing);
  assert.equal(missingResult.plan, null);
  assert.ok(missingResult.errors.some((error) => error.code === "MISSING_NODE_CONSTRAINT"));

  const duplicate = inputFor();
  duplicate.nodeConstraints.push(structuredClone(duplicate.nodeConstraints[0]));
  const duplicateResult = planWorkflowGraphV1(duplicate);
  assert.equal(duplicateResult.plan, null);
  assert.ok(duplicateResult.errors.some((error) => error.code === "DUPLICATE_NODE_CONSTRAINT"));

  const unknown = inputFor();
  unknown.nodeConstraints[0].nodeId = "unknown";
  const unknownResult = planWorkflowGraphV1(unknown);
  assert.equal(unknownResult.plan, null);
  assert.ok(unknownResult.errors.some((error) => error.code === "UNKNOWN_CONSTRAINED_NODE"));

  const unbounded = inputFor();
  unbounded.nodeConstraints[0].semanticOwnership = Array.from({ length: 17 }, (_, index) => `semantic:${index}`);
  const unboundedResult = planWorkflowGraphV1(unbounded);
  assert.equal(unboundedResult.plan, null);
  assert.ok(unboundedResult.errors.some((error) => error.code === "CONSTRAINT_LIMIT_EXCEEDED"));
});

test("produces deterministic bounded ordering and estimates", () => {
  const input = inputFor();
  const first = planWorkflowGraphV1(input);
  const second = planWorkflowGraphV1(structuredClone(input));
  assert.deepEqual(first, second);
  assert.ok((first.plan?.estimates.totalNodeCount ?? Infinity) <= 32);
  assert.ok((first.plan?.estimates.criticalPathNodeCount ?? Infinity) <= 32);
  assert.ok((first.plan?.estimates.maximumParallelWidth ?? Infinity) <= 32);
  assert.equal(JSON.stringify(first).includes("runtimeSavings"), false);
});
