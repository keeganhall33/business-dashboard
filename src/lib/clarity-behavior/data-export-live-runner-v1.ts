import {
  fetchAuthorizedClarityDataExportV1,
  type ClarityDataExportAuthorizedFetchResultV1,
} from "./data-export-authorized-fetch-v1";
import {
  planClarityDataExportRequestV1,
  type ClarityDataExportRequestPlanV1,
} from "./data-export-request-plan-v1";
import {
  adaptClarityDataExportResponseV1,
  type ClarityDataExportResponseAdapterResultV1,
} from "./data-export-response-adapter-v1";
import type { ClarityEvidenceTruthState } from "./view-model-v1";

export const CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION =
  "CLARITY_DATA_EXPORT_LIVE_RUNNER_V1" as const;

export type ClarityDataExportLiveRunnerReasonV1 =
  | "ADAPTED"
  | "INVALID_INPUT"
  | "REQUEST_TIME_UNAVAILABLE"
  | "PLAN_BLOCKED"
  | "FETCH_REJECTED"
  | "FETCH_RESULT_INTEGRITY_MISMATCH"
  | "EVALUATION_TIME_INVALID"
  | "ADAPTER_REJECTED";

export type ClarityDataExportLiveRunnerInputV1 = Readonly<{
  lookbackDays: number;
  dimensions: readonly string[];
  requestsUsedInCurrentQuotaWindow: number | null;
  quotaEvidenceRef: string | null;
  bearerToken: string;
  sourceTruth: ClarityEvidenceTruthState;
  maxAgeHours: number;
  evidenceRef: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}>;

export type ClarityDataExportLiveRunnerResultV1 = Readonly<{
  version: typeof CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION;
  state:
    | "ADAPTED"
    | "REJECTED_BEFORE_FETCH"
    | "FETCH_REJECTED"
    | "ADAPTER_REJECTED";
  reasonCode: ClarityDataExportLiveRunnerReasonV1;
  plan: ClarityDataExportRequestPlanV1 | null;
  fetchResult: ClarityDataExportAuthorizedFetchResultV1 | null;
  adapterResult: ClarityDataExportResponseAdapterResultV1 | null;
  chronology: Readonly<{
    requestStartedAt: string | null;
    responseReceivedAt: string | null;
    evaluatedAt: string | null;
  }>;
  provenance: Readonly<{
    requestStartCapturedByRunner: boolean;
    observedWindowBoundToAuthorizedFetch: boolean;
    extractedAtBoundToAuthorizedFetch: boolean;
    sourceTruthSuppliedExplicitly: boolean;
    sourceTruthInferredFromHttpStatus: false;
    transportEvidenceRefs: readonly string[];
  }>;
  privacy: Readonly<{
    bearerTokenReturned: false;
  }>;
  authority: Readonly<{
    networkCallPerformed: boolean;
    authorizationHeaderUsed: boolean;
    persistencePerformed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  }>;
}>;

const ALLOWED_SOURCE_TRUTHS = new Set<ClarityEvidenceTruthState>([
  "COMPLETE",
  "PARTIAL",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "UNAVAILABLE",
]);
const ALLOWED_INPUT_KEYS = new Set([
  "lookbackDays",
  "dimensions",
  "requestsUsedInCurrentQuotaWindow",
  "quotaEvidenceRef",
  "bearerToken",
  "sourceTruth",
  "maxAgeHours",
  "evidenceRef",
  "fetchImpl",
  "now",
  "timeoutMs",
  "maxResponseBytes",
]);
const SECRET_LIKE_REF =
  /(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validEvidenceRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 240 &&
    !/[\r\n]/.test(value) &&
    !SECRET_LIKE_REF.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validInput(input: unknown): input is ClarityDataExportLiveRunnerInputV1 {
  if (!isPlainObject(input)) return false;
  if (Object.keys(input).some((key) => !ALLOWED_INPUT_KEYS.has(key))) return false;

  const candidate = input as Partial<ClarityDataExportLiveRunnerInputV1>;
  return Boolean(
    Number.isInteger(candidate.lookbackDays) &&
      Array.isArray(candidate.dimensions) &&
      candidate.dimensions.every((dimension) => typeof dimension === "string") &&
      (candidate.requestsUsedInCurrentQuotaWindow === null ||
        Number.isSafeInteger(candidate.requestsUsedInCurrentQuotaWindow)) &&
      (candidate.quotaEvidenceRef === null ||
        typeof candidate.quotaEvidenceRef === "string") &&
      typeof candidate.bearerToken === "string" &&
      ALLOWED_SOURCE_TRUTHS.has(candidate.sourceTruth as ClarityEvidenceTruthState) &&
      typeof candidate.maxAgeHours === "number" &&
      Number.isFinite(candidate.maxAgeHours) &&
      candidate.maxAgeHours >= 0 &&
      validEvidenceRef(candidate.evidenceRef) &&
      (candidate.fetchImpl === undefined || typeof candidate.fetchImpl === "function") &&
      (candidate.now === undefined || typeof candidate.now === "function") &&
      (candidate.timeoutMs === undefined || typeof candidate.timeoutMs === "number") &&
      (candidate.maxResponseBytes === undefined ||
        typeof candidate.maxResponseBytes === "number")
  );
}

function safeNow(now: (() => string) | undefined): string | null {
  try {
    const value = now ? now() : new Date().toISOString();
    return canonicalInstant(value) ? value : null;
  } catch {
    return null;
  }
}

function sameWindow(
  left: Readonly<{ startAt: string; endAt: string }> | null,
  right: Readonly<{ startAt: string; endAt: string }> | null,
): boolean {
  return Boolean(
    left &&
      right &&
      left.startAt === right.startAt &&
      left.endAt === right.endAt,
  );
}

function result(
  state: ClarityDataExportLiveRunnerResultV1["state"],
  reasonCode: ClarityDataExportLiveRunnerReasonV1,
  options: Readonly<{
    plan?: ClarityDataExportRequestPlanV1 | null;
    fetchResult?: ClarityDataExportAuthorizedFetchResultV1 | null;
    adapterResult?: ClarityDataExportResponseAdapterResultV1 | null;
    requestStartedAt?: string | null;
    evaluatedAt?: string | null;
    sourceTruthSuppliedExplicitly?: boolean;
    observedWindowBoundToAuthorizedFetch?: boolean;
    extractedAtBoundToAuthorizedFetch?: boolean;
  }> = {},
): ClarityDataExportLiveRunnerResultV1 {
  const fetchResult = options.fetchResult ?? null;
  return deepFreeze({
    version: CLARITY_DATA_EXPORT_LIVE_RUNNER_VERSION,
    state,
    reasonCode,
    plan: options.plan ?? null,
    fetchResult,
    adapterResult: options.adapterResult ?? null,
    chronology: {
      requestStartedAt: options.requestStartedAt ?? null,
      responseReceivedAt: fetchResult?.responseReceivedAt ?? null,
      evaluatedAt: options.evaluatedAt ?? null,
    },
    provenance: {
      requestStartCapturedByRunner: options.requestStartedAt != null,
      observedWindowBoundToAuthorizedFetch:
        options.observedWindowBoundToAuthorizedFetch === true,
      extractedAtBoundToAuthorizedFetch:
        options.extractedAtBoundToAuthorizedFetch === true,
      sourceTruthSuppliedExplicitly: options.sourceTruthSuppliedExplicitly === true,
      sourceTruthInferredFromHttpStatus: false as const,
      transportEvidenceRefs: fetchResult?.evidenceRefs ?? [],
    },
    privacy: {
      bearerTokenReturned: false as const,
    },
    authority: {
      networkCallPerformed: fetchResult?.authority.networkCallPerformed === true,
      authorizationHeaderUsed: fetchResult?.authority.authorizationHeaderUsed === true,
      persistencePerformed: false as const,
      externalMutationAllowed: false as const,
      metaWriteAllowed: false as const,
    },
  });
}

/**
 * Runs the bounded Clarity live-read path as one provenance-preserving unit:
 * capture the real invocation time, build the request plan from current quota
 * evidence, execute the authorized read, and bind the transport-owned window
 * and receive timestamp into the existing response adapter/live-export gate.
 *
 * The caller may explicitly supply source truth, but HTTP success never upgrades
 * that truth state. The caller cannot provide a plan, observed window, extracted
 * timestamp, or request-start timestamp, preventing those fields from drifting
 * away from the authorized fetch that produced the payload.
 *
 * This function performs no persistence, checkout/site mutation, Meta write, or
 * attribution/causal inference.
 */
export async function runClarityDataExportLiveV1(
  input: ClarityDataExportLiveRunnerInputV1,
): Promise<ClarityDataExportLiveRunnerResultV1> {
  if (!validInput(input)) {
    return result("REJECTED_BEFORE_FETCH", "INVALID_INPUT");
  }

  const requestStartedAt = safeNow(input.now);
  if (!requestStartedAt) {
    return result("REJECTED_BEFORE_FETCH", "REQUEST_TIME_UNAVAILABLE", {
      sourceTruthSuppliedExplicitly: true,
    });
  }

  const plan = planClarityDataExportRequestV1({
    requestedAt: requestStartedAt,
    lookbackDays: input.lookbackDays,
    dimensions: [...input.dimensions],
    requestsUsedInCurrentQuotaWindow: input.requestsUsedInCurrentQuotaWindow,
    quotaEvidenceRef: input.quotaEvidenceRef,
  });

  if (plan.status !== "READY") {
    return result("REJECTED_BEFORE_FETCH", "PLAN_BLOCKED", {
      plan,
      requestStartedAt,
      sourceTruthSuppliedExplicitly: true,
    });
  }

  const fetchResult = await fetchAuthorizedClarityDataExportV1({
    plan,
    bearerToken: input.bearerToken,
    requestStartedAt,
    evidenceRef: input.evidenceRef,
    fetchImpl: input.fetchImpl,
    now: input.now,
    timeoutMs: input.timeoutMs,
    maxResponseBytes: input.maxResponseBytes,
  });

  if (fetchResult.state !== "FETCHED") {
    return result("FETCH_REJECTED", "FETCH_REJECTED", {
      plan,
      fetchResult,
      requestStartedAt,
      sourceTruthSuppliedExplicitly: true,
    });
  }

  const fetchIntegrityMatches = Boolean(
    fetchResult.reasonCode === "FETCHED" &&
      fetchResult.requestStartedAt === requestStartedAt &&
      fetchResult.requestUrl === plan.requestUrl &&
      canonicalInstant(fetchResult.responseReceivedAt) &&
      sameWindow(fetchResult.coverage.providerWindow, plan.expectedUtcWindow) &&
      fetchResult.coverage.basis ===
        "PROVIDER_DOCUMENTED_LOOKBACK_FROM_REQUEST_START" &&
      fetchResult.coverage.providerTimestampObserved === false &&
      fetchResult.coverage.exactServerReceiptTimeKnown === false &&
      fetchResult.coverage.mustPassLiveExportGateBeforeHistory === true &&
      fetchResult.evidenceRefs.length === 1 &&
      fetchResult.evidenceRefs[0] === input.evidenceRef.trim() &&
      fetchResult.authority.networkCallPerformed === true &&
      fetchResult.authority.authorizationHeaderUsed === true &&
      fetchResult.authority.persistencePerformed === false &&
      fetchResult.authority.externalMutationAllowed === false &&
      fetchResult.authority.metaWriteAllowed === false &&
      fetchResult.privacy.bearerTokenReturned === false &&
      fetchResult.privacy.bearerTokenStoredInUrl === false
  );

  if (!fetchIntegrityMatches) {
    return result("ADAPTER_REJECTED", "FETCH_RESULT_INTEGRITY_MISMATCH", {
      plan,
      fetchResult,
      requestStartedAt,
      sourceTruthSuppliedExplicitly: true,
    });
  }

  const evaluatedAt = safeNow(input.now);
  if (
    !evaluatedAt ||
    Date.parse(evaluatedAt) < Date.parse(fetchResult.responseReceivedAt as string)
  ) {
    return result("ADAPTER_REJECTED", "EVALUATION_TIME_INVALID", {
      plan,
      fetchResult,
      requestStartedAt,
      evaluatedAt,
      sourceTruthSuppliedExplicitly: true,
      observedWindowBoundToAuthorizedFetch: true,
      extractedAtBoundToAuthorizedFetch: true,
    });
  }

  const adapterResult = adaptClarityDataExportResponseV1({
    plan,
    responseJson: fetchResult.responseJson,
    sourceTruth: input.sourceTruth,
    observedWindow: fetchResult.coverage.providerWindow!,
    fetchedAt: fetchResult.responseReceivedAt!,
    now: evaluatedAt,
    maxAgeHours: input.maxAgeHours,
    evidenceRef: fetchResult.evidenceRefs[0],
  });

  return result(
    adapterResult.adapterState === "ADAPTED" ? "ADAPTED" : "ADAPTER_REJECTED",
    adapterResult.adapterState === "ADAPTED" ? "ADAPTED" : "ADAPTER_REJECTED",
    {
      plan,
      fetchResult,
      adapterResult,
      requestStartedAt,
      evaluatedAt,
      sourceTruthSuppliedExplicitly: true,
      observedWindowBoundToAuthorizedFetch: true,
      extractedAtBoundToAuthorizedFetch: true,
    },
  );
}
