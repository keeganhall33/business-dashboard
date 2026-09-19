import {
  IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_VERSION,
  type IonosBusinessMessageClaimKindV1,
  type IonosBusinessMessageContentHandoffResultV1
} from "../discovery-intelligence/ionos-business-message-content-handoff-v1";
import {
  IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION,
  type IonosEmailDirectionV1,
  type IonosEmailOpportunitySignalClassV1
} from "../discovery-intelligence/ionos-email-opportunity-capture-v1";
import { IONOS_MAILBOX_ROLES_V1, type IonosMailboxRoleV1 } from "../email/ionos-mailbox-config-v1";
import type { OpportunityHandoffTruthStateV1 } from "../relationships-crm/opportunity-import-handoff-v1";

export const IONOS_HIGH_VALUE_HISTORY_SWEEP_VERSION = "IONOS_HIGH_VALUE_HISTORY_SWEEP_V1" as const;

export type IonosHighValueHistoryReviewBandV1 =
  | "REVIEW_FIRST"
  | "REVIEW_NEXT"
  | "VERIFY_BEFORE_REVIEW";

export type IonosHighValueHistorySweepInputV1 = Readonly<{
  records: readonly IonosBusinessMessageContentHandoffResultV1[];
  now: string;
  windowStart: string;
  priorityMailboxRoles: readonly IonosMailboxRoleV1[];
  strategicEntityRefs?: readonly string[];
  maximumThreads?: number;
}>;

export type IonosHighValueHistoryThreadReviewV1 = Readonly<{
  reviewId: string;
  mailboxRole: IonosMailboxRoleV1;
  canonicalThreadRef: string;
  latestObservedAt: string;
  messageRefs: readonly string[];
  messageCount: number;
  observedDirections: readonly IonosEmailDirectionV1[];
  twoWayObserved: boolean;
  signalClasses: readonly IonosEmailOpportunitySignalClassV1[];
  claimKinds: readonly IonosBusinessMessageClaimKindV1[];
  truthState: OpportunityHandoffTruthStateV1;
  captureDispositions: readonly IonosBusinessMessageContentHandoffResultV1["disposition"][];
  personRefs: readonly string[];
  organizationRefs: readonly string[];
  opportunityRefs: readonly string[];
  matchedStrategicEntityRefs: readonly string[];
  evidenceRefs: readonly string[];
  reviewBand: IonosHighValueHistoryReviewBandV1;
  reasonCodes: readonly string[];
  replyStateEstablished: false;
  relationshipStrengthEstablished: false;
  sponsorshipEstablished: false;
  timingEstablished: false;
  opportunityQualificationEstablished: false;
  decisionAuthorityEstablished: false;
  contactInfoInferred: false;
  confidenceEstablished: false;
  monetaryValueEstablished: false;
}>;

export type IonosHighValueHistorySuppressionV1 = Readonly<{
  mailboxRole: IonosMailboxRoleV1;
  canonicalThreadRef: string;
  messageRefs: readonly string[];
  reasonCodes: readonly string[];
}>;

export type IonosHighValueHistorySweepResultV1 = Readonly<{
  version: typeof IONOS_HIGH_VALUE_HISTORY_SWEEP_VERSION;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  queue: readonly IonosHighValueHistoryThreadReviewV1[];
  suppressed: readonly IonosHighValueHistorySuppressionV1[];
  counts: Readonly<{
    inputRecords: number;
    reviewedThreads: number;
    queuedThreads: number;
    suppressedThreadsOrRecords: number;
  }>;
  mailboxMutationPerformed: false;
  smtpSendPerformed: false;
  crmMutationPerformed: false;
  externalActionPerformed: false;
  writeAuthorityGranted: false;
}>;

const MAX_RECORDS = 5_000;
const MAX_STRATEGIC_ENTITY_REFS = 500;
const DEFAULT_MAX_THREADS = 50;
const MAX_THREADS = 200;
const MAILBOX_ROLES = new Set<string>(IONOS_MAILBOX_ROLES_V1);
const DIRECTIONS: readonly IonosEmailDirectionV1[] = ["INBOUND", "OUTBOUND", "UNKNOWN"];
const TRUTH_ORDER: readonly OpportunityHandoffTruthStateV1[] = [
  "CONFLICTED",
  "UNKNOWN",
  "STALE",
  "PARTIAL",
  "INFERRED",
  "KNOWN"
];
const FRONTLOAD_SIGNAL_CLASSES = new Set<IonosEmailOpportunitySignalClassV1>([
  "PARTNERSHIP",
  "COMMISSION",
  "LICENSING",
  "SPONSORSHIP",
  "COLLABORATION",
  "WARM_INTRODUCTION",
  "EXPLICIT_FOLLOW_UP"
]);
const FRONTLOAD_CLAIM_KINDS = new Set<IonosBusinessMessageClaimKindV1>([
  "PROPOSAL",
  "INTRODUCTION",
  "COMMITMENT",
  "NEXT_STEP"
]);

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = requiredText(value, label);
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return new Date(parsed).toISOString();
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return candidate;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function normalizeStrategicRefs(value: readonly string[] | undefined): readonly string[] {
  if (value == null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_STRATEGIC_ENTITY_REFS) {
    throw new Error(`strategicEntityRefs must contain at most ${MAX_STRATEGIC_ENTITY_REFS} entries`);
  }
  return uniqueSorted(value.map((item, index) => requiredText(item, `strategicEntityRefs[${index}]`)));
}

function normalizeMailboxPriority(value: readonly IonosMailboxRoleV1[]): readonly IonosMailboxRoleV1[] {
  if (!Array.isArray(value) || value.length !== IONOS_MAILBOX_ROLES_V1.length) {
    throw new Error(`priorityMailboxRoles must contain exactly ${IONOS_MAILBOX_ROLES_V1.length} mailbox roles`);
  }
  const normalized = value.map((role, index) => {
    if (typeof role !== "string" || !MAILBOX_ROLES.has(role)) throw new Error(`priorityMailboxRoles[${index}] is unsupported`);
    return role as IonosMailboxRoleV1;
  });
  if (new Set(normalized).size !== IONOS_MAILBOX_ROLES_V1.length) {
    throw new Error("priorityMailboxRoles must contain every mailbox role exactly once");
  }
  return Object.freeze([...normalized]);
}

function worstTruth(states: readonly OpportunityHandoffTruthStateV1[]): OpportunityHandoffTruthStateV1 {
  return TRUTH_ORDER.find((state) => states.includes(state)) ?? "UNKNOWN";
}

function assertAuthorityBoundary(record: IonosBusinessMessageContentHandoffResultV1, index: number): void {
  if (record.version !== IONOS_BUSINESS_MESSAGE_CONTENT_HANDOFF_VERSION) throw new Error(`records[${index}] has unsupported version`);
  if (record.capture.version !== IONOS_EMAIL_OPPORTUNITY_CAPTURE_VERSION) throw new Error(`records[${index}].capture has unsupported version`);
  if (record.mailboxRole !== record.capture.mailboxRole) throw new Error(`records[${index}] mailbox identity drift`);
  if (record.canonicalMessageRef !== record.capture.canonicalMessageRef) throw new Error(`records[${index}] message identity drift`);
  if (record.canonicalThreadRef !== record.capture.canonicalThreadRef) throw new Error(`records[${index}] thread identity drift`);
  if (record.disposition !== record.capture.disposition) throw new Error(`records[${index}] disposition drift`);
  if (record.generatedAt !== record.capture.evaluatedAt) throw new Error(`records[${index}] evaluation timestamp drift`);
  if (
    record.rawBodyRetained !== false ||
    record.rawBodyReturned !== false ||
    record.attachmentContentConsumed !== false ||
    record.inferredContactInfo !== false ||
    record.inferredRelationship !== false ||
    record.inferredSponsorship !== false ||
    record.inferredTiming !== false ||
    record.inferredOpportunityCertainty !== false ||
    record.inferredDecisionAuthority !== false ||
    record.inferredEconomics !== false ||
    record.mailboxMutationPerformed !== false ||
    record.smtpSendPerformed !== false ||
    record.crmMutationPerformed !== false ||
    record.externalActionPerformed !== false ||
    record.writeAuthorityGranted !== false ||
    record.capture.inferredContactInfo !== false ||
    record.capture.inferredRelationship !== false ||
    record.capture.inferredSponsorship !== false ||
    record.capture.inferredTiming !== false ||
    record.capture.inferredInterest !== false ||
    record.capture.inferredAuthority !== false ||
    record.capture.inferredEconomics !== false ||
    record.capture.mailboxMutationPerformed !== false ||
    record.capture.smtpSendPerformed !== false ||
    record.capture.crmMutationPerformed !== false ||
    record.capture.externalActionPerformed !== false ||
    record.capture.writeAuthorityGranted !== false
  ) {
    throw new Error(`records[${index}] widens inference, mutation, or external-action authority`);
  }
  if (
    record.bodyContentConsumed !== true ||
    record.semanticExtractionPerformedByThisContract !== false ||
    record.providedExtractionValidated !== true
  ) {
    throw new Error(`records[${index}] is not a validated privacy-bounded content handoff`);
  }
}

type NormalizedRecord = Readonly<{
  source: IonosBusinessMessageContentHandoffResultV1;
  mailboxRole: IonosMailboxRoleV1;
  canonicalMessageRef: string;
  canonicalThreadRef: string;
  observedAt: string;
  observedAtMs: number;
  generatedAtMs: number;
}>;

function recordFingerprint(record: NormalizedRecord): string {
  const source = record.source;
  return JSON.stringify({
    mailboxRole: record.mailboxRole,
    canonicalMessageRef: record.canonicalMessageRef,
    canonicalThreadRef: record.canonicalThreadRef,
    observedAt: record.observedAt,
    generatedAt: source.generatedAt,
    extractionRef: source.extractionRef,
    communicationClass: source.capture.communicationClass,
    direction: source.capture.direction,
    signalClass: source.capture.signalClass,
    disposition: source.disposition,
    truthState: source.effectiveTruthState,
    claimEvidence: source.claimEvidence.map((claim) => [claim.claimId, claim.kind, claim.state, claim.evidenceRef, claim.signalClass])
  });
}

function bandRank(value: IonosHighValueHistoryReviewBandV1): number {
  if (value === "REVIEW_FIRST") return 0;
  if (value === "REVIEW_NEXT") return 1;
  return 2;
}

/**
 * Prioritizes already-governed IONOS business-message evidence for a bounded
 * recent-history review. It does not read mail, extract content, discover
 * contacts, infer replies, qualify opportunities, or mutate CRM/mailboxes.
 *
 * The caller owns the history window, mailbox review order, and any canonical
 * strategic-entity refs. Exact evidence is only reordered for internal review.
 */
export function prioritizeIonosHighValueHistorySweepV1(
  input: IonosHighValueHistorySweepInputV1
): IonosHighValueHistorySweepResultV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.records)) throw new Error("records must be an array");
  if (input.records.length > MAX_RECORDS) throw new Error(`records exceeds ${MAX_RECORDS}`);

  const now = timestamp(input.now, "now");
  const windowStart = timestamp(input.windowStart, "windowStart");
  const nowMs = Date.parse(now);
  const windowStartMs = Date.parse(windowStart);
  if (windowStartMs > nowMs) throw new Error("windowStart must not be after now");

  const priorityMailboxRoles = normalizeMailboxPriority(input.priorityMailboxRoles);
  const mailboxRank = new Map(priorityMailboxRoles.map((role, index) => [role, index] as const));
  const strategicEntityRefs = normalizeStrategicRefs(input.strategicEntityRefs);
  const strategicEntitySet = new Set(strategicEntityRefs);
  const maximumThreads = boundedInteger(input.maximumThreads, DEFAULT_MAX_THREADS, 1, MAX_THREADS, "maximumThreads");

  const normalized: NormalizedRecord[] = input.records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`records[${index}] must be an object`);
    assertAuthorityBoundary(record, index);
    const mailboxRole = record.mailboxRole;
    if (!MAILBOX_ROLES.has(mailboxRole)) throw new Error(`records[${index}].mailboxRole is unsupported`);
    const canonicalMessageRef = requiredText(record.canonicalMessageRef, `records[${index}].canonicalMessageRef`);
    const canonicalThreadRef = requiredText(record.canonicalThreadRef, `records[${index}].canonicalThreadRef`);
    const observedAt = timestamp(record.capture.observedAt, `records[${index}].capture.observedAt`);
    const generatedAt = timestamp(record.generatedAt, `records[${index}].generatedAt`);
    return freezeDeep({
      source: record,
      mailboxRole,
      canonicalMessageRef,
      canonicalThreadRef,
      observedAt,
      observedAtMs: Date.parse(observedAt),
      generatedAtMs: Date.parse(generatedAt)
    });
  });

  const duplicateIdentity = new Map<string, NormalizedRecord>();
  const deduped: NormalizedRecord[] = [];
  for (const record of normalized) {
    const identity = `${record.mailboxRole}\u0000${record.canonicalMessageRef}`;
    const prior = duplicateIdentity.get(identity);
    if (!prior) {
      duplicateIdentity.set(identity, record);
      deduped.push(record);
      continue;
    }
    if (recordFingerprint(prior) !== recordFingerprint(record)) {
      throw new Error(`duplicate canonical message identity disagrees for ${record.canonicalMessageRef}`);
    }
  }

  const suppressed: IonosHighValueHistorySuppressionV1[] = [];
  const eligible: NormalizedRecord[] = [];

  for (const record of deduped) {
    const reasons: string[] = [];
    if (record.observedAtMs > nowMs || record.generatedAtMs > nowMs) reasons.push("FUTURE_DATED_EVIDENCE");
    if (record.observedAtMs < windowStartMs) reasons.push("OUTSIDE_CALLER_HISTORY_WINDOW");
    if (
      record.source.capture.communicationClass === "MARKETING_AUTOMATION" ||
      record.source.capture.communicationClass === "SYSTEM_TRANSACTIONAL" ||
      record.source.disposition === "SUPPRESSED_NON_HUMAN"
    ) {
      reasons.push("NON_HUMAN_CORRESPONDENCE_SUPPRESSED");
    }

    if (reasons.length > 0) {
      suppressed.push(freezeDeep({
        mailboxRole: record.mailboxRole,
        canonicalThreadRef: record.canonicalThreadRef,
        messageRefs: [record.canonicalMessageRef],
        reasonCodes: uniqueSorted(reasons)
      }));
    } else {
      eligible.push(record);
    }
  }

  const threadGroups = new Map<string, NormalizedRecord[]>();
  for (const record of eligible) {
    const key = `${record.mailboxRole}\u0000${record.canonicalThreadRef}`;
    threadGroups.set(key, [...(threadGroups.get(key) ?? []), record]);
  }

  const queue: IonosHighValueHistoryThreadReviewV1[] = [];

  for (const records of threadGroups.values()) {
    const ordered = [...records].sort((a, b) => b.observedAtMs - a.observedAtMs || a.canonicalMessageRef.localeCompare(b.canonicalMessageRef));
    const latest = ordered[0];
    const sources = ordered.map((record) => record.source);
    const observedDirections = uniqueSorted(sources.map((source) => source.capture.direction)) as readonly IonosEmailDirectionV1[];
    const signalClasses = uniqueSorted(sources.map((source) => source.capture.signalClass)) as readonly IonosEmailOpportunitySignalClassV1[];
    const claimKinds = uniqueSorted(sources.flatMap((source) => source.claimEvidence.map((claim) => claim.kind))) as readonly IonosBusinessMessageClaimKindV1[];
    const captureDispositions = uniqueSorted(sources.map((source) => source.disposition)) as readonly IonosBusinessMessageContentHandoffResultV1["disposition"][];
    const truthState = worstTruth(sources.map((source) => source.effectiveTruthState));
    const handoffs = sources.map((source) => source.capture.handoff).filter((handoff) => handoff != null);
    const personRefs = uniqueSorted(handoffs.flatMap((handoff) => handoff.payload.personRefs));
    const organizationRefs = uniqueSorted(handoffs.flatMap((handoff) => handoff.payload.organizationRefs));
    const opportunityRefs = uniqueSorted(handoffs.flatMap((handoff) => handoff.payload.existingOpportunityRef ? [handoff.payload.existingOpportunityRef] : []));
    const matchedStrategicEntityRefs = uniqueSorted(
      [...personRefs, ...organizationRefs].filter((ref) => strategicEntitySet.has(ref))
    );
    const evidenceRefs = uniqueSorted([
      ...sources.flatMap((source) => source.claimEvidence.map((claim) => claim.evidenceRef)),
      ...handoffs.flatMap((handoff) => handoff.payload.evidenceRefs)
    ]);
    const twoWayObserved = observedDirections.includes("INBOUND") && observedDirections.includes("OUTBOUND");

    const verificationReasons: string[] = [];
    if (sources.some((source) => source.capture.communicationClass !== "DIRECT_HUMAN")) verificationReasons.push("DIRECT_HUMAN_CLASSIFICATION_NOT_ESTABLISHED");
    if (observedDirections.includes("UNKNOWN")) verificationReasons.push("MESSAGE_DIRECTION_REQUIRES_VERIFICATION");
    if (truthState !== "KNOWN") verificationReasons.push(`THREAD_TRUTH_${truthState}_REQUIRES_VERIFICATION`);
    if (sources.some((source) => source.evidenceIntegrity !== "SUPPORTED")) verificationReasons.push("MESSAGE_EVIDENCE_NOT_FULLY_SUPPORTED");
    if (captureDispositions.includes("NEEDS_VERIFICATION")) verificationReasons.push("UPSTREAM_CAPTURE_REQUIRES_VERIFICATION");
    if (handoffs.some((handoff) => handoff.payload.truthState !== "KNOWN")) verificationReasons.push("HANDOFF_TRUTH_REQUIRES_VERIFICATION");

    const reviewReasons: string[] = [];
    if (matchedStrategicEntityRefs.length > 0) reviewReasons.push("EXACT_CALLER_STRATEGIC_ENTITY_MATCH");
    if (opportunityRefs.length > 0) reviewReasons.push("EXPLICIT_EXISTING_OPPORTUNITY_REFERENCE");
    if (twoWayObserved) reviewReasons.push("INBOUND_AND_OUTBOUND_DIRECTIONS_OBSERVED");
    for (const signal of signalClasses) {
      if (FRONTLOAD_SIGNAL_CLASSES.has(signal)) reviewReasons.push(`EVIDENCED_FRONTLOAD_SIGNAL_${signal}`);
    }
    for (const kind of claimKinds) {
      if (FRONTLOAD_CLAIM_KINDS.has(kind)) reviewReasons.push(`EVIDENCED_FRONTLOAD_CLAIM_${kind}`);
    }

    const reviewBand: IonosHighValueHistoryReviewBandV1 = verificationReasons.length > 0
      ? "VERIFY_BEFORE_REVIEW"
      : reviewReasons.length > 0
        ? "REVIEW_FIRST"
        : "REVIEW_NEXT";

    const reasonCodes = uniqueSorted([
      ...verificationReasons,
      ...reviewReasons,
      ...signalClasses.map((signal) => `EVIDENCED_SIGNAL_${signal}`)
    ]);

    queue.push(freezeDeep({
      reviewId: `ionos-history:${latest.mailboxRole}:${latest.canonicalThreadRef}`,
      mailboxRole: latest.mailboxRole,
      canonicalThreadRef: latest.canonicalThreadRef,
      latestObservedAt: latest.observedAt,
      messageRefs: uniqueSorted(ordered.map((record) => record.canonicalMessageRef)),
      messageCount: ordered.length,
      observedDirections,
      twoWayObserved,
      signalClasses,
      claimKinds,
      truthState,
      captureDispositions,
      personRefs,
      organizationRefs,
      opportunityRefs,
      matchedStrategicEntityRefs,
      evidenceRefs,
      reviewBand,
      reasonCodes,
      replyStateEstablished: false as const,
      relationshipStrengthEstablished: false as const,
      sponsorshipEstablished: false as const,
      timingEstablished: false as const,
      opportunityQualificationEstablished: false as const,
      decisionAuthorityEstablished: false as const,
      contactInfoInferred: false as const,
      confidenceEstablished: false as const,
      monetaryValueEstablished: false as const
    }));
  }

  queue.sort((a, b) =>
    bandRank(a.reviewBand) - bandRank(b.reviewBand)
    || (mailboxRank.get(a.mailboxRole) ?? Number.MAX_SAFE_INTEGER) - (mailboxRank.get(b.mailboxRole) ?? Number.MAX_SAFE_INTEGER)
    || Number(b.matchedStrategicEntityRefs.length > 0) - Number(a.matchedStrategicEntityRefs.length > 0)
    || Number(b.opportunityRefs.length > 0) - Number(a.opportunityRefs.length > 0)
    || Number(b.twoWayObserved) - Number(a.twoWayObserved)
    || Date.parse(b.latestObservedAt) - Date.parse(a.latestObservedAt)
    || a.reviewId.localeCompare(b.reviewId)
  );

  const cappedQueue = queue.slice(0, maximumThreads);
  for (const overflow of queue.slice(maximumThreads)) {
    suppressed.push(freezeDeep({
      mailboxRole: overflow.mailboxRole,
      canonicalThreadRef: overflow.canonicalThreadRef,
      messageRefs: [...overflow.messageRefs],
      reasonCodes: ["QUEUE_LIMIT_REACHED"]
    }));
  }

  suppressed.sort((a, b) =>
    (mailboxRank.get(a.mailboxRole) ?? Number.MAX_SAFE_INTEGER) - (mailboxRank.get(b.mailboxRole) ?? Number.MAX_SAFE_INTEGER)
    || a.canonicalThreadRef.localeCompare(b.canonicalThreadRef)
    || a.messageRefs.join("\u0000").localeCompare(b.messageRefs.join("\u0000"))
  );

  return freezeDeep({
    version: IONOS_HIGH_VALUE_HISTORY_SWEEP_VERSION,
    generatedAt: now,
    windowStart,
    windowEnd: now,
    queue: cappedQueue,
    suppressed,
    counts: {
      inputRecords: input.records.length,
      reviewedThreads: threadGroups.size,
      queuedThreads: cappedQueue.length,
      suppressedThreadsOrRecords: suppressed.length
    },
    mailboxMutationPerformed: false as const,
    smtpSendPerformed: false as const,
    crmMutationPerformed: false as const,
    externalActionPerformed: false as const,
    writeAuthorityGranted: false as const
  });
}
