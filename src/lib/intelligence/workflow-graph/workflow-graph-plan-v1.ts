import {
  WORKFLOW_GRAPH_V1_LIMITS,
  validateWorkflowGraphV1,
  type WorkflowGraphV1,
  type WorkflowGraphValidationErrorV1,
  type WorkflowNodeV1
} from "./workflow-graph-v1";

export const WORKFLOW_GRAPH_PLAN_V1_LIMITS = {
  maxConsumedDataRefsPerNode: WORKFLOW_GRAPH_V1_LIMITS.maxEdges,
  maxSemanticOwnershipPerNode: 16,
  maxConnectorAccessesPerNode: 16
} as const;

export type WorkflowConnectorAccessModeV1 = "SHARED" | "EXCLUSIVE";

export type WorkflowConnectorAccessV1 = {
  groupId: string;
  mode: WorkflowConnectorAccessModeV1;
};

export type WorkflowNodePlanningConstraintV1 = {
  nodeId: string;
  consumedDataRefs: string[];
  semanticOwnership: string[];
  connectorAccesses: WorkflowConnectorAccessV1[];
};

export type WorkflowGraphPlanningInputV1 = {
  graph: WorkflowGraphV1;
  nodeConstraints: WorkflowNodePlanningConstraintV1[];
};

export type WorkflowGraphPlanningErrorCodeV1 =
  | "INVALID_INPUT"
  | "INVALID_GRAPH"
  | "INVALID_NODE_CONSTRAINT"
  | "DUPLICATE_NODE_CONSTRAINT"
  | "MISSING_NODE_CONSTRAINT"
  | "UNKNOWN_CONSTRAINED_NODE"
  | "INVALID_CONSTRAINT_IDENTIFIER"
  | "DUPLICATE_CONSTRAINT_IDENTIFIER"
  | "CONSTRAINT_LIMIT_EXCEEDED"
  | "INVALID_CONNECTOR_ACCESS";

export type WorkflowGraphPlanningErrorV1 = {
  code: WorkflowGraphPlanningErrorCodeV1;
  path: string;
  nodeId?: string;
};

export type WorkflowFakeEdgeCandidateV1 = {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  reason: "DATA_REFERENCE_NOT_DECLARED_CONSUMED";
};

export type WorkflowHiddenDependencyReasonV1 =
  | "MUTABLE_RESOURCE_ACCESS"
  | "SEMANTIC_OWNERSHIP"
  | "EXCLUSIVE_CONNECTOR_GROUP";

export type WorkflowHiddenDependencyV1 = {
  fromNodeId: string;
  toNodeId: string;
  reasons: WorkflowHiddenDependencyReasonV1[];
};

export type WorkflowExecutionWaveV1 = {
  index: number;
  nodeIds: string[];
};

export type WorkflowPlanEstimatesV1 = {
  totalNodeCount: number;
  criticalPathNodeCount: number;
  maximumParallelWidth: number;
};

export type WorkflowGraphExecutionPlanV1 = {
  version: "WORKFLOW_GRAPH_EXECUTION_PLAN_V1";
  graphId: string;
  waves: WorkflowExecutionWaveV1[];
  fakeEdgeCandidates: WorkflowFakeEdgeCandidateV1[];
  hiddenDependencies: WorkflowHiddenDependencyV1[];
  estimates: WorkflowPlanEstimatesV1;
};

export type WorkflowGraphPlanResultV1 =
  | {
      status: "GRAPH_READY" | "SINGLE_RECOMMENDED";
      plan: WorkflowGraphExecutionPlanV1;
      errors: [];
      graphValidationErrors: [];
    }
  | {
      status: "INVALID_GRAPH";
      plan: null;
      errors: [];
      graphValidationErrors: WorkflowGraphValidationErrorV1[];
    }
  | {
      status: "INVALID_PLANNING_INPUT";
      plan: null;
      errors: WorkflowGraphPlanningErrorV1[];
      graphValidationErrors: [];
    };

type UnknownRecord = Record<string, unknown>;
type Adjacency = Map<string, Set<string>>;

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const hiddenReasonOrder: WorkflowHiddenDependencyReasonV1[] = [
  "MUTABLE_RESOURCE_ACCESS",
  "SEMANTIC_OWNERSHIP",
  "EXCLUSIVE_CONNECTOR_GROUP"
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= WORKFLOW_GRAPH_V1_LIMITS.maxIdentifierLength &&
    identifierPattern.test(value)
  );
}

function validateIdentifierArray(
  value: unknown,
  path: string,
  maximum: number,
  errors: WorkflowGraphPlanningErrorV1[],
  nodeId: string
): string[] {
  if (!Array.isArray(value)) {
    errors.push({ code: "INVALID_NODE_CONSTRAINT", path, nodeId });
    return [];
  }
  if (value.length > maximum) {
    errors.push({ code: "CONSTRAINT_LIMIT_EXCEEDED", path, nodeId });
  }

  const accepted: string[] = [];
  const seen = new Set<string>();
  value.forEach((candidate, index) => {
    if (!isIdentifier(candidate)) {
      errors.push({ code: "INVALID_CONSTRAINT_IDENTIFIER", path: `${path}[${index}]`, nodeId });
      return;
    }
    if (seen.has(candidate)) {
      errors.push({ code: "DUPLICATE_CONSTRAINT_IDENTIFIER", path: `${path}[${index}]`, nodeId });
      return;
    }
    seen.add(candidate);
    accepted.push(candidate);
  });
  return accepted;
}

function validateConstraints(
  value: unknown,
  graph: WorkflowGraphV1
): {
  errors: WorkflowGraphPlanningErrorV1[];
  constraints: Map<string, WorkflowNodePlanningConstraintV1>;
} {
  const errors: WorkflowGraphPlanningErrorV1[] = [];
  const constraints = new Map<string, WorkflowNodePlanningConstraintV1>();
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  if (!Array.isArray(value)) {
    return {
      errors: [{ code: "INVALID_INPUT", path: "nodeConstraints" }],
      constraints
    };
  }
  if (value.length > WORKFLOW_GRAPH_V1_LIMITS.maxNodes) {
    errors.push({ code: "CONSTRAINT_LIMIT_EXCEEDED", path: "nodeConstraints" });
  }

  value.forEach((candidate, index) => {
    const path = `nodeConstraints[${index}]`;
    if (!isRecord(candidate) || !isIdentifier(candidate.nodeId)) {
      errors.push({ code: "INVALID_NODE_CONSTRAINT", path });
      return;
    }
    const nodeId = candidate.nodeId;
    if (constraints.has(nodeId)) {
      errors.push({ code: "DUPLICATE_NODE_CONSTRAINT", path: `${path}.nodeId`, nodeId });
      return;
    }
    if (!nodeIds.has(nodeId)) {
      errors.push({ code: "UNKNOWN_CONSTRAINED_NODE", path: `${path}.nodeId`, nodeId });
    }

    const consumedDataRefs = validateIdentifierArray(
      candidate.consumedDataRefs,
      `${path}.consumedDataRefs`,
      WORKFLOW_GRAPH_PLAN_V1_LIMITS.maxConsumedDataRefsPerNode,
      errors,
      nodeId
    );
    const semanticOwnership = validateIdentifierArray(
      candidate.semanticOwnership,
      `${path}.semanticOwnership`,
      WORKFLOW_GRAPH_PLAN_V1_LIMITS.maxSemanticOwnershipPerNode,
      errors,
      nodeId
    );

    const connectorAccesses: WorkflowConnectorAccessV1[] = [];
    if (!Array.isArray(candidate.connectorAccesses)) {
      errors.push({ code: "INVALID_NODE_CONSTRAINT", path: `${path}.connectorAccesses`, nodeId });
    } else {
      if (candidate.connectorAccesses.length > WORKFLOW_GRAPH_PLAN_V1_LIMITS.maxConnectorAccessesPerNode) {
        errors.push({ code: "CONSTRAINT_LIMIT_EXCEEDED", path: `${path}.connectorAccesses`, nodeId });
      }
      const seenGroups = new Set<string>();
      candidate.connectorAccesses.forEach((access, accessIndex) => {
        if (
          !isRecord(access) ||
          !isIdentifier(access.groupId) ||
          (access.mode !== "SHARED" && access.mode !== "EXCLUSIVE") ||
          seenGroups.has(String(access.groupId))
        ) {
          errors.push({ code: "INVALID_CONNECTOR_ACCESS", path: `${path}.connectorAccesses[${accessIndex}]`, nodeId });
          return;
        }
        seenGroups.add(access.groupId);
        connectorAccesses.push({ groupId: access.groupId, mode: access.mode });
      });
    }

    constraints.set(nodeId, {
      nodeId,
      consumedDataRefs,
      semanticOwnership,
      connectorAccesses
    });
  });

  for (const nodeId of [...nodeIds].sort()) {
    if (!constraints.has(nodeId)) {
      errors.push({ code: "MISSING_NODE_CONSTRAINT", path: "nodeConstraints", nodeId });
    }
  }

  return { errors, constraints };
}

function buildAdjacency(graph: WorkflowGraphV1): { adjacency: Adjacency; reverseAdjacency: Adjacency } {
  const adjacency: Adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  const reverseAdjacency: Adjacency = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.fromNodeId)!.add(edge.toNodeId);
    reverseAdjacency.get(edge.toNodeId)!.add(edge.fromNodeId);
  }
  return { adjacency, reverseAdjacency };
}

function hasPath(from: string, to: string, adjacency: Adjacency): boolean {
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

function stableTopologicalOrder(nodeIds: string[], adjacency: Adjacency, reverseAdjacency: Adjacency): string[] {
  const indegrees = new Map(nodeIds.map((nodeId) => [nodeId, reverseAdjacency.get(nodeId)?.size ?? 0]));
  const available = nodeIds.filter((nodeId) => indegrees.get(nodeId) === 0).sort();
  const order: string[] = [];

  while (available.length > 0) {
    const nodeId = available.shift()!;
    order.push(nodeId);
    for (const dependent of [...(adjacency.get(nodeId) ?? [])].sort()) {
      const nextDegree = (indegrees.get(dependent) ?? 0) - 1;
      indegrees.set(dependent, nextDegree);
      if (nextDegree === 0) {
        available.push(dependent);
        available.sort();
      }
    }
  }
  return order;
}

function intersect(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function conflictReasons(
  left: WorkflowNodeV1,
  right: WorkflowNodeV1,
  constraints: Map<string, WorkflowNodePlanningConstraintV1>
): WorkflowHiddenDependencyReasonV1[] {
  const reasons = new Set<WorkflowHiddenDependencyReasonV1>();
  const leftResources = [...left.readResources, ...left.mutableWriteResources];
  const rightResources = [...right.readResources, ...right.mutableWriteResources];
  if (
    intersect(left.mutableWriteResources, rightResources) ||
    intersect(right.mutableWriteResources, leftResources)
  ) {
    reasons.add("MUTABLE_RESOURCE_ACCESS");
  }

  const leftConstraint = constraints.get(left.id)!;
  const rightConstraint = constraints.get(right.id)!;
  if (intersect(leftConstraint.semanticOwnership, rightConstraint.semanticOwnership)) {
    reasons.add("SEMANTIC_OWNERSHIP");
  }

  for (const leftAccess of leftConstraint.connectorAccesses) {
    const rightAccess = rightConstraint.connectorAccesses.find((candidate) => candidate.groupId === leftAccess.groupId);
    if (rightAccess && (leftAccess.mode === "EXCLUSIVE" || rightAccess.mode === "EXCLUSIVE")) {
      reasons.add("EXCLUSIVE_CONNECTOR_GROUP");
    }
  }
  return hiddenReasonOrder.filter((reason) => reasons.has(reason));
}

function findFakeEdgeCandidates(
  graph: WorkflowGraphV1,
  constraints: Map<string, WorkflowNodePlanningConstraintV1>
): WorkflowFakeEdgeCandidateV1[] {
  const byPair = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const key = `${edge.fromNodeId}\u0000${edge.toNodeId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), edge]);
  }

  const candidates: WorkflowFakeEdgeCandidateV1[] = [];
  for (const edges of byPair.values()) {
    const targetConstraint = constraints.get(edges[0].toNodeId)!;
    const hasConsumedData = edges.some(
      (edge) => edge.kind === "DATA" && targetConstraint.consumedDataRefs.includes(edge.dataRef)
    );
    const hasJustifiedControl = edges.some((edge) => edge.kind === "CONTROL");
    if (hasConsumedData || hasJustifiedControl) continue;

    for (const edge of edges) {
      if (edge.kind === "DATA" && !targetConstraint.consumedDataRefs.includes(edge.dataRef)) {
        candidates.push({
          edgeId: edge.id,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          reason: "DATA_REFERENCE_NOT_DECLARED_CONSUMED"
        });
      }
    }
  }
  return candidates.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
}

function addHiddenDependencies(
  graph: WorkflowGraphV1,
  constraints: Map<string, WorkflowNodePlanningConstraintV1>,
  adjacency: Adjacency,
  reverseAdjacency: Adjacency
): WorkflowHiddenDependencyV1[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const baseOrder = stableTopologicalOrder([...nodeById.keys()].sort(), adjacency, reverseAdjacency);
  const orderIndex = new Map(baseOrder.map((nodeId, index) => [nodeId, index]));
  const hiddenDependencies: WorkflowHiddenDependencyV1[] = [];

  for (let leftIndex = 0; leftIndex < baseOrder.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < baseOrder.length; rightIndex += 1) {
      const first = baseOrder[leftIndex];
      const second = baseOrder[rightIndex];
      if (hasPath(first, second, adjacency) || hasPath(second, first, adjacency)) continue;

      const left = nodeById.get(first)!;
      const right = nodeById.get(second)!;
      const reasons = conflictReasons(left, right, constraints);
      if (reasons.length === 0) continue;

      const fromNodeId = (orderIndex.get(first) ?? 0) <= (orderIndex.get(second) ?? 0) ? first : second;
      const toNodeId = fromNodeId === first ? second : first;
      adjacency.get(fromNodeId)!.add(toNodeId);
      reverseAdjacency.get(toNodeId)!.add(fromNodeId);
      hiddenDependencies.push({ fromNodeId, toNodeId, reasons });
    }
  }

  return hiddenDependencies.sort((left, right) => {
    const fromComparison = left.fromNodeId.localeCompare(right.fromNodeId);
    return fromComparison !== 0 ? fromComparison : left.toNodeId.localeCompare(right.toNodeId);
  });
}

function compileWaves(
  nodeIds: string[],
  adjacency: Adjacency,
  reverseAdjacency: Adjacency
): { waves: WorkflowExecutionWaveV1[]; criticalPathNodeCount: number } {
  const indegrees = new Map(nodeIds.map((nodeId) => [nodeId, reverseAdjacency.get(nodeId)?.size ?? 0]));
  let available = nodeIds.filter((nodeId) => indegrees.get(nodeId) === 0).sort();
  const waves: WorkflowExecutionWaveV1[] = [];
  const depth = new Map(nodeIds.map((nodeId) => [nodeId, 1]));

  while (available.length > 0) {
    const current = available;
    waves.push({ index: waves.length, nodeIds: current });
    const next: string[] = [];
    for (const nodeId of current) {
      for (const dependent of [...(adjacency.get(nodeId) ?? [])].sort()) {
        depth.set(dependent, Math.max(depth.get(dependent) ?? 1, (depth.get(nodeId) ?? 1) + 1));
        const nextDegree = (indegrees.get(dependent) ?? 0) - 1;
        indegrees.set(dependent, nextDegree);
        if (nextDegree === 0) next.push(dependent);
      }
    }
    available = next.sort();
  }

  return {
    waves,
    criticalPathNodeCount: Math.max(...depth.values())
  };
}

export function planWorkflowGraphV1(input: unknown): WorkflowGraphPlanResultV1 {
  if (!isRecord(input) || !("graph" in input)) {
    return {
      status: "INVALID_PLANNING_INPUT",
      plan: null,
      errors: [{ code: "INVALID_INPUT", path: "$" }],
      graphValidationErrors: []
    };
  }

  const graphValidation = validateWorkflowGraphV1(input.graph);
  if (!graphValidation.valid) {
    return {
      status: "INVALID_GRAPH",
      plan: null,
      errors: [],
      graphValidationErrors: graphValidation.errors
    };
  }

  const graph = input.graph as WorkflowGraphV1;
  const constraintValidation = validateConstraints(input.nodeConstraints, graph);
  if (constraintValidation.errors.length > 0) {
    return {
      status: "INVALID_PLANNING_INPUT",
      plan: null,
      errors: constraintValidation.errors,
      graphValidationErrors: []
    };
  }

  const { adjacency, reverseAdjacency } = buildAdjacency(graph);
  const fakeEdgeCandidates = findFakeEdgeCandidates(graph, constraintValidation.constraints);
  const hiddenDependencies = addHiddenDependencies(
    graph,
    constraintValidation.constraints,
    adjacency,
    reverseAdjacency
  );
  const compiled = compileWaves(
    graph.nodes.map((node) => node.id).sort(),
    adjacency,
    reverseAdjacency
  );
  const maximumParallelWidth = Math.max(...compiled.waves.map((wave) => wave.nodeIds.length));

  return {
    status: maximumParallelWidth > 1 ? "GRAPH_READY" : "SINGLE_RECOMMENDED",
    plan: {
      version: "WORKFLOW_GRAPH_EXECUTION_PLAN_V1",
      graphId: graph.id,
      waves: compiled.waves,
      fakeEdgeCandidates,
      hiddenDependencies,
      estimates: {
        totalNodeCount: graph.nodes.length,
        criticalPathNodeCount: compiled.criticalPathNodeCount,
        maximumParallelWidth
      }
    },
    errors: [],
    graphValidationErrors: []
  };
}
