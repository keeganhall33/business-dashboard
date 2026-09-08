import { createHash } from "node:crypto";

import {
  IONOS_MAILBOX_ROLES_V1,
  type IonosMailboxRoleV1
} from "@/lib/email/ionos-mailbox-config-v1";
import type {
  CanonicalEmailCrmLinkResultV1,
  EmailActivityProjectionV1,
  EmailEvidenceFreshnessStateV1,
  EmailEvidenceTruthStateV1
} from "@/lib/email/ionos-crm-linking-v1";

export type RelationshipActivityClassV1 =
  | "DIRECT_HUMAN"
  | "MARKETING_SEND"
  | "MARKETING_OPEN"
  | "MARKETING_CLICK"
  | "AUTOMATED_NOTIFICATION"
  | "BOUNCE"
  | "DELIVERY";

export type RelationshipActivityDirectionV1 = "INBOUND" | "OUTBOUND" | "SELF";

export type RelationshipStateV1 =
  | "NEEDS_REPLY"
  | "WAITING_ON_CONTACT"
  | "RESOLVED"
  | "NO_ACTION"
  | "STALE_THREAD"
  | "STALE_OPPORTUNITY"
  | "HIGH_VALUE"
  | "ACTIVE_ASK"
  | "COMMITMENT_SUGGESTED"
  | "FOLLOW_UP_SUGGESTED"
  | "UNKNOWN"
  | "CONFLICTED";

export type RelationshipNextMoveV1 =
  | "PREPARE_REPLY"
  | "PREPARE_FOLLOW_UP"
  | "WAIT_FOR_CONTACT"
  | "VERIFY_EVIDENCE"
  | "NO_ACTION";

export type RelationshipActivityClassificationEvidenceV1 = {
  activityId: string;
  canonicalEmailId: string;
  contactId: string;
  threadId: string;
  direction: RelationshipActivityDirectionV1;
  classification: RelationshipActivityClassV1;
  mailboxRole: IonosMailboxRoleV1;
  expectsReply: boolean;
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipResolutionEvidenceV1 = {
  threadId: string;
  contactId: string;
  resolvedAt: string | Date;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipOpportunityEvidenceV1 = {
  opportunityId: string;
  contactId: string;
  active: boolean;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipValueEvidenceV1 = {
  scopeType: "CONTACT" | "THREAD" | "OPPORTUNITY";
  scopeId: string;
  classification: "HIGH_VALUE";
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipActiveAskEvidenceV1 = {
  askId: string;
  activityId: string;
  threadId: string;
  contactId: string;
  opportunityId?: string | null;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipCommitmentSuggestionEvidenceV1 = {
  commitmentId: string;
  activityId: string;
  threadId: string;
  contactId: string;
  status: "SUGGESTED_UNVERIFIED";
  evidenceRef: string;
  observedAt: string | Date;
};

export type RelationshipPriorProjectionV1 = {
  projectionId: string;
  threadId: string;
  generatedAt: string | Date;
  evidenceFingerprint: string;
  states: readonly RelationshipStateV1[];
};

export type IonosRelationshipStateInputV1 = {
  crm: CanonicalEmailCrmLinkResultV1;
  activityClassifications: readonly RelationshipActivityClassificationEvidenceV1[];
  resolutions?: readonly RelationshipResolutionEvidenceV1[];
  opportunities?: readonly RelationshipOpportunityEvidenceV1[];
  values?: readonly RelationshipValueEvidenceV1[];
  activeAsks?: readonly RelationshipActiveAskEvidenceV1[];
  commitmentSuggestions?: readonly RelationshipCommitmentSuggestionEvidenceV1[];
  priorProjections?: readonly RelationshipPriorProjectionV1[];
  staleThreadDays: number;
  staleOpportunityDays: number;
  now: string | Date;
};

export type RelationshipLastMeaningfulInteractionV1 = {
  activityId: string;
  canonicalEmailId: string;
  effectiveTimestamp: string;
  direction: "INBOUND" | "OUTBOUND";
  mailboxRole: IonosMailboxRoleV1;
  expectsReply: boolean;
};

export type RelationshipNextBestMoveV1 = {
  move: RelationshipNextMoveV1;
  status: "SUGGESTED_UNVERIFIED" | "NOT_APPLICABLE";
  evidenceRefs: readonly string[];
  blockingConditions: readonly string[];
  whatWouldChange: readonly string[];
};

export type RelationshipStateProjectionV1 = {
  projectionId: string;
  threadId: string;
  contactId: string;
  opportunityIds: readonly string[];
  mailboxRoles: readonly IonosMailboxRoleV1[];
  primaryState: "NEEDS_REPLY" | "WAITING_ON_CONTACT" | "RESOLVED" | "NO_ACTION" | "UNKNOWN" | "CONFLICTED";
  states: readonly RelationshipStateV1[];
  lastMeaningfulInteraction: RelationshipLastMeaningfulInteractionV1 | null;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  activeAskIds: readonly string[];
  commitmentSuggestionIds: readonly string[];
  evidenceRefs: readonly string[];
  evidenceFingerprint: string;
  decisionEligible: boolean;
  nextBestMove: RelationshipNextBestMoveV1;
  supersedesProjectionId: string | null;
  priorState: {
    projectionId: string;
    generatedAt: string;
    states: readonly RelationshipStateV1[];
  } | null;
};

export type IonosRelationshipStateResultV1 = {
  generatedAt: string;
  projections: readonly RelationshipStateProjectionV1[];
  telemetry: {
    projectionCount: number;
    needsReplyCount: number;
    waitingOnContactCount: number;
    staleThreadCount: number;
    staleOpportunityCount: number;
    highValueCount: number;
    unknownCount: number;
    conflictedCount: number;
    projectionFingerprints: readonly string[];
  };
};

const DAY_MS = 86_400_000;
const ACTIVITY_CLASSES = new Set<RelationshipActivityClassV1>([
  "DIRECT_HUMAN",
  "MARKETING_SEND",
  "MARKETING_OPEN",
  "MARKETING_CLICK",
  "AUTOMATED_NOTIFICATION",
  "BOUNCE",
  "DELIVERY"
]);
const DIRECTIONS = new Set<RelationshipActivityDirectionV1>(["INBOUND", "OUTBOUND", "SELF"]);
const MAILBOX_ROLES = new Set<string>(IONOS_MAILBOX_ROLES_V1);
const TRUTH_STATES = new Set<EmailEvidenceTruthStateV1>(["KNOWN", "UNKNOWN", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<EmailEvidenceFreshnessStateV1>(["CURRENT", "STALE", "UNKNOWN"]);
const STATES = new Set<RelationshipStateV1>([
  "NEEDS_REPLY",
  "WAITING_ON_CONTACT",
  "RESOLVED",
  "NO_ACTION",
  "STALE_THREAD",
  "STALE_OPPORTUNITY",
  "HIGH_VALUE",
  "ACTIVE_ASK",
  "COMMITMENT_SUGGESTED",
  "FOLLOW_UP_SUGGESTED",
  "UNKNOWN",
  "CONFLICTED"
]);
const STATE_ORDER: readonly RelationshipStateV1[] = [
  "CONFLICTED",
  "UNKNOWN",
  "NEEDS_REPLY",
  "WAITING_ON_CONTACT",
  "STALE_OPPORTUNITY",
  "STALE_THREAD",
  "HIGH_VALUE",
  "ACTIVE_ASK",
  "COMMITMENT_SUGGESTED",
  "FOLLOW_UP_SUGGESTED",
  "RESOLVED",
  "NO_ACTION"
];

const CLASSIFICATION_KEYS = new Set([
  "activityId",
  "canonicalEmailId",
  "contactId",
  "threadId",
  "direction",
  "classification",
  "mailboxRole",
  "expectsReply",
  "evidenceRef",
  "observedAt"
]);
const RESOLUTION_KEYS = new Set([
  "threadId",
  "contactId",
  "resolvedAt",
  "truthState",
  "freshnessState",
  "evidenceRef",
  "observedAt"
]);
const OPPORTUNITY_KEYS = new Set([
  "opportunityId",
  "contactId",
  "active",
  "truthState",
  "freshnessState",
  "evidenceRef",
  "observedAt"
]);
const VALUE_KEYS = new Set([
  "scopeType",
  "scopeId",
  "classification",
  "truthState",
  "freshnessState",
  "evidenceRef",
  "observedAt"
]);
const ASK_KEYS = new Set([
  "askId",
  "activityId",
  "threadId",
  "contactId",
  "opportunityId",
  "truthState",
  "freshnessState",
  "evidenceRef",
  "observedAt"
]);
const COMMITMENT_KEYS = new Set([
  "commitmentId",
  "activityId",
  "threadId",
  "contactId",
  "status",
  "evidenceRef",
  "observedAt"
]);
const PRIOR_KEYS = new Set(["projectionId", "threadId", "generatedAt", "evidenceFingerprint", "states"]);

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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function canonicalTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function observedTimestamp(value: unknown, nowMs: number, label: string): string {
  const timestamp = canonicalTimestamp(value, label);
  if (Date.parse(timestamp) > nowMs) throw new Error(`${label} must not be future-dated`);
  return timestamp;
}

function nonNegativeDays(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 36_500) {
    throw new Error(`${label} must be a non-negative finite integer number of days`);
  }
  return value;
}

function truthState(value: unknown, label: string): EmailEvidenceTruthStateV1 {
  if (typeof value !== "string" || !TRUTH_STATES.has(value as EmailEvidenceTruthStateV1)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as EmailEvidenceTruthStateV1;
}

function freshnessState(value: unknown, label: string): EmailEvidenceFreshnessStateV1 {
  if (typeof value !== "string" || !FRESHNESS_STATES.has(value as EmailEvidenceFreshnessStateV1)) {
    throw new Error(`${label} is unsupported`);
  }
  return value as EmailEvidenceFreshnessStateV1;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableFingerprint(parts: readonly string[]): string {
  return sha256([...parts].sort((a, b) => a.localeCompare(b)).join("\n"));
}

function sortedStates(values: Iterable<RelationshipStateV1>): RelationshipStateV1[] {
  const set = new Set(values);
  return STATE_ORDER.filter((state) => set.has(state));
}

function compareActivity(a: EmailActivityProjectionV1, b: EmailActivityProjectionV1): number {
  return a.effectiveTimestamp.localeCompare(b.effectiveTimestamp) || a.id.localeCompare(b.id);
}

function assertBaseActivity(activity: EmailActivityProjectionV1, nowMs: number): void {
  requiredString(activity.id, "CRM activity id");
  requiredString(activity.canonicalEmailId, `activity ${activity.id} canonicalEmailId`);
  requiredString(activity.contactId, `activity ${activity.id} contactId`);
  const effective = observedTimestamp(activity.effectiveTimestamp, nowMs, `activity ${activity.id} effectiveTimestamp`);
  const source = observedTimestamp(activity.sourceTimestamp, nowMs, `activity ${activity.id} sourceTimestamp`);
  if (Date.parse(source) < Date.parse(effective)) {
    throw new Error(`activity ${activity.id} sourceTimestamp must not precede effectiveTimestamp`);
  }
  truthState(activity.truthState, `activity ${activity.id} truthState`);
  freshnessState(activity.freshnessState, `activity ${activity.id} freshnessState`);
  if (!Array.isArray(activity.evidenceRefs) || activity.evidenceRefs.length === 0) {
    throw new Error(`activity ${activity.id} must contain evidenceRefs`);
  }
  for (const ref of activity.evidenceRefs) requiredString(ref, `activity ${activity.id} evidenceRef`);
  if (!Array.isArray(activity.provenanceFingerprints) || activity.provenanceFingerprints.length === 0) {
    throw new Error(`activity ${activity.id} must contain provenance fingerprints`);
  }
  for (const fingerprint of activity.provenanceFingerprints) {
    requiredString(fingerprint, `activity ${activity.id} provenance fingerprint`);
  }
  if (!Array.isArray(activity.linkedEntities)) throw new Error(`activity ${activity.id} linkedEntities must be an array`);
  for (const entity of activity.linkedEntities) {
    requiredString(entity.entityType, `activity ${activity.id} linked entity type`);
    requiredString(entity.entityId, `activity ${activity.id} linked entity id`);
    if (!Array.isArray(entity.evidenceRefs) || entity.evidenceRefs.length === 0) {
      throw new Error(`activity ${activity.id} linked entity must contain evidenceRefs`);
    }
  }
}

function isCurrentKnown(truth: EmailEvidenceTruthStateV1, freshness: EmailEvidenceFreshnessStateV1): boolean {
  return truth === "KNOWN" && freshness === "CURRENT";
}

function scopeMatches(
  value: RelationshipValueEvidenceV1,
  threadId: string,
  contactId: string,
  opportunityIds: readonly string[]
): boolean {
  if (value.scopeType === "THREAD") return value.scopeId === threadId;
  if (value.scopeType === "CONTACT") return value.scopeId === contactId;
  return opportunityIds.includes(value.scopeId);
}

function stateFingerprintInput(
  activity: EmailActivityProjectionV1,
  evidence: RelationshipActivityClassificationEvidenceV1
): string {
  return [
    activity.id,
    activity.canonicalEmailId,
    activity.effectiveTimestamp,
    activity.sourceTimestamp,
    activity.truthState,
    activity.freshnessState,
    evidence.threadId,
    evidence.contactId,
    evidence.direction,
    evidence.classification,
    evidence.mailboxRole,
    String(evidence.expectsReply),
    evidence.evidenceRef,
    ...activity.evidenceRefs,
    ...activity.provenanceFingerprints
  ].join("|");
}

export function projectIonosRelationshipStateV1(input: IonosRelationshipStateInputV1): IonosRelationshipStateResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  const allowedInputKeys = new Set([
    "crm",
    "activityClassifications",
    "resolutions",
    "opportunities",
    "values",
    "activeAsks",
    "commitmentSuggestions",
    "priorProjections",
    "staleThreadDays",
    "staleOpportunityDays",
    "now"
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) throw new Error(`input contains unsupported key ${key}`);
  }

  if (!isPlainObject(input.crm)) throw new Error("crm must be a plain object");
  if (!Array.isArray(input.crm.activities) || !Array.isArray(input.crm.records)) {
    throw new Error("crm activities and records must be arrays");
  }
  if (!Array.isArray(input.activityClassifications)) throw new Error("activityClassifications must be an array");

  const resolutions = input.resolutions ?? [];
  const opportunities = input.opportunities ?? [];
  const values = input.values ?? [];
  const activeAsks = input.activeAsks ?? [];
  const commitmentSuggestions = input.commitmentSuggestions ?? [];
  const priorProjections = input.priorProjections ?? [];
  for (const [name, collection] of [
    ["resolutions", resolutions],
    ["opportunities", opportunities],
    ["values", values],
    ["activeAsks", activeAsks],
    ["commitmentSuggestions", commitmentSuggestions],
    ["priorProjections", priorProjections]
  ] as const) {
    if (!Array.isArray(collection)) throw new Error(`${name} must be an array`);
  }

  const now = canonicalTimestamp(input.now, "now");
  const nowMs = Date.parse(now);
  const staleThreadDays = nonNegativeDays(input.staleThreadDays, "staleThreadDays");
  const staleOpportunityDays = nonNegativeDays(input.staleOpportunityDays, "staleOpportunityDays");

  const recordsById = new Map(input.crm.records.map((record) => [record.canonicalEmailId, record]));
  if (recordsById.size !== input.crm.records.length) throw new Error("crm contains duplicate canonical record ids");

  const activitiesById = new Map<string, EmailActivityProjectionV1>();
  for (const activity of input.crm.activities) {
    assertBaseActivity(activity, nowMs);
    if (activitiesById.has(activity.id)) throw new Error(`duplicate CRM activity id ${activity.id}`);
    if (!recordsById.has(activity.canonicalEmailId)) {
      throw new Error(`activity ${activity.id} is missing its canonical CRM record`);
    }
    activitiesById.set(activity.id, activity);
  }

  const classificationsById = new Map<string, RelationshipActivityClassificationEvidenceV1>();
  for (const classification of input.activityClassifications) {
    assertKeys(classification, CLASSIFICATION_KEYS, "activity classification evidence");
    const activityId = requiredString(classification.activityId, "activity classification activityId");
    const activity = activitiesById.get(activityId);
    if (!activity) throw new Error(`activity classification references unknown activity ${activityId}`);
    if (classificationsById.has(activityId)) throw new Error(`duplicate activity classification for ${activityId}`);
    if (requiredString(classification.canonicalEmailId, "activity classification canonicalEmailId") !== activity.canonicalEmailId) {
      throw new Error(`activity classification canonicalEmailId mismatch for ${activityId}`);
    }
    if (requiredString(classification.contactId, "activity classification contactId") !== activity.contactId) {
      throw new Error(`activity classification contactId mismatch for ${activityId}`);
    }
    requiredString(classification.threadId, "activity classification threadId");
    if (!DIRECTIONS.has(classification.direction)) throw new Error(`activity ${activityId} direction is unsupported`);
    if (!ACTIVITY_CLASSES.has(classification.classification)) {
      throw new Error(`activity ${activityId} classification is unsupported`);
    }
    if (!MAILBOX_ROLES.has(classification.mailboxRole)) throw new Error(`activity ${activityId} mailboxRole is unsupported`);
    if (typeof classification.expectsReply !== "boolean") throw new Error(`activity ${activityId} expectsReply must be boolean`);
    if (classification.classification === "DIRECT_HUMAN" && classification.direction === "SELF") {
      throw new Error(`direct human activity ${activityId} cannot be SELF`);
    }
    if (classification.classification !== "DIRECT_HUMAN" && classification.expectsReply) {
      throw new Error(`non-direct activity ${activityId} cannot assert expectsReply`);
    }
    requiredString(classification.evidenceRef, `activity ${activityId} classification evidenceRef`);
    observedTimestamp(classification.observedAt, nowMs, `activity ${activityId} classification observedAt`);
    classificationsById.set(activityId, classification);
  }
  if (classificationsById.size !== activitiesById.size) {
    throw new Error("every CRM activity requires exactly one explicit activity classification");
  }

  const normalizedResolutions = resolutions.map((resolution, index) => {
    assertKeys(resolution, RESOLUTION_KEYS, `resolution ${index}`);
    return {
      ...resolution,
      threadId: requiredString(resolution.threadId, `resolution ${index} threadId`),
      contactId: requiredString(resolution.contactId, `resolution ${index} contactId`),
      resolvedAt: observedTimestamp(resolution.resolvedAt, nowMs, `resolution ${index} resolvedAt`),
      truthState: truthState(resolution.truthState, `resolution ${index} truthState`),
      freshnessState: freshnessState(resolution.freshnessState, `resolution ${index} freshnessState`),
      evidenceRef: requiredString(resolution.evidenceRef, `resolution ${index} evidenceRef`),
      observedAt: observedTimestamp(resolution.observedAt, nowMs, `resolution ${index} observedAt`)
    };
  });

  const opportunityIds = new Set<string>();
  const normalizedOpportunities = opportunities.map((opportunity, index) => {
    assertKeys(opportunity, OPPORTUNITY_KEYS, `opportunity ${index}`);
    const opportunityId = requiredString(opportunity.opportunityId, `opportunity ${index} opportunityId`);
    if (opportunityIds.has(opportunityId)) throw new Error(`duplicate opportunity evidence ${opportunityId}`);
    opportunityIds.add(opportunityId);
    if (typeof opportunity.active !== "boolean") throw new Error(`opportunity ${opportunityId} active must be boolean`);
    return {
      ...opportunity,
      opportunityId,
      contactId: requiredString(opportunity.contactId, `opportunity ${opportunityId} contactId`),
      truthState: truthState(opportunity.truthState, `opportunity ${opportunityId} truthState`),
      freshnessState: freshnessState(opportunity.freshnessState, `opportunity ${opportunityId} freshnessState`),
      evidenceRef: requiredString(opportunity.evidenceRef, `opportunity ${opportunityId} evidenceRef`),
      observedAt: observedTimestamp(opportunity.observedAt, nowMs, `opportunity ${opportunityId} observedAt`)
    };
  });

  const normalizedValues = values.map((value, index) => {
    assertKeys(value, VALUE_KEYS, `value evidence ${index}`);
    if (!["CONTACT", "THREAD", "OPPORTUNITY"].includes(value.scopeType)) {
      throw new Error(`value evidence ${index} scopeType is unsupported`);
    }
    if (value.classification !== "HIGH_VALUE") throw new Error(`value evidence ${index} classification is unsupported`);
    return {
      ...value,
      scopeId: requiredString(value.scopeId, `value evidence ${index} scopeId`),
      truthState: truthState(value.truthState, `value evidence ${index} truthState`),
      freshnessState: freshnessState(value.freshnessState, `value evidence ${index} freshnessState`),
      evidenceRef: requiredString(value.evidenceRef, `value evidence ${index} evidenceRef`),
      observedAt: observedTimestamp(value.observedAt, nowMs, `value evidence ${index} observedAt`)
    };
  });

  const askIds = new Set<string>();
  const normalizedAsks = activeAsks.map((ask, index) => {
    assertKeys(ask, ASK_KEYS, `active ask ${index}`);
    const askId = requiredString(ask.askId, `active ask ${index} askId`);
    if (askIds.has(askId)) throw new Error(`duplicate active ask ${askId}`);
    askIds.add(askId);
    const activityId = requiredString(ask.activityId, `active ask ${askId} activityId`);
    if (!activitiesById.has(activityId)) throw new Error(`active ask ${askId} references unknown activity`);
    return {
      ...ask,
      askId,
      activityId,
      threadId: requiredString(ask.threadId, `active ask ${askId} threadId`),
      contactId: requiredString(ask.contactId, `active ask ${askId} contactId`),
      opportunityId: ask.opportunityId == null ? null : requiredString(ask.opportunityId, `active ask ${askId} opportunityId`),
      truthState: truthState(ask.truthState, `active ask ${askId} truthState`),
      freshnessState: freshnessState(ask.freshnessState, `active ask ${askId} freshnessState`),
      evidenceRef: requiredString(ask.evidenceRef, `active ask ${askId} evidenceRef`),
      observedAt: observedTimestamp(ask.observedAt, nowMs, `active ask ${askId} observedAt`)
    };
  });

  const commitmentIds = new Set<string>();
  const normalizedCommitments = commitmentSuggestions.map((commitment, index) => {
    assertKeys(commitment, COMMITMENT_KEYS, `commitment suggestion ${index}`);
    const commitmentId = requiredString(commitment.commitmentId, `commitment suggestion ${index} commitmentId`);
    if (commitmentIds.has(commitmentId)) throw new Error(`duplicate commitment suggestion ${commitmentId}`);
    commitmentIds.add(commitmentId);
    const activityId = requiredString(commitment.activityId, `commitment suggestion ${commitmentId} activityId`);
    if (!activitiesById.has(activityId)) throw new Error(`commitment suggestion ${commitmentId} references unknown activity`);
    if (commitment.status !== "SUGGESTED_UNVERIFIED") {
      throw new Error(`commitment suggestion ${commitmentId} must remain SUGGESTED_UNVERIFIED`);
    }
    return {
      ...commitment,
      commitmentId,
      activityId,
      threadId: requiredString(commitment.threadId, `commitment suggestion ${commitmentId} threadId`),
      contactId: requiredString(commitment.contactId, `commitment suggestion ${commitmentId} contactId`),
      evidenceRef: requiredString(commitment.evidenceRef, `commitment suggestion ${commitmentId} evidenceRef`),
      observedAt: observedTimestamp(commitment.observedAt, nowMs, `commitment suggestion ${commitmentId} observedAt`)
    };
  });

  if (priorProjections.length > 200) throw new Error("priorProjections exceeds bounded history limit");
  const normalizedPrior = priorProjections.map((prior, index) => {
    assertKeys(prior, PRIOR_KEYS, `prior projection ${index}`);
    if (!Array.isArray(prior.states) || prior.states.length === 0) throw new Error(`prior projection ${index} states must be non-empty`);
    for (const state of prior.states) {
      if (!STATES.has(state)) throw new Error(`prior projection ${index} contains unsupported state`);
    }
    return {
      projectionId: requiredString(prior.projectionId, `prior projection ${index} projectionId`),
      threadId: requiredString(prior.threadId, `prior projection ${index} threadId`),
      generatedAt: observedTimestamp(prior.generatedAt, nowMs, `prior projection ${index} generatedAt`),
      evidenceFingerprint: requiredString(prior.evidenceFingerprint, `prior projection ${index} evidenceFingerprint`),
      states: sortedStates(prior.states)
    };
  });

  const threadMap = new Map<string, EmailActivityProjectionV1[]>();
  const threadContacts = new Map<string, string>();
  for (const activity of input.crm.activities) {
    const classification = classificationsById.get(activity.id)!;
    const existingContact = threadContacts.get(classification.threadId);
    if (existingContact && existingContact !== activity.contactId) {
      throw new Error(`thread ${classification.threadId} maps to multiple contacts`);
    }
    threadContacts.set(classification.threadId, activity.contactId);
    const bucket = threadMap.get(classification.threadId) ?? [];
    bucket.push(activity);
    threadMap.set(classification.threadId, bucket);
  }

  const projections: RelationshipStateProjectionV1[] = [];
  for (const threadId of [...threadMap.keys()].sort((a, b) => a.localeCompare(b))) {
    const activities = [...threadMap.get(threadId)!].sort(compareActivity);
    const contactId = threadContacts.get(threadId)!;
    const classified = activities.map((activity) => ({ activity, evidence: classificationsById.get(activity.id)! }));
    const direct = classified.filter(({ evidence }) => evidence.classification === "DIRECT_HUMAN");
    const latestDirect = direct.at(-1) ?? null;

    const sameTimestampDirections = latestDirect
      ? new Set(
          direct
            .filter(({ activity }) => activity.effectiveTimestamp === latestDirect.activity.effectiveTimestamp)
            .map(({ evidence }) => evidence.direction)
        )
      : new Set<RelationshipActivityDirectionV1>();
    const sequenceConflict = sameTimestampDirections.size > 1;

    const linkedOpportunityIds = uniqueSorted(
      activities.flatMap((activity) =>
        activity.linkedEntities.filter((entity) => entity.entityType === "OPPORTUNITY").map((entity) => entity.entityId)
      )
    );
    const threadOpportunityEvidence = normalizedOpportunities.filter(
      (opportunity) => opportunity.contactId === contactId && linkedOpportunityIds.includes(opportunity.opportunityId)
    );
    const activeKnownOpportunities = threadOpportunityEvidence.filter(
      (opportunity) => opportunity.active && isCurrentKnown(opportunity.truthState, opportunity.freshnessState)
    );

    const threadResolutions = normalizedResolutions
      .filter((resolution) => resolution.threadId === threadId && resolution.contactId === contactId)
      .sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt) || a.evidenceRef.localeCompare(b.evidenceRef));
    const latestResolution = threadResolutions.at(-1) ?? null;

    const threadValues = normalizedValues.filter((value) =>
      scopeMatches(value, threadId, contactId, linkedOpportunityIds)
    );
    const highValue = threadValues.some((value) => isCurrentKnown(value.truthState, value.freshnessState));

    const threadAsks = normalizedAsks.filter((ask) => {
      if (ask.threadId !== threadId || ask.contactId !== contactId) return false;
      const classification = classificationsById.get(ask.activityId);
      if (!classification || classification.threadId !== threadId || classification.classification !== "DIRECT_HUMAN") {
        throw new Error(`active ask ${ask.askId} is not tied to direct human evidence in its thread`);
      }
      if (ask.opportunityId && !linkedOpportunityIds.includes(ask.opportunityId)) {
        throw new Error(`active ask ${ask.askId} references an unrelated opportunity`);
      }
      return isCurrentKnown(ask.truthState, ask.freshnessState);
    });

    const threadCommitments = normalizedCommitments.filter((commitment) => {
      if (commitment.threadId !== threadId || commitment.contactId !== contactId) return false;
      const classification = classificationsById.get(commitment.activityId);
      if (!classification || classification.threadId !== threadId || classification.classification !== "DIRECT_HUMAN") {
        throw new Error(`commitment suggestion ${commitment.commitmentId} is not tied to direct human evidence in its thread`);
      }
      return true;
    });

    let hasConflict = sequenceConflict;
    let hasUnknownRequiredEvidence = false;
    const blockingConditions: string[] = [];

    if (latestDirect) {
      const record = recordsById.get(latestDirect.activity.canonicalEmailId)!;
      if (latestDirect.activity.truthState === "CONFLICTED" || record.truthState === "CONFLICTED") hasConflict = true;
      if (
        latestDirect.activity.truthState !== "KNOWN" ||
        latestDirect.activity.freshnessState !== "CURRENT" ||
        !record.decisionEligible
      ) {
        hasUnknownRequiredEvidence = true;
      }
    }
    if (latestResolution) {
      if (latestResolution.truthState === "CONFLICTED") hasConflict = true;
      if (!isCurrentKnown(latestResolution.truthState, latestResolution.freshnessState)) {
        hasUnknownRequiredEvidence = true;
      }
    }
    if (sequenceConflict) blockingConditions.push("CONTRADICTORY_DIRECT_SEQUENCE");
    if (hasConflict) blockingConditions.push("CONFLICTED_REQUIRED_EVIDENCE");
    if (hasUnknownRequiredEvidence) blockingConditions.push("REQUIRED_EVIDENCE_NOT_CURRENT_KNOWN");

    const states = new Set<RelationshipStateV1>();
    let primaryState: RelationshipStateProjectionV1["primaryState"];
    const lastTimestamp = latestDirect?.activity.effectiveTimestamp ?? null;
    const resolutionIsCurrent = Boolean(
      latestResolution &&
        isCurrentKnown(latestResolution.truthState, latestResolution.freshnessState) &&
        (!lastTimestamp || latestResolution.resolvedAt >= lastTimestamp)
    );

    if (hasConflict) {
      primaryState = "CONFLICTED";
      states.add("CONFLICTED");
    } else if (hasUnknownRequiredEvidence) {
      primaryState = "UNKNOWN";
      states.add("UNKNOWN");
    } else if (resolutionIsCurrent) {
      primaryState = "RESOLVED";
      states.add("RESOLVED");
    } else if (!latestDirect || !latestDirect.evidence.expectsReply) {
      primaryState = "NO_ACTION";
      states.add("NO_ACTION");
    } else if (latestDirect.evidence.direction === "INBOUND") {
      primaryState = "NEEDS_REPLY";
      states.add("NEEDS_REPLY");
    } else {
      primaryState = "WAITING_ON_CONTACT";
      states.add("WAITING_ON_CONTACT");
    }

    const ageMs = lastTimestamp ? nowMs - Date.parse(lastTimestamp) : null;
    const staleThread = Boolean(
      ageMs != null && primaryState !== "RESOLVED" && ageMs >= staleThreadDays * DAY_MS
    );
    const staleOpportunity = Boolean(
      ageMs != null &&
        primaryState !== "RESOLVED" &&
        activeKnownOpportunities.length > 0 &&
        ageMs >= staleOpportunityDays * DAY_MS
    );
    if (staleThread) states.add("STALE_THREAD");
    if (staleOpportunity) states.add("STALE_OPPORTUNITY");
    if (highValue) states.add("HIGH_VALUE");
    if (threadAsks.length > 0) states.add("ACTIVE_ASK");
    if (threadCommitments.length > 0) states.add("COMMITMENT_SUGGESTED");
    const followUpSuggested = primaryState === "WAITING_ON_CONTACT" && (staleThread || staleOpportunity);
    if (followUpSuggested) states.add("FOLLOW_UP_SUGGESTED");

    const evidenceRefs = uniqueSorted([
      ...activities.flatMap((activity) => activity.evidenceRefs),
      ...classified.map(({ evidence }) => evidence.evidenceRef),
      ...activities.flatMap((activity) => activity.linkedEntities.flatMap((entity) => entity.evidenceRefs)),
      ...threadResolutions.map((resolution) => resolution.evidenceRef),
      ...threadOpportunityEvidence.map((opportunity) => opportunity.evidenceRef),
      ...threadValues.map((value) => value.evidenceRef),
      ...threadAsks.map((ask) => ask.evidenceRef),
      ...threadCommitments.map((commitment) => commitment.evidenceRef)
    ]);
    const evidenceFingerprint = stableFingerprint([
      ...classified.map(({ activity, evidence }) => stateFingerprintInput(activity, evidence)),
      ...threadResolutions.map((resolution) =>
        [resolution.threadId, resolution.resolvedAt, resolution.truthState, resolution.freshnessState, resolution.evidenceRef].join("|")
      ),
      ...threadOpportunityEvidence.map((opportunity) =>
        [opportunity.opportunityId, String(opportunity.active), opportunity.truthState, opportunity.freshnessState, opportunity.evidenceRef].join("|")
      ),
      ...threadValues.map((value) =>
        [value.scopeType, value.scopeId, value.truthState, value.freshnessState, value.evidenceRef].join("|")
      ),
      ...threadAsks.map((ask) => [ask.askId, ask.activityId, ask.evidenceRef].join("|")),
      ...threadCommitments.map((commitment) => [commitment.commitmentId, commitment.activityId, commitment.evidenceRef].join("|")),
      `staleThreadDays=${staleThreadDays}`,
      `staleOpportunityDays=${staleOpportunityDays}`
    ]);

    let truth: EmailEvidenceTruthStateV1 = "KNOWN";
    let freshness: EmailEvidenceFreshnessStateV1 = "CURRENT";
    if (hasConflict) truth = "CONFLICTED";
    else if (hasUnknownRequiredEvidence) truth = "UNKNOWN";
    if (latestDirect?.activity.freshnessState === "STALE") freshness = "STALE";
    else if (latestDirect?.activity.freshnessState === "UNKNOWN" || hasUnknownRequiredEvidence) freshness = "UNKNOWN";

    let move: RelationshipNextMoveV1;
    let status: RelationshipNextBestMoveV1["status"] = "SUGGESTED_UNVERIFIED";
    const whatWouldChange: string[] = [];
    if (primaryState === "CONFLICTED" || primaryState === "UNKNOWN") {
      move = "VERIFY_EVIDENCE";
      whatWouldChange.push("CURRENT_KNOWN_NON_CONFLICTING_EVIDENCE");
    } else if (primaryState === "NEEDS_REPLY") {
      move = "PREPARE_REPLY";
      blockingConditions.push("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL");
      whatWouldChange.push("LATER_DIRECT_OUTBOUND_RESPONSE", "CURRENT_RESOLUTION_EVIDENCE");
    } else if (primaryState === "WAITING_ON_CONTACT" && followUpSuggested) {
      move = "PREPARE_FOLLOW_UP";
      blockingConditions.push("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL");
      whatWouldChange.push("LATER_DIRECT_INBOUND_REPLY", "CURRENT_RESOLUTION_EVIDENCE");
    } else if (primaryState === "WAITING_ON_CONTACT") {
      move = "WAIT_FOR_CONTACT";
      whatWouldChange.push("LATER_DIRECT_INBOUND_REPLY", "STALE_THRESHOLD_REACHED", "CURRENT_RESOLUTION_EVIDENCE");
    } else {
      move = "NO_ACTION";
      status = "NOT_APPLICABLE";
      whatWouldChange.push("NEW_MATERIAL_DIRECT_CORRESPONDENCE");
    }

    const decisionEligible = !hasConflict && !hasUnknownRequiredEvidence;
    const stateList = sortedStates(states);
    const projectionId = `relationship_${sha256(`${threadId}|${contactId}|${evidenceFingerprint}|${stateList.join(",")}`).slice(0, 24)}`;
    const prior = normalizedPrior
      .filter((candidate) => candidate.threadId === threadId)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || b.projectionId.localeCompare(a.projectionId))[0] ?? null;

    projections.push({
      projectionId,
      threadId,
      contactId,
      opportunityIds: linkedOpportunityIds,
      mailboxRoles: uniqueSorted(classified.map(({ evidence }) => evidence.mailboxRole)) as IonosMailboxRoleV1[],
      primaryState,
      states: stateList,
      lastMeaningfulInteraction: latestDirect
        ? {
            activityId: latestDirect.activity.id,
            canonicalEmailId: latestDirect.activity.canonicalEmailId,
            effectiveTimestamp: latestDirect.activity.effectiveTimestamp,
            direction: latestDirect.evidence.direction as "INBOUND" | "OUTBOUND",
            mailboxRole: latestDirect.evidence.mailboxRole,
            expectsReply: latestDirect.evidence.expectsReply
          }
        : null,
      truthState: truth,
      freshnessState: freshness,
      activeAskIds: uniqueSorted(threadAsks.map((ask) => ask.askId)),
      commitmentSuggestionIds: uniqueSorted(threadCommitments.map((commitment) => commitment.commitmentId)),
      evidenceRefs,
      evidenceFingerprint,
      decisionEligible,
      nextBestMove: {
        move,
        status,
        evidenceRefs,
        blockingConditions: uniqueSorted(blockingConditions),
        whatWouldChange: uniqueSorted(whatWouldChange)
      },
      supersedesProjectionId:
        prior && prior.projectionId !== projectionId && prior.evidenceFingerprint !== evidenceFingerprint ? prior.projectionId : null,
      priorState: prior
        ? { projectionId: prior.projectionId, generatedAt: prior.generatedAt, states: prior.states }
        : null
    });
  }

  const fingerprintList = projections.map((projection) => projection.evidenceFingerprint).sort((a, b) => a.localeCompare(b));
  return {
    generatedAt: now,
    projections,
    telemetry: {
      projectionCount: projections.length,
      needsReplyCount: projections.filter((projection) => projection.states.includes("NEEDS_REPLY")).length,
      waitingOnContactCount: projections.filter((projection) => projection.states.includes("WAITING_ON_CONTACT")).length,
      staleThreadCount: projections.filter((projection) => projection.states.includes("STALE_THREAD")).length,
      staleOpportunityCount: projections.filter((projection) => projection.states.includes("STALE_OPPORTUNITY")).length,
      highValueCount: projections.filter((projection) => projection.states.includes("HIGH_VALUE")).length,
      unknownCount: projections.filter((projection) => projection.states.includes("UNKNOWN")).length,
      conflictedCount: projections.filter((projection) => projection.states.includes("CONFLICTED")).length,
      projectionFingerprints: fingerprintList
    }
  };
}
