export const CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION =
  "CLARITY_DATA_EXPORT_REQUEST_PLAN_V1" as const;
export const CLARITY_DATA_EXPORT_ENDPOINT_V1 =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights" as const;
export const CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY = 10 as const;
export const CLARITY_DATA_EXPORT_ROW_LIMIT = 1_000 as const;
export const CLARITY_DATA_EXPORT_MAX_DIMENSIONS = 3 as const;

export const CLARITY_DATA_EXPORT_DIMENSIONS_V1 = Object.freeze([
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
] as const);

type ClarityDataExportDimensionV1 =
  (typeof CLARITY_DATA_EXPORT_DIMENSIONS_V1)[number];

type ClarityDataExportRequestPlanInputV1 = Readonly<{
  requestedAt: string;
  lookbackDays: number;
  dimensions: readonly string[];
  requestsUsedInCurrentQuotaWindow: number | null;
  quotaEvidenceRef: string | null;
}>;

export type ClarityDataExportRequestPlanV1 = Readonly<{
  version: typeof CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION;
  status: "READY" | "BLOCKED" | "INVALID_INPUT";
  reasonCode:
    | "REQUEST_READY"
    | "INVALID_INPUT"
    | "UNSUPPORTED_LOOKBACK"
    | "TOO_MANY_DIMENSIONS"
    | "UNSUPPORTED_DIMENSION"
    | "DUPLICATE_DIMENSION"
    | "QUOTA_STATE_UNKNOWN"
    | "QUOTA_EXHAUSTED";
  requestUrl: string | null;
  requestedAt: string | null;
  expectedUtcWindow: Readonly<{ startAt: string; endAt: string }> | null;
  lookbackDays: 1 | 2 | 3 | null;
  dimensions: readonly ClarityDataExportDimensionV1[];
  quota: Readonly<{
    maxRequestsPerProjectPerDay: typeof CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY;
    requestsUsedInCurrentQuotaWindow: number | null;
    quotaEvidenceRef: string | null;
    oneRequestReservedByPlan: boolean;
  }>;
  providerLimits: Readonly<{
    maximumLookbackDays: 3;
    maximumDimensions: typeof CLARITY_DATA_EXPORT_MAX_DIMENSIONS;
    maximumRows: typeof CLARITY_DATA_EXPORT_ROW_LIMIT;
    paginationSupported: false;
    responseTimezone: "UTC";
  }>;
  handoff: Readonly<{
    authorizationHeaderRequired: true;
    bearerTokenIncludedInPlan: false;
    expectedWindowIsProviderRequestExpectationOnly: true;
    observedWindowMustBeVerifiedFromFetchContext: true;
    responseMustPassLiveExportGate: true;
  }>;
  authority: Readonly<{
    networkCallPerformed: false;
    credentialAccessPerformed: false;
    persistencePerformed: false;
    externalMutationAllowed: false;
    metaWriteAllowed: false;
  }>;
}>;

const DAY_MS = 24 * 60 * 60 * 1_000;
const SUPPORTED_DIMENSIONS = new Set<string>(CLARITY_DATA_EXPORT_DIMENSIONS_V1);

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
    !/(?:bearer\s+|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)=?/i.test(
      value,
    )
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

function basePlan(
  input: Partial<ClarityDataExportRequestPlanInputV1>,
  status: ClarityDataExportRequestPlanV1["status"],
  reasonCode: ClarityDataExportRequestPlanV1["reasonCode"],
  overrides: Partial<ClarityDataExportRequestPlanV1> = {},
): ClarityDataExportRequestPlanV1 {
  const requestsUsed =
    Number.isSafeInteger(input.requestsUsedInCurrentQuotaWindow) &&
    (input.requestsUsedInCurrentQuotaWindow as number) >= 0
      ? (input.requestsUsedInCurrentQuotaWindow as number)
      : null;
  const evidenceRef = validEvidenceRef(input.quotaEvidenceRef)
    ? input.quotaEvidenceRef.trim()
    : null;

  return deepFreeze({
    version: CLARITY_DATA_EXPORT_REQUEST_PLAN_VERSION,
    status,
    reasonCode,
    requestUrl: null,
    requestedAt: canonicalInstant(input.requestedAt) ? input.requestedAt : null,
    expectedUtcWindow: null,
    lookbackDays: [1, 2, 3].includes(input.lookbackDays as number)
      ? (input.lookbackDays as 1 | 2 | 3)
      : null,
    dimensions: [],
    quota: {
      maxRequestsPerProjectPerDay: CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY,
      requestsUsedInCurrentQuotaWindow: requestsUsed,
      quotaEvidenceRef: evidenceRef,
      oneRequestReservedByPlan: false,
    },
    providerLimits: {
      maximumLookbackDays: 3,
      maximumDimensions: CLARITY_DATA_EXPORT_MAX_DIMENSIONS,
      maximumRows: CLARITY_DATA_EXPORT_ROW_LIMIT,
      paginationSupported: false,
      responseTimezone: "UTC",
    },
    handoff: {
      authorizationHeaderRequired: true,
      bearerTokenIncludedInPlan: false,
      expectedWindowIsProviderRequestExpectationOnly: true,
      observedWindowMustBeVerifiedFromFetchContext: true,
      responseMustPassLiveExportGate: true,
    },
    authority: {
      networkCallPerformed: false,
      credentialAccessPerformed: false,
      persistencePerformed: false,
      externalMutationAllowed: false,
      metaWriteAllowed: false,
    },
    ...overrides,
  });
}

export function planClarityDataExportRequestV1(
  input: ClarityDataExportRequestPlanInputV1,
): ClarityDataExportRequestPlanV1 {
  if (
    !input ||
    !canonicalInstant(input.requestedAt) ||
    !Number.isInteger(input.lookbackDays) ||
    !Array.isArray(input.dimensions) ||
    !input.dimensions.every((dimension) => typeof dimension === "string")
  ) {
    return basePlan(input ?? {}, "INVALID_INPUT", "INVALID_INPUT");
  }

  if (![1, 2, 3].includes(input.lookbackDays)) {
    return basePlan(input, "BLOCKED", "UNSUPPORTED_LOOKBACK");
  }
  if (input.dimensions.length > CLARITY_DATA_EXPORT_MAX_DIMENSIONS) {
    return basePlan(input, "BLOCKED", "TOO_MANY_DIMENSIONS");
  }
  if (input.dimensions.some((dimension) => !SUPPORTED_DIMENSIONS.has(dimension))) {
    return basePlan(input, "BLOCKED", "UNSUPPORTED_DIMENSION");
  }
  if (new Set(input.dimensions).size !== input.dimensions.length) {
    return basePlan(input, "BLOCKED", "DUPLICATE_DIMENSION");
  }
  if (
    !Number.isSafeInteger(input.requestsUsedInCurrentQuotaWindow) ||
    (input.requestsUsedInCurrentQuotaWindow as number) < 0 ||
    !validEvidenceRef(input.quotaEvidenceRef)
  ) {
    return basePlan(input, "BLOCKED", "QUOTA_STATE_UNKNOWN");
  }
  if (
    (input.requestsUsedInCurrentQuotaWindow as number) >=
    CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY
  ) {
    return basePlan(input, "BLOCKED", "QUOTA_EXHAUSTED");
  }

  const requestedAtMs = Date.parse(input.requestedAt);
  const startAt = new Date(requestedAtMs - input.lookbackDays * DAY_MS).toISOString();
  const url = new URL(CLARITY_DATA_EXPORT_ENDPOINT_V1);
  url.searchParams.set("numOfDays", String(input.lookbackDays));
  input.dimensions.forEach((dimension, index) => {
    url.searchParams.set(`dimension${index + 1}`, dimension);
  });

  return basePlan(input, "READY", "REQUEST_READY", {
    requestUrl: url.toString(),
    expectedUtcWindow: {
      startAt,
      endAt: input.requestedAt,
    },
    dimensions: [...input.dimensions] as ClarityDataExportDimensionV1[],
    quota: {
      maxRequestsPerProjectPerDay: CLARITY_DATA_EXPORT_MAX_REQUESTS_PER_PROJECT_PER_DAY,
      requestsUsedInCurrentQuotaWindow: input.requestsUsedInCurrentQuotaWindow,
      quotaEvidenceRef: input.quotaEvidenceRef.trim(),
      oneRequestReservedByPlan: true,
    },
  });
}
