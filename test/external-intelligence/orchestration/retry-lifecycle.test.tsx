import test from "node:test";
import assert from "node:assert/strict";

import { nextJobStateAfterFailure } from "@/lib/external-intelligence/orchestration/job-retry-lifecycle";

test("retry lifecycle: retryable failures go to retry_wait with bounded backoff", () => {
  const out = nextJobStateAfterFailure({
    now_iso: "2026-08-05T00:00:00.000Z",
    attempt_count: 0,
    maximum_attempts: 3,
    error_code: "timeout",
    retry_after_seconds: null
  });

  assert.equal(out.next_status, "retry_wait");
  assert.ok(out.next_retry_at_iso);
});

test("retry lifecycle: blocking failures become blocked", () => {
  const out = nextJobStateAfterFailure({
    now_iso: "2026-08-05T00:00:00.000Z",
    attempt_count: 0,
    maximum_attempts: 3,
    error_code: "terms_expired",
    retry_after_seconds: null
  });

  assert.equal(out.next_status, "blocked");
  assert.equal(out.next_retry_at_iso, null);
});

test("retry lifecycle: permanent failures become failed", () => {
  const out = nextJobStateAfterFailure({
    now_iso: "2026-08-05T00:00:00.000Z",
    attempt_count: 0,
    maximum_attempts: 3,
    error_code: "schema_mismatch",
    retry_after_seconds: null
  });

  assert.equal(out.next_status, "failed");
  assert.equal(out.next_retry_at_iso, null);
});

test("retry lifecycle: exhausted attempts becomes failed", () => {
  const out = nextJobStateAfterFailure({
    now_iso: "2026-08-05T00:00:00.000Z",
    attempt_count: 3,
    maximum_attempts: 3,
    error_code: "timeout",
    retry_after_seconds: null
  });

  assert.equal(out.next_status, "failed");
  assert.equal(out.next_retry_at_iso, null);
});

test("retry lifecycle: handler_timeout is treated as retryable timeout", () => {
  const out = nextJobStateAfterFailure({
    now_iso: "2026-08-05T00:00:00.000Z",
    attempt_count: 0,
    maximum_attempts: 2,
    error_code: "handler_timeout",
    retry_after_seconds: null
  });

  assert.equal(out.failure_class, "timeout");
  assert.equal(out.next_status, "retry_wait");
  assert.ok(out.next_retry_at_iso);
});
