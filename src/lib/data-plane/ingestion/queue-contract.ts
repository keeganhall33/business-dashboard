export const INGESTION_JOB_STATES = [
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "RETRY_WAIT",
  "SUCCEEDED",
  "DEAD_LETTERED",
  "CANCELLED",
] as const;

export type IngestionJobState = (typeof INGESTION_JOB_STATES)[number];

export const INGESTION_RUN_STATES = [
  "CLAIMED",
  "RUNNING",
  "SUCCEEDED",
  "RETRY_SCHEDULED",
  "DEAD_LETTERED",
] as const;

export type IngestionRunState = (typeof INGESTION_RUN_STATES)[number];

export const INGESTION_JOB_KINDS = [
  "INCREMENTAL",
  "BACKFILL",
  "RECONCILIATION",
] as const;

export type IngestionJobKind = (typeof INGESTION_JOB_KINDS)[number];

export const EXECUTABLE_INGESTION_VENUES = [
  "DASHBOARD_WORKER",
  "GITHUB_ACTIONS",
  "LOCAL_AUTHORIZED_WORKER",
] as const;

export type ExecutableIngestionVenue =
  (typeof EXECUTABLE_INGESTION_VENUES)[number];

export type ClaimedIngestionJob = {
  jobId: string;
  runId: string;
  sourceId: string;
  adapterIdentity: string;
  executionVenue: ExecutableIngestionVenue;
  jobKind: IngestionJobKind;
  attemptNumber: number;
  leaseToken: string;
  leaseExpiresAt: string;
  payload: Record<string, unknown>;
  cursorBefore: unknown | null;
  targetCoverageStart: string | null;
  targetCoverageEnd: string | null;
};

export function isClaimableIngestionState(
  state: IngestionJobState,
): state is "QUEUED" | "RETRY_WAIT" {
  return state === "QUEUED" || state === "RETRY_WAIT";
}

export function calculateRetryDelaySeconds(input: {
  attemptNumber: number;
  baseDelaySeconds: number;
  maximumDelaySeconds: number;
}): number | null {
  const { attemptNumber, baseDelaySeconds, maximumDelaySeconds } = input;
  if (
    !Number.isInteger(attemptNumber) ||
    attemptNumber < 1 ||
    !Number.isInteger(baseDelaySeconds) ||
    baseDelaySeconds < 1 ||
    !Number.isInteger(maximumDelaySeconds) ||
    maximumDelaySeconds < baseDelaySeconds
  ) {
    return null;
  }

  return Math.min(
    maximumDelaySeconds,
    baseDelaySeconds * 2 ** (attemptNumber - 1),
  );
}
