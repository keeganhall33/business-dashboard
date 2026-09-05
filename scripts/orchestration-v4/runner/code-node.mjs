const CODE_NODE_NAME = /^[a-z][a-z0-9-]{1,63}$/;

export function createCodeNodeRegistry(entries = {}) {
  const registry = new Map();
  for (const [name, transform] of Object.entries(entries)) {
    if (!CODE_NODE_NAME.test(name) || typeof transform !== 'function') throw new Error('V4_CODE_NODE_INVALID');
    registry.set(name, transform);
  }
  return registry;
}

export async function executeCodeNode({ registry, name, input } = {}) {
  if (!(registry instanceof Map) || !registry.has(name)) throw new Error('V4_CODE_NODE_NOT_REGISTERED');
  const startedAt = Date.now();
  const output = await registry.get(name)(structuredClone(input));
  return Object.freeze({
    nodeType: 'CODE', name, output: structuredClone(output), durationMs: Math.max(0, Date.now() - startedAt),
  });
}
