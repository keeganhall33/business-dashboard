import type { ExternalCollectionJobStatus } from "@/lib/external-intelligence/orchestration/job-status";
import { applyRetryDecision, calculateRetryDecision, classifyCollectionFailure } from "@/lib/external-intelligence/orchestration/retry";

export type CollectionJobFailureInput = {
  now_iso: string;
  attempt_count: number;
  maximum_attempts: number;
  error_code: string;
  retry_after_seconds: number | null;
};

export type CollectionJobFailureOutcome = {
  next_status: ExternalCollectionJobStatus;
  next_retry_at_iso: string | null;
  failure_class: string;
  reason: string;
};

/**
 * Pure retry lifecycle application (B2): decides next job status without executing collectors.
 */
export function nextJobStateAfterFailure(input: CollectionJobFailureInput): CollectionJobFailureOutcome {
  const classification = classifyCollectionFailure({ error_code: input.error_code });
  const decision = calculateRetryDecision({
    now_iso: input.now_iso,
    attempt_count: input.attempt_count,
    maximum_attempts: input.maximum_attempts,
    failure_class: classification.failure_class,
    retry_after_seconds: input.retry_after_seconds
  });

  const applied = applyRetryDecision({
    classification,
    attempt_count: input.attempt_count,
    maximum_attempts: input.maximum_attempts,
    decision
  });

  return {
    next_status: applied.next_status,
    next_retry_at_iso: applied.next_retry_at_iso,
    failure_class: classification.failure_class,
    reason: decision.reason
  };
}
