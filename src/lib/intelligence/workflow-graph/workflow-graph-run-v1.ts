import {
  WORKFLOW_ANCHOR_CLASSES_V1,
  WORKFLOW_GRAPH_V1_LIMITS,
  WORKFLOW_VERIFIER_LENSES_V1,
  validateWorkflowGraphV1,
  type WorkflowAnchorClassV1,
  type WorkflowGraphV1,
  type WorkflowGraphValidationErrorV1,
  type WorkflowResultStateV1,
  type WorkflowTruthStateV1,
  type WorkflowVerifierLensV1
} from "./workflow-graph-v1";

export const WORKFLOW_GRAPH_RUN_V1_LIMITS = {
  maxResults: WORKFLOW_GRAPH_V1_LIMITS.maxNodes * 2,
  maxEvidenceRefsPerResult: 64,
  maxAnchorChecksPerResult: WORKFLOW_GRAPH_V1_LIMITS.maxAnchorsPerNode,
  maxInputResultIdsPerResult: WORKFLOW_GRAPH_V1_LIMITS.maxEdges,
  maxChunkSize: 16,
  maxFailureReasonLength: 256
} as const;

export type WorkflowEvidenceSemanticKindV1 = "OBSERVED" | "DERIVED" | "INFERRED" | "HYPOTHESIS";
export type WorkflowAnchorOutcomeV1 = "PASS" | "FAIL" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type WorkflowVerifierVerdictV1 = "PASS" | "FAIL" | "UNKNOWN";
export type WorkflowAnchorSourceKindV1 =
  | "DETERMINISTIC_TEST"
  | "CANONICAL_CONNECTOR"
  | "TRANSACTION"
  | "ANALYTICS"
  | "GOVERNED_POLICY"
  | "MODEL_NARRATIVE";

export type WorkflowEvidenceReferenceV1 = {
  evidenceId: string;
  semanticKind: WorkflowEvidenceSemanticKindV1;
  sourceIdentity: string;
};

export type WorkflowAnchorCheckV1 = {
  anchorClass: WorkflowAnchorClassV1;
  canonicalRef: string;
  evidenceRef: string;
  sourceKind: WorkflowAnchorSourceKindV1;
  outcome: WorkflowAnchorOutcomeV1;
};

export type WorkflowVerifierLensResultV1 = {
  lens: WorkflowVerifierLensV1;
  verdict: WorkflowVerifierVerdictV1;
  reasonCode: string;
  evidenceRefs: string[];
};

export type WorkflowVerifierResultV1 = {
  verifierContextId: string;
  lenses: WorkflowVerifierLensResultV1[];
};

export type WorkflowFailureClassificationV1 = {
  class: "TRANSIENT" | "PERMANENT" | "POLICY" | "DATA" | "UNKNOWN";
  code: string;
  reason: string;
};

export type WorkflowNodeResultEnvelopeV1 = {
  graphId: string;
  nodeId: string;
  runId: string;
  resultId: string;
  attemptId: number;
  producerContextId: string;
  resultState: WorkflowResultStateV1;
  truthState: WorkflowTruthStateV1;
  generatedAt: string;
  observedAt: string;
  outputSchemaId: string;
  outputItemCount: number;
  inputResultIds: string[];
  evidenceRefs: WorkflowEvidenceReferenceV1[];
  anchorChecks: WorkflowAnchorCheckV1[];
  verification?: WorkflowVerifierResultV1;
  elapsedMs?: number;
  provider?: string;
  modelTier?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  failure?: WorkflowFailureClassificationV1;
};

export type WorkflowGraphRunIntegrityInputV1 = {
  graph: WorkflowGraphV1;
  runId: string;
  evaluatedAt: string;
  maxResultAgeMs: number;
  chunkSize: number;
  results: WorkflowNodeResultEnvelopeV1[];
};

export type WorkflowRunRejectionCodeV1 =
  | "INVALID_ENVELOPE"
  | "IDENTITY_MISMATCH"
  | "DUPLICATE_RESULT"
  | "UNKNOWN_NODE"
  | "RESULT_NOT_COMPLETE"
  | "UNRESOLVED_TRUTH"
  | "STALE_RESULT"
  | "OUTPUT_SCHEMA_MISMATCH"
  | "OUTPUT_CARDINALITY_MISMATCH"
  | "FAN_IN_MISMATCH"
  | "SYNTHESIS_PREREQUISITE_REJECTED"
  | "MISSING_MANDATORY_ANCHOR"
  | "MANDATORY_ANCHOR_REJECTED"
  | "MODEL_NARRATIVE_IS_NOT_ANCHOR"
  | "INVALID_VERIFIER"
  | "VERIFIER_CONTEXT_REUSED"
  | "MISSING_VERIFIER_LENS"
  | "VERIFIER_LENS_REJECTED"
  | "INVALID_METRIC"
  | "MISSING_FAILURE_CLASSIFICATION";

export type WorkflowRejectedResultV1 = {
  resultId: string;
  nodeId: string;
  reasons: WorkflowRunRejectionCodeV1[];
};

export type WorkflowMetricAggregateV1 = {
  state: "KNOWN" | "UNKNOWN";
  value: number | null;
  knownSubtotal: number;
  reportedNodeCount: number;
  expectedNodeCount: number;
};

export type WorkflowRunBudgetProjectionV1 = {
  state: "WITHIN_BUDGET" | "UNKNOWN" | "EXCEEDED";
  elapsedMs: WorkflowMetricAggregateV1;
  tokens: WorkflowMetricAggregateV1;
  costUsd: WorkflowMetricAggregateV1;
  exceededGraphFields: Array<"maxRuntimeMs" | "maxContextTokens" | "maxOutputTokens" | "maxCostUsd">;
  exceededNodeIds: string[];
};

export type WorkflowFanInLayerV1 = {
  nodeId: string;
  layerIndex: number;
  inputNodeCount: number;
  chunks: Array<{ index: number; inputNodeIds: string[] }>;
};

export type WorkflowAnchorProjectionV1 = {
  requiredCount: number;
  passedCount: number;
  rejectedCanonicalRefs: string[];
  uniqueEvidenceIdentityCount: number;
};

export type WorkflowGraphRunIntegrityProjectionV1 = {
  version: "WORKFLOW_GRAPH_RUN_INTEGRITY_V1";
  graphId: string;
  runId: string;
  state: "COMPLETE" | "PARTIAL" | "DEGRADED" | "BLOCKED" | "FAILED";
  acceptedResultIds: string[];
  missingNodeIds: string[];
  failedNodeIds: string[];
  duplicateNodeIds: string[];
  rejectedResults: WorkflowRejectedResultV1[];
  anchors: WorkflowAnchorProjectionV1;
  budget: WorkflowRunBudgetProjectionV1;
  fanInLayers: WorkflowFanInLayerV1[];
};

export type WorkflowGraphRunIntegrityResultV1 =
  | { status: "PROJECTED"; projection: WorkflowGraphRunIntegrityProjectionV1; graphValidationErrors: [] }
  | { status: "INVALID_GRAPH"; projection: null; graphValidationErrors: WorkflowGraphValidationErrorV1[] }
  | { status: "INVALID_INPUT"; projection: null; graphValidationErrors: [] };

type UnknownRecord = Record<string, unknown>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const semanticKinds = new Set<WorkflowEvidenceSemanticKindV1>(["OBSERVED", "DERIVED", "INFERRED", "HYPOTHESIS"]);
const anchorOutcomes = new Set<WorkflowAnchorOutcomeV1>(["PASS", "FAIL", "UNKNOWN", "STALE", "CONFLICTED"]);
const anchorSources = new Set<WorkflowAnchorSourceKindV1>([
  "DETERMINISTIC_TEST",
  "CANONICAL_CONNECTOR",
  "TRANSACTION",
  "ANALYTICS",
  "GOVERNED_POLICY",
  "MODEL_NARRATIVE"
]);
const anchorClasses = new Set<WorkflowAnchorClassV1>(WORKFLOW_ANCHOR_CLASSES_V1);
const verifierLenses = new Set<WorkflowVerifierLensV1>(WORKFLOW_VERIFIER_LENSES_V1);
const verifierVerdicts = new Set<WorkflowVerifierVerdictV1>(["PASS", "FAIL", "UNKNOWN"]);
const blockerReasons = new Set<WorkflowRunRejectionCodeV1>([
  "SYNTHESIS_PREREQUISITE_REJECTED",
  "MISSING_MANDATORY_ANCHOR",
  "MANDATORY_ANCHOR_REJECTED",
  "MODEL_NARRATIVE_IS_NOT_ANCHOR",
  "INVALID_VERIFIER",
  "VERIFIER_CONTEXT_REUSED",
  "MISSING_VERIFIER_LENS",
  "VERIFIER_LENS_REJECTED"
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= WORKFLOW_GRAPH_V1_LIMITS.maxIdentifierLength && identifierPattern.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function validateIdentifierArray(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum && value.every(isIdentifier) && new Set(value).size === value.length;
}

function expectedAnchorSource(anchorClass: WorkflowAnchorClassV1): WorkflowAnchorSourceKindV1 {
  const map: Record<WorkflowAnchorClassV1, WorkflowAnchorSourceKindV1> = {
    DETERMINISTIC_TEST: "DETERMINISTIC_TEST",
    CANONICAL_CONNECTOR_OBSERVATION: "CANONICAL_CONNECTOR",
    TRANSACTION_MEASUREMENT: "TRANSACTION",
    ANALYTICS_MEASUREMENT: "ANALYTICS",
    GOVERNED_POLICY_OR_APPROVAL: "GOVERNED_POLICY"
  };
  return map[anchorClass];
}

function validMetric(value: unknown, integer: boolean): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && (!integer || Number.isInteger(value));
}

function envelopeReasons(
  raw: unknown,
  graph: WorkflowGraphV1,
  runId: string,
  evaluatedAtMs: number,
  maxResultAgeMs: number
): { envelope: WorkflowNodeResultEnvelopeV1 | null; reasons: WorkflowRunRejectionCodeV1[] } {
  if (!isRecord(raw)) return { envelope: null, reasons: ["INVALID_ENVELOPE"] };
  const node = graph.nodes.find((candidate) => candidate.id === raw.nodeId);
  const resultId = isIdentifier(raw.resultId) ? raw.resultId : "invalid-result";
  const nodeId = isIdentifier(raw.nodeId) ? raw.nodeId : "invalid-node";
  const reasons: WorkflowRunRejectionCodeV1[] = [];

  if (!node) reasons.push("UNKNOWN_NODE");
  if (
    raw.graphId !== graph.id ||
    raw.runId !== runId ||
    !isIdentifier(raw.resultId) ||
    !Number.isInteger(raw.attemptId) ||
    (raw.attemptId as number) < 1 ||
    !isIdentifier(raw.producerContextId)
  ) reasons.push("IDENTITY_MISMATCH");
  if (raw.resultState !== "COMPLETE") reasons.push("RESULT_NOT_COMPLETE");
  if (raw.truthState !== "CURRENT") reasons.push("UNRESOLVED_TRUTH");
  if (!validTimestamp(raw.generatedAt) || !validTimestamp(raw.observedAt)) {
    reasons.push("INVALID_ENVELOPE");
  } else if (evaluatedAtMs - Date.parse(raw.observedAt) > maxResultAgeMs || Date.parse(raw.observedAt) > evaluatedAtMs) {
    reasons.push("STALE_RESULT");
  }
  if (!node || !isIdentifier(raw.outputSchemaId) || !node.outputSchemaIds.includes(raw.outputSchemaId)) {
    reasons.push("OUTPUT_SCHEMA_MISMATCH");
  }
  if (!Number.isInteger(raw.outputItemCount) || (raw.outputItemCount as number) < 0 || (node?.expectedOutputCardinality !== undefined && raw.outputItemCount !== node.expectedOutputCardinality)) {
    reasons.push("OUTPUT_CARDINALITY_MISMATCH");
  }
  if (!validateIdentifierArray(raw.inputResultIds, WORKFLOW_GRAPH_RUN_V1_LIMITS.maxInputResultIdsPerResult)) reasons.push("INVALID_ENVELOPE");

  if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length > WORKFLOW_GRAPH_RUN_V1_LIMITS.maxEvidenceRefsPerResult || raw.evidenceRefs.some((reference) => !isRecord(reference) || !isIdentifier(reference.evidenceId) || !isIdentifier(reference.sourceIdentity) || !semanticKinds.has(reference.semanticKind as WorkflowEvidenceSemanticKindV1))) {
    reasons.push("INVALID_ENVELOPE");
  }
  if (!Array.isArray(raw.anchorChecks) || raw.anchorChecks.length > WORKFLOW_GRAPH_RUN_V1_LIMITS.maxAnchorChecksPerResult || raw.anchorChecks.some((check) => !isRecord(check) || !anchorClasses.has(check.anchorClass as WorkflowAnchorClassV1) || !isIdentifier(check.canonicalRef) || !isIdentifier(check.evidenceRef) || !anchorOutcomes.has(check.outcome as WorkflowAnchorOutcomeV1) || !anchorSources.has(check.sourceKind as WorkflowAnchorSourceKindV1))) {
    reasons.push("INVALID_ENVELOPE");
  }

  for (const [key, integer] of [["elapsedMs", true], ["inputTokens", true], ["outputTokens", true], ["costUsd", false]] as const) {
    if (raw[key] !== undefined && !validMetric(raw[key], integer)) reasons.push("INVALID_METRIC");
  }
  if (raw.provider !== undefined && !isIdentifier(raw.provider)) reasons.push("INVALID_ENVELOPE");
  if (raw.modelTier !== undefined && !isIdentifier(raw.modelTier)) reasons.push("INVALID_ENVELOPE");
  if (raw.resultState === "FAILED" && !isRecord(raw.failure)) reasons.push("MISSING_FAILURE_CLASSIFICATION");
  if (raw.failure !== undefined && (!isRecord(raw.failure) || !isIdentifier(raw.failure.code) || typeof raw.failure.reason !== "string" || raw.failure.reason.length === 0 || raw.failure.reason.length > WORKFLOW_GRAPH_RUN_V1_LIMITS.maxFailureReasonLength || !["TRANSIENT", "PERMANENT", "POLICY", "DATA", "UNKNOWN"].includes(String(raw.failure.class)))) reasons.push("INVALID_ENVELOPE");

  return {
    envelope: {
      graphId: String(raw.graphId), nodeId, runId: String(raw.runId), resultId,
      attemptId: Number(raw.attemptId), producerContextId: String(raw.producerContextId),
      resultState: raw.resultState as WorkflowResultStateV1, truthState: raw.truthState as WorkflowTruthStateV1,
      generatedAt: String(raw.generatedAt), observedAt: String(raw.observedAt), outputSchemaId: String(raw.outputSchemaId),
      outputItemCount: Number(raw.outputItemCount), inputResultIds: Array.isArray(raw.inputResultIds) ? raw.inputResultIds.filter(isIdentifier) : [],
      evidenceRefs: Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs as WorkflowEvidenceReferenceV1[] : [],
      anchorChecks: Array.isArray(raw.anchorChecks) ? raw.anchorChecks as WorkflowAnchorCheckV1[] : [],
      verification: raw.verification as WorkflowVerifierResultV1 | undefined,
      elapsedMs: raw.elapsedMs as number | undefined, provider: raw.provider as string | undefined,
      modelTier: raw.modelTier as string | undefined, inputTokens: raw.inputTokens as number | undefined,
      outputTokens: raw.outputTokens as number | undefined, costUsd: raw.costUsd as number | undefined,
      failure: raw.failure as WorkflowFailureClassificationV1 | undefined
    },
    reasons: uniqueSorted(reasons)
  };
}

function anchorReasons(nodeId: string, graph: WorkflowGraphV1, envelope: WorkflowNodeResultEnvelopeV1): WorkflowRunRejectionCodeV1[] {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)!;
  const reasons: WorkflowRunRejectionCodeV1[] = [];
  for (const anchor of node.evidenceAnchors.filter((candidate) => candidate.mandatory)) {
    const checks = envelope.anchorChecks.filter((check) => check.canonicalRef === anchor.canonicalRef && check.anchorClass === anchor.anchorClass);
    if (checks.length === 0) {
      reasons.push("MISSING_MANDATORY_ANCHOR");
      continue;
    }
    if (checks.some((check) => check.sourceKind === "MODEL_NARRATIVE" || check.sourceKind !== expectedAnchorSource(anchor.anchorClass))) {
      reasons.push("MODEL_NARRATIVE_IS_NOT_ANCHOR");
    }
    if (!checks.some((check) => check.outcome === "PASS" && check.sourceKind === expectedAnchorSource(anchor.anchorClass))) {
      reasons.push("MANDATORY_ANCHOR_REJECTED");
    }
  }
  return uniqueSorted(reasons);
}

function verifierReasons(nodeId: string, graph: WorkflowGraphV1, envelope: WorkflowNodeResultEnvelopeV1): WorkflowRunRejectionCodeV1[] {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId)!;
  if (node.kind !== "VERIFY") return envelope.verification === undefined ? [] : ["INVALID_VERIFIER"];
  if (!node.verifier || !envelope.verification) return ["INVALID_VERIFIER"];
  const producer = graph.nodes.find((candidate) => candidate.id === node.verifier!.producerNodeId)!;
  const reasons: WorkflowRunRejectionCodeV1[] = [];
  if (envelope.producerContextId !== node.contextId || envelope.verification.verifierContextId !== node.verifier.verifierContextId) reasons.push("INVALID_VERIFIER");
  if (envelope.verification.verifierContextId === producer.contextId || envelope.producerContextId === producer.contextId) reasons.push("VERIFIER_CONTEXT_REUSED");
  if (!Array.isArray(envelope.verification.lenses) || envelope.verification.lenses.length > WORKFLOW_GRAPH_V1_LIMITS.maxVerifierLenses) return uniqueSorted([...reasons, "MISSING_VERIFIER_LENS"]);
  for (const requiredLens of node.verifier.lenses) {
    const matches = envelope.verification.lenses.filter((result) => result.lens === requiredLens);
    if (matches.length !== 1) reasons.push("MISSING_VERIFIER_LENS");
    else if (matches[0].verdict !== "PASS") reasons.push("VERIFIER_LENS_REJECTED");
  }
  if (envelope.verification.lenses.some((result) => !verifierLenses.has(result.lens) || !isIdentifier(result.reasonCode) || !validateIdentifierArray(result.evidenceRefs, WORKFLOW_GRAPH_RUN_V1_LIMITS.maxEvidenceRefsPerResult) || !verifierVerdicts.has(result.verdict))) reasons.push("INVALID_VERIFIER");
  return uniqueSorted(reasons);
}

function aggregateMetric(
  envelopes: WorkflowNodeResultEnvelopeV1[],
  expectedNodeCount: number,
  selector: (envelope: WorkflowNodeResultEnvelopeV1) => number | undefined
): WorkflowMetricAggregateV1 {
  const supplied = envelopes.map(selector).filter((value): value is number => value !== undefined && validMetric(value, false));
  const knownSubtotal = supplied.reduce((sum, value) => sum + value, 0);
  const known = supplied.length === expectedNodeCount;
  return { state: known ? "KNOWN" : "UNKNOWN", value: known ? knownSubtotal : null, knownSubtotal, reportedNodeCount: supplied.length, expectedNodeCount };
}

function budgetProjection(graph: WorkflowGraphV1, singletonEnvelopes: WorkflowNodeResultEnvelopeV1[]): WorkflowRunBudgetProjectionV1 {
  const elapsedMs = aggregateMetric(singletonEnvelopes, graph.nodes.length, (result) => result.elapsedMs);
  const tokens = aggregateMetric(singletonEnvelopes, graph.nodes.length, (result) => result.inputTokens === undefined || result.outputTokens === undefined ? undefined : result.inputTokens + result.outputTokens);
  const costUsd = aggregateMetric(singletonEnvelopes, graph.nodes.length, (result) => result.costUsd);
  const exceededGraphFields: WorkflowRunBudgetProjectionV1["exceededGraphFields"] = [];
  if (elapsedMs.knownSubtotal > graph.budget.maxRuntimeMs) exceededGraphFields.push("maxRuntimeMs");
  const inputTokenSubtotal = singletonEnvelopes.reduce((sum, result) => sum + (result.inputTokens ?? 0), 0);
  const outputTokenSubtotal = singletonEnvelopes.reduce((sum, result) => sum + (result.outputTokens ?? 0), 0);
  if (inputTokenSubtotal > graph.budget.maxContextTokens) exceededGraphFields.push("maxContextTokens");
  if (outputTokenSubtotal > graph.budget.maxOutputTokens) exceededGraphFields.push("maxOutputTokens");
  if (costUsd.knownSubtotal > graph.budget.maxCostUsd) exceededGraphFields.push("maxCostUsd");

  const exceededNodeIds = singletonEnvelopes.filter((result) => {
    const budget = graph.nodes.find((node) => node.id === result.nodeId)?.budget;
    if (!budget) return false;
    return (result.elapsedMs !== undefined && result.elapsedMs > budget.maxRuntimeMs) ||
      (result.inputTokens !== undefined && result.inputTokens > budget.maxContextTokens) ||
      (result.outputTokens !== undefined && result.outputTokens > budget.maxOutputTokens) ||
      (result.costUsd !== undefined && result.costUsd > budget.maxCostUsd);
  }).map((result) => result.nodeId).sort();

  const exceeded = exceededGraphFields.length > 0 || exceededNodeIds.length > 0;
  const unknown = elapsedMs.state === "UNKNOWN" || tokens.state === "UNKNOWN" || costUsd.state === "UNKNOWN";
  return {
    state: exceeded ? "EXCEEDED" : unknown ? "UNKNOWN" : "WITHIN_BUDGET",
    elapsedMs, tokens, costUsd,
    exceededGraphFields: uniqueSorted(exceededGraphFields),
    exceededNodeIds: uniqueSorted(exceededNodeIds)
  };
}

function fanInLayers(graph: WorkflowGraphV1, chunkSize: number): WorkflowFanInLayerV1[] {
  const predecessors = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  const successors = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    predecessors.get(edge.toNodeId)!.add(edge.fromNodeId);
    successors.get(edge.fromNodeId)!.add(edge.toNodeId);
  }
  const indegrees = new Map(graph.nodes.map((node) => [node.id, predecessors.get(node.id)!.size]));
  const depth = new Map(graph.nodes.map((node) => [node.id, 0]));
  const available = graph.nodes.map((node) => node.id).filter((id) => indegrees.get(id) === 0).sort();
  while (available.length > 0) {
    const nodeId = available.shift()!;
    for (const successor of [...successors.get(nodeId)!].sort()) {
      depth.set(successor, Math.max(depth.get(successor)!, depth.get(nodeId)! + 1));
      indegrees.set(successor, indegrees.get(successor)! - 1);
      if (indegrees.get(successor) === 0) { available.push(successor); available.sort(); }
    }
  }
  return graph.nodes.map((node) => node.id).sort().filter((nodeId) => predecessors.get(nodeId)!.size > 0).map((nodeId) => {
    const inputNodeIds = [...predecessors.get(nodeId)!].sort();
    const chunks: Array<{ index: number; inputNodeIds: string[] }> = [];
    for (let index = 0; index < inputNodeIds.length; index += chunkSize) chunks.push({ index: chunks.length, inputNodeIds: inputNodeIds.slice(index, index + chunkSize) });
    return { nodeId, layerIndex: depth.get(nodeId)!, inputNodeCount: inputNodeIds.length, chunks };
  });
}

export function projectWorkflowGraphRunIntegrityV1(input: unknown): WorkflowGraphRunIntegrityResultV1 {
  if (!isRecord(input) || !("graph" in input)) return { status: "INVALID_INPUT", projection: null, graphValidationErrors: [] };
  const validation = validateWorkflowGraphV1(input.graph);
  if (!validation.valid) return { status: "INVALID_GRAPH", projection: null, graphValidationErrors: validation.errors };
  if (!isIdentifier(input.runId) || !validTimestamp(input.evaluatedAt) || !Number.isInteger(input.maxResultAgeMs) || (input.maxResultAgeMs as number) < 1 || !Number.isInteger(input.chunkSize) || (input.chunkSize as number) < 1 || (input.chunkSize as number) > WORKFLOW_GRAPH_RUN_V1_LIMITS.maxChunkSize || !Array.isArray(input.results) || input.results.length > WORKFLOW_GRAPH_RUN_V1_LIMITS.maxResults) {
    return { status: "INVALID_INPUT", projection: null, graphValidationErrors: [] };
  }

  const graph = input.graph as WorkflowGraphV1;
  const evaluatedAtMs = Date.parse(input.evaluatedAt as string);
  const parsed = input.results.map((raw) => envelopeReasons(raw, graph, input.runId as string, evaluatedAtMs, input.maxResultAgeMs as number));
  const byNode = new Map<string, Array<{ envelope: WorkflowNodeResultEnvelopeV1; reasons: WorkflowRunRejectionCodeV1[] }>>();
  for (const item of parsed) if (item.envelope) byNode.set(item.envelope.nodeId, [...(byNode.get(item.envelope.nodeId) ?? []), item as { envelope: WorkflowNodeResultEnvelopeV1; reasons: WorkflowRunRejectionCodeV1[] }]);
  const duplicateNodeIds = [...byNode].filter(([, items]) => items.length > 1).map(([nodeId]) => nodeId).filter((nodeId) => graph.nodes.some((node) => node.id === nodeId)).sort();
  for (const nodeId of duplicateNodeIds) for (const item of byNode.get(nodeId)!) item.reasons.push("DUPLICATE_RESULT");

  const rejectionByResult = new Map<string, WorkflowRejectedResultV1>();
  const addRejection = (envelope: WorkflowNodeResultEnvelopeV1, reasons: WorkflowRunRejectionCodeV1[]) => {
    if (reasons.length === 0) return;
    rejectionByResult.set(envelope.resultId, { resultId: envelope.resultId, nodeId: envelope.nodeId, reasons: uniqueSorted([...(rejectionByResult.get(envelope.resultId)?.reasons ?? []), ...reasons]) });
  };
  for (const item of parsed) if (item.envelope) addRejection(item.envelope, item.reasons);

  const singletonEnvelopes = graph.nodes.map((node) => byNode.get(node.id)).filter((items): items is Array<{ envelope: WorkflowNodeResultEnvelopeV1; reasons: WorkflowRunRejectionCodeV1[] }> => items?.length === 1).map((items) => items[0].envelope);
  for (const envelope of singletonEnvelopes) addRejection(envelope, [...anchorReasons(envelope.nodeId, graph, envelope), ...verifierReasons(envelope.nodeId, graph, envelope)]);

  const accepted = new Map<string, WorkflowNodeResultEnvelopeV1>();
  const pending = new Set(graph.nodes.map((node) => node.id));
  while (pending.size > 0) {
    let progressed = false;
    for (const nodeId of [...pending].sort()) {
      const predecessors = uniqueSorted(graph.edges.filter((edge) => edge.toNodeId === nodeId).map((edge) => edge.fromNodeId));
      if (predecessors.some((predecessor) => pending.has(predecessor))) continue;
      const items = byNode.get(nodeId) ?? [];
      if (items.length === 1) {
        const envelope = items[0].envelope;
        const existing = rejectionByResult.get(envelope.resultId)?.reasons ?? [];
        const expectedInputResultIds = predecessors.map((predecessor) => accepted.get(predecessor)?.resultId).filter((value): value is string => Boolean(value)).sort();
        const prerequisitesPass = expectedInputResultIds.length === predecessors.length;
        if (!prerequisitesPass || JSON.stringify([...envelope.inputResultIds].sort()) !== JSON.stringify(expectedInputResultIds)) {
          addRejection(envelope, [graph.nodes.find((node) => node.id === nodeId)!.kind === "SYNTHESIZE" ? "SYNTHESIS_PREREQUISITE_REJECTED" : "FAN_IN_MISMATCH"]);
        }
        if (existing.length === 0 && prerequisitesPass && JSON.stringify([...envelope.inputResultIds].sort()) === JSON.stringify(expectedInputResultIds)) accepted.set(nodeId, envelope);
      }
      pending.delete(nodeId);
      progressed = true;
    }
    if (!progressed) break;
  }

  const missingNodeIds = graph.nodes.map((node) => node.id).filter((nodeId) => !byNode.has(nodeId)).sort();
  const failedNodeIds = graph.nodes.map((node) => node.id).filter((nodeId) => !accepted.has(nodeId) && !missingNodeIds.includes(nodeId)).sort();
  const allEnvelopes = [...byNode.values()].flatMap((items) => items.map((item) => item.envelope));
  const explicitFailure = allEnvelopes.some((envelope) => envelope.resultState === "FAILED");
  const rejectedResults = [...rejectionByResult.values()].sort((left, right) => left.resultId.localeCompare(right.resultId));
  const intrinsicallyBlocked = rejectedResults.some((result) =>
    result.reasons.some((reason) => blockerReasons.has(reason) && reason !== "SYNTHESIS_PREREQUISITE_REJECTED")
  );
  const synthesisBlocked = rejectedResults.some((result) => result.reasons.includes("SYNTHESIS_PREREQUISITE_REJECTED"));
  const partialGap = missingNodeIds.length > 0 || failedNodeIds.length > 0 || duplicateNodeIds.length > 0;
  const budget = budgetProjection(graph, singletonEnvelopes);

  const requiredAnchors = graph.nodes.flatMap((node) => node.evidenceAnchors.filter((anchor) => anchor.mandatory).map((anchor) => ({ nodeId: node.id, ...anchor })));
  const passedAnchors = requiredAnchors.filter((anchor) => accepted.get(anchor.nodeId)?.anchorChecks.some((check) => check.canonicalRef === anchor.canonicalRef && check.anchorClass === anchor.anchorClass && check.outcome === "PASS" && check.sourceKind === expectedAnchorSource(anchor.anchorClass)));
  const rejectedCanonicalRefs = requiredAnchors.filter((anchor) => !passedAnchors.includes(anchor)).map((anchor) => anchor.canonicalRef).sort();
  const uniqueEvidenceIdentityCount = new Set(passedAnchors.flatMap((anchor) => {
    const envelope = accepted.get(anchor.nodeId);
    return envelope?.anchorChecks
      .filter((check) => check.canonicalRef === anchor.canonicalRef && check.outcome === "PASS")
      .map((check) => envelope.evidenceRefs.find((reference) => reference.evidenceId === check.evidenceRef)?.sourceIdentity ?? check.evidenceRef) ?? [];
  })).size;

  let state: WorkflowGraphRunIntegrityProjectionV1["state"] = "COMPLETE";
  if (explicitFailure) state = "FAILED";
  else if (intrinsicallyBlocked) state = "BLOCKED";
  else if (partialGap) state = "PARTIAL";
  else if (synthesisBlocked) state = "BLOCKED";
  else if (budget.state === "EXCEEDED") state = "DEGRADED";

  return {
    status: "PROJECTED",
    projection: {
      version: "WORKFLOW_GRAPH_RUN_INTEGRITY_V1", graphId: graph.id, runId: input.runId as string, state,
      acceptedResultIds: [...accepted.values()].map((result) => result.resultId).sort(),
      missingNodeIds, failedNodeIds, duplicateNodeIds, rejectedResults,
      anchors: { requiredCount: requiredAnchors.length, passedCount: passedAnchors.length, rejectedCanonicalRefs, uniqueEvidenceIdentityCount },
      budget,
      fanInLayers: fanInLayers(graph, input.chunkSize as number)
    },
    graphValidationErrors: []
  };
}
