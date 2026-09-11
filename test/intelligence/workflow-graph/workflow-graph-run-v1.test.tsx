import assert from "node:assert/strict";
import test from "node:test";

import {
  projectWorkflowGraphRunIntegrityV1,
  type WorkflowGraphRunIntegrityInputV1,
  type WorkflowNodeResultEnvelopeV1
} from "@/lib/intelligence/workflow-graph/workflow-graph-run-v1";
import type { WorkflowBudgetV1, WorkflowGraphV1, WorkflowNodeKindV1, WorkflowNodeV1 } from "@/lib/intelligence/workflow-graph/workflow-graph-v1";

const NOW = "2026-09-11T03:00:00.000Z";

function budget(): WorkflowBudgetV1 {
  return { maxRuntimeMs: 60_000, maxRetries: 1, maxContextTokens: 8_000, maxOutputTokens: 2_000, maxCostUsd: 2 };
}

function node(id: string, kind: WorkflowNodeKindV1, inputs: string[], outputs: string[], options: Partial<WorkflowNodeV1> = {}): WorkflowNodeV1 {
  return { id, kind, contextId: `context:${id}`, inputSchemaIds: inputs, outputSchemaIds: outputs, readResources: [], mutableWriteResources: [`result:${id}`], evidenceAnchors: [], budget: budget(), approvalClass: "ARCHITECT_REVIEW_REQUIRED", resultState: "PENDING", truthState: "UNKNOWN", ...options };
}

function graph(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1", id: "graph:integrity", objective: "Produce one verified evidence-backed finding.", executionMode: "GRAPH", approvalClass: "ARCHITECT_REVIEW_REQUIRED", budget: { ...budget(), maxRuntimeMs: 300_000, maxContextTokens: 40_000, maxOutputTokens: 10_000, maxCostUsd: 10 },
    nodes: [
      node("source", "DETERMINISTIC", ["request.v1"], ["observation.v1"], { evidenceAnchors: [{ anchorClass: "DETERMINISTIC_TEST", canonicalRef: "test:source", mandatory: true }] }),
      node("worker-a", "WORKER", ["observation.v1"], ["branch-a.v1"]),
      node("worker-b", "WORKER", ["observation.v1"], ["branch-b.v1"]),
      node("reduce", "REDUCE", ["branch-a.v1", "branch-b.v1"], ["combined.v1"], { expectedOutputCardinality: 1 }),
      node("verify", "VERIFY", ["combined.v1"], ["verified.v1"], { verifier: { producerNodeId: "reduce", verifierContextId: "context:verify", lenses: ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"] } }),
      node("synthesize", "SYNTHESIZE", ["verified.v1"], ["finding.v1"])
    ],
    edges: [
      { id: "source-a", kind: "DATA", fromNodeId: "source", toNodeId: "worker-a", dataRef: "data:source-a", producerOutputSchemaId: "observation.v1", consumerInputSchemaId: "observation.v1" },
      { id: "source-b", kind: "DATA", fromNodeId: "source", toNodeId: "worker-b", dataRef: "data:source-b", producerOutputSchemaId: "observation.v1", consumerInputSchemaId: "observation.v1" },
      { id: "a-reduce", kind: "DATA", fromNodeId: "worker-a", toNodeId: "reduce", dataRef: "data:a-reduce", producerOutputSchemaId: "branch-a.v1", consumerInputSchemaId: "branch-a.v1" },
      { id: "b-reduce", kind: "DATA", fromNodeId: "worker-b", toNodeId: "reduce", dataRef: "data:b-reduce", producerOutputSchemaId: "branch-b.v1", consumerInputSchemaId: "branch-b.v1" },
      { id: "reduce-verify", kind: "DATA", fromNodeId: "reduce", toNodeId: "verify", dataRef: "data:reduce-verify", producerOutputSchemaId: "combined.v1", consumerInputSchemaId: "combined.v1" },
      { id: "verify-synth", kind: "DATA", fromNodeId: "verify", toNodeId: "synthesize", dataRef: "data:verify-synth", producerOutputSchemaId: "verified.v1", consumerInputSchemaId: "verified.v1" }
    ]
  };
}

function result(node: WorkflowNodeV1, inputResultIds: string[]): WorkflowNodeResultEnvelopeV1 {
  const envelope: WorkflowNodeResultEnvelopeV1 = {
    graphId: "graph:integrity", nodeId: node.id, runId: "run:one", resultId: `result:${node.id}`, attemptId: 1,
    producerContextId: node.contextId, resultState: "COMPLETE", truthState: "CURRENT", generatedAt: NOW, observedAt: NOW,
    outputSchemaId: node.outputSchemaIds[0], outputItemCount: node.expectedOutputCardinality ?? 1, inputResultIds,
    evidenceRefs: [{ evidenceId: `evidence:${node.id}`, semanticKind: node.id === "source" ? "OBSERVED" : "DERIVED", sourceIdentity: `source:${node.id}` }],
    anchorChecks: [], elapsedMs: 100, inputTokens: 10, outputTokens: 5, costUsd: 0.1
  };
  if (node.id === "source") envelope.anchorChecks = [{ anchorClass: "DETERMINISTIC_TEST", canonicalRef: "test:source", evidenceRef: "evidence:source", sourceKind: "DETERMINISTIC_TEST", outcome: "PASS" }];
  if (node.kind === "VERIFY") envelope.verification = { verifierContextId: "context:verify", lenses: [
    { lens: "CORRECTNESS", verdict: "PASS", reasonCode: "supported", evidenceRefs: ["evidence:reduce"] },
    { lens: "FRESHNESS", verdict: "PASS", reasonCode: "current", evidenceRefs: ["evidence:reduce"] },
    { lens: "SOURCE_SUPPORT", verdict: "PASS", reasonCode: "anchored", evidenceRefs: ["evidence:reduce"] }
  ] };
  return envelope;
}

function validInput(): WorkflowGraphRunIntegrityInputV1 {
  const value = graph();
  const ids: Record<string, string[]> = {
    source: [], "worker-a": ["result:source"], "worker-b": ["result:source"],
    reduce: ["result:worker-a", "result:worker-b"], verify: ["result:reduce"], synthesize: ["result:verify"]
  };
  return { graph: value, runId: "run:one", evaluatedAt: NOW, maxResultAgeMs: 60_000, chunkSize: 2, results: value.nodes.map((candidate) => result(candidate, ids[candidate.id])) };
}

function project(input = validInput()) {
  const output = projectWorkflowGraphRunIntegrityV1(input);
  assert.equal(output.status, "PROJECTED");
  assert.ok(output.projection);
  return output.projection;
}

test("all required results, fresh verifier lenses, and anchors permit COMPLETE", () => {
  const output = project();
  assert.equal(output.state, "COMPLETE");
  assert.equal(output.acceptedResultIds.length, 6);
  assert.deepEqual(output.anchors, { requiredCount: 1, passedCount: 1, rejectedCanonicalRefs: [], uniqueEvidenceIdentityCount: 1 });
});

test("one missing node produces PARTIAL and names it", () => {
  const input = validInput();
  input.results = input.results.filter((candidate) => candidate.nodeId !== "worker-b");
  const output = project(input);
  assert.equal(output.state, "PARTIAL");
  assert.deepEqual(output.missingNodeIds, ["worker-b"]);
});

test("unknown truth and duplicate results cannot satisfy fan-in", () => {
  const unknown = validInput();
  unknown.results.find((candidate) => candidate.nodeId === "worker-a")!.truthState = "UNKNOWN";
  assert.equal(project(unknown).state, "PARTIAL");
  assert.ok(project(unknown).failedNodeIds.includes("worker-a"));

  const duplicate = validInput();
  duplicate.results.push({ ...structuredClone(duplicate.results[1]), resultId: "result:worker-a:duplicate" });
  const duplicated = project(duplicate);
  assert.deepEqual(duplicated.duplicateNodeIds, ["worker-a"]);
  assert.equal(duplicated.state, "PARTIAL");
});

test("rejects output schema mismatch", () => {
  const input = validInput();
  input.results.find((candidate) => candidate.nodeId === "worker-a")!.outputSchemaId = "wrong.v1";
  assert.ok(project(input).rejectedResults.some((candidate) => candidate.reasons.includes("OUTPUT_SCHEMA_MISMATCH")));
});

test("rejects synthesis before prerequisites pass", () => {
  const input = validInput();
  input.results.find((candidate) => candidate.nodeId === "verify")!.truthState = "UNKNOWN";
  const output = project(input);
  assert.notEqual(output.state, "COMPLETE");
  assert.ok(output.rejectedResults.find((candidate) => candidate.nodeId === "synthesize")?.reasons.includes("SYNTHESIS_PREREQUISITE_REJECTED"));
});

test("rejects same-context verification", () => {
  const input = validInput();
  const verifier = input.results.find((candidate) => candidate.nodeId === "verify")!;
  verifier.producerContextId = "context:reduce";
  verifier.verification!.verifierContextId = "context:reduce";
  assert.ok(project(input).rejectedResults.find((candidate) => candidate.nodeId === "verify")?.reasons.includes("VERIFIER_CONTEXT_REUSED"));
});

test("correctness pass cannot substitute for freshness and source-support", () => {
  const input = validInput();
  input.results.find((candidate) => candidate.nodeId === "verify")!.verification!.lenses = [
    { lens: "CORRECTNESS", verdict: "PASS", reasonCode: "supported", evidenceRefs: ["evidence:reduce"] }
  ];
  assert.ok(project(input).rejectedResults.find((candidate) => candidate.nodeId === "verify")?.reasons.includes("MISSING_VERIFIER_LENS"));
});

test("failed deterministic anchor overrides narrative consensus", () => {
  const input = validInput();
  const source = input.results.find((candidate) => candidate.nodeId === "source")!;
  source.anchorChecks[0].outcome = "FAIL";
  source.anchorChecks.push({ ...source.anchorChecks[0], evidenceRef: "evidence:narrative", sourceKind: "MODEL_NARRATIVE", outcome: "PASS" });
  const output = project(input);
  assert.equal(output.state, "BLOCKED");
  assert.equal(output.anchors.passedCount, 0);
});

test("duplicated evidence does not inflate anchor independence", () => {
  const input = validInput();
  const source = input.results.find((candidate) => candidate.nodeId === "source")!;
  source.evidenceRefs.push({ evidenceId: "evidence:source-copy", semanticKind: "OBSERVED", sourceIdentity: "source:source" });
  source.anchorChecks.push({ ...structuredClone(source.anchorChecks[0]), evidenceRef: "evidence:source-copy" });
  assert.equal(project(input).anchors.uniqueEvidenceIdentityCount, 1);
});

test("stale or conflicted mandatory anchors block completion", () => {
  for (const outcome of ["STALE", "CONFLICTED"] as const) {
    const input = validInput();
    input.results.find((candidate) => candidate.nodeId === "source")!.anchorChecks[0].outcome = outcome;
    const output = project(input);
    assert.equal(output.state, "BLOCKED");
    assert.deepEqual(output.anchors.rejectedCanonicalRefs, ["test:source"]);
  }
});

test("absent cost and token metrics remain UNKNOWN", () => {
  const input = validInput();
  for (const envelope of input.results) { delete envelope.costUsd; delete envelope.inputTokens; delete envelope.outputTokens; }
  const output = project(input);
  assert.equal(output.budget.costUsd.state, "UNKNOWN");
  assert.equal(output.budget.costUsd.value, null);
  assert.equal(output.budget.tokens.state, "UNKNOWN");
});

test("budget overage is explicit without hiding accepted evidence", () => {
  const input = validInput();
  input.results.find((candidate) => candidate.nodeId === "worker-a")!.costUsd = 3;
  const output = project(input);
  assert.equal(output.state, "DEGRADED");
  assert.equal(output.budget.state, "EXCEEDED");
  assert.deepEqual(output.budget.exceededNodeIds, ["worker-a"]);
  assert.equal(output.acceptedResultIds.length, 6);
});

test("fan-in layer and chunk metadata is bounded and deterministic", () => {
  const first = project();
  const second = project(structuredClone(validInput()));
  assert.deepEqual(first.fanInLayers, second.fanInLayers);
  assert.ok(first.fanInLayers.every((layer) => layer.chunks.every((chunk) => chunk.inputNodeIds.length <= 2)));
  assert.deepEqual(first.fanInLayers.find((layer) => layer.nodeId === "reduce")?.chunks, [
    { index: 0, inputNodeIds: ["worker-a", "worker-b"] }
  ]);
});

test("projection never exposes raw transcript or secret-bearing fields", () => {
  const input = validInput() as WorkflowGraphRunIntegrityInputV1 & { results: Array<WorkflowNodeResultEnvelopeV1 & Record<string, unknown>> };
  input.results[0].rawTranscript = "SECRET_TRANSCRIPT";
  input.results[0].secret = "SECRET_VALUE";
  const serialized = JSON.stringify(projectWorkflowGraphRunIntegrityV1(input));
  assert.doesNotMatch(serialized, /SECRET_TRANSCRIPT|SECRET_VALUE|rawTranscript|secret/);
});

test("invalid graphs return no projection", () => {
  const input = validInput();
  input.graph.edges.push({ id: "cycle", kind: "DATA", fromNodeId: "synthesize", toNodeId: "source", dataRef: "data:cycle", producerOutputSchemaId: "finding.v1", consumerInputSchemaId: "request.v1" });
  const output = projectWorkflowGraphRunIntegrityV1(input);
  assert.equal(output.status, "INVALID_GRAPH");
  assert.equal(output.projection, null);
});
