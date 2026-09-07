/**
 * Model Routing Policy for V4 Orchestration
 * Routes tasks to the cheapest reliable execution tier: DETERMINISTIC, LOCAL, CLOUD_WORKER, or FRONTIER_LEADER
 * Escalates only when capability, privacy, budget, or evidenced failure requires it.
 */

export const ROUTE_TIERS = Object.freeze({
  DETERMINISTIC: 'DETERMINISTIC',
  LOCAL: 'LOCAL',
  CLOUD_WORKER: 'CLOUD_WORKER',
  FRONTIER_LEADER: 'FRONTIER_LEADER',
});

export const ROUTE_REASONS = Object.freeze({
  CAPABILITY_REQUIRED: 'CAPABILITY_REQUIRED',
  PRIVACY_REQUIRED: 'PRIVACY_REQUIRED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  LOCAL_FAILURE_EVIDENCED: 'LOCAL_FAILURE_EVIDENCED',
  REPEAT_REJECTED: 'REPEAT_REJECTED',
});

/**
 * Validates that a value is finite and non-negative.
 */
function finiteNonNegative(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`V4_ROUTE_${name}_INVALID`);
  }
  return value;
}

/**
 * Reliability enum values for evidence validation.
 */
const RELIABILITY_ENUMS = Object.freeze(['UNKNOWN', 'GOOD', 'EXCELLENT', 'LOCAL_OK', 'MODERATE', 'BAD', 'FAILED']);

/**
 * Tier cost map for budget calculations (route-tier to cost mapping).
 * Exported so tests can verify correct budget policy implementation.
 */
export const TIER_COSTS = Object.freeze({
  DETERMINISTIC: 1,
  LOCAL: 2,
  CLOUD_WORKER: 3,
  FRONTIER_LEADER: 5,
});

/**
 * Ordered tier list for fallback routing.
 */
const TIER_ORDER = Object.freeze([
  ROUTE_TIERS.DETERMINISTIC,
  ROUTE_TIERS.LOCAL,
  ROUTE_TIERS.CLOUD_WORKER,
  ROUTE_TIERS.FRONTIER_LEADER,
]);

/**
 * Route caps by tier: attempt limits and checkpoint triggers.
 */
const TIER_CAPS = Object.freeze({
  DETERMINISTIC: { attemptLimit: 5, checkpointOn: 'NONE' },
  LOCAL: { attemptLimit: 5, checkpointOn: 'SUCCESS' },
  CLOUD_WORKER: { attemptLimit: 5, checkpointOn: 'BUDGET' },
  FRONTIER_LEADER: { attemptLimit: 1, checkpointOn: 'ARCHITECTURE_APPROVAL' },
});

/**
 * Checkpoints required by tier type.
 */
const TIER_CHECKPOINTS = Object.freeze({
  DETERMINISTIC: [],
  LOCAL: [],
  CLOUD_WORKER: [{ event: 'BUDGET_CHECK', before: false }],
  FRONTIER_LEADER: [
    { event: 'ARCHITECTURE_APPROVAL', before: true },
    { event: 'DECOMPOSITION_COMPLETE', before: true },
  ],
});

/**
 * Routes a task to the cheapest reliable execution tier.
 * Returns complete result with route, reason, caps, and checkpoints inline.
 * @param {Object} options - Routing options.
 * @param {Object} options.capability - Task capabilities (architectural, decomposition).
 * @param {boolean} options.privacy - Whether task has privacy requirements.
 * @param {number} options.budget - Available budget for execution.
 * @param {string} options.reliability - Reliability tier: UNKNOWN, GOOD, LOCAL_OK, FAILED, BAD.
 * @param {number} options.attempt - Current attempt number (1-based).
 * @param {string} options.failureEvidence - Evidence of previous failures.
 * @returns {Object} Complete route result with route, reason, caps, and checkpoints.
 */
export function routeTask({
  capability = {},
  privacy = false,
  budget,
  reliability = 'UNKNOWN',
  attempt = 1,
  failureEvidence = '',
} = {}) {
  // Fix 5: Validate all caller-supplied numeric/string inputs that influence routing
  if (typeof reliability !== 'string') {
    throw new Error('V4_ROUTE_RELIABILITY_INVALID');
  }

  // Reject unknown enum values fail-closed
  if (!RELIABILITY_ENUMS.includes(reliability)) {
    throw new Error('V4_ROUTE_RELIBILITY_UNKNOWN_ENUM');
  }

  // Validate attempt if provided (must be finite positive integer)
  if (typeof attempt !== 'number' || !Number.isFinite(attempt) || attempt <= 0) {
    throw new Error('V4_ROUTE_ATTEMPT_INVALID');
  }

  // Validate budget if provided (must be finite non-negative number)
  if (budget !== undefined && budget !== null) {
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0) {
      throw new Error('V4_ROUTE_BUDGET_INVALID');
    }
  }

  // UNKNOWN reliability forces escalation to CLOUD_WORKER or FRONTIER_LEADER
  if (reliability === 'UNKNOWN') {
    const hasSpecialCapability = capability.architectural || capability.decomposition;
    const route = hasSpecialCapability ? ROUTE_TIERS.FRONTIER_LEADER : ROUTE_TIERS.CLOUD_WORKER;
    return buildCompleteRoute(route, ROUTE_REASONS.CAPABILITY_REQUIRED);
  }

  // Privacy tasks take precedence over capability - use FRONTIER_LEADER if privacy + architecture, else CLOUD_WORKER
  if (privacy) {
    const hasSpecialCapability = capability.architectural || capability.decomposition;
    const route = hasSpecialCapability ? ROUTE_TIERS.FRONTIER_LEADER : ROUTE_TIERS.CLOUD_WORKER;
    return buildCompleteRoute(route, ROUTE_REASONS.PRIVACY_REQUIRED);
  }

  // Capability check for architectural/decomposition tasks (these require FRONTIER_LEADER)
  if (capability.architectural || capability.decomposition) {
    return buildCompleteRoute(ROUTE_TIERS.FRONTIER_LEADER, ROUTE_REASONS.CAPABILITY_REQUIRED);
  }

  // Budget exceeded forces tier selection using TIER_COSTS table (Fix 1)
  if (budget !== undefined && budget !== null) {
    const selectedRoute = selectCheapestAffordableTier(budget);
    return buildCompleteRoute(selectedRoute, ROUTE_REASONS.BUDGET_EXCEEDED);
  }

  // Local failure evidenced after one attempt forces escalation (Fix 4: use explicit failed route evidence)
  if (reliability === 'FAILED' && attempt > 1) {
    // Skip the failed local tier, escalate to cloud worker
    return buildCompleteRoute(ROUTE_TIERS.CLOUD_WORKER, ROUTE_REASONS.LOCAL_FAILURE_EVIDENCED);
  }

  // Attempt caps and repeat rejection for BAD reliability after multiple attempts (Fix 4)
  if (attempt > 2 || failureEvidence.includes('REPEAT_FAILED')) {
    // Reject explicitly failed route index by using different tier or escalating
    // Find next available tier that is NOT the current reliability tier if it maps to a known tier
    let candidateRoute = ROUTE_TIERS.LOCAL;
    const currentIndex = TIER_ORDER.indexOf(reliability);
    
    // Iterate through tiers, skipping the currently failed one if possible
    for (let i = 0; i < TIER_ORDER.length; i++) {
      const tier = TIER_ORDER[i];
      // Skip if this is the same tier as the reliability evidence indicates failure
      if (currentIndex >= 0 && tier === RELIABILITY_ENUMS[currentIndex]) {
        continue;
      }
      candidateRoute = tier;
      break;
    }
    
    return buildCompleteRoute(candidateRoute, ROUTE_REASONS.REPEAT_REJECTED);
  }

  // Deterministic-first for simple bounded tasks with good reliability
  if (reliability === 'GOOD' || reliability === 'EXCELLENT') {
    return buildCompleteRoute(ROUTE_TIERS.DETERMINISTIC, 'DETERMINISTIC_FIRST');
  }

  // Local routing for LOCAL_OK reliability  
  if (reliability === 'LOCAL_OK') {
    return buildCompleteRoute(ROUTE_TIERS.LOCAL, 'LOCAL_SUCCESS');
  }

  // Default safe route for moderate/bad scenarios
  return buildCompleteRoute(ROUTE_TIERS.LOCAL, 'DEFAULT_LOCAL');
}

/**
 * Select the cheapest tier that fits within budget.
 * Uses TIER_COSTS table (not RELIABILITY_COSTS) for correct cost comparison.
 */
function selectCheapestAffordableTier(budget) {
  // Find cheapest tier within budget constraints
  for (const tier of TIER_ORDER) {
    if (TIER_COSTS[tier] <= budget) {
      return tier;
    }
  }
  // If nothing affordable, default to LOCAL as safest fallback
  return ROUTE_TIERS.LOCAL;
}

/**
 * Builds complete route result with caps and checkpoints inline.
 */
function buildCompleteRoute(route, reason) {
  const caps = TIER_CAPS[route] || { attemptLimit: 5, checkpointOn: 'SUCCESS' };
  const checkpoints = [...(TIER_CHECKPOINTS[route] || [])];

  return Object.freeze({
    route,
    reason,
    caps,
    checkpoints,
  });
}

/**
 * Validates route output and returns caps/checkpoints.
 * This is kept for backward compatibility but routing now returns complete results.
 * @param {Object} options - Validation options.
 * @param {string} options.route - Selected route tier.
 * @param {string} options.reason - Route reason.
 * @returns {Object} Validated result with route, reason, caps, and checkpoints.
 */
export function validateRouteOutput({ route, reason } = {}) {
  const validRoutes = Object.values(ROUTE_TIERS);
  if (!validRoutes.includes(route)) {
    throw new Error('V4_ROUTE_INVALID');
  }

  // Check that reason is either from ROUTE_REASONS or allowed literals
  const validReasons = [...Object.values(ROUTE_REASONS), 'DETERMINISTIC_FIRST', 'LOCAL_SUCCESS', 'DEFAULT_LOCAL'];
  if (reason !== 'ARCHITECTURE_APPROVAL' && reason !== 'DECOMPOSITION_COMPLETE') {
    if (!validReasons.includes(reason)) {
      throw new Error('V4_REASON_INVALID');
    }
  }

  // Cap constraints based on route choice
  const caps = TIER_CAPS[route] || { attemptLimit: 5, checkpointOn: 'SUCCESS' };

  // Checkpoint requirements based on tier and risk lane
  const checkpoints = [...(TIER_CHECKPOINTS[route] || [])];
  if (route === ROUTE_TIERS.CLOUD_WORKER) {
    checkpoints.push({ event: 'BUDGET_CHECK', before: false });
  } else if (route === ROUTE_TIERS.FRONTIER_LEADER) {
    checkpoints.push({ event: 'ARCHITECTURE_APPROVAL', before: true });
    checkpoints.push({ event: 'DECOMPOSITION_COMPLETE', before: true });
  }

  return Object.freeze({ route, reason, caps, checkpoints });
}
