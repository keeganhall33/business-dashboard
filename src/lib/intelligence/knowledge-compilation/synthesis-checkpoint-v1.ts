import { validateWorkflowGraphV1, type WorkflowGraphV1 } from "../workflow-graph/workflow-graph-v1";

export const SYNTHESIS_CHECKPOINT_CONTRACT_VERSION_V1 = "SYNTHESIS_CHECKPOINT_V1" as const;

export const SYNTHESIS_CHECKPOINT_LIMITS_V1 = Object.freeze({
  maxSourceRefs: 256,
  maxFindingRefs: 128,
  maxConflictRefs: 128,
  maxIdentifierLength: 256
});

export type SynthesisCheckpointStateV1 =
  | "IN_PROGRESS"
  | "READY_TO_RESUME"
  | "READY_FOR_REVIEW"
  | "COMPLETE"
  | "BLOCKED";

export type SynthesisCheckpointUsageV1 = Readonly<{
  context_tokens: number;
  output_tokens: number;
  cost_usd: number;
  elapsed_ms: number;
}>;

export type SynthesisCheckpointV1 = Readonly<{
  contract_version: typeof SYNTHESIS_CHECKPOINT_CONTRACT_VERSION_V1;
  checkpoint_id: string;
  checkpoint_fingerprint: string;
  graph_id: string;
  run_id: string;
  synthesis_node_id: string;
  sequence: number;
  state: SynthesisCheckpointStateV1;
  source_snapshot_fingerprint: string;
  processed_source_refs: readonly string[];
  pending_source_refs: readonly string[];
  candidate_finding_refs: readonly string[];
  unresolved_conflict_refs: readonly string[];
  resolved_conflict_refs: readonly string[];
  usage: SynthesisCheckpointUsageV1;
  updated_at: string;
  previous_checkpoint_fingerprint: string | null;
  resumable: boolean;
}>;

export type BuildSynthesisCheckpointInputV1 = Readonly<{
  graph: WorkflowGraphV1;
  run_id: string;
  synthesis_node_id: string;
  sequence: number;
  state: SynthesisCheckpointStateV1;
  source_snapshot_fingerprint: string;
  processed_source_refs: readonly string[];
  pending_source_refs: readonly string[];
  candidate_finding_refs: readonly string[];
  unresolved_conflict_refs: readonly string[];
  resolved_conflict_refs: readonly string[];
  usage: SynthesisCheckpointUsageV1;
  updated_at: string;
  previous_checkpoint?: SynthesisCheckpointV1 | null;
}>;

export type SystemRunCheckpointWriteV1 = Readonly<{
  agentKey: "knowledge-synthesis";
  checkpointKey: string;
  status: "started" | "completed" | "failed";
  detailMd: string;
  metadata: Readonly<{ synthesis_checkpoint: SynthesisCheckpointV1 }>;
}>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const states = new Set<SynthesisCheckpointStateV1>([
  "IN_PROGRESS",
  "READY_TO_RESUME",
  "READY_FOR_REVIEW",
  "COMPLETE",
  "BLOCKED"
]);

function fail(code: string): never {
  throw new Error(`SYNTHESIS_CHECKPOINT_${code}`);
}

function identifier(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > SYNTHESIS_CHECKPOINT_LIMITS_V1.maxIdentifierLength || !identifierPattern.test(value)) {
    fail(`${name.toUpperCase()}_INVALID`);
  }
  return value;
}

function refs(value: unknown, name: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${name.toUpperCase()}_INVALID`);
  const accepted = value.map((entry) => identifier(entry, name));
  if (new Set(accepted).size !== accepted.length) fail(`${name.toUpperCase()}_DUPLICATE`);
  return [...accepted].sort();
}

function metric(value: unknown, name: string, integer: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) fail(`${name.toUpperCase()}_INVALID`);
  return value;
}

function subset(subsetValues: readonly string[], supersetValues: readonly string[]): boolean {
  const superset = new Set(supersetValues);
  return subsetValues.every((value) => superset.has(value));
}

function disjoint(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.every((value) => !rightSet.has(value));
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function fingerprintFor(value: {
  graphId: string;
  runId: string;
  nodeId: string;
  sequence: number;
  state: SynthesisCheckpointStateV1;
  snapshot: string;
  processed: readonly string[];
  pending: readonly string[];
  findings: readonly string[];
  unresolved: readonly string[];
  resolved: readonly string[];
  usage: SynthesisCheckpointUsageV1;
  previous: string | null;
}): string {
  return `fnv1a:${fnv1a(JSON.stringify(value))}`;
}

function assertStoredCheckpoint(previous: SynthesisCheckpointV1): void {
  if (!previous || previous.contract_version !== SYNTHESIS_CHECKPOINT_CONTRACT_VERSION_V1) fail("PREVIOUS_CONTRACT_INVALID");
  const graphId = identifier(previous.graph_id, "previous_graph_id");
  const runId = identifier(previous.run_id, "previous_run_id");
  const nodeId = identifier(previous.synthesis_node_id, "previous_synthesis_node_id");
  if (!Number.isInteger(previous.sequence) || previous.sequence < 1) fail("PREVIOUS_SEQUENCE_INVALID");
  if (!states.has(previous.state)) fail("PREVIOUS_STATE_INVALID");
  const snapshot = identifier(previous.source_snapshot_fingerprint, "previous_source_snapshot_fingerprint");
  const processed = refs(previous.processed_source_refs, "previous_processed_source_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxSourceRefs);
  const pending = refs(previous.pending_source_refs, "previous_pending_source_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxSourceRefs);
  const findings = refs(previous.candidate_finding_refs, "previous_candidate_finding_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxFindingRefs);
  const unresolved = refs(previous.unresolved_conflict_refs, "previous_unresolved_conflict_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxConflictRefs);
  const resolved = refs(previous.resolved_conflict_refs, "previous_resolved_conflict_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxConflictRefs);
  if (!disjoint(processed, pending)) fail("PREVIOUS_SOURCE_REF_OVERLAP");
  if (!disjoint(unresolved, resolved)) fail("PREVIOUS_CONFLICT_REF_OVERLAP");
  if (previous.state === "READY_TO_RESUME" && pending.length === 0) fail("PREVIOUS_RESUME_WITHOUT_PENDING_WORK");
  if (previous.state === "READY_FOR_REVIEW" && pending.length > 0) fail("PREVIOUS_REVIEW_WITH_PENDING_WORK");
  if (previous.state === "COMPLETE" && (pending.length > 0 || unresolved.length > 0)) fail("PREVIOUS_COMPLETE_WITH_UNRESOLVED_WORK");
  const usage = Object.freeze({
    context_tokens: metric(previous.usage?.context_tokens, "previous_usage_context_tokens", true),
    output_tokens: metric(previous.usage?.output_tokens, "previous_usage_output_tokens", true),
    cost_usd: metric(previous.usage?.cost_usd, "previous_usage_cost_usd", false),
    elapsed_ms: metric(previous.usage?.elapsed_ms, "previous_usage_elapsed_ms", true)
  });
  if (typeof previous.updated_at !== "string" || !Number.isFinite(Date.parse(previous.updated_at))) fail("PREVIOUS_UPDATED_AT_INVALID");
  const previousFingerprint = previous.previous_checkpoint_fingerprint == null
    ? null
    : identifier(previous.previous_checkpoint_fingerprint, "previous_checkpoint_fingerprint");
  const expectedFingerprint = fingerprintFor({
    graphId,
    runId,
    nodeId,
    sequence: previous.sequence,
    state: previous.state,
    snapshot,
    processed,
    pending,
    findings,
    unresolved,
    resolved,
    usage,
    previous: previousFingerprint
  });
  if (previous.checkpoint_fingerprint !== expectedFingerprint) fail("PREVIOUS_FINGERPRINT_INVALID");
  if (previous.checkpoint_id !== `checkpoint:${runId}:${previous.sequence}:${expectedFingerprint.slice(-8)}`) fail("PREVIOUS_ID_INVALID");
  const shouldBeResumable = previous.state === "IN_PROGRESS" || previous.state === "READY_TO_RESUME";
  if (previous.resumable !== shouldBeResumable) fail("PREVIOUS_RESUMABLE_INVALID");
}

function assertMonotonic(previous: SynthesisCheckpointV1, next: {
  graphId: string;
  runId: string;
  nodeId: string;
  sequence: number;
  snapshot: string;
  processed: readonly string[];
  pending: readonly string[];
  findings: readonly string[];
  unresolved: readonly string[];
  resolved: readonly string[];
  usage: SynthesisCheckpointUsageV1;
}): void {
  if (previous.graph_id !== next.graphId || previous.run_id !== next.runId || previous.synthesis_node_id !== next.nodeId) fail("SCOPE_CHANGED");
  if (previous.source_snapshot_fingerprint !== next.snapshot) fail("SOURCE_SNAPSHOT_CHANGED");
  if (next.sequence !== previous.sequence + 1) fail("SEQUENCE_NOT_MONOTONIC");
  if (!subset(previous.processed_source_refs, next.processed)) fail("PROCESSED_SOURCE_REGRESSION");
  if (!subset(next.pending, previous.pending_source_refs)) fail("PENDING_SOURCE_EXPANSION");
  if (!subset(previous.candidate_finding_refs, next.findings)) fail("FINDING_REGRESSION");
  if (!subset(previous.resolved_conflict_refs, next.resolved)) fail("RESOLVED_CONFLICT_REGRESSION");
  const newlyRemovedConflicts = previous.unresolved_conflict_refs.filter((ref) => !next.unresolved.includes(ref));
  if (!subset(newlyRemovedConflicts, next.resolved)) fail("CONFLICT_SILENTLY_REMOVED");
  if (
    next.usage.context_tokens < previous.usage.context_tokens ||
    next.usage.output_tokens < previous.usage.output_tokens ||
    next.usage.cost_usd < previous.usage.cost_usd ||
    next.usage.elapsed_ms < previous.usage.elapsed_ms
  ) fail("USAGE_REGRESSION");
}

export function buildSynthesisCheckpointV1(input: BuildSynthesisCheckpointInputV1): SynthesisCheckpointV1 {
  const graphValidation = validateWorkflowGraphV1(input?.graph);
  if (!graphValidation.valid) fail("GRAPH_INVALID");
  const graphId = identifier(input.graph.id, "graph_id");
  const runId = identifier(input.run_id, "run_id");
  const nodeId = identifier(input.synthesis_node_id, "synthesis_node_id");
  const node = input.graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.kind !== "SYNTHESIZE") fail("SYNTHESIS_NODE_INVALID");
  if (!Number.isInteger(input.sequence) || input.sequence < 1) fail("SEQUENCE_INVALID");
  if (!states.has(input.state)) fail("STATE_INVALID");
  const snapshot = identifier(input.source_snapshot_fingerprint, "source_snapshot_fingerprint");
  if (typeof input.updated_at !== "string" || !Number.isFinite(Date.parse(input.updated_at))) fail("UPDATED_AT_INVALID");

  const processed = refs(input.processed_source_refs, "processed_source_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxSourceRefs);
  const pending = refs(input.pending_source_refs, "pending_source_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxSourceRefs);
  const findings = refs(input.candidate_finding_refs, "candidate_finding_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxFindingRefs);
  const unresolved = refs(input.unresolved_conflict_refs, "unresolved_conflict_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxConflictRefs);
  const resolved = refs(input.resolved_conflict_refs, "resolved_conflict_refs", SYNTHESIS_CHECKPOINT_LIMITS_V1.maxConflictRefs);
  if (!disjoint(processed, pending)) fail("SOURCE_REF_OVERLAP");
  if (!disjoint(unresolved, resolved)) fail("CONFLICT_REF_OVERLAP");
  if (input.state === "READY_TO_RESUME" && pending.length === 0) fail("RESUME_WITHOUT_PENDING_WORK");
  if (input.state === "READY_FOR_REVIEW" && pending.length > 0) fail("REVIEW_WITH_PENDING_WORK");
  if (input.state === "COMPLETE" && (pending.length > 0 || unresolved.length > 0)) fail("COMPLETE_WITH_UNRESOLVED_WORK");

  const usage = Object.freeze({
    context_tokens: metric(input.usage?.context_tokens, "usage_context_tokens", true),
    output_tokens: metric(input.usage?.output_tokens, "usage_output_tokens", true),
    cost_usd: metric(input.usage?.cost_usd, "usage_cost_usd", false),
    elapsed_ms: metric(input.usage?.elapsed_ms, "usage_elapsed_ms", true)
  });
  if (
    usage.context_tokens > Math.min(input.graph.budget.maxContextTokens, node.budget.maxContextTokens) ||
    usage.output_tokens > Math.min(input.graph.budget.maxOutputTokens, node.budget.maxOutputTokens) ||
    usage.cost_usd > Math.min(input.graph.budget.maxCostUsd, node.budget.maxCostUsd) ||
    usage.elapsed_ms > Math.min(input.graph.budget.maxRuntimeMs, node.budget.maxRuntimeMs)
  ) fail("BUDGET_EXCEEDED");

  const previous = input.previous_checkpoint ?? null;
  if (previous) {
    assertStoredCheckpoint(previous);
    assertMonotonic(previous, {
      graphId,
      runId,
      nodeId,
      sequence: input.sequence,
      snapshot,
      processed,
      pending,
      findings,
      unresolved,
      resolved,
      usage
    });
  } else if (input.sequence !== 1) {
    fail("INITIAL_SEQUENCE_INVALID");
  }

  const checkpointFingerprint = fingerprintFor({
    graphId,
    runId,
    nodeId,
    sequence: input.sequence,
    state: input.state,
    snapshot,
    processed,
    pending,
    findings,
    unresolved,
    resolved,
    usage,
    previous: previous?.checkpoint_fingerprint ?? null
  });
  return Object.freeze({
    contract_version: SYNTHESIS_CHECKPOINT_CONTRACT_VERSION_V1,
    checkpoint_id: `checkpoint:${runId}:${input.sequence}:${checkpointFingerprint.slice(-8)}`,
    checkpoint_fingerprint: checkpointFingerprint,
    graph_id: graphId,
    run_id: runId,
    synthesis_node_id: nodeId,
    sequence: input.sequence,
    state: input.state,
    source_snapshot_fingerprint: snapshot,
    processed_source_refs: Object.freeze(processed),
    pending_source_refs: Object.freeze(pending),
    candidate_finding_refs: Object.freeze(findings),
    unresolved_conflict_refs: Object.freeze(unresolved),
    resolved_conflict_refs: Object.freeze(resolved),
    usage,
    updated_at: input.updated_at,
    previous_checkpoint_fingerprint: previous?.checkpoint_fingerprint ?? null,
    resumable: input.state === "IN_PROGRESS" || input.state === "READY_TO_RESUME"
  });
}

export function toSystemRunCheckpointWriteV1(checkpoint: SynthesisCheckpointV1): SystemRunCheckpointWriteV1 {
  const status = checkpoint.state === "COMPLETE"
    ? "completed"
    : checkpoint.state === "BLOCKED"
      ? "failed"
      : "started";
  return Object.freeze({
    agentKey: "knowledge-synthesis",
    checkpointKey: `synthesis:${checkpoint.synthesis_node_id}`,
    status,
    detailMd: `Synthesis ${checkpoint.state.toLowerCase().replaceAll("_", " ")} at checkpoint ${checkpoint.sequence}.`,
    metadata: Object.freeze({ synthesis_checkpoint: checkpoint })
  });
}
