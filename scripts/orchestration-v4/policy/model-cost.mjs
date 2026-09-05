const ACTIONS = Object.freeze({
  PROCEED: 'PROCEED',
  COMPACT_OR_RETRIEVE: 'COMPACT_OR_RETRIEVE',
  SPLIT_OR_DEFER: 'SPLIT_OR_DEFER',
  BLOCK: 'BLOCK',
});

function finiteNonNegative(value, name, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`MODEL_COST_${name}_INVALID`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`MODEL_COST_${name}_INVALID`);
  return value;
}

function multiplier(pricing, mode) {
  const value = pricing?.modeMultipliers?.[mode ?? 'standard'] ?? (mode === 'standard' || mode == null ? 1 : null);
  if (value == null) throw new Error('MODEL_COST_MODE_UNKNOWN');
  return finiteNonNegative(value, 'MODE_MULTIPLIER');
}

function normalizedPricing(pricing) {
  if (!pricing?.version || !pricing?.effectiveAt) throw new Error('MODEL_COST_PRICING_VERSION_REQUIRED');
  return {
    freshInputPerMillion: finiteNonNegative(pricing.freshInputPerMillion, 'FRESH_INPUT_RATE'),
    cachedInputPerMillion: finiteNonNegative(pricing.cachedInputPerMillion ?? pricing.freshInputPerMillion, 'CACHED_INPUT_RATE'),
    outputPerMillion: finiteNonNegative(pricing.outputPerMillion, 'OUTPUT_RATE'),
    inputMultiplierAboveThreshold: finiteNonNegative(pricing.inputMultiplierAboveThreshold ?? 1, 'INPUT_THRESHOLD_MULTIPLIER'),
    outputMultiplierAboveThreshold: finiteNonNegative(pricing.outputMultiplierAboveThreshold ?? 1, 'OUTPUT_THRESHOLD_MULTIPLIER'),
  };
}

export function calculateModelCallCost({ usage, pricing, mode = 'standard' }) {
  const inputTokens = finiteNonNegative(usage?.inputTokens, 'INPUT_TOKENS', { integer: true });
  const cachedInputTokens = finiteNonNegative(usage?.cachedInputTokens ?? 0, 'CACHED_INPUT_TOKENS', { integer: true });
  const outputTokens = finiteNonNegative(usage?.outputTokens, 'OUTPUT_TOKENS', { integer: true });
  if (cachedInputTokens > inputTokens) throw new Error('MODEL_COST_CACHED_EXCEEDS_INPUT');
  const rates = normalizedPricing(pricing);
  const threshold = pricing.surchargeInputThreshold == null
    ? null
    : positiveInteger(pricing.surchargeInputThreshold, 'SURCHARGE_THRESHOLD');
  const overThreshold = threshold != null && inputTokens > threshold;
  const inputMultiplier = overThreshold ? rates.inputMultiplierAboveThreshold : 1;
  const outputMultiplier = overThreshold ? rates.outputMultiplierAboveThreshold : 1;
  const modeMultiplier = multiplier(pricing, mode);
  const freshInputTokens = inputTokens - cachedInputTokens;
  const freshInputUsd = freshInputTokens / 1e6 * rates.freshInputPerMillion * inputMultiplier * modeMultiplier;
  const cachedInputUsd = cachedInputTokens / 1e6 * rates.cachedInputPerMillion * inputMultiplier * modeMultiplier;
  const outputUsd = outputTokens / 1e6 * rates.outputPerMillion * outputMultiplier * modeMultiplier;
  return Object.freeze({
    pricingVersion: pricing.version,
    pricingEffectiveAt: pricing.effectiveAt,
    mode,
    inputTokens,
    freshInputTokens,
    cachedInputTokens,
    outputTokens,
    overThreshold,
    cacheHitRate: inputTokens === 0 ? 0 : cachedInputTokens / inputTokens,
    freshInputUsd,
    cachedInputUsd,
    outputUsd,
    totalUsd: freshInputUsd + cachedInputUsd + outputUsd,
  });
}

export function preflightModelCall({ estimate, limits, pricing, budget = {}, mode = 'standard' }) {
  const estimatedInputTokens = finiteNonNegative(estimate?.inputTokens, 'ESTIMATED_INPUT', { integer: true });
  const expectedCachedInputTokens = finiteNonNegative(estimate?.cachedInputTokens ?? 0, 'ESTIMATED_CACHED', { integer: true });
  const reservedOutputTokens = finiteNonNegative(estimate?.reservedOutputTokens, 'RESERVED_OUTPUT', { integer: true });
  if (expectedCachedInputTokens > estimatedInputTokens) throw new Error('MODEL_COST_CACHED_EXCEEDS_INPUT');
  const contextWindow = positiveInteger(limits?.contextWindow, 'CONTEXT_WINDOW');
  const maxInputTokens = limits.maxInputTokens == null ? contextWindow : positiveInteger(limits.maxInputTokens, 'MAX_INPUT');
  const tokensPerMinute = limits.tokensPerMinute == null ? null : positiveInteger(limits.tokensPerMinute, 'TPM');
  const totalReservedTokens = estimatedInputTokens + reservedOutputTokens;
  const estimatedCost = calculateModelCallCost({
    usage: { inputTokens: estimatedInputTokens, cachedInputTokens: expectedCachedInputTokens, outputTokens: reservedOutputTokens },
    pricing,
    mode,
  });
  const reasons = [];
  let action = ACTIONS.PROCEED;
  if (estimatedInputTokens > maxInputTokens || totalReservedTokens > contextWindow) {
    action = ACTIONS.BLOCK;
    reasons.push('CONTEXT_LIMIT_EXCEEDED');
  }
  if (tokensPerMinute != null && totalReservedTokens > tokensPerMinute) {
    action = action === ACTIONS.BLOCK ? action : ACTIONS.SPLIT_OR_DEFER;
    reasons.push('RATE_LIMIT_EXCEEDED');
  }
  const headroomInputTokens = budget.maxInputTokens == null ? null : positiveInteger(budget.maxInputTokens, 'BUDGET_INPUT');
  if (headroomInputTokens != null && estimatedInputTokens > headroomInputTokens) {
    action = action === ACTIONS.BLOCK ? action : ACTIONS.COMPACT_OR_RETRIEVE;
    reasons.push('INPUT_BUDGET_EXCEEDED');
  }
  const maxEstimatedUsd = budget.maxEstimatedUsd == null ? null : finiteNonNegative(budget.maxEstimatedUsd, 'USD_BUDGET');
  if (maxEstimatedUsd != null && estimatedCost.totalUsd > maxEstimatedUsd) {
    action = ACTIONS.BLOCK;
    reasons.push('COST_BUDGET_EXCEEDED');
  }
  if (estimatedCost.overThreshold) {
    action = action === ACTIONS.PROCEED ? ACTIONS.COMPACT_OR_RETRIEVE : action;
    reasons.push('PRICING_THRESHOLD_CROSSED');
  }
  return Object.freeze({ action, reasons: Object.freeze([...new Set(reasons)]), totalReservedTokens, estimatedCost });
}

export function analyzePromptCache({ calls, minimumExpectedHitRate = 0.25 }) {
  finiteNonNegative(minimumExpectedHitRate, 'MINIMUM_CACHE_RATE');
  if (minimumExpectedHitRate > 1) throw new Error('MODEL_COST_MINIMUM_CACHE_RATE_INVALID');
  if (!Array.isArray(calls)) throw new Error('MODEL_COST_CALLS_REQUIRED');
  let inputTokens = 0;
  let cachedInputTokens = 0;
  const prefixFingerprints = new Set();
  for (const call of calls) {
    const input = finiteNonNegative(call?.inputTokens, 'INPUT_TOKENS', { integer: true });
    const cached = finiteNonNegative(call?.cachedInputTokens ?? 0, 'CACHED_INPUT_TOKENS', { integer: true });
    if (cached > input) throw new Error('MODEL_COST_CACHED_EXCEEDS_INPUT');
    inputTokens += input;
    cachedInputTokens += cached;
    if (call?.prefixFingerprint) prefixFingerprints.add(String(call.prefixFingerprint));
  }
  const cacheHitRate = inputTokens === 0 ? null : cachedInputTokens / inputTokens;
  const unstablePrefix = calls.length > 1 && prefixFingerprints.size > 1;
  return Object.freeze({
    callCount: calls.length,
    inputTokens,
    cachedInputTokens,
    cacheHitRate,
    unstablePrefix,
    status: cacheHitRate == null ? 'UNKNOWN' : cacheHitRate < minimumExpectedHitRate ? 'LOW' : 'HEALTHY',
  });
}

export { ACTIONS as MODEL_COST_ACTIONS };
