import "@/lib/server-only";

export type InternalOrchestrationJobKey =
  | "external-source-watchdog-v1"
  | "milestone-horizon-scan-v1"
  | "expired-lease-recovery-v1"
  | "expired-milestone-alert-cleanup-v1";

export type InternalOrchestrationJobDefinition = {
  job_name: InternalOrchestrationJobKey;
  job_version: string;

  enabled: boolean;
  environment: "production" | "staging" | "local";

  cadence: { type: "hourly" | "daily"; minutes?: number };
  timeout_seconds: number;
  maximum_attempts: number;

  concurrency_key: string;
  handler_identity: string;

  next_run_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;

  review_by: string;
  governing_policy_version: string;
};

/**
 * Code-defined B3 internal orchestration jobs.
 *
 * NOTE: these definitions do not enable scheduling on their own.
 * Production activation is a later staged rollout.
 */
export const INTERNAL_ORCHESTRATION_JOBS_V1: ReadonlyArray<InternalOrchestrationJobDefinition> = [
  {
    job_name: "external-source-watchdog-v1",
    job_version: "v1",
    enabled: false,
    environment: "production",
    cadence: { type: "daily" },
    timeout_seconds: 60,
    maximum_attempts: 3,
    concurrency_key: "internal:watchdog",
    handler_identity: "external-intelligence.watchdog.persist.v1",
    next_run_at: null,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    review_by: "owner",
    governing_policy_version: "v1"
  },
  {
    job_name: "milestone-horizon-scan-v1",
    job_version: "v1",
    enabled: false,
    environment: "production",
    cadence: { type: "daily" },
    timeout_seconds: 60,
    maximum_attempts: 3,
    concurrency_key: "internal:milestone_horizon_scan",
    handler_identity: "external-intelligence.milestones.horizon_scan.v1",
    next_run_at: null,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    review_by: "owner",
    governing_policy_version: "v1"
  },
  {
    job_name: "expired-lease-recovery-v1",
    job_version: "v1",
    enabled: false,
    environment: "production",
    cadence: { type: "hourly", minutes: 60 },
    timeout_seconds: 30,
    maximum_attempts: 3,
    concurrency_key: "internal:lease_recovery",
    handler_identity: "external-intelligence.orchestration.lease_recovery.v1",
    next_run_at: null,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    review_by: "owner",
    governing_policy_version: "v1"
  },
  {
    job_name: "expired-milestone-alert-cleanup-v1",
    job_version: "v1",
    enabled: false,
    environment: "production",
    cadence: { type: "daily" },
    timeout_seconds: 60,
    maximum_attempts: 3,
    concurrency_key: "internal:milestone_alert_cleanup",
    handler_identity: "external-intelligence.milestones.alert_cleanup.v1",
    next_run_at: null,
    last_run_at: null,
    last_success_at: null,
    last_failure_at: null,
    review_by: "owner",
    governing_policy_version: "v1"
  }
] as const;

