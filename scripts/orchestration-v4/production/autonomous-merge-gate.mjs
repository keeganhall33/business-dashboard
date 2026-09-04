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
