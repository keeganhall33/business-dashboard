import type { DashboardOverviewResponse, TelemetrySource } from "@/lib/types/dashboard";
import type {
  ExplainWorkflowRunSummary,
  ExplanationEvidenceItem
} from "../explanation-contract";
import { planWorkflowGraphV1 } from "./workflow-graph-plan-v1";
import {
  projectWorkflowGraphRunIntegrityV1,
  type WorkflowAnchorOutcomeV1,
  type WorkflowNodeResultEnvelopeV1,
  type WorkflowVerifierLensResultV1
} from "./workflow-graph-run-v1";
import type {
  WorkflowAnchorClassV1,
  WorkflowGraphV1,
  WorkflowNodeKindV1,
  WorkflowNodeV1,
  WorkflowTruthStateV1
} from "./workflow-graph-v1";

const GRAPH_ID = "graph:revenue-explanation:v1";
const MAX_RESULT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type SourceId = "woo" | "ga4" | "meta";

export type RevenueExplanationWorkflowInputV1 = {
  metric: string;
  currentRange: { startDate: string; endDate: string };
  comparisonRange: { startDate: string; endDate: string };
  current: DashboardOverviewResponse;
  previous: DashboardOverviewResponse;
  evidence: ExplanationEvidenceItem[];
  allZeroWindow: boolean;
};

function budget(maxRuntimeMs: number) {
  return {
    maxRuntimeMs,
    maxRetries: 0,
    maxContextTokens: 1,
    maxOutputTokens: 1,
    maxCostUsd: 0
  };
}

function node(
  id: string,
  kind: WorkflowNodeKindV1,
  inputs: string[],
  output: string,
  options: Partial<WorkflowNodeV1> = {}
): WorkflowNodeV1 {
  return {
    id,
    kind,
    contextId: `context:${id}`,
    inputSchemaIds: inputs,
    outputSchemaIds: [output],
    readResources: [],
    mutableWriteResources: [],
    evidenceAnchors: [],
    budget: budget(1_000),
    approvalClass: "AUTO_CONTINUE",
    resultState: "PENDING",
    truthState: "UNKNOWN",
    ...options
  };
}

function sourceHasConflict(data: DashboardOverviewResponse, source: TelemetrySource): boolean {
  const values = [
    ...(data.telemetryMetadata?.[source]?.warningCodes ?? []),
    ...(data.telemetryHealth?.[source]?.warningCodes ?? []),
    ...(data.telemetryHealth?.[source]?.reasons ?? [])
  ];
  return values.some((value) => value.toUpperCase().includes("CONFLICT"));
}

function sourceTruth(
  data: DashboardOverviewResponse,
  source: TelemetrySource,
  usable: boolean
): WorkflowTruthStateV1 {
  if (!usable || data.dataMode === "UNAVAILABLE" || data.dataMode === "SEED_DATA") return "UNKNOWN";
  if (sourceHasConflict(data, source)) return "CONFLICTED";
  const freshness = data.telemetryMetadata?.[source]?.freshnessStatus;
  if (freshness === "stale") return "STALE";
  if (freshness === "no_data" || freshness === "unknown") return "UNKNOWN";
  const coverage = data.telemetryMetadata?.[source]?.coverageStatus;
  if (coverage === "partial" || coverage === "unknown") return "UNKNOWN";
  if (source === "woo" && data.commerceTelemetry?.woo?.summary?.completeness !== undefined && data.commerceTelemetry.woo.summary.completeness !== "complete") return "UNKNOWN";
  if (source === "meta" && data.metaAds?.status === "PARTIAL") return "UNKNOWN";
  return "CURRENT";
}

function combinedTruth(...states: WorkflowTruthStateV1[]): WorkflowTruthStateV1 {
  if (states.includes("CONFLICTED")) return "CONFLICTED";
  if (states.includes("STALE")) return "STALE";
  if (states.some((state) => state !== "CURRENT")) return "UNKNOWN";
  return "CURRENT";
}

function sourceObservedAt(data: DashboardOverviewResponse, source: SourceId, fallback: string): string {
  const metadata = data.telemetryMetadata?.[source]?.generatedAt;
  const wooAsOf = source === "woo" ? data.commerceTelemetry?.woo?.summary?.asOf : null;
  const metaGeneratedAt = source === "meta" ? data.metaAds?.generatedAt : null;
  for (const candidate of [metadata, wooAsOf, metaGeneratedAt, data.timestamp, fallback]) {
    if (candidate && Number.isFinite(Date.parse(candidate))) return candidate;
  }
  return fallback;
}

function anchorOutcome(truthState: WorkflowTruthStateV1): WorkflowAnchorOutcomeV1 {
  if (truthState === "CURRENT") return "PASS";
  if (truthState === "STALE") return "STALE";
  if (truthState === "CONFLICTED") return "CONFLICTED";
  return "UNKNOWN";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hasNumbers(values: unknown[]): boolean {
  return values.every((value) => typeof value === "number" && Number.isFinite(value));
}

function usableMeta(data: DashboardOverviewResponse): boolean {
  const summary = data.metaAds?.summary;
  if (!summary || data.metaAds?.status === "FALLBACK" || data.metaAds?.status === "BROKEN") return false;
  return [summary.spend, summary.impressions, summary.clicks, summary.purchases, summary.purchaseValue]
    .some((value) => typeof value === "number" && Number.isFinite(value));
}

function aovConsistent(input: RevenueExplanationWorkflowInputV1): boolean {
  for (const data of [input.current, input.previous]) {
    const summary = data.commerceTelemetry?.woo?.summary;
    if (!summary || summary.revenue == null || summary.orders == null || summary.avgOrderValue == null) continue;
    if (summary.orders === 0) {
      if (summary.revenue !== 0 || summary.avgOrderValue !== 0) return false;
      continue;
    }
    if (Math.abs(summary.revenue / summary.orders - summary.avgOrderValue) > 0.01) return false;
  }
  return true;
}

function graph(includeMeta: boolean): WorkflowGraphV1 {
  const sourceNodes: WorkflowNodeV1[] = [
    node("woo-evidence", "DETERMINISTIC", ["explain-request.v1"], "woo-observation.v1", {
      readResources: ["connector:woo"],
      evidenceAnchors: [{ anchorClass: "TRANSACTION_MEASUREMENT", canonicalRef: "woo:selected-range", mandatory: true }]
    }),
    node("ga4-evidence", "DETERMINISTIC", ["explain-request.v1"], "ga4-observation.v1", {
      readResources: ["connector:ga4"],
      evidenceAnchors: [{ anchorClass: "ANALYTICS_MEASUREMENT", canonicalRef: "ga4:selected-range", mandatory: true }]
    })
  ];
  if (includeMeta) {
    sourceNodes.push(node("meta-evidence", "DETERMINISTIC", ["explain-request.v1"], "meta-observation.v1", {
      readResources: ["connector:meta"],
      evidenceAnchors: [{ anchorClass: "ANALYTICS_MEASUREMENT", canonicalRef: "meta:selected-range", mandatory: true }]
    }));
  }

  const nodes = [
    ...sourceNodes,
    node("decomposition", "REDUCE", ["woo-observation.v1", "ga4-observation.v1"], "revenue-decomposition.v1", {
      expectedOutputCardinality: 1,
      evidenceAnchors: [{ anchorClass: "DETERMINISTIC_TEST", canonicalRef: "calculation:revenue-decomposition", mandatory: true }]
    }),
    node("anomaly-reduction", "DETERMINISTIC", ["woo-observation.v1"], "anomaly-summary.v1", {
      evidenceAnchors: [{ anchorClass: "DETERMINISTIC_TEST", canonicalRef: "calculation:outlier-detection", mandatory: true }]
    }),
    node("verify-evidence", "VERIFY", ["revenue-decomposition.v1", "anomaly-summary.v1", ...(includeMeta ? ["meta-observation.v1"] : [])], "verified-explanation.v1", {
      expectedOutputCardinality: 1,
      verifier: {
        producerNodeId: "decomposition",
        verifierContextId: "context:verify-evidence",
        lenses: ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"]
      }
    }),
    node("synthesize-explanation", "SYNTHESIZE", ["verified-explanation.v1"], "explain-response.v1")
  ];

  const edges: WorkflowGraphV1["edges"] = [
    { id: "woo-decomposition", kind: "DATA", fromNodeId: "woo-evidence", toNodeId: "decomposition", dataRef: "data:woo-decomposition", producerOutputSchemaId: "woo-observation.v1", consumerInputSchemaId: "woo-observation.v1" },
    { id: "ga4-decomposition", kind: "DATA", fromNodeId: "ga4-evidence", toNodeId: "decomposition", dataRef: "data:ga4-decomposition", producerOutputSchemaId: "ga4-observation.v1", consumerInputSchemaId: "ga4-observation.v1" },
    { id: "woo-anomaly", kind: "DATA", fromNodeId: "woo-evidence", toNodeId: "anomaly-reduction", dataRef: "data:woo-anomaly", producerOutputSchemaId: "woo-observation.v1", consumerInputSchemaId: "woo-observation.v1" },
    { id: "decomposition-verify", kind: "DATA", fromNodeId: "decomposition", toNodeId: "verify-evidence", dataRef: "data:decomposition-verify", producerOutputSchemaId: "revenue-decomposition.v1", consumerInputSchemaId: "revenue-decomposition.v1" },
    { id: "anomaly-verify", kind: "DATA", fromNodeId: "anomaly-reduction", toNodeId: "verify-evidence", dataRef: "data:anomaly-verify", producerOutputSchemaId: "anomaly-summary.v1", consumerInputSchemaId: "anomaly-summary.v1" },
    { id: "verify-synthesis", kind: "DATA", fromNodeId: "verify-evidence", toNodeId: "synthesize-explanation", dataRef: "data:verify-synthesis", producerOutputSchemaId: "verified-explanation.v1", consumerInputSchemaId: "verified-explanation.v1" }
  ];
  if (includeMeta) {
    edges.push({ id: "meta-verify", kind: "DATA", fromNodeId: "meta-evidence", toNodeId: "verify-evidence", dataRef: "data:meta-verify", producerOutputSchemaId: "meta-observation.v1", consumerInputSchemaId: "meta-observation.v1" });
  }

  return {
    version: "WORKFLOW_GRAPH_V1",
    id: GRAPH_ID,
    objective: "Verify a bounded cross-source revenue explanation without strengthening unsupported causality.",
    executionMode: "GRAPH",
    approvalClass: "AUTO_CONTINUE",
    budget: budget(5_000),
    nodes,
    edges
  };
}

function sourceEnvelope(input: {
  graph: WorkflowGraphV1;
  runId: string;
  nodeId: string;
  source: SourceId;
  truthState: WorkflowTruthStateV1;
  observedAt: string;
  anchorClass: WorkflowAnchorClassV1;
  canonicalRef: string;
  evidenceId: string;
}): WorkflowNodeResultEnvelopeV1 {
  const graphNode = input.graph.nodes.find((candidate) => candidate.id === input.nodeId)!;
  return {
    graphId: input.graph.id,
    nodeId: input.nodeId,
    runId: input.runId,
    resultId: `result:${input.nodeId}`,
    attemptId: 1,
    producerContextId: graphNode.contextId,
    resultState: "COMPLETE",
    truthState: input.truthState,
    generatedAt: input.observedAt,
    observedAt: input.observedAt,
    outputSchemaId: graphNode.outputSchemaIds[0],
    outputItemCount: 1,
    inputResultIds: [],
    evidenceRefs: [{ evidenceId: input.evidenceId, semanticKind: "OBSERVED", sourceIdentity: input.canonicalRef }],
    anchorChecks: [{
      anchorClass: input.anchorClass,
      canonicalRef: input.canonicalRef,
      evidenceRef: input.evidenceId,
      sourceKind: input.source === "woo" ? "TRANSACTION" : "ANALYTICS",
      outcome: anchorOutcome(input.truthState)
    }]
  };
}

function derivedEnvelope(input: {
  graph: WorkflowGraphV1;
  runId: string;
  nodeId: string;
  observedAt: string;
  inputResultIds: string[];
  truthState?: WorkflowTruthStateV1;
  resultState?: WorkflowNodeResultEnvelopeV1["resultState"];
  canonicalRef?: string;
  verification?: WorkflowNodeResultEnvelopeV1["verification"];
}): WorkflowNodeResultEnvelopeV1 {
  const graphNode = input.graph.nodes.find((candidate) => candidate.id === input.nodeId)!;
  const evidenceId = `evidence:${input.nodeId}`;
  return {
    graphId: input.graph.id,
    nodeId: input.nodeId,
    runId: input.runId,
    resultId: `result:${input.nodeId}`,
    attemptId: 1,
    producerContextId: graphNode.contextId,
    resultState: input.resultState ?? "COMPLETE",
    truthState: input.truthState ?? "CURRENT",
    generatedAt: input.observedAt,
    observedAt: input.observedAt,
    outputSchemaId: graphNode.outputSchemaIds[0],
    outputItemCount: 1,
    inputResultIds: input.inputResultIds,
    evidenceRefs: [{ evidenceId, semanticKind: "DERIVED", sourceIdentity: input.canonicalRef ?? `calculation:${input.nodeId}` }],
    anchorChecks: input.canonicalRef ? [{
      anchorClass: "DETERMINISTIC_TEST",
      canonicalRef: input.canonicalRef,
      evidenceRef: evidenceId,
      sourceKind: "DETERMINISTIC_TEST",
      outcome: anchorOutcome(input.truthState ?? "CURRENT")
    }] : [],
    verification: input.verification
  };
}

function dedupeEvidence(evidence: ExplanationEvidenceItem[]): { duplicateCount: number } {
  const keys = evidence.map((item) => `${item.source}:${item.id}`);
  return { duplicateCount: keys.length - new Set(keys).size };
}

export function buildRevenueExplanationWorkflowRunV1(
  input: RevenueExplanationWorkflowInputV1
): ExplainWorkflowRunSummary {
  const includeMeta = input.current.metaAds != null;
  const workflowGraph = graph(includeMeta);
  const plan = planWorkflowGraphV1({
    graph: workflowGraph,
    nodeConstraints: workflowGraph.nodes.map((candidate) => ({
      nodeId: candidate.id,
      consumedDataRefs: workflowGraph.edges.flatMap((edge) =>
        edge.kind === "DATA" && edge.toNodeId === candidate.id ? [edge.dataRef] : []
      ),
      semanticOwnership: [`summary:${candidate.id}`],
      connectorAccesses: candidate.id.endsWith("-evidence") && candidate.id !== "verify-evidence"
        ? [{ groupId: `connector:${candidate.id.replace("-evidence", "")}`, mode: "SHARED" as const }]
        : []
    }))
  });

  const fallbackTime = `${input.currentRange.endDate}T23:59:59.000Z`;
  const evaluatedAt = Number.isFinite(Date.parse(input.current.timestamp)) ? input.current.timestamp : fallbackTime;
  const runId = `run:revenue-explanation:${stableHash(JSON.stringify({
    metric: input.metric,
    currentRange: input.currentRange,
    comparisonRange: input.comparisonRange
  }))}`;

  const currentWoo = input.current.commerceTelemetry?.woo?.summary;
  const previousWoo = input.previous.commerceTelemetry?.woo?.summary;
  const currentGa4 = input.current.commerceTelemetry?.ga4?.summary;
  const previousGa4 = input.previous.commerceTelemetry?.ga4?.summary;
  const wooUsable = hasNumbers([currentWoo?.revenue, currentWoo?.orders, previousWoo?.revenue, previousWoo?.orders]);
  const ga4Usable = hasNumbers([currentGa4?.sessions, previousGa4?.sessions]);
  const metaUsable = usableMeta(input.current);
  const truths: Record<SourceId, WorkflowTruthStateV1> = {
    woo: combinedTruth(
      sourceTruth(input.current, "woo", wooUsable),
      sourceTruth(input.previous, "woo", wooUsable)
    ),
    ga4: combinedTruth(
      sourceTruth(input.current, "ga4", ga4Usable),
      sourceTruth(input.previous, "ga4", ga4Usable)
    ),
    meta: sourceTruth(input.current, "meta", metaUsable)
  };

  const results: WorkflowNodeResultEnvelopeV1[] = [];
  if (wooUsable) results.push(sourceEnvelope({ graph: workflowGraph, runId, nodeId: "woo-evidence", source: "woo", truthState: truths.woo, observedAt: sourceObservedAt(input.current, "woo", evaluatedAt), anchorClass: "TRANSACTION_MEASUREMENT", canonicalRef: "woo:selected-range", evidenceId: "woo:revenue-orders-aov" }));
  if (ga4Usable) results.push(sourceEnvelope({ graph: workflowGraph, runId, nodeId: "ga4-evidence", source: "ga4", truthState: truths.ga4, observedAt: sourceObservedAt(input.current, "ga4", evaluatedAt), anchorClass: "ANALYTICS_MEASUREMENT", canonicalRef: "ga4:selected-range", evidenceId: "ga4:sessions-conversion" }));
  if (includeMeta && metaUsable) results.push(sourceEnvelope({ graph: workflowGraph, runId, nodeId: "meta-evidence", source: "meta", truthState: truths.meta, observedAt: sourceObservedAt(input.current, "meta", evaluatedAt), anchorClass: "ANALYTICS_MEASUREMENT", canonicalRef: "meta:selected-range", evidenceId: "meta:delivery-summary" }));

  const decompositionTruth: WorkflowTruthStateV1 = input.allZeroWindow ? "UNKNOWN" : "CURRENT";
  results.push(derivedEnvelope({
    graph: workflowGraph,
    runId,
    nodeId: "decomposition",
    observedAt: evaluatedAt,
    inputResultIds: ["result:ga4-evidence", "result:woo-evidence"],
    truthState: decompositionTruth,
    resultState: input.allZeroWindow ? "DEGRADED" : "COMPLETE",
    canonicalRef: "calculation:revenue-decomposition"
  }));
  results.push(derivedEnvelope({
    graph: workflowGraph,
    runId,
    nodeId: "anomaly-reduction",
    observedAt: evaluatedAt,
    inputResultIds: ["result:woo-evidence"],
    canonicalRef: "calculation:outlier-detection"
  }));

  const correctnessPass = !input.allZeroWindow && aovConsistent(input);
  const requiredSources: SourceId[] = includeMeta ? ["woo", "ga4", "meta"] : ["woo", "ga4"];
  const freshnessPass = requiredSources.every((source) => truths[source] === "CURRENT");
  const supportPass = (includeMeta ? wooUsable && ga4Usable && metaUsable : wooUsable && ga4Usable);
  const lenses: WorkflowVerifierLensResultV1[] = [
    { lens: "CORRECTNESS", verdict: correctnessPass ? "PASS" : "FAIL", reasonCode: correctnessPass ? "deterministic-calculations-consistent" : input.allZeroWindow ? "insufficient-nonzero-signal" : "aov-revenue-orders-conflict", evidenceRefs: ["evidence:decomposition"] },
    { lens: "FRESHNESS", verdict: freshnessPass ? "PASS" : "FAIL", reasonCode: freshnessPass ? "source-observations-current" : "source-freshness-unresolved", evidenceRefs: requiredSources.map((source) => `${source}:${source === "woo" ? "revenue-orders-aov" : source === "ga4" ? "sessions-conversion" : "delivery-summary"}`) },
    { lens: "SOURCE_SUPPORT", verdict: supportPass ? "PASS" : "FAIL", reasonCode: supportPass ? "required-source-evidence-present" : "required-source-evidence-missing", evidenceRefs: requiredSources.map((source) => `${source}:${source === "woo" ? "revenue-orders-aov" : source === "ga4" ? "sessions-conversion" : "delivery-summary"}`) }
  ];
  const verifierInputs = ["result:anomaly-reduction", "result:decomposition", ...(includeMeta ? ["result:meta-evidence"] : [])].sort();
  if (supportPass) {
    results.push(derivedEnvelope({
      graph: workflowGraph,
      runId,
      nodeId: "verify-evidence",
      observedAt: evaluatedAt,
      inputResultIds: verifierInputs,
      verification: { verifierContextId: "context:verify-evidence", lenses }
    }));
  }
  results.push(derivedEnvelope({ graph: workflowGraph, runId, nodeId: "synthesize-explanation", observedAt: evaluatedAt, inputResultIds: ["result:verify-evidence"] }));

  const integrity = projectWorkflowGraphRunIntegrityV1({
    graph: workflowGraph,
    runId,
    evaluatedAt,
    maxResultAgeMs: MAX_RESULT_AGE_MS,
    chunkSize: 4,
    results
  });
  if (integrity.status !== "PROJECTED" || !integrity.projection || !plan.plan) {
    return {
      version: "REVENUE_EXPLANATION_WORKFLOW_RUN_V1",
      graphId: GRAPH_ID,
      runId,
      state: "BLOCKED",
      expectedNodeCount: workflowGraph.nodes.length,
      acceptedNodeCount: 0,
      missingBranches: workflowGraph.nodes.map((candidate) => candidate.id).sort(),
      failedBranches: [],
      plannedWaves: [],
      observedTiming: { state: "NOT_OBSERVED", elapsedMs: null },
      verifier: { state: "UNKNOWN", failedLenses: [] },
      anchors: { requiredCount: 0, passedCount: 0, rejectedCanonicalRefs: [], uniqueEvidenceIdentityCount: 0 },
      evidenceCoverage: { expectedSources: requiredSources, observedSources: [], missingSources: requiredSources, duplicateEvidenceCount: dedupeEvidence(input.evidence).duplicateCount },
      budget: { state: "UNKNOWN", elapsedMs: null, costUsd: null },
      nodes: workflowGraph.nodes.map((candidate) => ({ nodeId: candidate.id, state: "MISSING", truthState: "UNKNOWN", evidenceCount: 0 }))
    };
  }

  const projection = integrity.projection;
  const acceptedNodes = new Set(projection.acceptedResultIds.map((resultId) => resultId.replace("result:", "")));
  const resultByNode = new Map(results.map((result) => [result.nodeId, result]));
  const failedLenses = lenses.filter((lens) => lens.verdict !== "PASS").map((lens) => lens.lens);
  const observedSources = requiredSources.filter((source) => {
    const nodeId = `${source}-evidence`;
    return acceptedNodes.has(nodeId);
  });

  return {
    version: "REVENUE_EXPLANATION_WORKFLOW_RUN_V1",
    graphId: projection.graphId,
    runId: projection.runId,
    state: projection.state,
    expectedNodeCount: workflowGraph.nodes.length,
    acceptedNodeCount: projection.acceptedResultIds.length,
    missingBranches: projection.missingNodeIds,
    failedBranches: projection.failedNodeIds,
    plannedWaves: plan.plan.waves,
    observedTiming: { state: "NOT_OBSERVED", elapsedMs: null },
    verifier: {
      state: projection.acceptedResultIds.includes("result:verify-evidence") ? "PASSED" : failedLenses.length ? "FAILED" : "UNKNOWN",
      failedLenses
    },
    anchors: projection.anchors,
    evidenceCoverage: {
      expectedSources: requiredSources,
      observedSources,
      missingSources: requiredSources.filter((source) => !observedSources.includes(source)),
      duplicateEvidenceCount: dedupeEvidence(input.evidence).duplicateCount
    },
    budget: {
      state: projection.budget.state,
      elapsedMs: projection.budget.elapsedMs.value,
      costUsd: projection.budget.costUsd.value
    },
    nodes: workflowGraph.nodes.map((candidate) => {
      const result = resultByNode.get(candidate.id);
      return {
        nodeId: candidate.id,
        state: acceptedNodes.has(candidate.id) ? "ACCEPTED" as const : projection.missingNodeIds.includes(candidate.id) ? "MISSING" as const : "REJECTED" as const,
        truthState: result?.truthState ?? "ABSENT",
        evidenceCount: result?.evidenceRefs.length ?? 0
      };
    })
  };
}
