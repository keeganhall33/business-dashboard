export const WORKFLOW_GRAPH_V1_LIMITS = {
  maxNodes: 32,
  maxEdges: 96,
  maxSchemasPerNode: 16,
  maxResourcesPerNode: 24,
  maxAnchorsPerNode: 16,
  maxVerifierLenses: 3,
  maxExpectedOutputCardinality: 64,
  maxRuntimeMs: 15 * 60 * 1000,
  maxRetries: 3,
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
  maxCostUsd: 100,
  maxIdentifierLength: 128,
  maxObjectiveLength: 512,
  maxControlReasonLength: 256
} as const;

export const WORKFLOW_NODE_KINDS_V1 = ["DETERMINISTIC", "WORKER", "VERIFY", "REDUCE", "SYNTHESIZE"] as const;
export const WORKFLOW_APPROVAL_CLASSES_V1 = ["AUTO_CONTINUE", "ARCHITECT_REVIEW_REQUIRED", "KEEGAN_APPROVAL_REQUIRED"] as const;
export const WORKFLOW_RESULT_STATES_V1 = ["PENDING", "RUNNING", "COMPLETE", "PARTIAL", "DEGRADED", "BLOCKED", "FAILED"] as const;
export const WORKFLOW_TRUTH_STATES_V1 = ["ABSENT", "UNKNOWN", "CURRENT", "STALE", "CONFLICTED"] as const;
export const WORKFLOW_VERIFIER_LENSES_V1 = ["CORRECTNESS", "FRESHNESS", "SOURCE_SUPPORT"] as const;
export const WORKFLOW_ANCHOR_CLASSES_V1 = [
  "DETERMINISTIC_TEST",
  "CANONICAL_CONNECTOR_OBSERVATION",
  "TRANSACTION_MEASUREMENT",
  "ANALYTICS_MEASUREMENT",
  "GOVERNED_POLICY_OR_APPROVAL"
] as const;

export type WorkflowExecutionModeV1 = "SINGLE" | "GRAPH";
export type WorkflowNodeKindV1 = (typeof WORKFLOW_NODE_KINDS_V1)[number];
export type WorkflowApprovalClassV1 = (typeof WORKFLOW_APPROVAL_CLASSES_V1)[number];
export type WorkflowResultStateV1 = (typeof WORKFLOW_RESULT_STATES_V1)[number];
export type WorkflowTruthStateV1 = (typeof WORKFLOW_TRUTH_STATES_V1)[number];
export type WorkflowVerifierLensV1 = (typeof WORKFLOW_VERIFIER_LENSES_V1)[number];
export type WorkflowAnchorClassV1 = (typeof WORKFLOW_ANCHOR_CLASSES_V1)[number];

export type WorkflowBudgetV1 = {
  maxRuntimeMs: number;
  maxRetries: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
};

export type WorkflowEvidenceAnchorV1 = {
  anchorClass: WorkflowAnchorClassV1;
  canonicalRef: string;
  mandatory: boolean;
};

export type WorkflowVerifierV1 = {
  producerNodeId: string;
  verifierContextId: string;
  lenses: WorkflowVerifierLensV1[];
};

export type WorkflowNodeV1 = {
  id: string;
  kind: WorkflowNodeKindV1;
  contextId: string;
  inputSchemaIds: string[];
  outputSchemaIds: string[];
  expectedOutputCardinality?: number;
  verifier?: WorkflowVerifierV1;
  readResources: string[];
  mutableWriteResources: string[];
  evidenceAnchors: WorkflowEvidenceAnchorV1[];
  budget: WorkflowBudgetV1;
  approvalClass: WorkflowApprovalClassV1;
  resultState?: WorkflowResultStateV1;
  truthState?: WorkflowTruthStateV1;
};

export type WorkflowDataEdgeV1 = {
  id: string;
  kind: "DATA";
  fromNodeId: string;
  toNodeId: string;
  dataRef: string;
  producerOutputSchemaId: string;
  consumerInputSchemaId: string;
};

export type WorkflowControlEdgeV1 = {
  id: string;
  kind: "CONTROL";
  fromNodeId: string;
  toNodeId: string;
  controlGate: "APPROVAL" | "POLICY" | "RESOURCE" | "VERIFICATION";
  reason: string;
};

export type WorkflowEdgeV1 = WorkflowDataEdgeV1 | WorkflowControlEdgeV1;

export type WorkflowGraphV1 = {
  version: "WORKFLOW_GRAPH_V1";
  id: string;
  objective: string;
  executionMode: WorkflowExecutionModeV1;
  approvalClass: WorkflowApprovalClassV1;
  budget: WorkflowBudgetV1;
  nodes: WorkflowNodeV1[];
  edges: WorkflowEdgeV1[];
};

export type WorkflowGraphValidationErrorCodeV1 =
  | "INVALID_GRAPH"
  | "INVALID_VERSION"
  | "INVALID_IDENTIFIER"
  | "INVALID_OBJECTIVE"
  | "INVALID_EXECUTION_MODE"
  | "INVALID_APPROVAL_CLASS"
  | "INVALID_BUDGET"
  | "ARRAY_LIMIT_EXCEEDED"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_EDGE_ID"
  | "INVALID_NODE_KIND"
  | "MISSING_SCHEMA_ID"
  | "INVALID_RESOURCE"
  | "INVALID_ANCHOR"
  | "INVALID_RESULT_STATE"
  | "INVALID_TRUTH_STATE"
  | "COMPLETE_WITH_UNRESOLVED_TRUTH"
  | "DANGLING_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "CYCLE"
  | "INVALID_DATA_EDGE"
  | "ORDERING_EDGE_UNJUSTIFIED"
  | "INVALID_FAN_IN_CARDINALITY"
  | "INVALID_VERIFIER"
  | "VERIFIER_CONTEXT_REUSED"
  | "MISSING_VERIFIER_LENS"
  | "SYNTHESIS_WITHOUT_EVIDENCE"
  | "NODE_APPROVAL_TOO_WEAK"
  | "GRAPH_WITHOUT_PARALLEL_WIDTH"
  | "SINGLE_MODE_FAN_OUT"
  | "INDEPENDENT_MUTABLE_RESOURCE_CONFLICT";

export type WorkflowGraphValidationErrorV1 = {
  code: WorkflowGraphValidationErrorCodeV1;
  path: string;
  nodeId?: string;
  edgeId?: string;
};

export type WorkflowGraphValidationV1 =
  | { valid: true; errors: [] }
  | { valid: false; errors: WorkflowGraphValidationErrorV1[] };

type UnknownRecord = Record<string, unknown>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const approvalRank: Record<WorkflowApprovalClassV1, number> = {
  AUTO_CONTINUE: 0,
  ARCHITECT_REVIEW_REQUIRED: 1,
  KEEGAN_APPROVAL_REQUIRED: 2
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= WORKFLOW_GRAPH_V1_LIMITS.maxIdentifierLength &&
    identifierPattern.test(value)
  );
}

function validateStringArray(
  value: unknown,
  path: string,
  maximum: number,
  code: "MISSING_SCHEMA_ID" | "INVALID_RESOURCE",
  errors: WorkflowGraphValidationErrorV1[],
  nodeId?: string,
  allowEmpty = false
): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push({ code, path, nodeId });
    return [];
  }
  if (value.length > maximum) errors.push({ code: "ARRAY_LIMIT_EXCEEDED", path, nodeId });

  const accepted: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!isIdentifier(entry) || seen.has(entry)) {
      errors.push({ code, path: `${path}[${index}]`, nodeId });
      return;
    }
    seen.add(entry);
    accepted.push(entry);
  });
  return accepted;
}

function validateBudget(value: unknown, path: string, errors: WorkflowGraphValidationErrorV1[], nodeId?: string): void {
  if (!isRecord(value)) {
    errors.push({ code: "INVALID_BUDGET", path, nodeId });
    return;
  }

  const limits: Array<[keyof WorkflowBudgetV1, number, boolean]> = [
    ["maxRuntimeMs", WORKFLOW_GRAPH_V1_LIMITS.maxRuntimeMs, false],
    ["maxRetries", WORKFLOW_GRAPH_V1_LIMITS.maxRetries, true],
    ["maxContextTokens", WORKFLOW_GRAPH_V1_LIMITS.maxContextTokens, false],
    ["maxOutputTokens", WORKFLOW_GRAPH_V1_LIMITS.maxOutputTokens, false],
    ["maxCostUsd", WORKFLOW_GRAPH_V1_LIMITS.maxCostUsd, true]
  ];

  for (const [key, maximum, zeroAllowed] of limits) {
    const candidate = value[key];
    const minimum = zeroAllowed ? 0 : 1;
    const integerRequired = key !== "maxCostUsd";
    if (
      typeof candidate !== "number" ||
      !Number.isFinite(candidate) ||
      candidate < minimum ||
      candidate > maximum ||
      (integerRequired && !Number.isInteger(candidate))
    ) {
      errors.push({ code: "INVALID_BUDGET", path: `${path}.${key}`, nodeId });
    }
  }
}

function hasPath(from: string, to: string, adjacency: Map<string, Set<string>>): boolean {
  const pending = [...(adjacency.get(from) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function hasRequiredAnchorUpstream(
  nodeId: string,
  reverseAdjacency: Map<string, Set<string>>,
  nodes: Map<string, UnknownRecord>
): boolean {
  const pending = [...(reverseAdjacency.get(nodeId) ?? [])];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const anchors = nodes.get(current)?.evidenceAnchors;
    if (Array.isArray(anchors) && anchors.some((anchor) => isRecord(anchor) && anchor.mandatory === true)) return true;
    pending.push(...(reverseAdjacency.get(current) ?? []));
  }
  return false;
}

export function validateWorkflowGraphV1(input: unknown): WorkflowGraphValidationV1 {
  const errors: WorkflowGraphValidationErrorV1[] = [];
  if (!isRecord(input)) return { valid: false, errors: [{ code: "INVALID_GRAPH", path: "$" }] };

  if (input.version !== "WORKFLOW_GRAPH_V1") errors.push({ code: "INVALID_VERSION", path: "version" });
  if (!isIdentifier(input.id)) errors.push({ code: "INVALID_IDENTIFIER", path: "id" });
  if (typeof input.objective !== "string" || input.objective.trim().length === 0 || input.objective.length > WORKFLOW_GRAPH_V1_LIMITS.maxObjectiveLength) {
    errors.push({ code: "INVALID_OBJECTIVE", path: "objective" });
  }
  if (input.executionMode !== "SINGLE" && input.executionMode !== "GRAPH") {
    errors.push({ code: "INVALID_EXECUTION_MODE", path: "executionMode" });
  }
  if (!isMember(WORKFLOW_APPROVAL_CLASSES_V1, input.approvalClass)) {
    errors.push({ code: "INVALID_APPROVAL_CLASS", path: "approvalClass" });
  }
  validateBudget(input.budget, "budget", errors);

  const nodeValues = Array.isArray(input.nodes) ? input.nodes : [];
  const edgeValues = Array.isArray(input.edges) ? input.edges : [];
  if (!Array.isArray(input.nodes) || nodeValues.length === 0) errors.push({ code: "INVALID_GRAPH", path: "nodes" });
  if (!Array.isArray(input.edges)) errors.push({ code: "INVALID_GRAPH", path: "edges" });
  if (nodeValues.length > WORKFLOW_GRAPH_V1_LIMITS.maxNodes) errors.push({ code: "ARRAY_LIMIT_EXCEEDED", path: "nodes" });
  if (edgeValues.length > WORKFLOW_GRAPH_V1_LIMITS.maxEdges) errors.push({ code: "ARRAY_LIMIT_EXCEEDED", path: "edges" });

  const nodes = new Map<string, UnknownRecord>();
  const nodeSchemas = new Map<string, { input: string[]; output: string[] }>();
  const nodeWrites = new Map<string, string[]>();

  nodeValues.forEach((value, index) => {
    const path = `nodes[${index}]`;
    if (!isRecord(value)) {
      errors.push({ code: "INVALID_GRAPH", path });
      return;
    }
    const nodeId = typeof value.id === "string" ? value.id : undefined;
    if (!isIdentifier(value.id)) errors.push({ code: "INVALID_IDENTIFIER", path: `${path}.id`, nodeId });
    if (nodeId && nodes.has(nodeId)) errors.push({ code: "DUPLICATE_NODE_ID", path: `${path}.id`, nodeId });
    if (nodeId && !nodes.has(nodeId)) nodes.set(nodeId, value);

    if (!isMember(WORKFLOW_NODE_KINDS_V1, value.kind)) errors.push({ code: "INVALID_NODE_KIND", path: `${path}.kind`, nodeId });
    if (!isIdentifier(value.contextId)) errors.push({ code: "INVALID_IDENTIFIER", path: `${path}.contextId`, nodeId });
    const inputSchemas = validateStringArray(value.inputSchemaIds, `${path}.inputSchemaIds`, WORKFLOW_GRAPH_V1_LIMITS.maxSchemasPerNode, "MISSING_SCHEMA_ID", errors, nodeId);
    const outputSchemas = validateStringArray(value.outputSchemaIds, `${path}.outputSchemaIds`, WORKFLOW_GRAPH_V1_LIMITS.maxSchemasPerNode, "MISSING_SCHEMA_ID", errors, nodeId);
    if (nodeId) nodeSchemas.set(nodeId, { input: inputSchemas, output: outputSchemas });

    validateStringArray(value.readResources, `${path}.readResources`, WORKFLOW_GRAPH_V1_LIMITS.maxResourcesPerNode, "INVALID_RESOURCE", errors, nodeId, true);
    const writes = validateStringArray(value.mutableWriteResources, `${path}.mutableWriteResources`, WORKFLOW_GRAPH_V1_LIMITS.maxResourcesPerNode, "INVALID_RESOURCE", errors, nodeId, true);
    if (nodeId) nodeWrites.set(nodeId, writes);
    validateBudget(value.budget, `${path}.budget`, errors, nodeId);

    if (!isMember(WORKFLOW_APPROVAL_CLASSES_V1, value.approvalClass)) {
      errors.push({ code: "INVALID_APPROVAL_CLASS", path: `${path}.approvalClass`, nodeId });
    } else if (isMember(WORKFLOW_APPROVAL_CLASSES_V1, input.approvalClass) && approvalRank[value.approvalClass] < approvalRank[input.approvalClass]) {
      errors.push({ code: "NODE_APPROVAL_TOO_WEAK", path: `${path}.approvalClass`, nodeId });
    }

    if (value.resultState !== undefined && !isMember(WORKFLOW_RESULT_STATES_V1, value.resultState)) {
      errors.push({ code: "INVALID_RESULT_STATE", path: `${path}.resultState`, nodeId });
    }
    if (value.truthState !== undefined && !isMember(WORKFLOW_TRUTH_STATES_V1, value.truthState)) {
      errors.push({ code: "INVALID_TRUTH_STATE", path: `${path}.truthState`, nodeId });
    }
    if (value.resultState === "COMPLETE" && value.truthState !== "CURRENT") {
      errors.push({ code: "COMPLETE_WITH_UNRESOLVED_TRUTH", path: `${path}.truthState`, nodeId });
    }

    if (value.expectedOutputCardinality !== undefined && (
      !Number.isInteger(value.expectedOutputCardinality) ||
      (value.expectedOutputCardinality as number) < 1 ||
      (value.expectedOutputCardinality as number) > WORKFLOW_GRAPH_V1_LIMITS.maxExpectedOutputCardinality
    )) {
      errors.push({ code: "INVALID_FAN_IN_CARDINALITY", path: `${path}.expectedOutputCardinality`, nodeId });
    }

    if (!Array.isArray(value.evidenceAnchors)) {
      errors.push({ code: "INVALID_ANCHOR", path: `${path}.evidenceAnchors`, nodeId });
    } else {
      if (value.evidenceAnchors.length > WORKFLOW_GRAPH_V1_LIMITS.maxAnchorsPerNode) {
        errors.push({ code: "ARRAY_LIMIT_EXCEEDED", path: `${path}.evidenceAnchors`, nodeId });
      }
      value.evidenceAnchors.forEach((anchor, anchorIndex) => {
        if (
          !isRecord(anchor) ||
          !isMember(WORKFLOW_ANCHOR_CLASSES_V1, anchor.anchorClass) ||
          !isIdentifier(anchor.canonicalRef) ||
          typeof anchor.mandatory !== "boolean"
        ) {
          errors.push({ code: "INVALID_ANCHOR", path: `${path}.evidenceAnchors[${anchorIndex}]`, nodeId });
        }
      });
    }
  });

  const adjacency = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set<string>()]));
  const reverseAdjacency = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set<string>()]));
  const incomingCount = new Map<string, number>([...nodes.keys()].map((id) => [id, 0]));
  const edgeIds = new Set<string>();

  edgeValues.forEach((value, index) => {
    const path = `edges[${index}]`;
    if (!isRecord(value)) {
      errors.push({ code: "INVALID_GRAPH", path });
      return;
    }
    const edgeId = typeof value.id === "string" ? value.id : undefined;
    if (!isIdentifier(value.id)) errors.push({ code: "INVALID_IDENTIFIER", path: `${path}.id`, edgeId });
    if (edgeId && edgeIds.has(edgeId)) errors.push({ code: "DUPLICATE_EDGE_ID", path: `${path}.id`, edgeId });
    if (edgeId) edgeIds.add(edgeId);

    const from = typeof value.fromNodeId === "string" ? value.fromNodeId : "";
    const to = typeof value.toNodeId === "string" ? value.toNodeId : "";
    if (!nodes.has(from)) errors.push({ code: "DANGLING_DEPENDENCY", path: `${path}.fromNodeId`, edgeId });
    if (!nodes.has(to)) errors.push({ code: "DANGLING_DEPENDENCY", path: `${path}.toNodeId`, edgeId });
    if (from && from === to) errors.push({ code: "SELF_DEPENDENCY", path, edgeId });

    if (nodes.has(from) && nodes.has(to) && from !== to) {
      adjacency.get(from)!.add(to);
      reverseAdjacency.get(to)!.add(from);
      incomingCount.set(to, (incomingCount.get(to) ?? 0) + 1);
    }

    if (value.kind === "DATA") {
      const producerSchemas = nodeSchemas.get(from)?.output ?? [];
      const consumerSchemas = nodeSchemas.get(to)?.input ?? [];
      if (
        !isIdentifier(value.dataRef) ||
        !isIdentifier(value.producerOutputSchemaId) ||
        !isIdentifier(value.consumerInputSchemaId) ||
        !producerSchemas.includes(String(value.producerOutputSchemaId)) ||
        !consumerSchemas.includes(String(value.consumerInputSchemaId))
      ) {
        errors.push({ code: "INVALID_DATA_EDGE", path, edgeId });
      }
    } else if (value.kind === "CONTROL") {
      const validGate = value.controlGate === "APPROVAL" || value.controlGate === "POLICY" || value.controlGate === "RESOURCE" || value.controlGate === "VERIFICATION";
      if (!validGate || typeof value.reason !== "string" || value.reason.trim().length === 0 || value.reason.length > WORKFLOW_GRAPH_V1_LIMITS.maxControlReasonLength) {
        errors.push({ code: "ORDERING_EDGE_UNJUSTIFIED", path, edgeId });
      }
    } else {
      errors.push({ code: "ORDERING_EDGE_UNJUSTIFIED", path, edgeId });
    }
  });

  const indegrees = new Map<string, number>([...nodes.keys()].map((id) => [id, reverseAdjacency.get(id)?.size ?? 0]));
  let wave = [...indegrees].filter(([, degree]) => degree === 0).map(([id]) => id).sort();
  let visitedCount = 0;
  let maximumWidth = 0;
  while (wave.length > 0) {
    maximumWidth = Math.max(maximumWidth, wave.length);
    visitedCount += wave.length;
    const next: string[] = [];
    for (const id of wave) {
      for (const dependent of [...(adjacency.get(id) ?? [])].sort()) {
        const degree = (indegrees.get(dependent) ?? 0) - 1;
        indegrees.set(dependent, degree);
        if (degree === 0) next.push(dependent);
      }
    }
    wave = next.sort();
  }
  const cyclic = nodes.size > 0 && visitedCount !== nodes.size;
  if (cyclic) errors.push({ code: "CYCLE", path: "edges" });

  if (!cyclic && input.executionMode === "GRAPH" && maximumWidth < 2) {
    errors.push({ code: "GRAPH_WITHOUT_PARALLEL_WIDTH", path: "executionMode" });
  }
  if (input.executionMode === "SINGLE") {
    for (const [nodeId, dependents] of adjacency) {
      if (dependents.size > 1) errors.push({ code: "SINGLE_MODE_FAN_OUT", path: "executionMode", nodeId });
    }
  }

  for (const [nodeId, count] of incomingCount) {
    const node = nodes.get(nodeId)!;
    if (count > 1 && (
      !Number.isInteger(node.expectedOutputCardinality) ||
      (node.expectedOutputCardinality as number) < 1 ||
      (node.expectedOutputCardinality as number) > WORKFLOW_GRAPH_V1_LIMITS.maxExpectedOutputCardinality
    )) {
      errors.push({ code: "INVALID_FAN_IN_CARDINALITY", path: `nodes.${nodeId}.expectedOutputCardinality`, nodeId });
    }

    if (node.kind === "VERIFY") {
      const verifier = node.verifier;
      if (!isRecord(verifier) || !isIdentifier(verifier.producerNodeId) || !nodes.has(String(verifier.producerNodeId)) || !reverseAdjacency.get(nodeId)?.has(String(verifier.producerNodeId))) {
        errors.push({ code: "INVALID_VERIFIER", path: `nodes.${nodeId}.verifier`, nodeId });
      } else {
        const producerContext = nodes.get(String(verifier.producerNodeId))?.contextId;
        if (!isIdentifier(verifier.verifierContextId) || verifier.verifierContextId !== node.contextId) {
          errors.push({ code: "INVALID_VERIFIER", path: `nodes.${nodeId}.verifier.verifierContextId`, nodeId });
        } else if (verifier.verifierContextId === producerContext) {
          errors.push({ code: "VERIFIER_CONTEXT_REUSED", path: `nodes.${nodeId}.verifier.verifierContextId`, nodeId });
        }
        if (!Array.isArray(verifier.lenses) || verifier.lenses.length === 0 || verifier.lenses.length > WORKFLOW_GRAPH_V1_LIMITS.maxVerifierLenses) {
          errors.push({ code: "MISSING_VERIFIER_LENS", path: `nodes.${nodeId}.verifier.lenses`, nodeId });
        } else {
          const unique = new Set(verifier.lenses);
          if (unique.size !== verifier.lenses.length || verifier.lenses.some((lens) => !isMember(WORKFLOW_VERIFIER_LENSES_V1, lens))) {
            errors.push({ code: "MISSING_VERIFIER_LENS", path: `nodes.${nodeId}.verifier.lenses`, nodeId });
          }
        }
      }
    } else if (node.verifier !== undefined) {
      errors.push({ code: "INVALID_VERIFIER", path: `nodes.${nodeId}.verifier`, nodeId });
    }

    if (node.kind === "SYNTHESIZE" && ((incomingCount.get(nodeId) ?? 0) === 0 || !hasRequiredAnchorUpstream(nodeId, reverseAdjacency, nodes))) {
      errors.push({ code: "SYNTHESIS_WITHOUT_EVIDENCE", path: `nodes.${nodeId}`, nodeId });
    }
  }

  if (!cyclic) {
    const nodeIds = [...nodes.keys()].sort();
    for (let leftIndex = 0; leftIndex < nodeIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodeIds.length; rightIndex += 1) {
        const left = nodeIds[leftIndex];
        const right = nodeIds[rightIndex];
        if (hasPath(left, right, adjacency) || hasPath(right, left, adjacency)) continue;
        const rightWrites = new Set(nodeWrites.get(right) ?? []);
        if ((nodeWrites.get(left) ?? []).some((resource) => rightWrites.has(resource))) {
          errors.push({ code: "INDEPENDENT_MUTABLE_RESOURCE_CONFLICT", path: "nodes", nodeId: `${left}|${right}` });
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}
