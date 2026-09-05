export const GRAPH_NODE_STATES = Object.freeze({
  PENDING: 'PENDING',
  RUNNABLE: 'RUNNABLE',
  RUNNING: 'RUNNING',
  ACCEPTED: 'ACCEPTED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  REPLAN_REQUIRED: 'REPLAN_REQUIRED',
});

const TERMINAL_SUCCESS = new Set([GRAPH_NODE_STATES.ACCEPTED, 'COMPLETE']);
const TERMINAL_FAILURE = new Set([
  GRAPH_NODE_STATES.FAILED,
  GRAPH_NODE_STATES.BLOCKED,
  GRAPH_NODE_STATES.REPLAN_REQUIRED,
  'TIMED_OUT',
]);

function uniqueStrings(values, field) {
  if (!Array.isArray(values)) throw new Error(`V4_GRAPH_${field}_ARRAY_REQUIRED`);
  const result = [...new Set(values.map((value) => String(value ?? '').trim()))];
  if (result.some((value) => !value)) throw new Error(`V4_GRAPH_${field}_INVALID`);
  return result;
}

export function validateWorkGraph({ nodes = [], edges = [] } = {}) {
  const nodeIds = uniqueStrings(nodes.map((node) => node?.id), 'NODE');
  if (nodeIds.length !== nodes.length) throw new Error('V4_GRAPH_DUPLICATE_NODE');
  const known = new Set(nodeIds);
  const normalizedEdges = edges.map((edge) => {
    const from = String(edge?.from ?? '').trim();
    const to = String(edge?.to ?? '').trim();
    const artifact = String(edge?.artifact ?? '').trim();
    if (!known.has(from) || !known.has(to) || from === to) throw new Error('V4_GRAPH_EDGE_INVALID');
    if (!artifact) throw new Error('V4_GRAPH_EDGE_ARTIFACT_REQUIRED');
    return Object.freeze({ from, to, artifact });
  });

  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  for (const edge of normalizedEdges) {
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    for (const next of outgoing.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (visited !== nodeIds.length) throw new Error('V4_GRAPH_CYCLE_DETECTED');
  return Object.freeze({ nodes: Object.freeze([...nodes]), edges: Object.freeze(normalizedEdges) });
}

export function evaluateNodeReadiness({ nodeId, dependencies = [], states = {} } = {}) {
  const required = dependencies.filter((edge) => edge.to === nodeId);
  const failed = required.filter((edge) => TERMINAL_FAILURE.has(states[edge.from]));
  const waiting = required.filter((edge) => !TERMINAL_SUCCESS.has(states[edge.from]) && !TERMINAL_FAILURE.has(states[edge.from]));
  return Object.freeze({
    runnable: failed.length === 0 && waiting.length === 0,
    blockedByFailure: Object.freeze(failed.map((edge) => edge.from)),
    waitingOn: Object.freeze(waiting.map((edge) => edge.from)),
    requiredArtifacts: Object.freeze(required.map((edge) => ({ from: edge.from, artifact: edge.artifact }))),
  });
}

export function findFalseDependencies({ edges = [], consumers = {} } = {}) {
  return edges.filter((edge) => !(consumers[edge.to] ?? []).includes(edge.artifact));
}
