import path from 'node:path';

export const AUTONOMOUS_MERGE_BLOCK_REASONS = Object.freeze({
  PR_NOT_OPEN: 'PR_NOT_OPEN',
  PR_DRAFT: 'PR_DRAFT',
  PR_NOT_MERGEABLE: 'PR_NOT_MERGEABLE',
  WRONG_BASE: 'WRONG_BASE',
  HEAD_MOVED: 'HEAD_MOVED',
  EMPTY_DIFF: 'EMPTY_DIFF',
  INVALID_CHANGED_PATH: 'INVALID_CHANGED_PATH',
  OWNERSHIP_MISSING: 'OWNERSHIP_MISSING',
  UNOWNED_CHANGE: 'UNOWNED_CHANGE',
  PUBLICATION_NOT_VERIFIED: 'PUBLICATION_NOT_VERIFIED',
  VALIDATION_INCOMPLETE: 'VALIDATION_INCOMPLETE',
  CI_INCOMPLETE: 'CI_INCOMPLETE',
  CI_FAILED: 'CI_FAILED',
  INDEPENDENT_REVIEW_MISSING: 'INDEPENDENT_REVIEW_MISSING',
  REVIEW_REJECTED: 'REVIEW_REJECTED',
  REVIEW_HEAD_MISMATCH: 'REVIEW_HEAD_MISMATCH',
  UNRESOLVED_REVIEW_THREADS: 'UNRESOLVED_REVIEW_THREADS',
});

export const DELIVERY_CONTINUITY_STATES = Object.freeze({
  IMPLEMENTING: 'IMPLEMENTING',
  PR_OPEN: 'PR_OPEN',
  CI_PENDING: 'CI_PENDING',
  CI_FAILED: 'CI_FAILED',
  REVIEW_PENDING: 'REVIEW_PENDING',
  MERGE_READY: 'MERGE_READY',
  MERGING: 'MERGING',
  DEPLOY_PENDING: 'DEPLOY_PENDING',
  DEPLOYED: 'DEPLOYED',
  BLOCKED: 'BLOCKED',
});

const RETRYABLE_MERGE_FAILURES = new Set(['MERGE_TEMPORARILY_UNAVAILABLE', 'MERGE_QUEUE_BUSY', 'RATE_LIMITED']);

function continuityResult(state, extra = {}) {
  return Object.freeze({ contractVersion: 'PrToDeployContinuityV1', state, ...extra });
}

export function classifyPrDeliveryObservation(observation = {}) {
  if (!observation.pr) return continuityResult(DELIVERY_CONTINUITY_STATES.IMPLEMENTING);
  if (observation.pr.state === 'merged') return continuityResult(DELIVERY_CONTINUITY_STATES.DEPLOY_PENDING, { mergeSha: observation.pr.mergeSha || null });
  if (observation.pr.state !== 'open' || observation.pr.draft || observation.pr.mergeable === false) {
    return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, { blocker: 'PR_NOT_SAFELY_OPEN' });
  }
  if (observation.pr.headSha !== observation.expectedHeadSha) {
    return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, { blocker: 'HEAD_MOVED' });
  }
  if (observation.ci?.status !== 'completed') return continuityResult(DELIVERY_CONTINUITY_STATES.CI_PENDING);
  if (observation.ci?.conclusion !== 'success') return continuityResult(DELIVERY_CONTINUITY_STATES.CI_FAILED, { blocker: 'CI_FAILED' });
  if (observation.review?.independent !== true
    || observation.review?.decision !== 'APPROVE'
    || observation.review?.reviewedHeadSha !== observation.expectedHeadSha
    || Number(observation.review?.unresolvedThreads || 0) > 0) {
    return continuityResult(DELIVERY_CONTINUITY_STATES.REVIEW_PENDING);
  }
  return continuityResult(DELIVERY_CONTINUITY_STATES.MERGE_READY);
}

export async function runPrToDeployContinuity({
  expectedHeadSha,
  gateInput,
  observePr,
  mergePr,
  observeDeployment,
  timeoutMs = 60 * 60_000,
  pollMs = 20_000,
  maxMergeAttempts = 2,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onState = () => {},
} = {}) {
  if (!expectedHeadSha || typeof observePr !== 'function' || typeof mergePr !== 'function' || typeof observeDeployment !== 'function') {
    throw new Error('V4_DELIVERY_CONTINUITY_CONFIG_INVALID');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2 * 60 * 60_000
    || !Number.isInteger(pollMs) || pollMs <= 0 || pollMs > timeoutMs
    || !Number.isInteger(maxMergeAttempts) || maxMergeAttempts < 1 || maxMergeAttempts > 2) {
    throw new Error('V4_DELIVERY_CONTINUITY_BOUNDS_INVALID');
  }
  const startedAt = now();
  let mergeAttempts = 0;
  let mergeSha = null;
  let lastState = DELIVERY_CONTINUITY_STATES.PR_OPEN;

  while (now() - startedAt <= timeoutMs) {
    if (!mergeSha) {
      const observation = await observePr();
      const classified = classifyPrDeliveryObservation({ ...observation, expectedHeadSha });
      lastState = classified.state;
      onState(classified);
      if (classified.state === DELIVERY_CONTINUITY_STATES.BLOCKED || classified.state === DELIVERY_CONTINUITY_STATES.CI_FAILED) return classified;
      if (classified.state === DELIVERY_CONTINUITY_STATES.DEPLOY_PENDING) {
        mergeSha = classified.mergeSha;
      } else if (classified.state === DELIVERY_CONTINUITY_STATES.MERGE_READY) {
        const gate = evaluateAutonomousMergeGate({ ...gateInput, ...observation, expectedHeadSha });
        if (!gate.allowed) return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, { blocker: gate.reasons[0] || 'MERGE_GATE_BLOCKED', gate });
        mergeAttempts += 1;
        try {
          const merged = await mergePr({ expectedHeadSha, attempt: mergeAttempts });
          mergeSha = merged?.mergeSha || null;
          if (!mergeSha) throw Object.assign(new Error('MERGE_RESULT_MISSING'), { code: 'MERGE_RESULT_MISSING' });
          lastState = DELIVERY_CONTINUITY_STATES.MERGING;
          onState(continuityResult(lastState, { mergeSha, mergeAttempts }));
        } catch (error) {
          const code = String(error?.code || error?.message || 'MERGE_FAILED');
          if (!RETRYABLE_MERGE_FAILURES.has(code) || mergeAttempts >= maxMergeAttempts) {
            return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, { blocker: code, mergeAttempts });
          }
        }
      }
    }

    if (mergeSha) {
      const deployment = await observeDeployment({ mergeSha });
      if (deployment?.state === 'DEPLOYED') {
        const complete = continuityResult(DELIVERY_CONTINUITY_STATES.DEPLOYED, { mergeSha, deployment, mergeAttempts });
        onState(complete);
        return complete;
      }
      if (deployment?.state === 'DEPLOY_FAILED') return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, { blocker: 'DEPLOY_FAILED', mergeSha, deployment, mergeAttempts });
      lastState = DELIVERY_CONTINUITY_STATES.DEPLOY_PENDING;
      onState(continuityResult(lastState, { mergeSha, deployment, mergeAttempts }));
    }
    await sleep(pollMs);
  }
  return continuityResult(DELIVERY_CONTINUITY_STATES.BLOCKED, {
    blocker: mergeSha ? 'DEPLOY_TIMEOUT' : `${lastState}_TIMEOUT`,
    mergeSha,
    mergeAttempts,
  });
}

function normalizeRelative(value) {
  const raw = String(value ?? '').trim().replaceAll('\\', '/');
  if (!raw || raw.startsWith('/')) return null;
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function normalizeOwnership(fileOwnership) {
  const values = Array.isArray(fileOwnership)
    ? fileOwnership
    : String(fileOwnership ?? '').split(',');
  return values.map(normalizeRelative).filter(Boolean);
}

function isOwned(relativePath, ownership) {
  return ownership.some((owned) => relativePath === owned || relativePath.startsWith(`${owned}/`));
}

export function evaluateAutonomousMergeGate({
  pr,
  expectedHeadSha,
  changedPaths,
  fileOwnership,
  publication,
  validation,
  ci,
  review,
  requiredBase = 'main',
} = {}) {
  const reasons = [];
  const add = (reason) => { if (!reasons.includes(reason)) reasons.push(reason); };

  if (pr?.state !== 'open') add(AUTONOMOUS_MERGE_BLOCK_REASONS.PR_NOT_OPEN);
  if (pr?.draft === true) add(AUTONOMOUS_MERGE_BLOCK_REASONS.PR_DRAFT);
  if (pr?.mergeable !== true) add(AUTONOMOUS_MERGE_BLOCK_REASONS.PR_NOT_MERGEABLE);
  if (String(pr?.base ?? '') !== requiredBase) add(AUTONOMOUS_MERGE_BLOCK_REASONS.WRONG_BASE);
  if (!expectedHeadSha || !pr?.headSha || pr.headSha !== expectedHeadSha) add(AUTONOMOUS_MERGE_BLOCK_REASONS.HEAD_MOVED);

  const rawChanges = Array.isArray(changedPaths) ? changedPaths : [];
  const normalizedChanges = [];
  const invalidChangedPaths = [];
  for (const rawPath of rawChanges) {
    const normalized = normalizeRelative(rawPath);
    if (!normalized) invalidChangedPaths.push(String(rawPath ?? ''));
    else normalizedChanges.push(normalized);
  }
  if (normalizedChanges.length === 0) add(AUTONOMOUS_MERGE_BLOCK_REASONS.EMPTY_DIFF);
  if (invalidChangedPaths.length > 0) add(AUTONOMOUS_MERGE_BLOCK_REASONS.INVALID_CHANGED_PATH);

  const ownership = normalizeOwnership(fileOwnership);
  if (ownership.length === 0) add(AUTONOMOUS_MERGE_BLOCK_REASONS.OWNERSHIP_MISSING);
  const unownedChangedPaths = normalizedChanges.filter((relativePath) => !isOwned(relativePath, ownership));
  if (unownedChangedPaths.length > 0) add(AUTONOMOUS_MERGE_BLOCK_REASONS.UNOWNED_CHANGE);

  if (publication?.ownedMutationVerified !== true || publication?.commitOwnershipVerified !== true) {
    add(AUTONOMOUS_MERGE_BLOCK_REASONS.PUBLICATION_NOT_VERIFIED);
  }

  if (validation?.focusedTestsPassed !== true || validation?.diffCheckPassed !== true) {
    add(AUTONOMOUS_MERGE_BLOCK_REASONS.VALIDATION_INCOMPLETE);
  }

  if (ci?.status !== 'completed') add(AUTONOMOUS_MERGE_BLOCK_REASONS.CI_INCOMPLETE);
  else if (ci?.conclusion !== 'success') add(AUTONOMOUS_MERGE_BLOCK_REASONS.CI_FAILED);

  if (review?.independent === true) {
    if (review?.decision !== 'APPROVE') add(AUTONOMOUS_MERGE_BLOCK_REASONS.REVIEW_REJECTED);
    if (!expectedHeadSha || review?.reviewedHeadSha !== expectedHeadSha) add(AUTONOMOUS_MERGE_BLOCK_REASONS.REVIEW_HEAD_MISMATCH);
  } else {
    add(AUTONOMOUS_MERGE_BLOCK_REASONS.INDEPENDENT_REVIEW_MISSING);
  }
  if (Number(review?.unresolvedThreads ?? 0) > 0) add(AUTONOMOUS_MERGE_BLOCK_REASONS.UNRESOLVED_REVIEW_THREADS);

  return {
    allowed: reasons.length === 0,
    reasons,
    changedPaths: normalizedChanges,
    invalidChangedPaths,
    unownedChangedPaths,
    ownership,
    expectedHeadSha: expectedHeadSha ?? null,
    observedHeadSha: pr?.headSha ?? null,
    reviewedHeadSha: review?.reviewedHeadSha ?? null,
  };
}
