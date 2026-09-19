import type { CanonicalSocialAccountSnapshotV1 } from "./social-canonical-v1";
import { planSocialHistoryAppendV1 } from "./social-snapshot-history-ledger-v1";
import type { SocialSyncCheckpointV1 } from "./social-sync-acceptance-v1";
import type { YouTubeAnalyticsChannelLiveRunV1 } from "./youtube-analytics-live-runner-v1";
import type { YouTubeCanonicalIngestionHandoffV1 } from "./youtube-canonical-ingestion-handoff-v1";

export const YOUTUBE_CANONICAL_PERSISTENCE_DISPOSITIONS_V1 = [
  "APPLY",
  "NOOP",
  "VERIFICATION_REQUIRED"
] as const;
export type YouTubeCanonicalPersistenceDispositionV1 =
  (typeof YOUTUBE_CANONICAL_PERSISTENCE_DISPOSITIONS_V1)[number];

export const YOUTUBE_CANONICAL_PERSISTENCE_REASON_CODES_V1 = [
  "READY_TO_APPLY",
  "SNAPSHOT_ALREADY_PERSISTED_ADVANCE_CHECKPOINT",
  "ALREADY_PERSISTED",
  "HANDOFF_NOT_PERSISTABLE",
  "HANDOFF_INCOMPLETE",
  "HANDOFF_IDENTITY_MISMATCH",
  "HANDOFF_AUTHORITY_WIDENED",
  "PROVIDER_LINEAGE_MISMATCH",
  "CURRENT_CHECKPOINT_MISMATCH",
  "SNAPSHOT_CONFLICT",
  "CHECKPOINT_AHEAD_OF_SNAPSHOT"
] as const;
export type YouTubeCanonicalPersistenceReasonCodeV1 =
  (typeof YOUTUBE_CANONICAL_PERSISTENCE_REASON_CODES_V1)[number];

export type YouTubeCanonicalPersistenceOperationV1 =
  | {
      kind: "APPEND_CANONICAL_SNAPSHOT";
      canonicalKey: string;
      snapshot: CanonicalSocialAccountSnapshotV1;
    }
  | {
      kind: "COMPARE_AND_SET_CHECKPOINT";
      platform: "YOUTUBE";
      connectorId: string;
      expected: SocialSyncCheckpointV1;
      next: SocialSyncCheckpointV1;
    };

export type PlanYouTubeCanonicalPersistenceInputV1 = {
  report: YouTubeAnalyticsChannelLiveRunV1;
  handoff: YouTubeCanonicalIngestionHandoffV1;
  persistedSnapshots: readonly CanonicalSocialAccountSnapshotV1[];
  persistedCheckpoint?: SocialSyncCheckpointV1 | null;
  now: string;
};

export type YouTubeCanonicalPersistencePlanV1 = {
  contractVersion: "YouTubeCanonicalPersistencePlanV1";
  generatedAt: string;
  platform: "YOUTUBE";
  connectorId: string;
  runId: string;
  disposition: YouTubeCanonicalPersistenceDispositionV1;
  reasonCodes: readonly YouTubeCanonicalPersistenceReasonCodeV1[];
  candidateSnapshotId: string | null;
  operations: readonly YouTubeCanonicalPersistenceOperationV1[];
  evidenceRefs: readonly string[];
  localCanonicalPersistencePlanAllowed: boolean;
  canonicalPersistencePerformed: false;
  providerWritesAllowed: false;
  externalActionAuthorityGranted: false;
  causalClaimsCreated: false;
  attributionClaimsCreated: false;
};

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

function normalizeCheckpoint(input: SocialSyncCheckpointV1 | null | undefined): SocialSyncCheckpointV1 {
  const cursor = input?.cursor?.trim() || null;
  const completedThroughAt = input?.completedThroughAt
    ? requireIso(input.completedThroughAt, "persistedCheckpoint.completedThroughAt")
    : null;
  return freeze({ cursor, completedThroughAt });
}

function checkpointsEqual(left: SocialSyncCheckpointV1, right: SocialSyncCheckpointV1): boolean {
  return left.cursor === right.cursor && left.completedThroughAt === right.completedThroughAt;
}

function normalizeRefs(refs: readonly string[]): readonly string[] {
  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function refsEqual(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizeRefs(left);
  const b = normalizeRefs(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function result(input: {
  generatedAt: string;
  handoff: YouTubeCanonicalIngestionHandoffV1;
  disposition: YouTubeCanonicalPersistenceDispositionV1;
  reasonCodes: readonly YouTubeCanonicalPersistenceReasonCodeV1[];
  operations?: readonly YouTubeCanonicalPersistenceOperationV1[];
}): YouTubeCanonicalPersistencePlanV1 {
  const operations = input.operations ?? [];
  return freeze({
    contractVersion: "YouTubeCanonicalPersistencePlanV1",
    generatedAt: input.generatedAt,
    platform: "YOUTUBE",
    connectorId: input.handoff.connectorId,
    runId: input.handoff.runId,
    disposition: input.disposition,
    reasonCodes: [...new Set(input.reasonCodes)].sort((left, right) => left.localeCompare(right)),
    candidateSnapshotId: input.handoff.projection?.snapshot.snapshotId ?? null,
    operations,
    evidenceRefs: normalizeRefs(input.handoff.evidenceRefs),
    localCanonicalPersistencePlanAllowed: input.disposition === "APPLY" && operations.length > 0,
    canonicalPersistencePerformed: false,
    providerWritesAllowed: false,
    externalActionAuthorityGranted: false,
    causalClaimsCreated: false,
    attributionClaimsCreated: false
  });
}

function verify(
  generatedAt: string,
  handoff: YouTubeCanonicalIngestionHandoffV1,
  reason: YouTubeCanonicalPersistenceReasonCodeV1
): YouTubeCanonicalPersistencePlanV1 {
  return result({ generatedAt, handoff, disposition: "VERIFICATION_REQUIRED", reasonCodes: [reason] });
}

export function planYouTubeCanonicalPersistenceV1(
  input: PlanYouTubeCanonicalPersistenceInputV1
): YouTubeCanonicalPersistencePlanV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.persistedSnapshots)) throw new Error("persistedSnapshots must be an array");
  const generatedAt = requireIso(input.now, "now");
  const nowMs = Date.parse(generatedAt);
  const { report, handoff } = input;

  if (report.contractVersion !== "YouTubeAnalyticsChannelLiveRunV1" || report.platform !== "YOUTUBE") {
    throw new Error("report must be an exact YouTubeAnalyticsChannelLiveRunV1 artifact");
  }
  if (handoff.contractVersion !== "YouTubeCanonicalIngestionHandoffV1" || handoff.platform !== "YOUTUBE") {
    throw new Error("handoff must be an exact YouTubeCanonicalIngestionHandoffV1 artifact");
  }
  if (handoff.generatedAt && Date.parse(requireIso(handoff.generatedAt, "handoff.generatedAt")) > nowMs) {
    throw new Error("handoff cannot be future-dated");
  }

  if (
    handoff.connectorId !== report.connectorId ||
    handoff.runId !== report.runId ||
    report.providerRun.connectorId !== report.connectorId ||
    report.providerRun.runId !== report.runId
  ) {
    return verify(generatedAt, handoff, "HANDOFF_IDENTITY_MISMATCH");
  }

  if (
    report.authorizationBoundary !== "READ_ONLY_REQUIRED_SCOPES_ONLY" ||
    report.providerWritesPerformed !== false ||
    report.providerRun.readOnly !== true ||
    report.providerRun.writesPerformed !== false ||
    handoff.providerWritesPerformed !== false ||
    handoff.canonicalPersistencePerformed !== false ||
    handoff.canonicalPersistenceAuthorized !== false ||
    handoff.externalActionAuthorityGranted !== false ||
    handoff.causalClaimsCreated !== false ||
    handoff.attributionClaimsCreated !== false
  ) {
    return verify(generatedAt, handoff, "HANDOFF_AUTHORITY_WIDENED");
  }

  if (handoff.state !== "READY_TO_APPEND" && handoff.state !== "ALREADY_PRESENT") {
    return verify(generatedAt, handoff, "HANDOFF_NOT_PERSISTABLE");
  }

  const projection = handoff.projection;
  const acceptance = handoff.syncAcceptance;
  const upstreamAppendPlan = handoff.appendPlan;
  if (!projection || !acceptance || !upstreamAppendPlan || !handoff.projectedLedger) {
    return verify(generatedAt, handoff, "HANDOFF_INCOMPLETE");
  }

  const candidate = projection.snapshot;
  if (
    projection.projectionState !== "READY" ||
    candidate.platform !== "YOUTUBE" ||
    candidate.snapshotId !== handoff.candidateSnapshotId ||
    acceptance.platform !== "YOUTUBE" ||
    acceptance.connectorId !== handoff.connectorId ||
    acceptance.runId !== handoff.runId ||
    acceptance.outcome !== "SUCCESS" ||
    !acceptance.acceptedForLiveProof ||
    !acceptance.proof ||
    acceptance.checkpointAction !== "ADVANCE_COMPLETED" ||
    acceptance.retryRequired ||
    acceptance.writesPerformed !== false ||
    candidate.writesPerformed !== false
  ) {
    return verify(generatedAt, handoff, "HANDOFF_INCOMPLETE");
  }

  if (
    acceptance.proof.snapshot.snapshotId !== candidate.snapshotId ||
    acceptance.proof.retrievedAt !== candidate.retrievedAt ||
    acceptance.nextCheckpoint.cursor !== null ||
    acceptance.nextCheckpoint.completedThroughAt !== candidate.retrievedAt ||
    upstreamAppendPlan.snapshotId !== candidate.snapshotId ||
    upstreamAppendPlan.platform !== "YOUTUBE" ||
    upstreamAppendPlan.accountId !== candidate.accountId ||
    upstreamAppendPlan.writesPerformed !== false ||
    !refsEqual(report.evidenceRefs, handoff.providerEvidenceRefs)
  ) {
    return verify(generatedAt, handoff, "HANDOFF_IDENTITY_MISMATCH");
  }

  if (
    (handoff.state === "READY_TO_APPEND" && upstreamAppendPlan.decision !== "APPEND") ||
    (handoff.state === "ALREADY_PRESENT" && upstreamAppendPlan.decision !== "NOOP_DUPLICATE")
  ) {
    return verify(generatedAt, handoff, "HANDOFF_INCOMPLETE");
  }

  const providerPrevious = report.providerRun.previousSuccessfulSyncAt
    ? requireIso(report.providerRun.previousSuccessfulSyncAt, "report.providerRun.previousSuccessfulSyncAt")
    : null;
  const expectedPrior = freeze({ cursor: null, completedThroughAt: providerPrevious });
  const targetCheckpoint = freeze({
    cursor: acceptance.nextCheckpoint.cursor,
    completedThroughAt: acceptance.nextCheckpoint.completedThroughAt
  });
  const persistedCheckpoint = normalizeCheckpoint(input.persistedCheckpoint);

  if (persistedCheckpoint.cursor !== null) {
    return verify(generatedAt, handoff, "CURRENT_CHECKPOINT_MISMATCH");
  }
  const checkpointAtPrior = checkpointsEqual(persistedCheckpoint, expectedPrior);
  const checkpointAtTarget = checkpointsEqual(persistedCheckpoint, targetCheckpoint);
  if (!checkpointAtPrior && !checkpointAtTarget) {
    return verify(generatedAt, handoff, "PROVIDER_LINEAGE_MISMATCH");
  }

  const currentAppendPlan = planSocialHistoryAppendV1(candidate, input.persistedSnapshots, generatedAt);
  if (currentAppendPlan.decision === "VERIFY_CONFLICT") {
    return verify(generatedAt, handoff, "SNAPSHOT_CONFLICT");
  }

  if (currentAppendPlan.decision === "NOOP_DUPLICATE") {
    if (checkpointAtTarget) {
      return result({
        generatedAt,
        handoff,
        disposition: "NOOP",
        reasonCodes: ["ALREADY_PERSISTED"]
      });
    }
    return result({
      generatedAt,
      handoff,
      disposition: "APPLY",
      reasonCodes: ["SNAPSHOT_ALREADY_PERSISTED_ADVANCE_CHECKPOINT"],
      operations: [
        {
          kind: "COMPARE_AND_SET_CHECKPOINT",
          platform: "YOUTUBE",
          connectorId: handoff.connectorId,
          expected: expectedPrior,
          next: targetCheckpoint
        }
      ]
    });
  }

  if (checkpointAtTarget) {
    return verify(generatedAt, handoff, "CHECKPOINT_AHEAD_OF_SNAPSHOT");
  }

  return result({
    generatedAt,
    handoff,
    disposition: "APPLY",
    reasonCodes: ["READY_TO_APPLY"],
    operations: [
      {
        kind: "APPEND_CANONICAL_SNAPSHOT",
        canonicalKey: currentAppendPlan.canonicalKey,
        snapshot: candidate
      },
      {
        kind: "COMPARE_AND_SET_CHECKPOINT",
        platform: "YOUTUBE",
        connectorId: handoff.connectorId,
        expected: expectedPrior,
        next: targetCheckpoint
      }
    ]
  });
}
