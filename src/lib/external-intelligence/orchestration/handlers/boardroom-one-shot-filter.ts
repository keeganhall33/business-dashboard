export type BoardroomCollectedItemBase = {
  canonical_url: string;
  guid: string | null;
};

export type BoardroomOneShotFilter = {
  // Preferred: stable EvidenceReference IDs (computed from canonical_url).
  evidence_reference_ids?: string[];
  // Optional fallback: canonical URLs.
  canonical_urls?: string[];
};

export function normalizeBoardroomOneShotFilter(input: null | BoardroomOneShotFilter) {
  if (!input) return null;
  const ev = (input.evidence_reference_ids ?? []).map((s) => s.trim()).filter(Boolean);
  const urls = (input.canonical_urls ?? []).map((s) => s.trim()).filter(Boolean);
  if (!ev.length && !urls.length) return null;
  return Object.freeze({
    evidence_reference_ids: Object.freeze(ev),
    canonical_urls: Object.freeze(urls)
  });
}

/**
 * One-shot-only controlled recollection filter.
 *
 * Contract:
 * - Filtering is exact-match.
 * - Non-matching items must NOT be processed (no evidence/claims persisted).
 * - Does not change item identity semantics: caller supplies the compute function.
 */
export function filterBoardroomItemsForOneShot<T extends BoardroomCollectedItemBase>(input: {
  items: T[];
  filter: ReturnType<typeof normalizeBoardroomOneShotFilter>;
  computeEvidenceReferenceId: (input: { canonical_url: string }) => string;
}) {
  if (!input.filter) {
    return { filtered: input.items, skipped_count: 0, mode: "unfiltered" as const };
  }

  const allowedEvidenceIds = new Set(input.filter.evidence_reference_ids ?? []);
  const allowedUrls = new Set(input.filter.canonical_urls ?? []);

  const filtered: T[] = [];
  let skipped = 0;
  for (const item of input.items) {
    const evId = input.computeEvidenceReferenceId({ canonical_url: item.canonical_url });
    const ok = (allowedEvidenceIds.size ? allowedEvidenceIds.has(evId) : false) ||
      (allowedUrls.size ? allowedUrls.has(item.canonical_url) : false);
    if (ok) filtered.push(item);
    else skipped += 1;
  }

  return {
    filtered,
    skipped_count: skipped,
    mode: "filtered" as const,
    allowed: {
      evidence_reference_ids: Array.from(allowedEvidenceIds),
      canonical_urls: Array.from(allowedUrls)
    }
  };
}
