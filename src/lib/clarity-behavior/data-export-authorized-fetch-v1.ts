import {
  CLARITY_DATA_EXPORT_ENDPOINT_V1,
  CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION,
  planClarityDataExportRequestV1,
  type ClarityDataExportRequestPlanV1,
} from "./data-export-request-plan-v1";

export const CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION =
  "CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_V1" as const;
export const CLARITY_DATA_EXPORT_DEFAULT_TIMEOUT_MS = 15_000 as const;
export const CLARITY_DATA_EXPORT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type ClarityDataExportAuthorizedFetchReasonV1 =
  | "FETCHED"
  | "PLAN_NOT_READY"
  | "PLAN_INTEGRITY_MISMATCH"
  | "INVALID_AUTHORIZATION_TOKEN"
  | "INVALID_FETCH_CONTEXT"
  | "REQUEST_TIME_MISMATCH"
  | "NETWORK_TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_BAD_REQUEST"
  | "HTTP_UNAUTHORIZED"
  | "HTTP_FORBIDDEN"
  | "HTTP_RATE_LIMITED"
  | "HTTP_PROVIDER_ERROR"
  | "HTTP_ERROR"
  | "NON_JSON_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "INVALID_JSON_RESPONSE";

export type ClarityDataExportAuthorizedFetchInputV1 = Readonly<{
  plan: ClarityDataExportRequestPlanV1;
  bearerToken: string;
  requestStartedAt: string;
  evidenceRef: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}>;

export type ClarityDataExportAuthorizedFetchResultV1 = Readonly<{
  version: typeof CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION;
  state: "FETCHED" | "REJECTED";
  reasonCode: ClarityDataExportAuthorizedFetchReasonV1;
  httpStatus: number | null;
  requestStartedAt: string | null;
  responseReceivedAt: string | null;
  requestUrl: string | null;
  responseJson: unknown | null;
  responseBytes: number | null;
  evidenceRefs: readonly string[];
  coverage: Readonly<{
    providerWindow: Readonly<{ startAt: string; endAt: string }> | null;
    basis: "PROVIDER_DOCUMENTED_LOOKBACK_FROM_REQUEST_START" | null;
    providerTimestampObserved: false;
    exactServerReceiptTimeKnown: false;
    mustPassLiveExportGateBeforeHistory: true;
  }>;
  privacy: Readonly<{
    bearerTokenReturned: false;
    bearerTokenStoredInUrl: false;
    redirectFollowingAllowed: false;
    referrerSent: false;
    credentialsIncluded: false;
  }>;
  authority: Readonly<{
    networkCallPerformed: boolean;
    authorizationHeaderUsed: boolean;
    persistencePerformed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  }>;
}>;

const SECRET_LIKE_REF =
  /(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 100;
const MIN_RESPONSE_BYTES = 1_024;
const ABSOLUTE_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

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

function validToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TOKEN_LENGTH &&
    value.trim() === value &&
    !/[\r\n\0]/.test(value)
  );
}

function validBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function rejected(
  input: Partial<ClarityDataExportAuthorizedFetchInputV1>,
  reasonCode: ClarityDataExportAuthorizedFetchReasonV1,
  options: Readonly<{
    networkCallPerformed?: boolean;
    authorizationHeaderUsed?: boolean;
    httpStatus?: number | null;
    responseReceivedAt?: string | null;
    responseBytes?: number | null;
  }> = {},
): ClarityDataExportAuthorizedFetchResultV1 {
  const plan = input.plan;
  const requestStartedAt = canonicalInstant(input.requestStartedAt)
    ? input.requestStartedAt
    : null;
  const evidenceRefs = validEvidenceRef(input.evidenceRef)
    ? [input.evidenceRef.trim()]
    : [];
  const safePlan = planIntegrityMatches(plan) ? plan : null;

  return deepFreeze({
    version: CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION,
    state: "REJECTED" as const,
    reasonCode,
    httpStatus: options.httpStatus ?? null,
    requestStartedAt,
    responseReceivedAt:
      canonicalInstant(options.responseReceivedAt) ? options.responseReceivedAt : null,
    requestUrl: safePlan?.requestUrl ?? null,
    responseJson: null,
    responseBytes: options.responseBytes ?? null,
    evidenceRefs,
    coverage: {
      providerWindow: null,
      basis: null,
      providerTimestampObserved: false as const,
      exactServerReceiptTimeKnown: false as const,
      mustPassLiveExportGateBeforeHistory: true as const,
    },
    privacy: {
      bearerTokenReturned: false as const,
      bearerTokenStoredInUrl: false as const,
      redirectFollowingAllowed: false as const,
      referrerSent: false as const,
      credentialsIncluded: false as const,
    },
    authority: {
      networkCallPerformed: options.networkCallPerformed === true,
      authorizationHeaderUsed: options.authorizationHeaderUsed === true,
      persistencePerformed: false as const,
      externalMutationAllowed: false as const,
      metaWriteAllowed: false as const,
    },
  });
}

function planIntegrityMatches(plan: unknown): plan is ClarityDataExportRequestPlanV1 {
  if (!plan || typeof plan !== "object") return false;
  const candidate = plan as ClarityDataExportRequestPlanV1;
  if (
    candidate.version !== CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION ||
    candidate.status !== "READY" ||
    candidate.reasonCode !== "REQUEST_READY" ||
    !candidate.requestedAt ||
    !candidate.requestUrl ||
    !candidate.expectedUtcWindow ||
    !candidate.lookbackDays ||
    !Array.isArray(candidate.dimensions) ||
    !candidate.quota ||
    !candidate.handoff ||
    !candidate.authority
  ) {
    return false;
  }

  const rebuilt = planClarityDataExportRequestV1({
    requestedAt: candidate.requestedAt,
    lookbackDays: candidate.lookbackDays,
    dimensions: [...candidate.dimensions],
    requestsUsedInCurrentQuotaWindow:
      candidate.quota.requestsUsedInCurrentQuotaWindow,
    quotaEvidenceRef: candidate.quota.quotaEvidenceRef,
  });

  if (
    rebuilt.status !== "READY" ||
    rebuilt.requestUrl !== candidate.requestUrl ||
    rebuilt.requestedAt !== candidate.requestedAt ||
    rebuilt.lookbackDays !== candidate.lookbackDays ||
    JSON.stringify(rebuilt.dimensions) !== JSON.stringify(candidate.dimensions) ||
    JSON.stringify(rebuilt.expectedUtcWindow) !==
      JSON.stringify(candidate.expectedUtcWindow) ||
    candidate.handoff.authorizationHeaderRequired !== true ||
    candidate.handoff.bearerTokenIncludedInPlan !== false ||
    candidate.handoff.expectedWindowIsProviderRequestExpectationOnly !== true ||
    candidate.handoff.observedWindowMustBeVerifiedFromFetchContext !== true ||
    candidate.handoff.responseMustPassLiveExportGate !== true ||
    candidate.authority.networkCallPerformed !== false ||
    candidate.authority.credentialAccessPerformed !== false ||
    candidate.authority.persistencePerformed !== false ||
    candidate.authority.externalMutationAllowed !== false ||
    candidate.authority.metaWriteAllowed !== false
  ) {
    return false;
  }

  try {
    const requestUrl = new URL(candidate.requestUrl);
    const endpoint = new URL(CLARITY_DATA_EXPORT_ENDPOINT_V1);
    if (
      requestUrl.protocol !== "https:" ||
      requestUrl.origin !== endpoint.origin ||
      requestUrl.pathname !== endpoint.pathname ||
      requestUrl.username ||
      requestUrl.password ||
      requestUrl.hash
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function statusReason(status: number): ClarityDataExportAuthorizedFetchReasonV1 {
  if (status === 400) return "HTTP_BAD_REQUEST";
  if (status === 401) return "HTTP_UNAUTHORIZED";
  if (status === 403) return "HTTP_FORBIDDEN";
  if (status === 429) return "HTTP_RATE_LIMITED";
  if (status >= 500) return "HTTP_PROVIDER_ERROR";
  return "HTTP_ERROR";
}

function safeNow(now: (() => string) | undefined): string | null {
  try {
    const value = now ? now() : new Date().toISOString();
    return canonicalInstant(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Performs exactly one read-only Microsoft Clarity Data Export request from an
 * already validated request plan. The bearer token exists only in the outbound
 * Authorization header and is never returned, persisted, embedded in the URL,
 * or included in error output.
 *
 * Coverage is anchored to the caller-captured request start because Microsoft
 * documents numOfDays as the last 24/48/72 hours "since the API call". The
 * provider does not return a server receipt timestamp, so this transport keeps
 * that limitation explicit and does not claim a directly observed provider
 * timestamp. The response still must pass the existing live-export gate before
 * it can become historical/decision evidence.
 */
export async function fetchAuthorizedClarityDataExportV1(
  input: ClarityDataExportAuthorizedFetchInputV1,
): Promise<ClarityDataExportAuthorizedFetchResultV1> {
  if (!input || !input.plan || input.plan.status !== "READY") {
    return rejected(input ?? {}, "PLAN_NOT_READY");
  }
  if (!planIntegrityMatches(input.plan)) {
    return rejected(input, "PLAN_INTEGRITY_MISMATCH");
  }
  if (!validToken(input.bearerToken)) {
    return rejected(input, "INVALID_AUTHORIZATION_TOKEN");
  }
  if (
    !canonicalInstant(input.requestStartedAt) ||
    !validEvidenceRef(input.evidenceRef)
  ) {
    return rejected(input, "INVALID_FETCH_CONTEXT");
  }
  if (input.requestStartedAt !== input.plan.requestedAt) {
    return rejected(input, "REQUEST_TIME_MISMATCH");
  }

  const timeoutMs = input.timeoutMs ?? CLARITY_DATA_EXPORT_DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    input.maxResponseBytes ?? CLARITY_DATA_EXPORT_MAX_RESPONSE_BYTES;
  if (
    !validBoundedInteger(timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS) ||
    !validBoundedInteger(
      maxResponseBytes,
      MIN_RESPONSE_BYTES,
      ABSOLUTE_MAX_RESPONSE_BYTES,
    )
  ) {
    return rejected(input, "INVALID_FETCH_CONTEXT");
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return rejected(input, "INVALID_FETCH_CONTEXT");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(input.plan.requestUrl as string, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.bearerToken}`,
      },
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return rejected(
      input,
      controller.signal.aborted ? "NETWORK_TIMEOUT" : "NETWORK_ERROR",
      {
        networkCallPerformed: true,
        authorizationHeaderUsed: true,
        responseReceivedAt: safeNow(input.now),
      },
    );
  }
  clearTimeout(timer);

  const responseReceivedAt = safeNow(input.now);
  if (!responseReceivedAt) {
    return rejected(input, "INVALID_FETCH_CONTEXT", {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
    });
  }

  if (!response.ok) {
    return rejected(input, statusReason(response.status), {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
      responseReceivedAt,
    });
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength != null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > maxResponseBytes
    ) {
      return rejected(input, "RESPONSE_TOO_LARGE", {
        networkCallPerformed: true,
        authorizationHeaderUsed: true,
        httpStatus: response.status,
        responseReceivedAt,
        responseBytes:
          Number.isSafeInteger(parsedLength) && parsedLength >= 0
            ? parsedLength
            : null,
      });
    }
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return rejected(input, "NON_JSON_RESPONSE", {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
      responseReceivedAt,
    });
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    return rejected(input, "NETWORK_ERROR", {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
      responseReceivedAt,
    });
  }

  const responseBytes = new TextEncoder().encode(body).byteLength;
  if (responseBytes > maxResponseBytes) {
    return rejected(input, "RESPONSE_TOO_LARGE", {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
      responseReceivedAt,
      responseBytes,
    });
  }

  let responseJson: unknown;
  try {
    responseJson = JSON.parse(body) as unknown;
  } catch {
    return rejected(input, "INVALID_JSON_RESPONSE", {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      httpStatus: response.status,
      responseReceivedAt,
      responseBytes,
    });
  }

  return deepFreeze({
    version: CLARITY_DATA_EXPORT_AUTHORIZED_FETCH_VERSION,
    state: "FETCHED" as const,
    reasonCode: "FETCHED" as const,
    httpStatus: response.status,
    requestStartedAt: input.requestStartedAt,
    responseReceivedAt,
    requestUrl: input.plan.requestUrl,
    responseJson,
    responseBytes,
    evidenceRefs: [input.evidenceRef.trim()],
    coverage: {
      providerWindow: { ...input.plan.expectedUtcWindow! },
      basis: "PROVIDER_DOCUMENTED_LOOKBACK_FROM_REQUEST_START" as const,
      providerTimestampObserved: false as const,
      exactServerReceiptTimeKnown: false as const,
      mustPassLiveExportGateBeforeHistory: true as const,
    },
    privacy: {
      bearerTokenReturned: false as const,
      bearerTokenStoredInUrl: false as const,
      redirectFollowingAllowed: false as const,
      referrerSent: false as const,
      credentialsIncluded: false as const,
    },
    authority: {
      networkCallPerformed: true,
      authorizationHeaderUsed: true,
      persistencePerformed: false as const,
      externalMutationAllowed: false as const,
      metaWriteAllowed: false as const,
    },
  });
}
