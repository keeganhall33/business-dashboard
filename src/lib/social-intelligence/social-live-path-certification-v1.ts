import type { SocialChannelDrilldownV1 } from "./social-channel-drilldown-v1";
import type { SocialConnectorHealthReviewV1 } from "./social-connector-health-review-v1";
import type { SocialSnapshotHistoryLedgerV1 } from "./social-snapshot-history-ledger-v1";
import type { SocialSyncRunAcceptanceV1 } from "./social-sync-acceptance-v1";

export const SOCIAL_LIVE_PATH_CERTIFICATION_STATES_V1 = ["CERTIFIED", "WITHHELD"] as const;
export type SocialLivePathCertificationStateV1 = (typeof SOCIAL_LIVE_PATH_CERTIFICATION_STATES_V1)[number];

export const SOCIAL_LIVE_PATH_BLOCKERS_V1 = [
  "SYNC_NOT_ACCEPTED",
  "SYNC_NOT_SUCCESSFUL",
  "PROOF_MISSING",
  "PROOF_STALE",
  "CONNECTOR_HEALTH_NOT_CURRENT",
  "CONNECTOR_NOT_HEALTHY",
  "HEALTH_RUN_MISMATCH",
  "HEALTH_PROOF_MISMATCH",
  "HISTORY_ACCOUNT_MISSING",
  "HISTORY_LATEST_MISMATCH",
  "HISTORY_NOT_DECISION_READY",
  "DRILLDOWN_IDENTITY_MISMATCH",
  "DRILLDOWN_NOT_READY",
  "NO_DECISION_GRADE_METRICS",
  "EVIDENCE_MISSING"
] as const;
export type SocialLivePathBlockerV1 = (typeof SOCIAL_LIVE_PATH_BLOCKERS_V1)[number];

export type SocialLivePathCertificationV1 = {
  contractVersion: "SocialLivePathCertificationV1";
  generatedAt: string;
  platform: SocialSyncRunAcceptanceV1["platform"];
  connectorId: string;
  runId: string;
  accountId: string | null;
  snapshotId: string | null;
  state: SocialLivePathCertificationStateV1;
  blockers: readonly SocialLivePathBlockerV1[];
  evidenceRefs: readonly string[];
  decisionGradeMetricKeys: readonly string[];
  sourceFresh: boolean;
  providerToCanonicalProven: boolean;
  canonicalHistoryProven: boolean;
  userVisibleDrilldownProven: boolean;
  causalClaimsCreated: false;
  attributionClaimsCreated: false;
  externalActionAuthorityGranted: false;
  externalAccessPerformed: false;
  writesPerformed: false;
};

export type CompileSocialLivePathCertificationOptionsV1 = {
  now: string;
  staleAfterHours?: number;
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

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function allIncluded(haystack: readonly string[], needles: readonly string[]): boolean {
  const known = new Set(haystack);
  return needles.every((value) => known.has(value));
}

export function compileSocialLivePathCertificationV1(
  sync: SocialSyncRunAcceptanceV1,
  health: SocialConnectorHealthReviewV1,
  history: SocialSnapshotHistoryLedgerV1,
  drilldown: SocialChannelDrilldownV1,
  options: CompileSocialLivePathCertificationOptionsV1
): SocialLivePathCertificationV1 {
  if (!sync || sync.contractVersion !== "SocialSyncRunAcceptanceV1") {
    throw new Error("sync must be SocialSyncRunAcceptanceV1");
  }
  if (!health || health.contractVersion !== "SocialConnectorHealthReviewV1") {
    throw new Error("health must be SocialConnectorHealthReviewV1");
  }
  if (!history || history.contractVersion !== "SocialSnapshotHistoryLedgerV1") {
    throw new Error("history must be SocialSnapshotHistoryLedgerV1");
  }
  if (!drilldown || drilldown.contractVersion !== "SocialChannelDrilldownV1") {
    throw new Error("drilldown must be SocialChannelDrilldownV1");
  }

  const now = requireIso(options.now, "now");
  const nowMs = Date.parse(now);
  const staleAfterHours = options.staleAfterHours ?? 48;
  if (!Number.isFinite(staleAfterHours) || staleAfterHours <= 0) {
    throw new Error("staleAfterHours must be positive");
  }

  const healthGeneratedAt = requireIso(health.generatedAt, "health.generatedAt");
  const historyGeneratedAt = requireIso(history.generatedAt, "history.generatedAt");
  if (Date.parse(healthGeneratedAt) > nowMs) throw new Error("health.generatedAt cannot be in the future");
  if (Date.parse(historyGeneratedAt) > nowMs) throw new Error("history.generatedAt cannot be in the future");

  const blockers = new Set<SocialLivePathBlockerV1>();
  const proof = sync.proof;
  const snapshot = proof?.snapshot ?? null;
  const accountId = snapshot?.accountId ?? null;
  const snapshotId = snapshot?.snapshotId ?? null;

  if (!sync.acceptedForLiveProof) blockers.add("SYNC_NOT_ACCEPTED");
  if (sync.outcome !== "SUCCESS") blockers.add("SYNC_NOT_SUCCESSFUL");
  if (!proof || !snapshot) blockers.add("PROOF_MISSING");

  let sourceFresh = false;
  if (proof) {
    const retrievedAt = requireIso(proof.retrievedAt, "sync.proof.retrievedAt");
    const retrievedMs = Date.parse(retrievedAt);
    if (retrievedMs > nowMs) throw new Error("sync proof cannot be future-dated");
    sourceFresh = nowMs - retrievedMs <= staleAfterHours * 60 * 60 * 1000;
    if (!sourceFresh) blockers.add("PROOF_STALE");
  }

  const healthAgeFresh = nowMs - Date.parse(healthGeneratedAt) <= staleAfterHours * 60 * 60 * 1000;
  if (!healthAgeFresh) blockers.add("CONNECTOR_HEALTH_NOT_CURRENT");

  const healthRow = health.platforms.find((row) => row.platform === sync.platform) ?? null;
  if (!healthRow || healthRow.connectorId !== sync.connectorId) {
    blockers.add("CONNECTOR_HEALTH_NOT_CURRENT");
  } else {
    if (healthRow.sourceHealth !== "HEALTHY" || healthRow.canonicalDataState !== "CURRENT" || !healthRow.liveFirstPartyDataProven) {
      blockers.add("CONNECTOR_NOT_HEALTHY");
    }
    if (healthRow.latestProviderRunId !== sync.runId || healthRow.latestProviderRunState !== "COMPLETE") {
      blockers.add("HEALTH_RUN_MISMATCH");
    }
    if (proof && healthRow.latestCanonicalProofAt !== requireIso(proof.retrievedAt, "sync.proof.retrievedAt")) {
      blockers.add("HEALTH_PROOF_MISMATCH");
    }
    if (proof && (!allIncluded(healthRow.evidenceRefs, proof.providerEvidenceRefs) || !allIncluded(healthRow.evidenceRefs, snapshot?.evidenceRefs ?? []))) {
      blockers.add("EVIDENCE_MISSING");
    }
  }

  const historyAgeFresh = nowMs - Date.parse(historyGeneratedAt) <= staleAfterHours * 60 * 60 * 1000;
  if (!historyAgeFresh) blockers.add("HISTORY_NOT_DECISION_READY");

  const historyAccount = snapshot
    ? history.accounts.find((row) => row.platform === sync.platform && row.accountId === snapshot.accountId) ?? null
    : null;
  if (snapshot && !historyAccount) {
    blockers.add("HISTORY_ACCOUNT_MISSING");
  } else if (snapshot && historyAccount) {
    if (historyAccount.latestSnapshotId !== snapshot.snapshotId) blockers.add("HISTORY_LATEST_MISMATCH");
    if (!historyAccount.decisionReady) blockers.add("HISTORY_NOT_DECISION_READY");
    if (!allIncluded(historyAccount.evidenceRefs, snapshot.evidenceRefs)) blockers.add("EVIDENCE_MISSING");
  }

  if (
    !snapshot ||
    drilldown.platform !== sync.platform ||
    drilldown.accountId !== snapshot.accountId ||
    drilldown.snapshotId !== snapshot.snapshotId
  ) {
    blockers.add("DRILLDOWN_IDENTITY_MISMATCH");
  }
  if (drilldown.availability !== "READY") blockers.add("DRILLDOWN_NOT_READY");
  if (drilldown.causalAttributionClaimed !== false || drilldown.externalAccessPerformed !== false || drilldown.writesPerformed !== false) {
    blockers.add("DRILLDOWN_NOT_READY");
  }

  const decisionGradeMetricKeys = unique(
    drilldown.metrics.filter((metric) => metric.decisionGrade).map((metric) => metric.key)
  );
  if (!decisionGradeMetricKeys.length) blockers.add("NO_DECISION_GRADE_METRICS");

  const evidenceRefs = unique([
    ...(sync.providerEvidenceRefs ?? []),
    ...(proof?.providerEvidenceRefs ?? []),
    ...(snapshot?.evidenceRefs ?? []),
    ...(healthRow?.evidenceRefs ?? []),
    ...(historyAccount?.evidenceRefs ?? []),
    ...(drilldown.evidenceRefs ?? [])
  ]);
  if (!evidenceRefs.length) blockers.add("EVIDENCE_MISSING");

  const providerToCanonicalProven = Boolean(
    proof &&
      sync.acceptedForLiveProof &&
      sync.outcome === "SUCCESS" &&
      healthRow &&
      healthRow.sourceHealth === "HEALTHY" &&
      healthRow.canonicalDataState === "CURRENT" &&
      healthRow.latestProviderRunId === sync.runId &&
      healthRow.latestProviderRunState === "COMPLETE" &&
      healthRow.latestCanonicalProofAt === requireIso(proof.retrievedAt, "sync.proof.retrievedAt")
  );

  const canonicalHistoryProven = Boolean(
    snapshot &&
      historyAccount &&
      historyAccount.latestSnapshotId === snapshot.snapshotId &&
      historyAccount.decisionReady
  );

  const userVisibleDrilldownProven = Boolean(
    snapshot &&
      drilldown.platform === sync.platform &&
      drilldown.accountId === snapshot.accountId &&
      drilldown.snapshotId === snapshot.snapshotId &&
      drilldown.availability === "READY" &&
      decisionGradeMetricKeys.length > 0
  );

  const normalizedBlockers = [...blockers].sort((left, right) => left.localeCompare(right));
  const state: SocialLivePathCertificationStateV1 = normalizedBlockers.length === 0 ? "CERTIFIED" : "WITHHELD";

  return freeze({
    contractVersion: "SocialLivePathCertificationV1",
    generatedAt: now,
    platform: sync.platform,
    connectorId: sync.connectorId,
    runId: sync.runId,
    accountId,
    snapshotId,
    state,
    blockers: normalizedBlockers,
    evidenceRefs,
    decisionGradeMetricKeys,
    sourceFresh,
    providerToCanonicalProven,
    canonicalHistoryProven,
    userVisibleDrilldownProven,
    causalClaimsCreated: false,
    attributionClaimsCreated: false,
    externalActionAuthorityGranted: false,
    externalAccessPerformed: false,
    writesPerformed: false
  });
}
