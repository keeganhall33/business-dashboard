export type GitHubCommitStatusV1 = {
  context?: string | null;
  state?: string | null;
  description?: string | null;
  updated_at?: string | null;
};

export type GitHubCombinedCommitStatusV1 = {
  sha?: string | null;
  statuses?: GitHubCommitStatusV1[] | null;
};

export type VercelDeploymentGateStateV1 = "READY" | "WAIT" | "BLOCKED";

export type VercelDeploymentGateReasonV1 =
  | "VERCEL_STATUS_SUCCESS"
  | "VERCEL_STATUS_PENDING"
  | "VERCEL_STATUS_NOT_YET_REPORTED"
  | "VERCEL_STATUS_FAILURE"
  | "VERCEL_STATUS_ERROR"
  | "VERCEL_STATUS_UNSUPPORTED"
  | "STATUS_RESPONSE_SHA_MISMATCH"
  | "STATUS_RESPONSE_MALFORMED";

export type VercelDeploymentGateV1 = {
  state: VercelDeploymentGateStateV1;
  reason: VercelDeploymentGateReasonV1;
  description: string | null;
  updatedAt: string | null;
};

function normalizedState(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isCanonicalVercelContext(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "vercel";
}

function timestampValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestVercelStatus(statuses: GitHubCommitStatusV1[]): GitHubCommitStatusV1 | null {
  const matches = statuses.filter((status) => isCanonicalVercelContext(status.context));
  if (matches.length === 0) return null;
  return [...matches].sort(
    (left, right) => timestampValue(right.updated_at) - timestampValue(left.updated_at),
  )[0] ?? null;
}

export function evaluateVercelDeploymentGateV1(
  response: GitHubCombinedCommitStatusV1,
  expectedReleaseSha: string,
): VercelDeploymentGateV1 {
  if (!expectedReleaseSha.trim()) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_MALFORMED",
      description: "Expected release SHA is missing.",
      updatedAt: null,
    };
  }

  if (response.sha && response.sha !== expectedReleaseSha) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_SHA_MISMATCH",
      description: null,
      updatedAt: null,
    };
  }

  if (!Array.isArray(response.statuses)) {
    return {
      state: "BLOCKED",
      reason: "STATUS_RESPONSE_MALFORMED",
      description: null,
      updatedAt: null,
    };
  }

  const vercelStatus = latestVercelStatus(response.statuses);
  if (!vercelStatus) {
    return {
      state: "WAIT",
      reason: "VERCEL_STATUS_NOT_YET_REPORTED",
      description: null,
      updatedAt: null,
    };
  }

  const state = normalizedState(vercelStatus.state);
  const common = {
    description: vercelStatus.description ?? null,
    updatedAt: vercelStatus.updated_at ?? null,
  };

  if (state === "success") {
    return { state: "READY", reason: "VERCEL_STATUS_SUCCESS", ...common };
  }

  if (state === "pending") {
    return { state: "WAIT", reason: "VERCEL_STATUS_PENDING", ...common };
  }

  if (state === "failure") {
    return { state: "BLOCKED", reason: "VERCEL_STATUS_FAILURE", ...common };
  }

  if (state === "error") {
    return { state: "BLOCKED", reason: "VERCEL_STATUS_ERROR", ...common };
  }

  return {
    state: "BLOCKED",
    reason: "VERCEL_STATUS_UNSUPPORTED",
    ...common,
  };
}
