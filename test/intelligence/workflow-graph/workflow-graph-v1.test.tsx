import assert from "node:assert/strict";
import test from "node:test";

import {
  validateWorkflowGraphV1,
  WORKFLOW_GRAPH_V1_LIMITS,
  type WorkflowBudgetV1,
  type WorkflowDataEdgeV1,
  type WorkflowGraphV1,
  type WorkflowGraphValidationErrorCodeV1,
  type WorkflowNodeKindV1,
  type WorkflowNodeV1
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
  producerOutputSchemaId: string,
  consumerInputSchemaId = producerOutputSchemaId
): WorkflowDataEdgeV1 {
  return {
    id,
    kind: "DATA",
    fromNodeId,
    toNodeId,
    dataRef: `data:${id}`,
    producerOutputSchemaId,
    consumerInputSchemaId
  };
}

function validDiamond(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1",
    id: "graph:revenue-diamond",
    objective: "Explain a revenue change with independent traffic and commerce evidence.",
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
      node("commerce-worker", "WORKER", ["observation.v1"], ["commerce-branch.v1"]),
      node("traffic-worker", "WORKER", ["observation.v1"], ["traffic-branch.v1"]),
      node("reduce", "REDUCE", ["commerce-branch.v1", "traffic-branch.v1"], ["combined-evidence.v1"], {
        expectedOutputCardinality: 1
      }),
      node("verify", "VERIFY", ["combined-evidence.v1"], ["verified-evidence.v1"], {
        verifier: {
          producerNodeId: "reduce",
          verifierContextId: "context:verify",
          lenses: ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"]
        }
      }),
      node("synthesize", "SYNTHESIZE", ["verified-evidence.v1"], ["explanation.v1"])
    ],
    edges: [
      dataEdge("source-commerce", "source", "commerce-worker", "observation.v1"),
      dataEdge("source-traffic", "source", "traffic-worker", "observation.v1"),
      dataEdge("commerce-reduce", "commerce-worker", "reduce", "commerce-branch.v1"),
      dataEdge("traffic-reduce", "traffic-worker", "reduce", "traffic-branch.v1"),
      dataEdge("reduce-verify", "reduce", "verify", "combined-evidence.v1"),
      dataEdge("verify-synthesize", "verify", "synthesize", "verified-evidence.v1")
    ]
  };
}

function validSequential(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1",
    id: "graph:sequential",
    objective: "Run one deterministic evidence transformation in sequence.",
    executionMode: "SINGLE",
    approvalClass: "AUTO_CONTINUE",
    budget: budget(),
    nodes: [
      node("read", "DETERMINISTIC", ["request.v1"], ["observation.v1"], {
        approvalClass: "AUTO_CONTINUE"
      }),
      node("derive", "DETERMINISTIC", ["observation.v1"], ["derived.v1"], {
        approvalClass: "AUTO_CONTINUE"
      }),
      node("format", "DETERMINISTIC", ["derived.v1"], ["result.v1"], {
        approvalClass: "AUTO_CONTINUE"
      })
    ],
    edges: [
      dataEdge("read-derive", "read", "derive", "observation.v1"),
      dataEdge("derive-format", "derive", "format", "derived.v1")
    ]
  };
}

type MutableGraph = Omit<WorkflowGraphV1, "nodes" | "edges"> & {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

function mutable(graph: WorkflowGraphV1 = validDiamond()): MutableGraph {
  return structuredClone(graph) as unknown as MutableGraph;
}

function errorCodes(graph: unknown): WorkflowGraphValidationErrorCodeV1[] {
  return validateWorkflowGraphV1(graph).errors.map((error) => error.code);
}

function assertRejected(graph: unknown, code: WorkflowGraphValidationErrorCodeV1): void {
  assert.ok(errorCodes(graph).includes(code), `expected ${code}, received ${errorCodes(graph).join(", ")}`);
}

test("accepts a bounded diamond with independent workers, explicit fan-in, fresh-context verification, anchors, and synthesis", () => {
  const graph = validDiamond();
  assert.deepEqual(validateWorkflowGraphV1(graph), { valid: true, errors: [] });

  const reduce = graph.nodes.find((candidate) => candidate.id === "reduce");
  const verifier = graph.nodes.find((candidate) => candidate.id === "verify");
  assert.equal(reduce?.expectedOutputCardinality, 1);
  assert.notEqual(verifier?.contextId, graph.nodes.find((candidate) => candidate.id === verifier?.verifier?.producerNodeId)?.contextId);
  assert.deepEqual(verifier?.verifier?.lenses, ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"]);
});

test("accepts a truly sequential SINGLE workflow without manufactured graph width", () => {
  assert.deepEqual(validateWorkflowGraphV1(validSequential()), { valid: true, errors: [] });
});

test("rejects duplicate node IDs", () => {
  const graph = mutable();
  graph.nodes[1].id = graph.nodes[0].id;
  assertRejected(graph, "DUPLICATE_NODE_ID");
});

test("rejects dangling, self, and cyclic dependencies", () => {
  const dangling = mutable();
  dangling.edges[0].fromNodeId = "missing-node";
  assertRejected(dangling, "DANGLING_DEPENDENCY");

  const self = mutable();
  self.edges[0].toNodeId = self.edges[0].fromNodeId;
  assertRejected(self, "SELF_DEPENDENCY");

  const cyclic = mutable();
  cyclic.edges.push(dataEdge("synthesize-source", "synthesize", "source", "explanation.v1", "request.v1"));
  assertRejected(cyclic, "CYCLE");
});

test("rejects missing schemas and data edges that do not carry a declared schema-bound reference", () => {
  const missingSchema = mutable();
  missingSchema.nodes[0].outputSchemaIds = [];
  assertRejected(missingSchema, "MISSING_SCHEMA_ID");

  const missingReference = mutable();
  delete missingReference.edges[0].dataRef;
  assertRejected(missingReference, "INVALID_DATA_EDGE");

  const mismatchedSchema = mutable();
  mismatchedSchema.edges[0].producerOutputSchemaId = "undeclared.v1";
  assertRejected(mismatchedSchema, "INVALID_DATA_EDGE");
});

test("rejects non-finite, negative, fractional, or ceiling-breaking budgets", () => {
  for (const [key, value] of [
    ["maxRuntimeMs", Number.POSITIVE_INFINITY],
    ["maxRetries", -1],
    ["maxContextTokens", 1.5],
    ["maxOutputTokens", WORKFLOW_GRAPH_V1_LIMITS.maxOutputTokens + 1],
    ["maxCostUsd", WORKFLOW_GRAPH_V1_LIMITS.maxCostUsd + 0.01]
  ] as const) {
    const graph = mutable();
    (graph.nodes[0].budget as Record<string, unknown>)[key] = value;
    assertRejected(graph, "INVALID_BUDGET");
  }
});

test("rejects fan-in without explicit positive bounded expected output cardinality", () => {
  const missing = mutable();
  delete missing.nodes.find((candidate) => candidate.id === "reduce")!.expectedOutputCardinality;
  assertRejected(missing, "INVALID_FAN_IN_CARDINALITY");

  const excessive = mutable();
  excessive.nodes.find((candidate) => candidate.id === "reduce")!.expectedOutputCardinality = WORKFLOW_GRAPH_V1_LIMITS.maxExpectedOutputCardinality + 1;
  assertRejected(excessive, "INVALID_FAN_IN_CARDINALITY");
});

test("rejects a verifier without a real direct producer or a declared lens", () => {
  const invalidProducer = mutable();
  (invalidProducer.nodes.find((candidate) => candidate.id === "verify")!.verifier as Record<string, unknown>).producerNodeId = "missing";
  assertRejected(invalidProducer, "INVALID_VERIFIER");

  const missingLens = mutable();
  (missingLens.nodes.find((candidate) => candidate.id === "verify")!.verifier as Record<string, unknown>).lenses = [];
  assertRejected(missingLens, "MISSING_VERIFIER_LENS");
});

test("rejects verifier context reuse and mismatched verifier identity", () => {
  const reused = mutable();
  const verifier = reused.nodes.find((candidate) => candidate.id === "verify")!;
  verifier.contextId = "context:reduce";
  (verifier.verifier as Record<string, unknown>).verifierContextId = "context:reduce";
  assertRejected(reused, "VERIFIER_CONTEXT_REUSED");

  const mismatched = mutable();
  (mismatched.nodes.find((candidate) => candidate.id === "verify")!.verifier as Record<string, unknown>).verifierContextId = "context:other-verifier";
  assertRejected(mismatched, "INVALID_VERIFIER");
});

test("rejects synthesis when no mandatory canonical anchor exists upstream", () => {
  const graph = mutable();
  for (const candidate of graph.nodes) candidate.evidenceAnchors = [];
  assertRejected(graph, "SYNTHESIS_WITHOUT_EVIDENCE");
});

test("rejects invalid or weaker-than-graph approval classes", () => {
  const invalid = mutable();
  invalid.nodes[0].approvalClass = "UNREVIEWED";
  assertRejected(invalid, "INVALID_APPROVAL_CLASS");

  const weaker = mutable();
  weaker.nodes[0].approvalClass = "AUTO_CONTINUE";
  assertRejected(weaker, "NODE_APPROVAL_TOO_WEAK");
});

test("rejects GRAPH without real parallel width and SINGLE with fan-out", () => {
  const noWidth = mutable(validSequential());
  noWidth.executionMode = "GRAPH";
  assertRejected(noWidth, "GRAPH_WITHOUT_PARALLEL_WIDTH");

  const fanOut = mutable();
  fanOut.executionMode = "SINGLE";
  assertRejected(fanOut, "SINGLE_MODE_FAN_OUT");
});

test("rejects duplicate mutable ownership between otherwise independent nodes", () => {
  const graph = mutable();
  graph.nodes.find((candidate) => candidate.id === "commerce-worker")!.mutableWriteResources = ["shared:mutable-result"];
  graph.nodes.find((candidate) => candidate.id === "traffic-worker")!.mutableWriteResources = ["shared:mutable-result"];
  assertRejected(graph, "INDEPENDENT_MUTABLE_RESOURCE_CONFLICT");
});

test("rejects unlabeled ordering-only edges while accepting narrowly justified control gates", () => {
  const unlabeled = mutable(validSequential());
  unlabeled.edges[0] = {
    id: "ordering-only",
    fromNodeId: "read",
    toNodeId: "derive"
  };
  assertRejected(unlabeled, "ORDERING_EDGE_UNJUSTIFIED");

  const controlled = mutable(validSequential());
  controlled.edges[0] = {
    id: "approval-gate",
    kind: "CONTROL",
    fromNodeId: "read",
    toNodeId: "derive",
    controlGate: "APPROVAL",
    reason: "A governed approval must be observed before derivation."
  };
  assert.deepEqual(validateWorkflowGraphV1(controlled), { valid: true, errors: [] });
});

test("does not accept COMPLETE when truth is absent, unknown, stale, or conflicted", () => {
  for (const truthState of ["ABSENT", "UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const graph = mutable();
    graph.nodes[0].resultState = "COMPLETE";
    graph.nodes[0].truthState = truthState;
    assertRejected(graph, "COMPLETE_WITH_UNRESOLVED_TRUTH");
  }

  const supported = mutable();
  supported.nodes[0].resultState = "COMPLETE";
  supported.nodes[0].truthState = "CURRENT";
  assert.ok(!errorCodes(supported).includes("COMPLETE_WITH_UNRESOLVED_TRUTH"));
});

test("enforces bounded arrays and duplicate-free evidence-safe identifiers", () => {
  const oversized = mutable();
  oversized.nodes[0].readResources = Array.from({ length: WORKFLOW_GRAPH_V1_LIMITS.maxResourcesPerNode + 1 }, (_, index) => `resource:${index}`);
  assertRejected(oversized, "ARRAY_LIMIT_EXCEEDED");

  const duplicate = mutable();
  duplicate.nodes[0].inputSchemaIds = ["request.v1", "request.v1"];
  assertRejected(duplicate, "MISSING_SCHEMA_ID");
});

test("returns deterministic structured errors without leaking arbitrary input payloads", () => {
  const graph = mutable();
  graph.nodes[0].id = "";
  graph.nodes[0].rawPayload = "SECRET_VALUE_MUST_NOT_APPEAR";

  const first = validateWorkflowGraphV1(graph);
  const second = validateWorkflowGraphV1(graph);
  assert.deepEqual(first, second);
  assert.doesNotMatch(JSON.stringify(first), /SECRET_VALUE_MUST_NOT_APPEAR/);
  assert.ok(first.errors.every((error) => typeof error.code === "string" && typeof error.path === "string"));
});
