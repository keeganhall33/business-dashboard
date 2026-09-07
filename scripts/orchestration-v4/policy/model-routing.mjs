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
 * Reliability-to-tier cost mapping.
 * Maps reliability status to the execution tier it represents for budget calculations.
 */
const RELIABILITY_COSTS = Object.freeze({
  UNKNOWN: 3,
  GOOD: 1,
  EXCELLENT: 1,
  LOCAL_OK: 2,
  MODERATE: 2,
  BAD: 3,
  FAILED: 3,
});

/**
 * Tier cost map for budget calculations.
 */
const TIER_COSTS = Object.freeze({
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
 * Routes a task to the cheapest reliable execution tier.
 * @param {Object} options - Routing options.
 * @param {Object} options.capability - Task capabilities (architectural, decomposition).
 * @param {boolean} options.privacy - Whether task has privacy requirements.
 * @param {number} options.budget - Available budget for execution.
 * @param {string} options.reliability - Reliability tier: UNKNOWN, GOOD, LOCAL_OK, FAILED, BAD.
 * @param {number} options.attempt - Current attempt number (1-based).
 * @param {string} options.failureEvidence - Evidence of previous failures.
 * @returns {Object} Route result with route, reason, caps, and checkpoints.
 */
export function routeTask({
  capability = {},
  privacy = false,
  budget,
  reliability = 'UNKNOWN',
  attempt = 1,
  failureEvidence = '',
} = {}) {
  if (typeof reliability !== 'string') {
    throw new Error('V4_ROUTE_RELIBILITY_REQUIRED');
  }

  // UNKNOWN reliability forces escalation to CLOUD_WORKER or FRONTIER_LEADER
  if (reliability === 'UNKNOWN') {
    const hasSpecialCapability = capability.architectural || capability.decomposition;
    return Object.freeze({
      route: hasSpecialCapability ? ROUTE_TIERS.FRONTIER_LEADER : ROUTE_TIERS.CLOUD_WORKER,
      reason: ROUTE_REASONS.CAPABILITY_REQUIRED,
    });
  }

  // Privacy tasks take precedence over capability - use FRONTIER_LEADER if privacy + architecture, else CLOUD_WORKER
  if (privacy) {
    const hasSpecialCapability = capability.architectural || capability.decomposition;
    return Object.freeze({
      route: hasSpecialCapability ? ROUTE_TIERS.FRONTIER_LEADER : ROUTE_TIERS.CLOUD_WORKER,
      reason: ROUTE_REASONS.PRIVACY_REQUIRED,
    });
  }

  // Capability check for architectural/decomposition tasks (these require FRONTIER_LEADER)
  if (capability.architectural || capability.decomposition) {
    return Object.freeze({
      route: ROUTE_TIERS.FRONTIER_LEADER,
      reason: ROUTE_REASONS.CAPABILITY_REQUIRED,
    });
  }

  // Budget exceeded forces worker/freelance tiers
  if (budget !== undefined && budget !== null) {
    const reliabilityCost = RELIABILITY_COSTS[reliability] ?? RELIABILITY_COSTS.MODERATE;
    if (reliabilityCost > budget) {
      // Find cheapest tier within budget
      let selectedTier = ROUTE_TIERS.LOCAL;
      for (const tier of TIER_ORDER) {
        if (RELIABILITY_COSTS[tier] <= budget) {
          selectedTier = tier;
        } else {
          break; // Costs increase along the order
        }
      }
      return Object.freeze({
        route: selectedTier,
        reason: ROUTE_REASONS.BUDGET_EXCEEDED,
      });
    }
  }

  // Local failure evidenced after one attempt forces escalation
  if (reliability === 'FAILED' && attempt > 1) {
    return Object.freeze({
      route: ROUTE_TIERS.CLOUD_WORKER,
      reason: ROUTE_REASONS.LOCAL_FAILURE_EVIDENCED,
    });
  }

  // Attempt caps and repeat rejection for BAD reliability after multiple attempts
  if (attempt > 2 || failureEvidence.includes('REPEAT_FAILED')) {
    // Skip failed route, find next available tier within budget constraints
    const badReliabilityIndex = TIER_ORDER.indexOf(reliability);
    let skippedCount = 0;
    for (const tier of TIER_ORDER) {
      if (TIER_ORDER.indexOf(tier) !== badReliabilityIndex) {
        skippedCount++;
        if (skippedCount > 3 || TIER_COSTS[tier] <= (budget ?? 10)) {
          return Object.freeze({
            route: tier,
            reason: ROUTE_REASONS.REPEAT_REJECTED,
          });
        }
      }
    }
    // Default fallback if no suitable tier found
    return Object.freeze({
      route: ROUTE_TIERS.LOCAL,
      reason: ROUTE_REASONS.REPEAT_REJECTED,
    });
  }

  // Deterministic-first for simple bounded tasks with good reliability
  if (reliability === 'GOOD' || reliability === 'EXCELLENT') {
    return Object.freeze({
      route: ROUTE_TIERS.DETERMINISTIC,
      reason: 'DETERMINISTIC_FIRST',
    });
  }

  // Fallback to local for proven reliability
  if (reliability === 'LOCAL_OK') {
    return Object.freeze({
      route: ROUTE_TIERS.LOCAL,
      reason: 'LOCAL_SUCCESS',
    });
  }

  // Default safe route for moderate/bad scenarios
  return Object.freeze({
    route: ROUTE_TIERS.LOCAL,
    reason: 'DEFAULT_LOCAL',
  });
}

/**
 * Validates route output and returns caps/checkpoints.
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
  if (reason !== 'DETERMINISTIC_FIRST' && reason !== 'LOCAL_SUCCESS' && reason !== 'DEFAULT_LOCAL') {
    const validReasons = [...Object.values(ROUTE_REASONS), 'DETERMINISTIC_FIRST', 'LOCAL_SUCCESS', 'DEFAULT_LOCAL'];
    if (!validReasons.includes(reason)) {
      throw new Error('V4_REASON_INVALID');
    }
  }

  // Cap constraints based on route choice
  const caps = {
    attemptLimit: route === ROUTE_TIERS.FRONTIER_LEADER ? 1 : 5,
    checkpointOn: route === ROUTE_TIERS.CLOUD_WORKER ? 'BUDGET' : route === ROUTE_TIERS.DETERMINISTIC ? 'NONE' : 'SUCCESS',
  };

  // Checkpoint requirements based on tier and risk lane
  const checkpoints = [];
  if (route === ROUTE_TIERS.CLOUD_WORKER) {
    checkpoints.push({ event: 'BUDGET_CHECK', before: false });
  } else if (route === ROUTE_TIERS.FRONTIER_LEADER) {
    checkpoints.push({ event: 'ARCHITECTURE_APPROVAL', before: true });
    checkpoints.push({ event: 'DECOMPOSITION_COMPLETE', before: true });
  }

  return Object.freeze({ route, reason, caps, checkpoints });
}
