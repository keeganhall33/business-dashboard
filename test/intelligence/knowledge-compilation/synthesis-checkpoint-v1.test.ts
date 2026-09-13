import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSynthesisCheckpointV1,
  toSystemRunCheckpointWriteV1,
  type BuildSynthesisCheckpointInputV1
} from "@/lib/intelligence/knowledge-compilation/synthesis-checkpoint-v1";
import type { WorkflowGraphV1, WorkflowNodeV1 } from "@/lib/intelligence/workflow-graph/workflow-graph-v1";

function node(id: string, kind: WorkflowNodeV1["kind"]): WorkflowNodeV1 {
  return {
    id,
    kind,
    contextId: `context:${id}`,
    inputSchemaIds: [kind === "DETERMINISTIC" ? "request:v1" : "evidence:v1"],
    outputSchemaIds: [kind === "DETERMINISTIC" ? "evidence:v1" : "synthesis:v1"],
    readResources: [],
    mutableWriteResources: [],
    evidenceAnchors: kind === "DETERMINISTIC"
      ? [{ anchorClass: "DETERMINISTIC_TEST", canonicalRef: "evidence:source-snapshot", mandatory: true }]
      : [],
    budget: {
      maxRuntimeMs: 60_000,
      maxRetries: 0,
      maxContextTokens: 10_000,
      maxOutputTokens: 2_000,
      maxCostUsd: 5
    },
    approvalClass: "AUTO_CONTINUE"
  };
}

function graph(): WorkflowGraphV1 {
  return {
    version: "WORKFLOW_GRAPH_V1",
    id: "graph:synthesis-checkpoint-test",
    objective: "Prove resumable synthesis without changing its source snapshot.",
    executionMode: "SINGLE",
    approvalClass: "AUTO_CONTINUE",
    budget: {
      maxRuntimeMs: 120_000,
      maxRetries: 1,
      maxContextTokens: 20_000,
      maxOutputTokens: 4_000,
      maxCostUsd: 10
    },
    nodes: [node("collect", "DETERMINISTIC"), node("synthesize", "SYNTHESIZE")],
    edges: [{
      id: "collect-synthesize",
      kind: "DATA",
      fromNodeId: "collect",
      toNodeId: "synthesize",
      dataRef: "data:collect-synthesize",
      producerOutputSchemaId: "evidence:v1",
      consumerInputSchemaId: "evidence:v1"
    }]
  };
}

function initial(overrides: Partial<BuildSynthesisCheckpointInputV1> = {}): BuildSynthesisCheckpointInputV1 {
  return {
    graph: graph(),
    run_id: "run:weekly-synthesis",
    synthesis_node_id: "synthesize",
    sequence: 1,
    state: "READY_TO_RESUME",
    source_snapshot_fingerprint: "sha256:source-snapshot-v1",
    processed_source_refs: ["source:a"],
    pending_source_refs: ["source:b"],
    candidate_finding_refs: ["finding:one"],
    unresolved_conflict_refs: ["conflict:one"],
    resolved_conflict_refs: [],
    usage: { context_tokens: 1_000, output_tokens: 200, cost_usd: 0.5, elapsed_ms: 5_000 },
    updated_at: "2026-09-13T20:00:00.000Z",
    ...overrides
  };
}

test("creates a bounded resumable checkpoint and maps it to the existing persistence seam", () => {
  const checkpoint = buildSynthesisCheckpointV1(initial());
  const write = toSystemRunCheckpointWriteV1(checkpoint);

  assert.equal(checkpoint.contract_version, "SYNTHESIS_CHECKPOINT_V1");
  assert.equal(checkpoint.sequence, 1);
  assert.equal(checkpoint.resumable, true);
  assert.match(checkpoint.checkpoint_fingerprint, /^fnv1a:[a-f0-9]{8}$/);
  assert.equal(write.agentKey, "knowledge-synthesis");
  assert.equal(write.checkpointKey, "synthesis:synthesize");
  assert.equal(write.status, "started");
  assert.equal(write.metadata.synthesis_checkpoint, checkpoint);
});

test("resumes monotonically on the same immutable source snapshot", () => {
  const first = buildSynthesisCheckpointV1(initial());
  const completed = buildSynthesisCheckpointV1(initial({
    sequence: 2,
    state: "COMPLETE",
    processed_source_refs: ["source:a", "source:b"],
    pending_source_refs: [],
    candidate_finding_refs: ["finding:one", "finding:two"],
    unresolved_conflict_refs: [],
    resolved_conflict_refs: ["conflict:one"],
    usage: { context_tokens: 2_000, output_tokens: 350, cost_usd: 0.8, elapsed_ms: 8_000 },
    updated_at: "2026-09-13T20:10:00.000Z",
    previous_checkpoint: first
  }));

  assert.equal(completed.previous_checkpoint_fingerprint, first.checkpoint_fingerprint);
  assert.equal(completed.resumable, false);
  assert.equal(toSystemRunCheckpointWriteV1(completed).status, "completed");
});

test("rejects source snapshot changes, progress regression, and silent conflict removal", () => {
  const first = buildSynthesisCheckpointV1(initial());

  assert.throws(() => buildSynthesisCheckpointV1(initial({
    sequence: 2,
    source_snapshot_fingerprint: "sha256:different-snapshot",
    previous_checkpoint: first
  })), /SOURCE_SNAPSHOT_CHANGED/);
  assert.throws(() => buildSynthesisCheckpointV1(initial({
    sequence: 2,
    processed_source_refs: [],
    previous_checkpoint: first
  })), /PROCESSED_SOURCE_REGRESSION/);
  assert.throws(() => buildSynthesisCheckpointV1(initial({
    sequence: 2,
    unresolved_conflict_refs: [],
    previous_checkpoint: first
  })), /CONFLICT_SILENTLY_REMOVED/);
});

test("rejects overlapping work, budget overflow, and false completion", () => {
  assert.throws(() => buildSynthesisCheckpointV1(initial({
    pending_source_refs: ["source:a"]
  })), /SOURCE_REF_OVERLAP/);
  assert.throws(() => buildSynthesisCheckpointV1(initial({
    usage: { context_tokens: 10_001, output_tokens: 200, cost_usd: 0.5, elapsed_ms: 5_000 }
  })), /BUDGET_EXCEEDED/);
  assert.throws(() => buildSynthesisCheckpointV1(initial({
    state: "COMPLETE"
  })), /COMPLETE_WITH_UNRESOLVED_WORK/);
});

test("unresolved conflicts can reach review but cannot masquerade as completion", () => {
  const checkpoint = buildSynthesisCheckpointV1(initial({
    state: "READY_FOR_REVIEW",
    pending_source_refs: []
  }));

  assert.equal(checkpoint.state, "READY_FOR_REVIEW");
  assert.equal(checkpoint.resumable, false);
  assert.equal(toSystemRunCheckpointWriteV1(checkpoint).status, "started");
});

test("rejects a tampered previous checkpoint before resuming", () => {
  const first = buildSynthesisCheckpointV1(initial());
  const tampered = {
    ...first,
    candidate_finding_refs: [...first.candidate_finding_refs, "finding:tampered"]
  };

  assert.throws(() => buildSynthesisCheckpointV1(initial({
    sequence: 2,
    state: "IN_PROGRESS",
    processed_source_refs: ["source:a", "source:b"],
    pending_source_refs: [],
    candidate_finding_refs: ["finding:one", "finding:tampered"],
    previous_checkpoint: tampered
  })), /PREVIOUS_FINGERPRINT_INVALID/);
});
