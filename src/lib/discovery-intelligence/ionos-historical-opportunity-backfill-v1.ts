import {
  compileOpportunityImportHandoffV1,
  type OpportunityHandoffEvidenceFieldV1,
  type OpportunityHandoffTruthStateV1,
  type OpportunityImportHandoffResultV1
} from "../relationships-crm/opportunity-import-handoff-v1";

export const IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION =
  "IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_V1" as const;
export const IONOS_HISTORICAL_OPPORTUNITY_EVIDENCE_CONTRACT =
  "CANONICAL_EXTRACTED_OPPORTUNITY_EVIDENCE_V1" as const;

export type IonosHistoricalOpportunityBackfillSourceStateV1 =
  | "CURRENT"
  | "STALE"
  | "PARTIAL"
  | "CONFLICTED";

export type IonosHistoricalOpportunityBackfillCheckpointV1 = Readonly<{
  version: typeof IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION;
  mailboxRef: string;
  windowStart: string;
  windowEnd: string;
  throughObservedAt: string;
  throughSourceRecordRef: string;
}>;

export type IonosHistoricalOpportunityCandidateV1 = {
  sourceCandidateKey: string;
  title: OpportunityHandoffEvidenceFieldV1;
  truthState: OpportunityHandoffTruthStateV1;
  evidenceRefs: readonly string[];
  personRefs?: readonly string[];
  organizationRefs?: readonly string[];
  existingOpportunityRef?: string | null;
  summary?: OpportunityHandoffEvidenceFieldV1 | null;
  whyNow?: OpportunityHandoffEvidenceFieldV1 | null;
  recommendedNextAction?: OpportunityHandoffEvidenceFieldV1 | null;
  planningWindow?: OpportunityHandoffEvidenceFieldV1 | null;
};

export type IonosHistoricalOpportunityRecordV1 = {
  sourceRecordRef: string;
  sourceMessageRef: string;
  messageObservedAt: string;
  evidenceContract: typeof IONOS_HISTORICAL_OPPORTUNITY_EVIDENCE_CONTRACT;
  candidate: IonosHistoricalOpportunityCandidateV1;
};

export type IonosHistoricalOpportunityBackfillInputV1 = {
  mailboxRef: string;
  asOf: string;
  snapshotObservedAt: string;
  snapshotExpiresAt: string;
  sourceState: IonosHistoricalOpportunityBackfillSourceStateV1;
  windowStart: string;
  windowEnd: string;
  checkpoint?: IonosHistoricalOpportunityBackfillCheckpointV1 | null;
  records: readonly IonosHistoricalOpportunityRecordV1[];
};

export type IonosHistoricalOpportunityReviewCandidateV1 = Readonly<{
  sourceRecordRef: string;
  sourceMessageRef: string;
  messageObservedAt: string;
  handoff: OpportunityImportHandoffResultV1;
  qualificationAuthority: "REVIEW_ONLY";
  relationshipInferencePerformed: false;
  contactInfoInferencePerformed: false;
  sponsorshipInferencePerformed: false;
  decisionAuthorityInferencePerformed: false;
  timingInferencePerformed: false;
  monetaryValueInferencePerformed: false;
}>;

export type IonosHistoricalOpportunityBackfillResultV1 = Readonly<{
  version: typeof IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION;
  status: "READY_FOR_REVIEW" | "BLOCKED";
  reasonCodes: readonly string[];
  mailboxRef: string;
  windowStart: string;
  windowEnd: string;
  reviewCandidates: readonly IonosHistoricalOpportunityReviewCandidateV1[];
  skippedAlreadyProcessed: readonly string[];
  blockedSourceRecordRef: string | null;
  nextCheckpoint: IonosHistoricalOpportunityBackfillCheckpointV1 | null;
  crmMutationPerformed: false;
  mailboxMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const SOURCE_STATES = new Set<IonosHistoricalOpportunityBackfillSourceStateV1>([
  "CURRENT",
  "STALE",
  "PARTIAL",
  "CONFLICTED"
]);
const TRUTH_STATES = new Set<OpportunityHandoffTruthStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED",
  "PARTIAL"
]);
const INPUT_KEYS = new Set([
  "mailboxRef",
  "asOf",
  "snapshotObservedAt",
  "snapshotExpiresAt",
  "sourceState",
  "windowStart",
  "windowEnd",
  "checkpoint",
  "records"
]);
const CHECKPOINT_KEYS = new Set([
  "version",
  "mailboxRef",
  "windowStart",
  "windowEnd",
  "throughObservedAt",
  "throughSourceRecordRef"
]);
const RECORD_KEYS = new Set([
  "sourceRecordRef",
  "sourceMessageRef",
  "messageObservedAt",
  "evidenceContract",
  "candidate"
]);
const CANDIDATE_KEYS = new Set([
  "sourceCandidateKey",
  "title",
  "truthState",
  "evidenceRefs",
  "personRefs",
  "organizationRefs",
  "existingOpportunityRef",
  "summary",
  "whyNow",
  "recommendedNextAction",
  "planningWindow"
]);
const FIELD_KEYS = new Set(["state", "value", "evidenceRefs"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKeys(value: unknown, allowed: ReadonlySet<string>, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredText(value, label);
}

function refs(value: unknown, label: string, required = false): readonly string[] {
  if (value == null) {
    if (required) throw new Error(`${label} must be a non-empty array`);
    return Object.freeze([]);
  }
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = [...new Set(value.map((item, index) => requiredText(item, `${label}[${index}]`)))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (required && normalized.length === 0) throw new Error(`${label} must be a non-empty array`);
  return Object.freeze(normalized);
}

function timestamp(value: unknown, label: string): Readonly<{ iso: string; ms: number }> {
  const text = requiredText(value, label);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be a valid timestamp`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function uniqueReasons(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function normalizeField(
  value: unknown,
  label: string,
  required = false
): Readonly<OpportunityHandoffEvidenceFieldV1> | null {
  if (value == null) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  assertKeys(value, FIELD_KEYS, label);
  if (typeof value.state !== "string" || !TRUTH_STATES.has(value.state as OpportunityHandoffTruthStateV1)) {
    throw new Error(`${label}.state is unsupported`);
  }
  const state = value.state as OpportunityHandoffTruthStateV1;
  const normalizedValue = value.value == null ? null : requiredText(value.value, `${label}.value`);
  const evidenceRefs = refs(value.evidenceRefs, `${label}.evidenceRefs`, true);
  if (state === "KNOWN" && normalizedValue == null) {
    throw new Error(`${label}.value is required when state is KNOWN`);
  }
  return freezeDeep({ state, value: normalizedValue, evidenceRefs: [...evidenceRefs] });
}

function cursorCompare(
  left: Readonly<{ observedAtMs: number; sourceRecordRef: string }>,
  right: Readonly<{ observedAtMs: number; sourceRecordRef: string }>
): number {
  if (left.observedAtMs !== right.observedAtMs) return left.observedAtMs - right.observedAtMs;
  return left.sourceRecordRef.localeCompare(right.sourceRecordRef);
}

function blockedResult(
  mailboxRef: string,
  windowStart: string,
  windowEnd: string,
  reasons: readonly string[],
  checkpoint: IonosHistoricalOpportunityBackfillCheckpointV1 | null,
  blockedSourceRecordRef: string | null,
  reviewCandidates: readonly IonosHistoricalOpportunityReviewCandidateV1[] = [],
  skippedAlreadyProcessed: readonly string[] = []
): IonosHistoricalOpportunityBackfillResultV1 {
  return freezeDeep({
    version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
    status: "BLOCKED" as const,
    reasonCodes: [...uniqueReasons(reasons)],
    mailboxRef,
    windowStart,
    windowEnd,
    reviewCandidates: [...reviewCandidates],
    skippedAlreadyProcessed: [...skippedAlreadyProcessed],
    blockedSourceRecordRef,
    nextCheckpoint: checkpoint,
    crmMutationPerformed: false as const,
    mailboxMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}

export function compileIonosHistoricalOpportunityBackfillV1(
  input: IonosHistoricalOpportunityBackfillInputV1
): IonosHistoricalOpportunityBackfillResultV1 {
  assertKeys(input, INPUT_KEYS, "input");
  const mailboxRef = requiredText(input.mailboxRef, "mailboxRef");
  const asOf = timestamp(input.asOf, "asOf");
  const snapshotObservedAt = timestamp(input.snapshotObservedAt, "snapshotObservedAt");
  const snapshotExpiresAt = timestamp(input.snapshotExpiresAt, "snapshotExpiresAt");
  const windowStart = timestamp(input.windowStart, "windowStart");
  const windowEnd = timestamp(input.windowEnd, "windowEnd");

  if (typeof input.sourceState !== "string" || !SOURCE_STATES.has(input.sourceState as IonosHistoricalOpportunityBackfillSourceStateV1)) {
    throw new Error("sourceState is unsupported");
  }
  if (!Array.isArray(input.records)) throw new Error("records must be an array");

  const sourceState = input.sourceState as IonosHistoricalOpportunityBackfillSourceStateV1;
  const sourceReasons: string[] = [];
  if (sourceState !== "CURRENT") sourceReasons.push(`SOURCE_${sourceState}_BLOCKS_BACKFILL`);
  if (snapshotObservedAt.ms > asOf.ms) sourceReasons.push("FUTURE_SNAPSHOT_OBSERVATION_BLOCKS_BACKFILL");
  if (snapshotObservedAt.ms > snapshotExpiresAt.ms) sourceReasons.push("INVALID_SNAPSHOT_FRESHNESS_RANGE");
  if (asOf.ms > snapshotExpiresAt.ms) sourceReasons.push("SNAPSHOT_EXPIRED_BLOCKS_BACKFILL");
  if (windowStart.ms > windowEnd.ms) sourceReasons.push("INVALID_BACKFILL_WINDOW");
  if (windowEnd.ms > snapshotObservedAt.ms) sourceReasons.push("WINDOW_EXTENDS_BEYOND_OBSERVED_SNAPSHOT");
  if (windowEnd.ms > asOf.ms) sourceReasons.push("FUTURE_BACKFILL_WINDOW_BLOCKS_BACKFILL");

  let checkpoint: IonosHistoricalOpportunityBackfillCheckpointV1 | null = null;
  let checkpointCursor: Readonly<{ observedAtMs: number; sourceRecordRef: string }> | null = null;
  if (input.checkpoint != null) {
    assertKeys(input.checkpoint, CHECKPOINT_KEYS, "checkpoint");
    if (input.checkpoint.version !== IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION) {
      sourceReasons.push("CHECKPOINT_VERSION_MISMATCH");
    }
    const checkpointMailboxRef = requiredText(input.checkpoint.mailboxRef, "checkpoint.mailboxRef");
    const checkpointWindowStart = timestamp(input.checkpoint.windowStart, "checkpoint.windowStart");
    const checkpointWindowEnd = timestamp(input.checkpoint.windowEnd, "checkpoint.windowEnd");
    const throughObservedAt = timestamp(input.checkpoint.throughObservedAt, "checkpoint.throughObservedAt");
    const throughSourceRecordRef = requiredText(
      input.checkpoint.throughSourceRecordRef,
      "checkpoint.throughSourceRecordRef"
    );
    if (
      checkpointMailboxRef !== mailboxRef ||
      checkpointWindowStart.iso !== windowStart.iso ||
      checkpointWindowEnd.iso !== windowEnd.iso
    ) {
      sourceReasons.push("CHECKPOINT_SCOPE_MISMATCH");
    }
    if (throughObservedAt.ms < windowStart.ms || throughObservedAt.ms > windowEnd.ms) {
      sourceReasons.push("CHECKPOINT_OUTSIDE_BACKFILL_WINDOW");
    }
    checkpoint = freezeDeep({
      version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
      mailboxRef: checkpointMailboxRef,
      windowStart: checkpointWindowStart.iso,
      windowEnd: checkpointWindowEnd.iso,
      throughObservedAt: throughObservedAt.iso,
      throughSourceRecordRef
    });
    checkpointCursor = { observedAtMs: throughObservedAt.ms, sourceRecordRef: throughSourceRecordRef };
  }

  if (sourceReasons.length > 0) {
    return blockedResult(mailboxRef, windowStart.iso, windowEnd.iso, sourceReasons, checkpoint, null);
  }

  const normalizedRecords = input.records.map((rawRecord, index) => {
    assertKeys(rawRecord, RECORD_KEYS, `records[${index}]`);
    const sourceRecordRef = requiredText(rawRecord.sourceRecordRef, `records[${index}].sourceRecordRef`);
    const sourceMessageRef = requiredText(rawRecord.sourceMessageRef, `records[${index}].sourceMessageRef`);
    const messageObservedAt = timestamp(rawRecord.messageObservedAt, `records[${index}].messageObservedAt`);
    if (rawRecord.evidenceContract !== IONOS_HISTORICAL_OPPORTUNITY_EVIDENCE_CONTRACT) {
      throw new Error(`records[${index}].evidenceContract is unsupported`);
    }
    assertKeys(rawRecord.candidate, CANDIDATE_KEYS, `records[${index}].candidate`);
    return {
      rawRecord,
      sourceRecordRef,
      sourceMessageRef,
      messageObservedAt,
      cursor: { observedAtMs: messageObservedAt.ms, sourceRecordRef }
    };
  });

  const duplicateRecordRefs = new Set<string>();
  const seenRecordRefs = new Set<string>();
  for (const record of normalizedRecords) {
    if (seenRecordRefs.has(record.sourceRecordRef)) duplicateRecordRefs.add(record.sourceRecordRef);
    seenRecordRefs.add(record.sourceRecordRef);
  }
  if (duplicateRecordRefs.size > 0) {
    return blockedResult(
      mailboxRef,
      windowStart.iso,
      windowEnd.iso,
      ["DUPLICATE_SOURCE_RECORD_REF_BLOCKS_BACKFILL"],
      checkpoint,
      [...duplicateRecordRefs].sort((a, b) => a.localeCompare(b))[0] ?? null
    );
  }

  normalizedRecords.sort((left, right) => cursorCompare(left.cursor, right.cursor));
  const reviewCandidates: IonosHistoricalOpportunityReviewCandidateV1[] = [];
  const skippedAlreadyProcessed: string[] = [];
  let nextCheckpoint = checkpoint;

  for (const record of normalizedRecords) {
    if (checkpointCursor && cursorCompare(record.cursor, checkpointCursor) <= 0) {
      skippedAlreadyProcessed.push(record.sourceRecordRef);
      continue;
    }

    const recordReasons: string[] = [];
    if (record.messageObservedAt.ms < windowStart.ms || record.messageObservedAt.ms > windowEnd.ms) {
      recordReasons.push("RECORD_OUTSIDE_BACKFILL_WINDOW");
    }
    if (record.messageObservedAt.ms > snapshotObservedAt.ms || record.messageObservedAt.ms > asOf.ms) {
      recordReasons.push("FUTURE_RECORD_OBSERVATION_BLOCKS_BACKFILL");
    }

    const candidate = record.rawRecord.candidate as unknown as IonosHistoricalOpportunityCandidateV1;
    const title = normalizeField(candidate.title, `record:${record.sourceRecordRef}.candidate.title`, true);
    if (!title || title.state !== "KNOWN" || title.value == null) {
      recordReasons.push("KNOWN_EVIDENCED_TITLE_REQUIRED");
    }
    if (typeof candidate.truthState !== "string" || !TRUTH_STATES.has(candidate.truthState as OpportunityHandoffTruthStateV1)) {
      throw new Error(`record:${record.sourceRecordRef}.candidate.truthState is unsupported`);
    }
    const truthState = candidate.truthState as OpportunityHandoffTruthStateV1;
    if (truthState !== "KNOWN") recordReasons.push(`TRUTH_${truthState}_BLOCKS_HISTORICAL_CAPTURE`);

    const candidateEvidenceRefs = refs(
      candidate.evidenceRefs,
      `record:${record.sourceRecordRef}.candidate.evidenceRefs`,
      true
    );
    const personRefs = refs(candidate.personRefs, `record:${record.sourceRecordRef}.candidate.personRefs`);
    const organizationRefs = refs(
      candidate.organizationRefs,
      `record:${record.sourceRecordRef}.candidate.organizationRefs`
    );
    const existingOpportunityRef = optionalText(
      candidate.existingOpportunityRef,
      `record:${record.sourceRecordRef}.candidate.existingOpportunityRef`
    );
    const summary = normalizeField(candidate.summary, `record:${record.sourceRecordRef}.candidate.summary`);
    const whyNow = normalizeField(candidate.whyNow, `record:${record.sourceRecordRef}.candidate.whyNow`);
    const recommendedNextAction = normalizeField(
      candidate.recommendedNextAction,
      `record:${record.sourceRecordRef}.candidate.recommendedNextAction`
    );
    const planningWindow = normalizeField(
      candidate.planningWindow,
      `record:${record.sourceRecordRef}.candidate.planningWindow`
    );

    if (recordReasons.length > 0 || !title || title.value == null) {
      return blockedResult(
        mailboxRef,
        windowStart.iso,
        windowEnd.iso,
        recordReasons,
        nextCheckpoint,
        record.sourceRecordRef,
        reviewCandidates,
        skippedAlreadyProcessed
      );
    }

    const evidenceRefs = refs(
      [
        ...candidateEvidenceRefs,
        ...title.evidenceRefs,
        ...(summary?.evidenceRefs ?? []),
        ...(whyNow?.evidenceRefs ?? []),
        ...(recommendedNextAction?.evidenceRefs ?? []),
        ...(planningWindow?.evidenceRefs ?? [])
      ],
      `record:${record.sourceRecordRef}.combinedEvidenceRefs`,
      true
    );
    const sourceCandidateKey = requiredText(
      candidate.sourceCandidateKey,
      `record:${record.sourceRecordRef}.candidate.sourceCandidateKey`
    );

    const handoff = compileOpportunityImportHandoffV1({
      source: "IONOS",
      sourceInteractionRef: `${mailboxRef}#${record.sourceMessageRef}`,
      candidate: {
        sourceCandidateKey,
        title: title.value,
        qualification: "CANDIDATE",
        truthState,
        evidenceRefs,
        personRefs,
        organizationRefs,
        existingOpportunityRef,
        summary,
        whyNow,
        recommendedNextAction,
        planningWindow
      }
    });

    reviewCandidates.push(
      freezeDeep({
        sourceRecordRef: record.sourceRecordRef,
        sourceMessageRef: record.sourceMessageRef,
        messageObservedAt: record.messageObservedAt.iso,
        handoff,
        qualificationAuthority: "REVIEW_ONLY" as const,
        relationshipInferencePerformed: false as const,
        contactInfoInferencePerformed: false as const,
        sponsorshipInferencePerformed: false as const,
        decisionAuthorityInferencePerformed: false as const,
        timingInferencePerformed: false as const,
        monetaryValueInferencePerformed: false as const
      })
    );
    nextCheckpoint = freezeDeep({
      version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
      mailboxRef,
      windowStart: windowStart.iso,
      windowEnd: windowEnd.iso,
      throughObservedAt: record.messageObservedAt.iso,
      throughSourceRecordRef: record.sourceRecordRef
    });
  }

  return freezeDeep({
    version: IONOS_HISTORICAL_OPPORTUNITY_BACKFILL_VERSION,
    status: "READY_FOR_REVIEW" as const,
    reasonCodes: reviewCandidates.length > 0 ? ["HISTORICAL_EMAIL_CANDIDATES_REQUIRE_REVIEW"] : ["NO_NEW_RECORDS"],
    mailboxRef,
    windowStart: windowStart.iso,
    windowEnd: windowEnd.iso,
    reviewCandidates,
    skippedAlreadyProcessed,
    blockedSourceRecordRef: null,
    nextCheckpoint,
    crmMutationPerformed: false as const,
    mailboxMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
