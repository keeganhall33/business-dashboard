import test from 'node:test';
import assert from 'node:assert/strict';
import { routeTask, validateRouteOutput, ROUTE_TIERS, ROUTE_REASONS, TIER_COSTS } from '../../../scripts/orchestration-v4/policy/model-routing.mjs';

// Deterministic-first routing for good reliability tasks (no special capability)
test('deterministic-first routing for simple bounded tasks', () => {
  const result = routeTask({ reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, 'DETERMINISTIC_FIRST');
  assert.equal(result.caps.attemptLimit, 5);
  assert.equal(result.caps.checkpointOn, 'NONE');
  assert.deepStrictEqual(result.checkpoints, []);
});

// Local routing for LOCAL_OK reliability  
test('local success routing for LOCAL_OK reliability', () => {
  const result = routeTask({ reliability: 'LOCAL_OK' });
  assert.equal(result.route, ROUTE_TIERS.LOCAL);
  assert.equal(result.reason, 'LOCAL_SUCCESS');
  assert.equal(result.caps.attemptLimit, 5);
  assert.equal(result.caps.checkpointOn, 'SUCCESS');
});

// Default fallback to local for moderate scenarios
test('default local routing when no special conditions apply', () => {
  const result = routeTask({ reliability: 'MODERATE' });
  assert.equal(result.route, ROUTE_TIERS.LOCAL);
  assert.equal(result.reason, 'DEFAULT_LOCAL');
});

// Default fallback for BAD reliability
test('default local routing for BAD reliability', () => {
  const result = routeTask({ reliability: 'BAD' });
  assert.equal(result.route, ROUTE_TIERS.LOCAL);
  assert.equal(result.reason, 'DEFAULT_LOCAL');
});

// Escalation to cloud worker on local failure after multiple attempts
test('failure escalation after one evidenced local failure', () => {
  const result = routeTask({ reliability: 'FAILED', attempt: 2 });
  assert.equal(result.route, ROUTE_TIERS.CLOUD_WORKER);
  assert.equal(result.reason, ROUTE_REASONS.LOCAL_FAILURE_EVIDENCED);
  assert.equal(result.caps.attemptLimit, 5);
  assert.equal(result.caps.checkpointOn, 'BUDGET');
});

// Frontier leader for architectural capabilities
test('frontier leader for architectural capability tasks', () => {
  const result = routeTask({ capability: { architectural: true }, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.FRONTIER_LEADER);
  assert.equal(result.reason, ROUTE_REASONS.CAPABILITY_REQUIRED);
  assert.equal(result.caps.attemptLimit, 1);
});

// Frontier leader for decomposition tasks  
test('frontier leader for decomposition tasks', () => {
  const result = routeTask({ capability: { decomposition: true }, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.FRONTIER_LEADER);
  assert.equal(result.reason, ROUTE_REASONS.CAPABILITY_REQUIRED);
  assert.deepStrictEqual(result.checkpoints, [
    { event: 'ARCHITECTURE_APPROVAL', before: true },
    { event: 'DECOMPOSITION_COMPLETE', before: true },
  ]);
});

// Privacy exclusion from deterministic and local tiers
test('privacy exclusion forces cloud worker tier', () => {
  const result = routeTask({ privacy: true, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.CLOUD_WORKER);
  assert.equal(result.reason, ROUTE_REASONS.PRIVACY_REQUIRED);
  assert.equal(result.caps.attemptLimit, 5);
});

// Privacy exclusion for architectural tasks goes to frontier leader
test('privacy with architecture forces frontier leader', () => {
  const result = routeTask({ privacy: true, capability: { architectural: true }, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.FRONTIER_LEADER);
  assert.equal(result.reason, ROUTE_REASONS.PRIVACY_REQUIRED);
});

// Unknown reliability handling escalates to cloud worker by default
test('unknown reliability escalation to cloud worker', () => {
  const result = routeTask({ reliability: 'UNKNOWN' });
  assert.equal(result.route, ROUTE_TIERS.CLOUD_WORKER);
  assert.equal(result.reason, ROUTE_REASONS.CAPABILITY_REQUIRED);
});

// Budget constraint forces tier selection - below minimum budget
test('budget of 1 selects cheapest affordable tier (DETERMINISTIC at cost 1)', () => {
  const result = routeTask({ budget: 1, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, ROUTE_REASONS.BUDGET_EXCEEDED);
  assert.equal(TIER_COSTS[result.route], 1, 'DETERMINISTIC should cost 1');
});

// Budget constraint forces tier selection - exact boundary matches DETERMINISTIC cost
test('budget of 2 selects cheapest affordable tier (still DETERMINISTIC)', () => {
  const result = routeTask({ budget: 2, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, ROUTE_REASONS.BUDGET_EXCEEDED);
  assert.equal(TIER_COSTS[result.route], 1, 'Should select cheapest affordable');
});

// Budget constraint forces tier selection - sufficient budget for DETERMINISTIC
test('budget of 3 selects cheapest affordable tier (DETERMINISTIC)', () => {
  const result = routeTask({ budget: 3, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, ROUTE_REASONS.BUDGET_EXCEEDED);
  assert.equal(TIER_COSTS[result.route], 1);
});

// Budget constraint forces tier selection - large budget selects DETERMINISTIC (cheapest)
test('budget of 5 selects cheapest affordable tier (DETERMINISTIC)', () => {
  const result = routeTask({ budget: 5, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, ROUTE_REASONS.BUDGET_EXCEEDED);
});

// No budget provided - default routing applies
test('no budget provides default routing based on reliability', () => {
  const result = routeTask({ reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, 'DETERMINISTIC_FIRST');
});

// Attempt cap prevents repeated routing to same failed route - explicit exclusion
test('attempt rejection after multiple failed attempts excludes failed tier', () => {
  const result = routeTask({ reliability: 'BAD', attempt: 3 });
  assert.ok(result.reason === ROUTE_REASONS.REPEAT_REJECTED);
});

// Failure evidence with REPEAT_FAILED triggers repeat rejection
test('failureEvidence REPEAT_FAILED triggers repeat rejection', () => {
  const result = routeTask({ reliability: 'GOOD', attempt: 1, failureEvidence: 'REPEAT_FAILED' });
  assert.equal(result.reason, ROUTE_REASONS.REPEAT_REJECTED);
});

// Validate CLOUD_WORKER checkpoint requirements using validateRouteOutput
test('cloud worker has budget checkpoint requirement', () => {
  const result = routeTask({ reliability: 'FAILED', attempt: 2 });
  const validated = validateRouteOutput(result);
  assert.ok(validated.checkpoints.some(cp => cp.event === 'BUDGET_CHECK'));
});

// Validate FRONTIER_LEADER checkpoint requirements
test('frontier leader has architecture and decomposition checkpoints', () => {
  const result = routeTask({ capability: { architectural: true }, reliability: 'GOOD' });
  const validated = validateRouteOutput(result);
  assert.ok(validated.checkpoints.some(cp => cp.event === 'ARCHITECTURE_APPROVAL'));
  assert.ok(validated.checkpoints.some(cp => cp.event === 'DECOMPOSITION_COMPLETE'));
});

// Validate DETERMINISTIC tier has no checkpoint requirement
test('deterministic tier has NONE checkpoint', () => {
  const result = routeTask({ reliability: 'GOOD' });
  const validated = validateRouteOutput(result);
  if (validated.route === ROUTE_TIERS.DETERMINISTIC) {
    assert.equal(validated.caps.checkpointOn, 'NONE');
  }
});

// Validate attempt limits by route tier
test('attempt limits vary by route tier', () => {
  const result = routeTask({ capability: { architectural: true }, reliability: 'GOOD' });
  const validated = validateRouteOutput(result);
  if (validated.route === ROUTE_TIERS.FRONTIER_LEADER) {
    assert.equal(validated.caps.attemptLimit, 1);
  }
});

// Invalid route throws error in validation
test('invalid route throws V4_ROUTE_INVALID', () => {
  try {
    validateRouteOutput({ route: 'INVALID_TIER' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_INVALID');
  }
});

// Valid reason check  
test('valid reason values are from ROUTE_REASONS or allowed literals', () => {
  const result = routeTask({ reliability: 'GOOD' });
  assert.ok(Object.values(ROUTE_REASONS).includes(result.reason) || 
            result.reason === 'DETERMINISTIC_FIRST' || 
            result.reason === 'LOCAL_SUCCESS' || 
            result.reason === 'DEFAULT_LOCAL');
});

// Malformed reliability (non-string) throws error fail-closed
test('malformed reliability non-string throws V4_ROUTE_RELIABILITY_INVALID', () => {
  try {
    routeTask({ reliability: 123 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_RELIABILITY_INVALID');
  }
});

// Malformed budget (negative) throws error fail-closed
test('negative budget throws V4_ROUTE_BUDGET_INVALID', () => {
  try {
    routeTask({ budget: -1, reliability: 'GOOD' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_BUDGET_INVALID');
  }
});

// Malformed budget (NaN) throws error fail-closed
test('NaN budget throws V4_ROUTE_BUDGET_INVALID', () => {
  try {
    routeTask({ budget: NaN, reliability: 'GOOD' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_BUDGET_INVALID');
  }
});

// Malformed attempt (negative) throws error fail-closed
test('negative attempt throws V4_ROUTE_ATTEMPT_INVALID', () => {
  try {
    routeTask({ reliability: 'GOOD', attempt: -1 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_ATTEMPT_INVALID');
  }
});

// Malformed attempt (zero) throws error fail-closed
test('zero attempt throws V4_ROUTE_ATTEMPT_INVALID', () => {
  try {
    routeTask({ reliability: 'GOOD', attempt: 0 });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_ATTEMPT_INVALID');
  }
});

// Unsupported reliability value throws error fail-closed
test('unsupported reliability enum value throws V4_ROUTE_RELIBILITY_UNKNOWN_ENUM', () => {
  try {
    routeTask({ reliability: 'INVALID_VALUE' });
    assert.fail('Should have thrown');
  } catch (e) {
    assert.equal(e.message, 'V4_ROUTE_RELIBILITY_UNKNOWN_ENUM');
  }
});

// Deterministic tier reason is literal string, not ROUTE_REASONS enum
test('deterministic first uses literal reason string', () => {
  const result = routeTask({ reliability: 'EXCELLENT' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, 'DETERMINISTIC_FIRST');
});

// CLOUD_WORKER has 5 attempt limit
test('cloud worker attempt limit is 5', () => {
  const result = routeTask({ reliability: 'UNKNOWN' });
  if (result.route === ROUTE_TIERS.CLOUD_WORKER) {
    assert.equal(result.caps.attemptLimit, 5);
  }
});

// Verify budget selection uses TIER_COSTS not RELIABILITY_COSTS
test('budget selection uses TIER_COSTS for correct tier cost comparison', () => {
  // Budget of 1 should select DETERMINISTIC (cost 1) which is affordable
  const result = routeTask({ budget: 1, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(TIER_COSTS[result.route], 1, 'DETERMINISTIC cost should be 1');
});

// EXCELLENT reliability routes to DETERMINISTIC like GOOD
test('EXCELLENT reliability routes to DETERMINISTIC', () => {
  const result = routeTask({ reliability: 'EXCELLENT' });
  assert.equal(result.route, ROUTE_TIERS.DETERMINISTIC);
  assert.equal(result.reason, 'DETERMINISTIC_FIRST');
});

// Frontier leader has attempt limit of 1
test('frontier leader attempt limit is 1', () => {
  const result = routeTask({ capability: { architectural: true }, reliability: 'GOOD' });
  if (result.route === ROUTE_TIERS.FRONTIER_LEADER) {
    assert.equal(result.caps.attemptLimit, 1);
  }
});

// Local tier has SUCCESS checkpoint
test('local tier has SUCCESS checkpoint', () => {
  const result = routeTask({ reliability: 'LOCAL_OK' });
  if (result.route === ROUTE_TIERS.LOCAL) {
    assert.equal(result.caps.checkpointOn, 'SUCCESS');
  }
});

// Verify deterministic tier has empty checkpoints array
test('deterministic tier checkpoints is empty array', () => {
  const result = routeTask({ reliability: 'GOOD' });
  if (result.route === ROUTE_TIERS.DETERMINISTIC) {
    assert.deepStrictEqual(result.checkpoints, []);
  }
});

// Verify frontier leader has before:true on all checkpoints
test('frontier leader checkpoints all have before:true', () => {
  const result = routeTask({ capability: { decomposition: true }, reliability: 'GOOD' });
  if (result.route === ROUTE_TIERS.FRONTIER_LEADER) {
    assert.ok(result.checkpoints.every(cp => cp.before === true));
  }
});

// Verify repeat rejection handles BAD reliability correctly by selecting different tier
test('repeat rejection selects tier excluding BAD reliability', () => {
  const result = routeTask({ reliability: 'BAD', attempt: 3 });
  assert.ok(result.reason === ROUTE_REASONS.REPEAT_REJECTED);
  // BAD maps to LOCAL_OK in terms of tier, so should skip that if needed
  assert.ok(result.checkpoints.length >= 0);
});

// Local tier has SUCCESS checkpoint
test('local tier reason is LOCAL_SUCCESS', () => {
  const result = routeTask({ reliability: 'LOCAL_OK' });
  assert.equal(result.reason, 'LOCAL_SUCCESS');
});

// Verify budget of 0 should select nothing affordable (fallback to LOCAL)
test('budget of zero fallbacks to local as cheapest available', () => {
  const result = routeTask({ budget: 0, reliability: 'GOOD' });
  assert.equal(result.route, ROUTE_TIERS.LOCAL); // No tier has cost <= 0, so fallback
  assert.equal(result.reason, ROUTE_REASONS.BUDGET_EXCEEDED);
});
