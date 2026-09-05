export const RISK_LANES = Object.freeze({
  CONTAINED_REVERSIBLE: 'CONTAINED_REVERSIBLE',
  WIDE_REVERSIBLE: 'WIDE_REVERSIBLE',
  HARD_TO_REVERSE: 'HARD_TO_REVERSE',
});

const HARD_MUTATIONS = new Set(['PRODUCTION_DATA_WRITE', 'DELETE', 'PAYMENT', 'MIGRATION']);

export function classifyRiskLane({ mutationKinds = [], affectedConsumers = 0, rollbackVerified = false } = {}) {
  if (!Array.isArray(mutationKinds) || !Number.isInteger(affectedConsumers) || affectedConsumers < 0) {
    throw new Error('V4_RISK_INPUT_INVALID');
  }
  const normalized = mutationKinds.map((kind) => String(kind).trim().toUpperCase());
  if (normalized.some((kind) => HARD_MUTATIONS.has(kind)) || rollbackVerified !== true) {
    return Object.freeze({ lane: RISK_LANES.HARD_TO_REVERSE, autonomous: false, requiredGate: 'HUMAN_APPROVAL' });
  }
  if (affectedConsumers > 3 || normalized.includes('SHARED_SCHEMA') || normalized.includes('SHARED_UTILITY')) {
    return Object.freeze({ lane: RISK_LANES.WIDE_REVERSIBLE, autonomous: true, requiredGate: 'DETERMINISTIC_CHECKS_AND_INDEPENDENT_REVIEW' });
  }
  return Object.freeze({ lane: RISK_LANES.CONTAINED_REVERSIBLE, autonomous: true, requiredGate: 'DETERMINISTIC_CHECKS' });
}
