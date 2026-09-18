import type { CanonicalSocialAccountSnapshotV1, SocialPlatformV1 } from "./social-canonical-v1";
import type {
  SocialConnectorSourceKindV1,
  SocialLiveIngestionProofInputV1
} from "./social-connector-proof-v1";

export const SOCIAL_SYNC_MODES_V1 = ["INCREMENTAL", "HISTORICAL_BACKFILL"] as const;
export type SocialSyncModeV1 = (typeof SOCIAL_SYNC_MODES_V1)[number];

export const SOCIAL_SYNC_OUTCOMES_V1 = ["SUCCESS", "PARTIAL", "RATE_LIMITED", "FAILED"] as const;
export type SocialSyncOutcomeV1 = (typeof SOCIAL_SYNC_OUTCOMES_V1)[number];

export type SocialSyncCheckpointV1 = {
  cursor: string | null;
  completedThroughAt: string | null;
};

export type SocialSyncPageReceiptV1 = {
  pageId: string;
  fetchedAt: string;
  cursorIn?: string | null;
  cursorOut?: string | null;
  recordCount: number;
  providerEvidenceRefs: readonly string[];
};

export type SocialSyncRunAcceptanceInputV1 = {
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  mode: SocialSyncModeV1;
  sourceKind: SocialConnectorSourceKindV1;
  authorizationState: "AUTHORIZED";
  readOnly: true;
  startedAt: string;
  completedAt: string;
  outcome: SocialSyncOutcomeV1;
  hasMore: boolean;
  resumeCursor?: string | null;
  providerEvidenceRefs?: readonly string[];
  limitations?: readonly string[];
  pages: readonly SocialSyncPageReceiptV1[];
  priorCheckpoint?: SocialSyncCheckpointV1 | null;
  snapshot?: CanonicalSocialAccountSnapshotV1 | null;
};

export type SocialSyncCheckpointActionV1 = "ADVANCE_COMPLETED" | "SAVE_RESUME" | "HOLD";

export type SocialSyncRunAcceptanceV1 = {
  contractVersion: "SocialSyncRunAcceptanceV1";
  platform: SocialPlatformV1;
  connectorId: string;
  runId: string;
  mode: SocialSyncModeV1;
  outcome: SocialSyncOutcomeV1;
  acceptedForLiveProof: boolean;
  proof: SocialLiveIngestionProofInputV1 | null;
  providerEvidenceRefs: readonly string[];
  limitations: readonly string[];
  retryRequired: boolean;
  checkpointAction: SocialSyncCheckpointActionV1;
  nextCheckpoint: SocialSyncCheckpointV1;
  externalAccessPerformed: false;
  writesPerformed: false;
};

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

function requireIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!value || Number.isNaN(parsed)) throw new Error(`${field} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be non-empty`);
  return normalized;
}

function optionalNonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized || null;
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
      throw new Error(`${path}.${key} contains credential material; sync acceptance must never carry secrets`);
    }
    rejectCredentialMaterial(child, `${path}.${key}`, seen);
  }
}

function normalizeCheckpoint(input: SocialSyncCheckpointV1 | null | undefined): SocialSyncCheckpointV1 {
  return freeze({
    cursor: optionalNonEmpty(input?.cursor),
    completedThroughAt: input?.completedThroughAt ? requireIso(input.completedThroughAt, "priorCheckpoint.completedThroughAt") : null
  });
}

function normalizePages(
  pages: readonly SocialSyncPageReceiptV1[],
  startedMs: number,
  completedMs: number
): readonly SocialSyncPageReceiptV1[] {
  if (!Array.isArray(pages)) throw new Error("pages must be an array");
  const seen = new Set<string>();
  return freeze(
    pages.map((page, index) => {
      if (!page || typeof page !== "object" || Array.isArray(page)) throw new Error(`pages[${index}] must be an object`);
      const pageId = requireNonEmpty(page.pageId, `pages[${index}].pageId`);
      if (seen.has(pageId)) throw new Error(`duplicate pageId: ${pageId}`);
      seen.add(pageId);
      const fetchedAt = requireIso(page.fetchedAt, `pages[${index}].fetchedAt`);
      const fetchedMs = Date.parse(fetchedAt);
      if (fetchedMs < startedMs || fetchedMs > completedMs) {
        throw new Error(`${pageId} fetchedAt must fall within the sync run`);
      }
      if (!Number.isInteger(page.recordCount) || page.recordCount < 0) {
        throw new Error(`${pageId}.recordCount must be a non-negative integer`);
      }
      const providerEvidenceRefs = unique(page.providerEvidenceRefs ?? []);
      if (!providerEvidenceRefs.length) throw new Error(`${pageId} requires provider provenance evidence`);
      return freeze({
        pageId,
        fetchedAt,
        cursorIn: optionalNonEmpty(page.cursorIn),
        cursorOut: optionalNonEmpty(page.cursorOut),
        recordCount: page.recordCount,
        providerEvidenceRefs
      });
    })
  );
}

export function compileSocialSyncRunAcceptanceV1(input: SocialSyncRunAcceptanceInputV1): SocialSyncRunAcceptanceV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  rejectCredentialMaterial(input);
  if (input.authorizationState !== "AUTHORIZED") throw new Error("sync acceptance requires explicit AUTHORIZED state");
  if (input.readOnly !== true) throw new Error("social sync must be read-only");
  if (input.sourceKind !== "OFFICIAL_API" && input.sourceKind !== "AUTHORIZED_EXPORT") {
    throw new Error("social sync requires an official API or authorized export source");
  }

  const connectorId = requireNonEmpty(input.connectorId, "connectorId");
  const runId = requireNonEmpty(input.runId, "runId");
  const startedAt = requireIso(input.startedAt, "startedAt");
  const completedAt = requireIso(input.completedAt, "completedAt");
  const startedMs = Date.parse(startedAt);
  const completedMs = Date.parse(completedAt);
  if (completedMs < startedMs) throw new Error("completedAt must not precede startedAt");

  const priorCheckpoint = normalizeCheckpoint(input.priorCheckpoint);
  const pages = normalizePages(input.pages, startedMs, completedMs);
  if (input.mode === "INCREMENTAL" && priorCheckpoint.cursor && pages.length) {
    if ((pages[0].cursorIn ?? null) !== priorCheckpoint.cursor) {
      throw new Error("incremental sync must resume from the prior checkpoint cursor");
    }
  }

  const resumeCursor = optionalNonEmpty(input.resumeCursor);
  if (input.outcome === "SUCCESS" && (input.hasMore || resumeCursor)) {
    throw new Error("successful sync cannot claim remaining pages or a resume cursor");
  }
  if ((input.outcome === "RATE_LIMITED" || (input.outcome === "PARTIAL" && input.hasMore)) && !resumeCursor) {
    throw new Error(`${input.outcome} sync with remaining work requires a resume cursor`);
  }
  if (input.outcome === "FAILED" && input.snapshot) {
    throw new Error("failed sync cannot emit a canonical live snapshot");
  }

  const providerEvidenceRefs = unique([
    ...(input.providerEvidenceRefs ?? []),
    ...pages.flatMap((page) => page.providerEvidenceRefs)
  ]);
  const limitations = unique(input.limitations ?? []);

  let proof: SocialLiveIngestionProofInputV1 | null = null;
  let checkpointAction: SocialSyncCheckpointActionV1 = "HOLD";
  let nextCheckpoint: SocialSyncCheckpointV1 = priorCheckpoint;
  let retryRequired = input.outcome === "FAILED" || input.outcome === "RATE_LIMITED" || (input.outcome === "PARTIAL" && input.hasMore);

  if (input.outcome !== "FAILED") {
    if (!input.snapshot) throw new Error(`${input.outcome} sync requires a canonical social snapshot`);
    if (input.snapshot.platform !== input.platform) throw new Error("sync snapshot platform mismatch");
    if (input.snapshot.writesPerformed !== false) throw new Error("canonical social snapshot must prove zero writes");
    const snapshotRetrievedAt = requireIso(input.snapshot.retrievedAt, "snapshot.retrievedAt");
    const snapshotMs = Date.parse(snapshotRetrievedAt);
    if (snapshotMs < startedMs || snapshotMs > completedMs) {
      throw new Error("snapshot.retrievedAt must fall within the sync run");
    }
    if (!providerEvidenceRefs.length) throw new Error("accepted live sync requires provider provenance evidence");
    if (!input.snapshot.evidenceRefs.length) throw new Error("accepted live sync requires canonical metric/content evidence");
    const requested = input.snapshot.sourceCoverage.requestedState;
    if (requested !== "CONNECTED_AND_INGESTING" && requested !== "CONNECTED_PARTIAL") {
      throw new Error("accepted live sync snapshot must claim a connected source");
    }

    proof = freeze({
      liveFirstPartyData: true,
      syncOutcome: input.outcome === "SUCCESS" ? "SUCCESS" : "PARTIAL",
      retrievedAt: snapshotRetrievedAt,
      providerEvidenceRefs,
      snapshot: input.snapshot
    });

    if (input.outcome === "SUCCESS") {
      if (priorCheckpoint.completedThroughAt && Date.parse(snapshotRetrievedAt) < Date.parse(priorCheckpoint.completedThroughAt)) {
        throw new Error("successful sync cannot move the completed checkpoint backwards");
      }
      checkpointAction = "ADVANCE_COMPLETED";
      nextCheckpoint = freeze({ cursor: null, completedThroughAt: snapshotRetrievedAt });
      retryRequired = false;
    } else if (input.hasMore && resumeCursor) {
      checkpointAction = "SAVE_RESUME";
      nextCheckpoint = freeze({ cursor: resumeCursor, completedThroughAt: priorCheckpoint.completedThroughAt });
    }
  }

  return freeze({
    contractVersion: "SocialSyncRunAcceptanceV1",
    platform: input.platform,
    connectorId,
    runId,
    mode: input.mode,
    outcome: input.outcome,
    acceptedForLiveProof: proof !== null,
    proof,
    providerEvidenceRefs,
    limitations,
    retryRequired,
    checkpointAction,
    nextCheckpoint,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
