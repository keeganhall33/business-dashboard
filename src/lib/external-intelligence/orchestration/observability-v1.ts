import "@/lib/server-only";

export type ReasonCodeCounts = Record<string, number>;

export type StageErrorCountsV1 = {
  collector: number;
  evidence_persistence: number;
  qualification: number;
  claim_persistence: number;
  sports_milestone_persistence: number;
};

export type ExternalCollectionObservabilityV1 = {
  collection: {
    fetched_items: number;
    selected_items: number;
    skipped_items: number;
  };

  evidence: {
    processed: number;
    new_versions: number;
    idempotent_replays: number;
    errors: number;
  };

  qualification: {
    processed: number;
    qualified: number;
    not_qualified: number;
    unsupported: number;
    errors: number;
    reason_codes: ReasonCodeCounts;
  };

  claims: {
    proposed: number;
    persistence_attempts: number;
    new_versions: number;
    idempotent_replays: number;
    errors: number;
  };

  sports_milestones: {
    proposed: number;
    persistence_attempts: number;
    persisted: number;
    errors: number;
  };
};

export function emptyExternalCollectionObservabilityV1(input: {
  fetched_items: number;
  selected_items: number;
  skipped_items: number;
}): ExternalCollectionObservabilityV1 {
  return Object.freeze({
    collection: {
      fetched_items: input.fetched_items,
      selected_items: input.selected_items,
      skipped_items: input.skipped_items
    },
    evidence: { processed: 0, new_versions: 0, idempotent_replays: 0, errors: 0 },
    qualification: {
      processed: 0,
      qualified: 0,
      not_qualified: 0,
      unsupported: 0,
      errors: 0,
      reason_codes: {}
    },
    claims: { proposed: 0, persistence_attempts: 0, new_versions: 0, idempotent_replays: 0, errors: 0 },
    sports_milestones: { proposed: 0, persistence_attempts: 0, persisted: 0, errors: 0 }
  });
}

export function bumpReasonCodes(counts: ReasonCodeCounts, reason_codes: string[]): ReasonCodeCounts {
  if (!reason_codes.length) return counts;
  const next: ReasonCodeCounts = { ...counts };
  for (const code of reason_codes) {
    const k = String(code || "unknown");
    next[k] = (next[k] ?? 0) + 1;
  }
  return next;
}

