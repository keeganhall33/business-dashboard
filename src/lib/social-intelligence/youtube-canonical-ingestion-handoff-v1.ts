import type { CanonicalSocialAccountSnapshotV1 } from "./social-canonical-v1";
import {
  compileSocialProviderSnapshotProjectionV1,
  type SocialProviderSnapshotProjectionV1
} from "./social-provider-snapshot-projection-v1";
import {
  compileSocialSnapshotHistoryLedgerV1,
  planSocialHistoryAppendV1,
  type SocialHistoryAppendPlanV1,
  type SocialSnapshotHistoryLedgerV1
} from "./social-snapshot-history-ledger-v1";
import {
  compileSocialSyncRunAcceptanceV1,
  type SocialSyncCheckpointV1,
  type SocialSyncModeV1,
  type SocialSyncRunAcceptanceV1
} from "./social-sync-acceptance-v1";
import type { YouTubeAnalyticsChannelLiveRunV1 } from "./youtube-analytics-live-runner-v1";

export const YOUTUBE_CANONICAL_HANDOFF_STATES_V1 = [
  "WITHHELD",
  "READY_TO_APPEND",
  "ALREADY_PRESENT",
  "VERIFY_CONFLICT"
] as const;
export type YouTubeCanonicalHandoffStateV1 = (typeof YOUTUBE_CANONICAL_HANDOFF_STATES_V1)[number];

export const YOUTUBE_CANONICAL_HANDOFF_BLOCKERS_V1 = [
  "PROVIDER_RUN_NOT_COMPLETE",
  "DAILY_COVERAGE_INCOMPLETE",
  "NORMALIZATION_MISSING",
  "PROVIDER_EVIDENCE_MISSING",
  "CANONICAL_PROJECTION_NOT_READY",
  "SYNC_NOT_ACCEPTED",
  "HISTORY_CONFLICT"
] as const;
export type YouTubeCanonicalHandoffBlockerV1 = (typeof YOUTUBE_CANONICAL_HANDOFF_BLOCKERS_V1)[number];

export type CompileYouTubeCanonicalIngestionHandoffInputV1 = {
  report: YouTubeAnalyticsChannelLiveRunV1;
  accountId: string;
  handle?: string | null;
  existingSnapshots: readonly CanonicalSocialAccountSnapshotV1[];
  now: string;
  freshnessMaxAgeHours: number;
  staleAfterHours?: number;
  mode?: SocialSyncModeV1;
  priorCheckpoint?: SocialSyncCheckpointV1 | null;
};

export type YouTubeCanonicalIngestionHandoffV1 = {
  contractVersion: "YouTubeCanonicalIngestionHandoffV1";
  generatedAt: string;
  platform: "YOUTUBE";
  connectorId: string;
  runId: string;
  state: YouTubeCanonicalHandoffStateV1;
  blockers: readonly YouTubeCanonicalHandoffBlockerV1[];
  projection: SocialProviderSnapshotProjectionV1 | null;
  syncAcceptance: SocialSyncRunAcceptanceV1 | null;
  appendPlan: SocialHistoryAppendPlanV1 | null;
  projectedLedger: SocialSnapshotHistoryLedgerV1 | null;
  candidateSnapshotId: string | null;
  providerEvidenceRefs: readonly string[];
  evidenceRefs: readonly string[];
  limitations: readonly string[];
  providerAccessObserved: boolean;
  providerWritesPerformed: false;
  canonicalPersistencePerformed: false;
  canonicalPersistenceAuthorized: false;
  causalClaimsCreated: false;
  attributionClaimsCreated: false;
  externalActionAuthorityGranted: false;
};

const MAX_REFERENCE_LENGTH = 2_000;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
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

function safeReference(value: string, field: string): string {
  const normalized = requireNonEmpty(value, field);
  if (normalized.length > MAX_REFERENCE_LENGTH) throw new Error(`${field} exceeds ${MAX_REFERENCE_LENGTH} characters`);
  if (/^bearer\s+/i.test(normalized) || /^(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|secret)\s*[:=]/i.test(normalized)) {
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

function normalizeRefs(values: readonly string[], field: string): string[] {
  return unique(values).map((value, index) => safeReference(value, `${field}[${index}]`));
}

function allIncluded(haystack: readonly string[], needles: readonly string[]): boolean {
  const values = new Set(haystack);
  return needles.every((value) => values.has(value));
}

function assertReportIntegrity(report: YouTubeAnalyticsChannelLiveRunV1, nowMs: number): void {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("report must be a YouTube Analytics live-run artifact");
  }
  if (
    report.contractVersion !== "YouTubeAnalyticsChannelLiveRunV1" ||
    report.provider !== "YOUTUBE_ANALYTICS" ||
    report.platform !== "YOUTUBE"
  ) {
    throw new Error("report must be an exact YouTubeAnalyticsChannelLiveRunV1 artifact");
  }
  if (report.authorizationBoundary !== "READ_ONLY_REQUIRED_SCOPES_ONLY" || report.providerWritesPerformed !== false) {
    throw new Error("YouTube canonical handoff requires the exact read-only provider authorization boundary");
  }
  if (report.causalAttributionClaimed !== false) throw new Error("provider report cannot widen causal attribution claims");

  const providerRun = report.providerRun;
  if (!providerRun || providerRun.contractVersion !== "SocialLiveProviderRunV1") {
    throw new Error("report.providerRun must be SocialLiveProviderRunV1");
  }
  if (providerRun.platform !== "YOUTUBE" || providerRun.connectorId !== report.connectorId || providerRun.runId !== report.runId) {
    throw new Error("YouTube report and provider-run identity must match exactly");
  }
  if (providerRun.sourceKind !== "OFFICIAL_API" || providerRun.authorizationState !== "AUTHORIZED" || providerRun.readOnly !== true) {
    throw new Error("YouTube provider run must remain an authorized read-only official API observation");
  }
  if (providerRun.externalAccessPerformed !== true || providerRun.writesPerformed !== false) {
    throw new Error("YouTube provider run must attest provider access with zero provider writes");
  }

  const startedAt = requireIso(providerRun.startedAt, "report.providerRun.startedAt");
  const retrievedAt = requireIso(providerRun.retrievedAt, "report.providerRun.retrievedAt");
  if (Date.parse(startedAt) > Date.parse(retrievedAt)) throw new Error("provider run startedAt cannot be after retrievedAt");
  if (Date.parse(retrievedAt) > nowMs) throw new Error("provider run cannot be future-dated");

  const reportRefs = normalizeRefs(report.evidenceRefs ?? [], "report.evidenceRefs");
  const pageRefs = normalizeRefs(providerRun.pageEvidenceRefs ?? [], "report.providerRun.pageEvidenceRefs");
  if (pageRefs.length && !allIncluded(reportRefs, pageRefs)) {
    throw new Error("report evidence must preserve every provider page evidence reference");
  }

  if (!report.normalization) return;
  const normalization = report.normalization;
  if (normalization.contractVersion !== "SocialProviderMetricNormalizationV1") {
    throw new Error("report normalization must be SocialProviderMetricNormalizationV1");
  }
  if (
    normalization.platform !== "YOUTUBE" ||
    normalization.connectorId !== report.connectorId ||
    normalization.runId !== report.runId ||
    normalization.sourceKind !== "OFFICIAL_API"
  ) {
    throw new Error("YouTube normalization identity must match the provider report exactly");
  }
  if (requireIso(normalization.retrievedAt, "report.normalization.retrievedAt") !== retrievedAt) {
    throw new Error("YouTube normalization retrieval time must match the provider run exactly");
  }
  if (normalization.externalAccessPerformed !== false || normalization.writesPerformed !== false) {
    throw new Error("canonical normalization must remain a zero-action projection");
  }
  if (normalization.causalAttributionClaimed !== false || normalization.crossPlatformAggregationPerformed !== false) {
    throw new Error("canonical normalization cannot widen attribution or cross-platform claims");
  }
}

function baseResult(input: {
  generatedAt: string;
  report: YouTubeAnalyticsChannelLiveRunV1;
  state: YouTubeCanonicalHandoffStateV1;
  blockers: readonly YouTubeCanonicalHandoffBlockerV1[];
  projection?: SocialProviderSnapshotProjectionV1 | null;
  syncAcceptance?: SocialSyncRunAcceptanceV1 | null;
  appendPlan?: SocialHistoryAppendPlanV1 | null;
  projectedLedger?: SocialSnapshotHistoryLedgerV1 | null;
}): YouTubeCanonicalIngestionHandoffV1 {
  const providerEvidenceRefs = normalizeRefs(input.report.evidenceRefs ?? [], "providerEvidenceRefs");
  const evidenceRefs = unique([
    ...providerEvidenceRefs,
    ...(input.projection?.snapshot.evidenceRefs ?? []),
    ...(input.syncAcceptance?.providerEvidenceRefs ?? []),
    ...(input.projectedLedger?.accounts.flatMap((account) => account.evidenceRefs) ?? [])
  ]);
  return freeze({
    contractVersion: "YouTubeCanonicalIngestionHandoffV1",
    generatedAt: input.generatedAt,
    platform: "YOUTUBE",
    connectorId: input.report.connectorId,
    runId: input.report.runId,
    state: input.state,
    blockers: [...new Set(input.blockers)].sort((left, right) => left.localeCompare(right)),
    projection: input.projection ?? null,
    syncAcceptance: input.syncAcceptance ?? null,
    appendPlan: input.appendPlan ?? null,
    projectedLedger: input.projectedLedger ?? null,
    candidateSnapshotId: input.projection?.snapshot.snapshotId ?? null,
    providerEvidenceRefs,
    evidenceRefs,
    limitations: unique(input.report.limitations ?? []),
    providerAccessObserved: input.report.providerRun.externalAccessPerformed === true,
    providerWritesPerformed: false,
    canonicalPersistencePerformed: false,
    canonicalPersistenceAuthorized: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false,
    externalActionAuthorityGranted: false
  });
}

export function compileYouTubeCanonicalIngestionHandoffV1(
  input: CompileYouTubeCanonicalIngestionHandoffInputV1
): YouTubeCanonicalIngestionHandoffV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  const generatedAt = requireIso(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const accountId = requireNonEmpty(input.accountId, "accountId");
  if (!Array.isArray(input.existingSnapshots)) throw new Error("existingSnapshots must be an array");
  if (!Number.isFinite(input.freshnessMaxAgeHours) || input.freshnessMaxAgeHours <= 0) {
    throw new Error("freshnessMaxAgeHours must be positive");
  }
  const staleAfterHours = input.staleAfterHours ?? input.freshnessMaxAgeHours;
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) throw new Error("staleAfterHours must be positive");

  assertReportIntegrity(input.report, nowMs);
  const report = input.report;
  const providerRun = report.providerRun;
  const blockers = new Set<YouTubeCanonicalHandoffBlockerV1>();

  if (providerRun.runState !== "COMPLETE" || !providerRun.providerRunComplete || !providerRun.paginationExhausted) {
    blockers.add("PROVIDER_RUN_NOT_COMPLETE");
  }
  if (!report.completeRequestedDailyCoverage) blockers.add("DAILY_COVERAGE_INCOMPLETE");
  if (!report.normalization) blockers.add("NORMALIZATION_MISSING");
  if (!report.evidenceRefs.length || !providerRun.pageEvidenceRefs.length) blockers.add("PROVIDER_EVIDENCE_MISSING");

  if (blockers.size) {
    return baseResult({ generatedAt, report, state: "WITHHELD", blockers: [...blockers] });
  }

  if (report.httpStatus == null || report.httpStatus < 200 || report.httpStatus >= 300) {
    throw new Error("complete YouTube provider report must carry a successful HTTP status");
  }
  if (providerRun.pageCount !== 1) {
    throw new Error("YouTube Analytics channel handoff expects the single evidenced report response emitted by the live runner");
  }
  if (report.observedStartDate !== report.requestedStartDate || report.observedEndDate !== report.requestedEndDate) {
    throw new Error("complete YouTube daily coverage must bind exactly to the requested date range");
  }
  if (report.limitations.length) throw new Error("complete YouTube provider report cannot carry unresolved limitations");
  if (!report.normalization) throw new Error("complete YouTube provider report requires normalization");
  if (report.normalization.normalizationState !== "READY" || !report.normalization.providerRunComplete) {
    throw new Error("complete YouTube provider report requires READY normalization from a complete provider run");
  }

  if (input.priorCheckpoint?.cursor) {
    throw new Error("YouTube Analytics bounded report handoff does not accept opaque pagination cursors");
  }
  const priorCompleted = input.priorCheckpoint?.completedThroughAt
    ? requireIso(input.priorCheckpoint.completedThroughAt, "priorCheckpoint.completedThroughAt")
    : null;
  const providerPrevious = providerRun.previousSuccessfulSyncAt
    ? requireIso(providerRun.previousSuccessfulSyncAt, "report.providerRun.previousSuccessfulSyncAt")
    : null;
  if (priorCompleted && providerPrevious !== priorCompleted) {
    throw new Error("prior canonical checkpoint must match the provider run previous-success lineage exactly");
  }

  const projection = compileSocialProviderSnapshotProjectionV1(
    {
      accountId,
      handle: input.handle,
      normalizations: [report.normalization],
      freshnessMaxAgeHours: input.freshnessMaxAgeHours
    },
    generatedAt
  );
  if (projection.projectionState !== "READY" || projection.snapshot.sourceCoverage.requestedState !== "CONNECTED_AND_INGESTING") {
    blockers.add("CANONICAL_PROJECTION_NOT_READY");
    return baseResult({ generatedAt, report, state: "WITHHELD", blockers: [...blockers], projection });
  }

  const syncAcceptance = compileSocialSyncRunAcceptanceV1({
    platform: "YOUTUBE",
    connectorId: report.connectorId,
    runId: report.runId,
    mode: input.mode ?? "INCREMENTAL",
    sourceKind: "OFFICIAL_API",
    authorizationState: "AUTHORIZED",
    readOnly: true,
    startedAt: providerRun.startedAt,
    completedAt: providerRun.retrievedAt,
    outcome: "SUCCESS",
    hasMore: false,
    providerEvidenceRefs: report.evidenceRefs,
    limitations: report.limitations,
    pages: [
      {
        pageId: `${report.runId}:youtube-analytics-report`,
        fetchedAt: providerRun.retrievedAt,
        cursorIn: null,
        cursorOut: null,
        recordCount: providerRun.itemCount,
        providerEvidenceRefs: providerRun.pageEvidenceRefs
      }
    ],
    priorCheckpoint: input.priorCheckpoint,
    snapshot: projection.snapshot
  });
  if (!syncAcceptance.acceptedForLiveProof || syncAcceptance.outcome !== "SUCCESS" || !syncAcceptance.proof) {
    blockers.add("SYNC_NOT_ACCEPTED");
    return baseResult({ generatedAt, report, state: "WITHHELD", blockers: [...blockers], projection, syncAcceptance });
  }

  const appendPlan = planSocialHistoryAppendV1(projection.snapshot, input.existingSnapshots, generatedAt);
  if (appendPlan.decision === "VERIFY_CONFLICT") {
    blockers.add("HISTORY_CONFLICT");
    return baseResult({
      generatedAt,
      report,
      state: "VERIFY_CONFLICT",
      blockers: [...blockers],
      projection,
      syncAcceptance,
      appendPlan
    });
  }

  const projectedSnapshots = appendPlan.decision === "APPEND"
    ? [...input.existingSnapshots, projection.snapshot]
    : [...input.existingSnapshots];
  const projectedLedger = compileSocialSnapshotHistoryLedgerV1(projectedSnapshots, generatedAt, staleAfterHours);
  const account = projectedLedger.accounts.find(
    (candidate) => candidate.platform === "YOUTUBE" && candidate.accountId === accountId
  );
  if (!account || account.latestSnapshotId !== projection.snapshot.snapshotId) {
    throw new Error("projected history must resolve the candidate as the latest exact YouTube account snapshot");
  }

  return baseResult({
    generatedAt,
    report,
    state: appendPlan.decision === "APPEND" ? "READY_TO_APPEND" : "ALREADY_PRESENT",
    blockers: [],
    projection,
    syncAcceptance,
    appendPlan,
    projectedLedger
  });
}