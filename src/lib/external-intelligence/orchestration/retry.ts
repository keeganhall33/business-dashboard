import type { FailureClass } from "@/lib/external-intelligence/orchestration/job-status";
import { computeExponentialBackoffSeconds } from "@/lib/external-intelligence/orchestration/retry-policy";

export type RetryClassification = {
  failure_class: FailureClass;
  retryable: boolean;
  blocking: boolean;
};

export function classifyCollectionFailure(input: { error_code: string }): RetryClassification {
  const c = input.error_code;

  const retryable: FailureClass[] = [
    "transient_network",
    "timeout",
    "upstream_5xx",
    "rate_limited",
    "temporary_access_degradation",
    "lease_expired"
  ];

  const blocking: FailureClass[] = [
    "terms_expired",
    "access_revoked",
    "credential_missing",
    "licensing_blocked",
    "legal_block",
    "eligibility_revoked"
  ];

  const permanent: FailureClass[] = [
    "invalid_configuration",
    "unsupported_adapter",
    "malformed_response",
    "schema_mismatch"
  ];

  const all = [...retryable, ...blocking, ...permanent];
  const failure_class = (all.includes(c as FailureClass) ? (c as FailureClass) : "invalid_configuration") as FailureClass;

  return {
    failure_class,
    retryable: retryable.includes(failure_class),
    blocking: blocking.includes(failure_class)
  };
}

export function calculateRetryDecision(input: {
  now_iso: string;
  attempt_count: number;
  maximum_attempts: number;
  failure_class: FailureClass;
  retry_after_seconds: number | null;
}): { action: "no_retry" | "retry_at"; next_retry_at_iso: string | null; reason: string } {
  if (input.attempt_count >= input.maximum_attempts) {
    return { action: "no_retry", next_retry_at_iso: null, reason: "maximum_attempts_exhausted" };
  }

  if (input.failure_class === "rate_limited" && input.retry_after_seconds && input.retry_after_seconds > 0) {
    const next = new Date(Date.parse(input.now_iso) + input.retry_after_seconds * 1000).toISOString();
    return { action: "retry_at", next_retry_at_iso: next, reason: "retry_after" };
  }

  const delay = computeExponentialBackoffSeconds({ attempt_count: input.attempt_count, base_seconds: 30, max_seconds: 3600 });
  const next = new Date(Date.parse(input.now_iso) + delay * 1000).toISOString();
  return { action: "retry_at", next_retry_at_iso: next, reason: "bounded_exponential" };
}

export function applyRetryDecision(input: {
  classification: ReturnType<typeof classifyCollectionFailure>;
  attempt_count: number;
  maximum_attempts: number;
  decision: ReturnType<typeof calculateRetryDecision>;
}): { next_status: "retry_wait" | "blocked" | "failed"; next_retry_at_iso: string | null } {
  if (input.classification.blocking) return { next_status: "blocked", next_retry_at_iso: null };
  if (!input.classification.retryable) return { next_status: "failed", next_retry_at_iso: null };

  if (input.decision.action === "no_retry") return { next_status: "failed", next_retry_at_iso: null };
  return { next_status: "retry_wait", next_retry_at_iso: input.decision.next_retry_at_iso };
}
