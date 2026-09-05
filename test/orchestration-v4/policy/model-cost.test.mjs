import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePromptCache, calculateModelCallCost, preflightModelCall } from '../../../scripts/orchestration-v4/policy/model-cost.mjs';

const pricing = {
  version: 'test-2026-09-05',
  effectiveAt: '2026-09-05T00:00:00Z',
  freshInputPerMillion: 10,
  cachedInputPerMillion: 1,
  outputPerMillion: 50,
  surchargeInputThreshold: 272_000,
  inputMultiplierAboveThreshold: 2,
  outputMultiplierAboveThreshold: 1.5,
  modeMultipliers: { standard: 1, deferred: 0.5, fast: 2 },
};

test('cost separates fresh cached and output components with independent multipliers', () => {
  const cost = calculateModelCallCost({
    usage: { inputTokens: 300_000, cachedInputTokens: 200_000, outputTokens: 20_000 },
    pricing,
  });
  assert.equal(cost.overThreshold, true);
  assert.equal(cost.freshInputUsd, 2);
  assert.equal(cost.cachedInputUsd, 0.4);
  assert.equal(cost.outputUsd, 1.5);
  assert.equal(cost.totalUsd, 3.9);
  assert.equal(cost.cacheHitRate, 2 / 3);
});

test('processing mode changes price without changing token facts', () => {
  const usage = { inputTokens: 100_000, cachedInputTokens: 0, outputTokens: 10_000 };
  const standard = calculateModelCallCost({ usage, pricing });
  const deferred = calculateModelCallCost({ usage, pricing, mode: 'deferred' });
  const fast = calculateModelCallCost({ usage, pricing, mode: 'fast' });
  assert.equal(deferred.totalUsd, standard.totalUsd / 2);
  assert.equal(fast.totalUsd, standard.totalUsd * 2);
});

test('preflight proceeds within context rate price and budget limits', () => {
  const result = preflightModelCall({
    estimate: { inputTokens: 100_000, cachedInputTokens: 50_000, reservedOutputTokens: 10_000 },
    limits: { contextWindow: 1_000_000, maxInputTokens: 900_000, tokensPerMinute: 500_000 },
    pricing,
    budget: { maxInputTokens: 250_000, maxEstimatedUsd: 10 },
  });
  assert.equal(result.action, 'PROCEED');
  assert.deepEqual(result.reasons, []);
});

test('preflight recommends retrieval before a pricing or input-budget cliff', () => {
  const result = preflightModelCall({
    estimate: { inputTokens: 280_000, cachedInputTokens: 0, reservedOutputTokens: 10_000 },
    limits: { contextWindow: 1_000_000, tokensPerMinute: 2_000_000 },
    pricing,
    budget: { maxInputTokens: 260_000, maxEstimatedUsd: 20 },
  });
  assert.equal(result.action, 'COMPACT_OR_RETRIEVE');
  assert.deepEqual(result.reasons, ['INPUT_BUDGET_EXCEEDED', 'PRICING_THRESHOLD_CROSSED']);
});

test('preflight distinguishes rate-limit deferral from impossible context and cost', () => {
  const rate = preflightModelCall({
    estimate: { inputTokens: 400_000, reservedOutputTokens: 20_000 },
    limits: { contextWindow: 1_000_000, tokensPerMinute: 300_000 }, pricing,
  });
  assert.equal(rate.action, 'SPLIT_OR_DEFER');
  assert.ok(rate.reasons.includes('RATE_LIMIT_EXCEEDED'));

  const context = preflightModelCall({
    estimate: { inputTokens: 950_000, reservedOutputTokens: 100_000 },
    limits: { contextWindow: 1_000_000, tokensPerMinute: 500_000 }, pricing,
  });
  assert.equal(context.action, 'BLOCK');
  assert.ok(context.reasons.includes('CONTEXT_LIMIT_EXCEEDED'));
  assert.ok(context.reasons.includes('RATE_LIMIT_EXCEEDED'));

  const cost = preflightModelCall({
    estimate: { inputTokens: 100_000, reservedOutputTokens: 10_000 },
    limits: { contextWindow: 1_000_000 }, pricing, budget: { maxEstimatedUsd: 0.01 },
  });
  assert.equal(cost.action, 'BLOCK');
  assert.ok(cost.reasons.includes('COST_BUDGET_EXCEEDED'));
});

test('cache analysis exposes low reuse and unstable prefixes without guessing a cause', () => {
  const result = analyzePromptCache({ calls: [
    { inputTokens: 1000, cachedInputTokens: 100, prefixFingerprint: 'a' },
    { inputTokens: 1000, cachedInputTokens: 0, prefixFingerprint: 'b' },
  ] });
  assert.equal(result.cacheHitRate, 0.05);
  assert.equal(result.status, 'LOW');
  assert.equal(result.unstablePrefix, true);
});

test('unknown cache evidence stays unknown and malformed inputs fail closed', () => {
  assert.deepEqual(analyzePromptCache({ calls: [] }), {
    callCount: 0, inputTokens: 0, cachedInputTokens: 0, cacheHitRate: null, unstablePrefix: false, status: 'UNKNOWN',
  });
  assert.throws(() => calculateModelCallCost({ usage: { inputTokens: 1, cachedInputTokens: 2, outputTokens: 0 }, pricing }), /CACHED_EXCEEDS_INPUT/);
  assert.throws(() => preflightModelCall({ estimate: { inputTokens: -1, reservedOutputTokens: 0 }, limits: { contextWindow: 10 }, pricing }), /ESTIMATED_INPUT_INVALID/);
  assert.throws(() => calculateModelCallCost({ usage: { inputTokens: 1, outputTokens: 1 }, pricing, mode: 'invented' }), /MODE_UNKNOWN/);
});
