import {
  SOCIAL_METRIC_KEYS_V1,
  type SocialHistoryWindowV1,
  type SocialMetricKeyV1,
  type SocialPlatformV1
} from "./social-canonical-v1";
import {
  SOCIAL_CONNECTOR_SOURCE_KINDS_V1,
  type SocialConnectorSourceKindV1
} from "./social-connector-proof-v1";
import type { SocialProviderMetricNormalizationInputV1 } from "./social-provider-metric-normalization-v1";

export const SOCIAL_PROVIDER_RUN_STATES_V1 = ["COMPLETE", "PARTIAL", "FAILED"] as const;
export type SocialProviderRunStateV1 = (typeof SOCIAL_PROVIDER_RUN_STATES_V1)[number];

export const SOCIAL_PROVIDER_RUN_INTERRUPTION_REASONS_V1 = [
  "RATE_LIMIT",
  "PROVIDER_ERROR",
  "NETWORK_ERROR",
  "TIMEOUT",
  "PAGINATION_LIMIT",
  "OTHER"
] as const;
export type SocialProviderRunInterruptionReasonV1 = (typeof SOCIAL_PROVIDER_RUN_INTERRUPTION_REASONS_V1)[number];

export type SocialProviderRunPageEvidenceInputV1 = {
  pageIndex: number;
  capturedAt: string;
  itemCount: number;
  evidenceRefs: readonly string[];
};

export type SocialLiveProviderRunInputV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  sourceKind: SocialConnectorSourceKindV1;
  authorizationState: "AUTHORIZED";
  readOnly: true;
  externalAccessPerformed: true;
  writesPerformed: false;
  startedAt: string;
  retrievedAt: string;
  previousSuccessfulSyncAt?: string | null;
  requestedMetricKeys: readonly SocialMetricKeyV1[];
  requestedWindows: readonly SocialHistoryWindowV1[];
  pages: readonly SocialProviderRunPageEvidenceInputV1[];
  runState: SocialProviderRunStateV1;
  paginationExhausted: boolean;
  interruptionReason?: SocialProviderRunInterruptionReasonV1 | null;
  retryAfterAt?: string | null;
  limitations?: readonly string[];
};

export type SocialLiveProviderRunV1 = {
  contractVersion: "SocialLiveProviderRunV1";
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  sourceKind: SocialConnectorSourceKindV1;
  startedAt: string;
  retrievedAt: string;
  previousSuccessfulSyncAt: string | null;
  requestedMetricKeys: readonly SocialMetricKeyV1[];
  requestedWindows: readonly SocialHistoryWindowV1[];
  runState: SocialProviderRunStateV1;
  providerRunComplete: boolean;
  normalizationAllowed: boolean;
  resumeRequired: boolean;
  paginationExhausted: boolean;
  interruptionReason: SocialProviderRunInterruptionReasonV1 | null;
  retryAfterAt: string | null;
  pageCount: number;
  itemCount: number;
  pageEvidenceRefs: readonly string[];
  limitations: readonly string[];
  authorizationState: "AUTHORIZED";
  readOnly: true;
  externalAccessPerformed: true;
  writesPerformed: false;
};

export type SocialProviderNormalizationContextV1 = Pick<
  SocialProviderMetricNormalizationInputV1,
  | "platform"
  | "connectorId"
  | "runId"
  | "sourceKind"
  | "authorizationState"
  | "readOnly"
  | "providerRunComplete"
  | "previousSuccessfulSyncAt"
  | "retrievedAt"
  | "limitations"
>;

const MAX_PAGES = 10_000;
const MAX_REFERENCES = 20_000;
const MAX_REFERENCE_LENGTH = 2_000;
const MAX_TEXT_LENGTH = 500;
const MAX_LIMITATIONS = 100;
const FORBIDDEN_CREDENTIAL_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "apikey",
  "clientsecret",
  "password",
  "cookie",
  "authorizationheader",
  "bearertoken",
  "secret"
]);

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireNonEmpty(value: string, field: string, maxLength = MAX_TEXT_LENGTH): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters`);
  return normalized;
}

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function rejectCredentialMaterial(value: unknown, path = "input", seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);

  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectCredentialMaterial(child, `${path}[${index}]`, seen));
    return;
  }

  for (const [key, child] of Object.entries(object)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (FORBIDDEN_CREDENTIAL_KEYS.has(normalizedKey)) {
      throw new Error(`${path}.${key} contains credential material; social provider run evidence must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function safeReference(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field, MAX_REFERENCE_LENGTH);
  if (/^bearer\s+/i.test(normalized)) throw new Error(`${field} must not contain bearer credentials`);
  if (/^(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
    throw new Error(`${field} must not contain credential material`);
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) throw new Error(`${field} must not contain embedded credentials`);
    for (const key of ["access_token", "token", "api_key", "apikey", "signature", "secret"]) {
      if (parsed.searchParams.has(key)) throw new Error(`${field} must not contain credential query parameters`);
    }
  } catch (error) {
    if (error instanceof Error && /credential/.test(error.message)) throw error;
  }

  return normalized;
}

function normalizeLimitations(values: readonly string[] | undefined): string[] {
  const limitations = unique(values ?? []).map((value, index) => requireNonEmpty(value, `limitations[${index}]`));
  if (limitations.length > MAX_LIMITATIONS) throw new Error(`limitations exceeds ${MAX_LIMITATIONS} items`);
  return limitations;
}

function normalizeRequestedMetrics(values: readonly SocialMetricKeyV1[]): SocialMetricKeyV1[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error("requestedMetricKeys must contain at least one canonical metric");
  const allowed = new Set<string>(SOCIAL_METRIC_KEYS_V1);
  const normalized = unique(values) as SocialMetricKeyV1[];
  for (const metric of normalized) {
    if (!allowed.has(metric)) throw new Error(`unsupported requested social metric: ${String(metric)}`);
  }
  return normalized;
}

function normalizeRequestedWindows(values: readonly SocialHistoryWindowV1[]): SocialHistoryWindowV1[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error("requestedWindows must contain at least one history window");
  const normalized = unique(values as readonly string[]) as SocialHistoryWindowV1[];
  if (normalized.length !== values.length) throw new Error("requestedWindows must not contain duplicates");
  return normalized;
}

function normalizePageEvidence(
  pages: readonly SocialProviderRunPageEvidenceInputV1[],
  startedMs: number,
  retrievedMs: number
): { pageCount: number; itemCount: number; refs: string[] } {
  if (!Array.isArray(pages)) throw new Error("pages must be an array");
  if (pages.length > MAX_PAGES) throw new Error(`pages exceeds ${MAX_PAGES} items`);

  const refs: string[] = [];
  let itemCount = 0;

  pages.forEach((page, index) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) throw new Error(`pages[${index}] must be an object`);
    if (!Number.isInteger(page.pageIndex) || page.pageIndex !== index) {
      throw new Error(`pages[${index}].pageIndex must be contiguous and equal ${index}`);
    }
    if (!Number.isInteger(page.itemCount) || page.itemCount < 0) {
      throw new Error(`pages[${index}].itemCount must be a non-negative integer`);
    }
    const capturedAt = requireIso(page.capturedAt, `pages[${index}].capturedAt`);
    const capturedMs = Date.parse(capturedAt);
    if (capturedMs < startedMs || capturedMs > retrievedMs) {
      throw new Error(`pages[${index}].capturedAt must fall within the provider run`);
    }
    const pageRefs = unique(page.evidenceRefs).map((value, refIndex) => safeReference(value, `pages[${index}].evidenceRefs[${refIndex}]`));
    if (!pageRefs.length) throw new Error(`pages[${index}] requires provider evidence`);
    refs.push(...pageRefs);
    itemCount += page.itemCount;
  });

  const uniqueRefs = unique(refs);
  if (uniqueRefs.length > MAX_REFERENCES) throw new Error(`page evidence exceeds ${MAX_REFERENCES} references`);
  return { pageCount: pages.length, itemCount, refs: uniqueRefs };
}

export function compileSocialLiveProviderRunV1(input: SocialLiveProviderRunInputV1, now: string): SocialLiveProviderRunV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  rejectCredentialMaterial(input);
  if (input.authorizationState !== "AUTHORIZED") throw new Error("live provider run requires explicit AUTHORIZED state");
  if (input.readOnly !== true) throw new Error("live provider run must be read-only");
  if (input.externalAccessPerformed !== true) throw new Error("live provider run must attest actual external provider access");
  if (input.writesPerformed !== false) throw new Error("live provider run must prove zero provider writes");
  if (!SOCIAL_CONNECTOR_SOURCE_KINDS_V1.includes(input.sourceKind)) {
    throw new Error("live provider run requires an official API or authorized export source");
  }
  if (!SOCIAL_PROVIDER_RUN_STATES_V1.includes(input.runState)) throw new Error(`unsupported provider run state: ${String(input.runState)}`);

  const generatedAt = requireIso(now, "now");
  const nowMs = Date.parse(generatedAt);
  const startedAt = requireIso(input.startedAt, "startedAt");
  const retrievedAt = requireIso(input.retrievedAt, "retrievedAt");
  const startedMs = Date.parse(startedAt);
  const retrievedMs = Date.parse(retrievedAt);
  if (startedMs > retrievedMs) throw new Error("startedAt cannot be after retrievedAt");
  if (retrievedMs > nowMs) throw new Error("retrievedAt cannot be in the future");

  const previousSuccessfulSyncAt = input.previousSuccessfulSyncAt
    ? requireIso(input.previousSuccessfulSyncAt, "previousSuccessfulSyncAt")
    : null;
  if (previousSuccessfulSyncAt && Date.parse(previousSuccessfulSyncAt) > startedMs) {
    throw new Error("previousSuccessfulSyncAt cannot be after the current run started");
  }

  const connectorId = requireNonEmpty(input.connectorId, "connectorId");
  const runId = requireNonEmpty(input.runId, "runId");
  const requestedMetricKeys = normalizeRequestedMetrics(input.requestedMetricKeys);
  const requestedWindows = normalizeRequestedWindows(input.requestedWindows);
  const pageEvidence = normalizePageEvidence(input.pages, startedMs, retrievedMs);
  const limitations = normalizeLimitations(input.limitations);

  const interruptionReason = input.interruptionReason ?? null;
  if (interruptionReason && !SOCIAL_PROVIDER_RUN_INTERRUPTION_REASONS_V1.includes(interruptionReason)) {
    throw new Error(`unsupported interruptionReason: ${String(interruptionReason)}`);
  }
  const retryAfterAt = input.retryAfterAt ? requireIso(input.retryAfterAt, "retryAfterAt") : null;
  if (retryAfterAt && Date.parse(retryAfterAt) < retrievedMs) {
    throw new Error("retryAfterAt cannot be before retrievedAt");
  }

  if (input.runState === "COMPLETE") {
    if (!pageEvidence.pageCount) throw new Error("COMPLETE provider run requires at least one evidenced page");
    if (input.paginationExhausted !== true) throw new Error("COMPLETE provider run requires paginationExhausted=true");
    if (interruptionReason || retryAfterAt) throw new Error("COMPLETE provider run cannot carry interruption or retry state");
  } else if (input.runState === "PARTIAL") {
    if (!pageEvidence.pageCount) throw new Error("PARTIAL provider run requires at least one evidenced page");
    if (input.paginationExhausted !== false) throw new Error("PARTIAL provider run cannot claim exhausted pagination");
    if (!interruptionReason) throw new Error("PARTIAL provider run requires an explicit interruptionReason");
  } else {
    if (pageEvidence.pageCount) throw new Error("FAILED provider run must not carry partially usable pages; classify evidenced partial data as PARTIAL");
    if (input.paginationExhausted !== false) throw new Error("FAILED provider run cannot claim exhausted pagination");
    if (!interruptionReason) throw new Error("FAILED provider run requires an explicit interruptionReason");
  }

  const providerRunComplete = input.runState === "COMPLETE";
  const normalizationAllowed = input.runState === "COMPLETE" || input.runState === "PARTIAL";
  const resumeRequired = input.runState === "PARTIAL";

  return freeze({
    contractVersion: "SocialLiveProviderRunV1",
    platform: input.platform,
    connectorId,
    runId,
    sourceKind: input.sourceKind,
    startedAt,
    retrievedAt,
    previousSuccessfulSyncAt,
    requestedMetricKeys,
    requestedWindows,
    runState: input.runState,
    providerRunComplete,
    normalizationAllowed,
    resumeRequired,
    paginationExhausted: input.paginationExhausted,
    interruptionReason,
    retryAfterAt,
    pageCount: pageEvidence.pageCount,
    itemCount: pageEvidence.itemCount,
    pageEvidenceRefs: pageEvidence.refs,
    limitations,
    authorizationState: "AUTHORIZED",
    readOnly: true,
    externalAccessPerformed: true,
    writesPerformed: false
  });
}

export function toSocialProviderNormalizationContextV1(run: SocialLiveProviderRunV1): SocialProviderNormalizationContextV1 {
  if (!run.normalizationAllowed) throw new Error("failed provider run cannot enter metric normalization");
  return freeze({
    platform: run.platform,
    connectorId: run.connectorId,
    runId: run.runId,
    sourceKind: run.sourceKind,
    authorizationState: "AUTHORIZED",
    readOnly: true,
    providerRunComplete: run.providerRunComplete,
    previousSuccessfulSyncAt: run.previousSuccessfulSyncAt,
    retrievedAt: run.retrievedAt,
    limitations: run.limitations
  });
}
