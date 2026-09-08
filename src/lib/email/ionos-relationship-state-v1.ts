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
const CLASSES = new Set<RelationshipActivityClassV1>([
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
const TRUTHS = new Set<EmailEvidenceTruthStateV1>(["KNOWN", "UNKNOWN", "CONFLICTED"]);
const FRESHNESS = new Set<EmailEvidenceFreshnessStateV1>(["CURRENT", "STALE", "UNKNOWN"]);
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

const INPUT_KEYS = new Set([
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
const RESOLUTION_KEYS = new Set(["threadId", "contactId", "resolvedAt", "truthState", "freshnessState", "evidenceRef", "observedAt"]);
const OPPORTUNITY_KEYS = new Set(["opportunityId", "contactId", "active", "truthState", "freshnessState", "evidenceRef", "observedAt"]);
const VALUE_KEYS = new Set(["scopeType", "scopeId", "classification", "truthState", "freshnessState", "evidenceRef", "observedAt"]);
const ASK_KEYS = new Set(["askId", "activityId", "threadId", "contactId", "opportunityId", "truthState", "freshnessState", "evidenceRef", "observedAt"]);
const COMMITMENT_KEYS = new Set(["commitmentId", "activityId", "threadId", "contactId", "status", "evidenceRef", "observedAt"]);
const PRIOR_KEYS = new Set(["projectionId", "threadId", "generatedAt", "evidenceFingerprint", "states"]);

function isObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkKeys(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (!isObject(value)) throw new Error(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported key ${key}`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return date.toISOString();
}

function observed(value: unknown, nowMs: number, label: string): string {
  const result = timestamp(value, label);
  if (Date.parse(result) > nowMs) throw new Error(`${label} must not be future-dated`);
  return result;
}

function dayCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 36_500) {
    throw new Error(`${label} must be a non-negative finite integer number of days`);
  }
  return value;
}

function truth(value: unknown, label: string): EmailEvidenceTruthStateV1 {
  if (typeof value !== "string" || !TRUTHS.has(value as EmailEvidenceTruthStateV1)) throw new Error(`${label} is unsupported`);
  return value as EmailEvidenceTruthStateV1;
}

function fresh(value: unknown, label: string): EmailEvidenceFreshnessStateV1 {
  if (typeof value !== "string" || !FRESHNESS.has(value as EmailEvidenceFreshnessStateV1)) throw new Error(`${label} is unsupported`);
  return value as EmailEvidenceFreshnessStateV1;
}

function uniq(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function evidenceFingerprint(parts: readonly string[]): string {
  return digest([...parts].sort((a, b) => a.localeCompare(b)).join("\n"));
}

function orderedStates(values: Iterable<RelationshipStateV1>): RelationshipStateV1[] {
  const set = new Set(values);
  return STATE_ORDER.filter((state) => set.has(state));
}

function activityCompare(a: EmailActivityProjectionV1, b: EmailActivityProjectionV1): number {
  return a.effectiveTimestamp.localeCompare(b.effectiveTimestamp) || a.id.localeCompare(b.id);
}

function currentKnown(t: EmailEvidenceTruthStateV1, f: EmailEvidenceFreshnessStateV1): boolean {
  return t === "KNOWN" && f === "CURRENT";
}

function validateActivity(activity: EmailActivityProjectionV1, nowMs: number): void {
  requiredString(activity.id, "CRM activity id");
  requiredString(activity.canonicalEmailId, `activity ${activity.id} canonicalEmailId`);
  requiredString(activity.contactId, `activity ${activity.id} contactId`);
  const effective = observed(activity.effectiveTimestamp, nowMs, `activity ${activity.id} effectiveTimestamp`);
  const source = observed(activity.sourceTimestamp, nowMs, `activity ${activity.id} sourceTimestamp`);
  if (Date.parse(source) < Date.parse(effective)) throw new Error(`activity ${activity.id} sourceTimestamp must not precede effectiveTimestamp`);
  truth(activity.truthState, `activity ${activity.id} truthState`);
  fresh(activity.freshnessState, `activity ${activity.id} freshnessState`);
  if (!Array.isArray(activity.evidenceRefs) || activity.evidenceRefs.length === 0) throw new Error(`activity ${activity.id} must contain evidenceRefs`);
  activity.evidenceRefs.forEach((ref) => requiredString(ref, `activity ${activity.id} evidenceRef`));
  if (!Array.isArray(activity.provenanceFingerprints) || activity.provenanceFingerprints.length === 0) throw new Error(`activity ${activity.id} must contain provenance fingerprints`);
  activity.provenanceFingerprints.forEach((ref) => requiredString(ref, `activity ${activity.id} provenance fingerprint`));
  if (!Array.isArray(activity.linkedEntities)) throw new Error(`activity ${activity.id} linkedEntities must be an array`);
  for (const entity of activity.linkedEntities) {
    requiredString(entity.entityType, `activity ${activity.id} linked entity type`);
    requiredString(entity.entityId, `activity ${activity.id} linked entity id`);
    if (!Array.isArray(entity.evidenceRefs) || entity.evidenceRefs.length === 0) throw new Error(`activity ${activity.id} linked entity must contain evidenceRefs`);
  }
}

function valueMatches(value: RelationshipValueEvidenceV1, threadId: string, contactId: string, opportunityIds: readonly string[]): boolean {
  if (value.scopeType === "THREAD") return value.scopeId === threadId;
  if (value.scopeType === "CONTACT") return value.scopeId === contactId;
  return opportunityIds.includes(value.scopeId);
}

export function projectIonosRelationshipStateV1(input: IonosRelationshipStateInputV1): IonosRelationshipStateResultV1 {
  if (!isObject(input)) throw new Error("input must be a plain object");
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) throw new Error(`input contains unsupported key ${key}`);
  if (!isObject(input.crm) || !Array.isArray(input.crm.activities) || !Array.isArray(input.crm.records)) throw new Error("crm activities and records must be arrays");
  if (!Array.isArray(input.activityClassifications)) throw new Error("activityClassifications must be an array");

  const now = timestamp(input.now, "now");
  const nowMs = Date.parse(now);
  const staleThreadDays = dayCount(input.staleThreadDays, "staleThreadDays");
  const staleOpportunityDays = dayCount(input.staleOpportunityDays, "staleOpportunityDays");
  const resolutions = input.resolutions ?? [];
  const opportunities = input.opportunities ?? [];
  const values = input.values ?? [];
  const activeAsks = input.activeAsks ?? [];
  const commitments = input.commitmentSuggestions ?? [];
  const priorProjections = input.priorProjections ?? [];
  for (const [name, collection] of [
    ["resolutions", resolutions],
    ["opportunities", opportunities],
    ["values", values],
    ["activeAsks", activeAsks],
    ["commitmentSuggestions", commitments],
    ["priorProjections", priorProjections]
  ] as const) if (!Array.isArray(collection)) throw new Error(`${name} must be an array`);
  if (priorProjections.length > 200) throw new Error("priorProjections exceeds bounded history limit");

  const recordsById = new Map(input.crm.records.map((record) => [requiredString(record.canonicalEmailId, "CRM record canonicalEmailId"), record]));
  if (recordsById.size !== input.crm.records.length) throw new Error("crm contains duplicate canonical record ids");

  const activitiesById = new Map<string, EmailActivityProjectionV1>();
  for (const activity of input.crm.activities) {
    validateActivity(activity, nowMs);
    if (activitiesById.has(activity.id)) throw new Error(`duplicate CRM activity id ${activity.id}`);
    if (!recordsById.has(activity.canonicalEmailId)) throw new Error(`activity ${activity.id} is missing its canonical CRM record`);
    activitiesById.set(activity.id, activity);
  }

  const classificationsById = new Map<string, RelationshipActivityClassificationEvidenceV1>();
  for (const classification of input.activityClassifications) {
    checkKeys(classification, CLASSIFICATION_KEYS, "activity classification evidence");
    const activityId = requiredString(classification.activityId, "activity classification activityId");
    const activity = activitiesById.get(activityId);
    if (!activity) throw new Error(`activity classification references unknown activity ${activityId}`);
    if (classificationsById.has(activityId)) throw new Error(`duplicate activity classification for ${activityId}`);
    if (requiredString(classification.canonicalEmailId, "activity classification canonicalEmailId") !== activity.canonicalEmailId) throw new Error(`activity classification canonicalEmailId mismatch for ${activityId}`);
    if (requiredString(classification.contactId, "activity classification contactId") !== activity.contactId) throw new Error(`activity classification contactId mismatch for ${activityId}`);
    requiredString(classification.threadId, "activity classification threadId");
    if (!DIRECTIONS.has(classification.direction)) throw new Error(`activity ${activityId} direction is unsupported`);
    if (!CLASSES.has(classification.classification)) throw new Error(`activity ${activityId} classification is unsupported`);
    if (!MAILBOX_ROLES.has(classification.mailboxRole)) throw new Error(`activity ${activityId} mailboxRole is unsupported`);
    if (typeof classification.expectsReply !== "boolean") throw new Error(`activity ${activityId} expectsReply must be boolean`);
    if (classification.classification === "DIRECT_HUMAN" && classification.direction === "SELF") throw new Error(`direct human activity ${activityId} cannot be SELF`);
    if (classification.classification !== "DIRECT_HUMAN" && classification.expectsReply) throw new Error(`non-direct activity ${activityId} cannot assert expectsReply`);
    requiredString(classification.evidenceRef, `activity ${activityId} classification evidenceRef`);
    observed(classification.observedAt, nowMs, `activity ${activityId} classification observedAt`);
    classificationsById.set(activityId, classification);
  }
  if (classificationsById.size !== activitiesById.size) throw new Error("every CRM activity requires exactly one explicit activity classification");

  const normalizedResolutions = resolutions.map((item, index) => {
    checkKeys(item, RESOLUTION_KEYS, `resolution ${index}`);
    return {
      ...item,
      threadId: requiredString(item.threadId, `resolution ${index} threadId`),
      contactId: requiredString(item.contactId, `resolution ${index} contactId`),
      resolvedAt: observed(item.resolvedAt, nowMs, `resolution ${index} resolvedAt`),
      truthState: truth(item.truthState, `resolution ${index} truthState`),
      freshnessState: fresh(item.freshnessState, `resolution ${index} freshnessState`),
      evidenceRef: requiredString(item.evidenceRef, `resolution ${index} evidenceRef`),
      observedAt: observed(item.observedAt, nowMs, `resolution ${index} observedAt`)
    };
  });

  const seenOpportunity = new Set<string>();
  const normalizedOpportunities = opportunities.map((item, index) => {
    checkKeys(item, OPPORTUNITY_KEYS, `opportunity ${index}`);
    const opportunityId = requiredString(item.opportunityId, `opportunity ${index} opportunityId`);
    if (seenOpportunity.has(opportunityId)) throw new Error(`duplicate opportunity evidence ${opportunityId}`);
    seenOpportunity.add(opportunityId);
    if (typeof item.active !== "boolean") throw new Error(`opportunity ${opportunityId} active must be boolean`);
    return {
      ...item,
      opportunityId,
      contactId: requiredString(item.contactId, `opportunity ${opportunityId} contactId`),
      truthState: truth(item.truthState, `opportunity ${opportunityId} truthState`),
      freshnessState: fresh(item.freshnessState, `opportunity ${opportunityId} freshnessState`),
      evidenceRef: requiredString(item.evidenceRef, `opportunity ${opportunityId} evidenceRef`),
      observedAt: observed(item.observedAt, nowMs, `opportunity ${opportunityId} observedAt`)
    };
  });

  const normalizedValues = values.map((item, index) => {
    checkKeys(item, VALUE_KEYS, `value evidence ${index}`);
    if (!["CONTACT", "THREAD", "OPPORTUNITY"].includes(item.scopeType)) throw new Error(`value evidence ${index} scopeType is unsupported`);
    if (item.classification !== "HIGH_VALUE") throw new Error(`value evidence ${index} classification is unsupported`);
    return {
      ...item,
      scopeId: requiredString(item.scopeId, `value evidence ${index} scopeId`),
      truthState: truth(item.truthState, `value evidence ${index} truthState`),
      freshnessState: fresh(item.freshnessState, `value evidence ${index} freshnessState`),
      evidenceRef: requiredString(item.evidenceRef, `value evidence ${index} evidenceRef`),
      observedAt: observed(item.observedAt, nowMs, `value evidence ${index} observedAt`)
    };
  });

  const seenAsk = new Set<string>();
  const normalizedAsks = activeAsks.map((item, index) => {
    checkKeys(item, ASK_KEYS, `active ask ${index}`);
    const askId = requiredString(item.askId, `active ask ${index} askId`);
    if (seenAsk.has(askId)) throw new Error(`duplicate active ask ${askId}`);
    seenAsk.add(askId);
    const activityId = requiredString(item.activityId, `active ask ${askId} activityId`);
    if (!activitiesById.has(activityId)) throw new Error(`active ask ${askId} references unknown activity`);
    return {
      ...item,
      askId,
      activityId,
      threadId: requiredString(item.threadId, `active ask ${askId} threadId`),
      contactId: requiredString(item.contactId, `active ask ${askId} contactId`),
      opportunityId: item.opportunityId == null ? null : requiredString(item.opportunityId, `active ask ${askId} opportunityId`),
      truthState: truth(item.truthState, `active ask ${askId} truthState`),
      freshnessState: fresh(item.freshnessState, `active ask ${askId} freshnessState`),
      evidenceRef: requiredString(item.evidenceRef, `active ask ${askId} evidenceRef`),
      observedAt: observed(item.observedAt, nowMs, `active ask ${askId} observedAt`)
    };
  });

  const seenCommitment = new Set<string>();
  const normalizedCommitments = commitments.map((item, index) => {
    checkKeys(item, COMMITMENT_KEYS, `commitment suggestion ${index}`);
    const commitmentId = requiredString(item.commitmentId, `commitment suggestion ${index} commitmentId`);
    if (seenCommitment.has(commitmentId)) throw new Error(`duplicate commitment suggestion ${commitmentId}`);
    seenCommitment.add(commitmentId);
    const activityId = requiredString(item.activityId, `commitment suggestion ${commitmentId} activityId`);
    if (!activitiesById.has(activityId)) throw new Error(`commitment suggestion ${commitmentId} references unknown activity`);
    if (item.status !== "SUGGESTED_UNVERIFIED") throw new Error(`commitment suggestion ${commitmentId} must remain SUGGESTED_UNVERIFIED`);
    return {
      ...item,
      commitmentId,
      activityId,
      threadId: requiredString(item.threadId, `commitment suggestion ${commitmentId} threadId`),
      contactId: requiredString(item.contactId, `commitment suggestion ${commitmentId} contactId`),
      evidenceRef: requiredString(item.evidenceRef, `commitment suggestion ${commitmentId} evidenceRef`),
      observedAt: observed(item.observedAt, nowMs, `commitment suggestion ${commitmentId} observedAt`)
    };
  });

  const normalizedPrior = priorProjections.map((item, index) => {
    checkKeys(item, PRIOR_KEYS, `prior projection ${index}`);
    if (!Array.isArray(item.states) || item.states.length === 0) throw new Error(`prior projection ${index} states must be non-empty`);
    item.states.forEach((state) => { if (!STATES.has(state)) throw new Error(`prior projection ${index} contains unsupported state`); });
    return {
      projectionId: requiredString(item.projectionId, `prior projection ${index} projectionId`),
      threadId: requiredString(item.threadId, `prior projection ${index} threadId`),
      generatedAt: observed(item.generatedAt, nowMs, `prior projection ${index} generatedAt`),
      evidenceFingerprint: requiredString(item.evidenceFingerprint, `prior projection ${index} evidenceFingerprint`),
      states: orderedStates(item.states)
    };
  });

  const threadMap = new Map<string, EmailActivityProjectionV1[]>();
  const threadContacts = new Map<string, string>();
  for (const activity of input.crm.activities) {
    const classification = classificationsById.get(activity.id)!;
    const existing = threadContacts.get(classification.threadId);
    if (existing && existing !== activity.contactId) throw new Error(`thread ${classification.threadId} maps to multiple contacts`);
    threadContacts.set(classification.threadId, activity.contactId);
    const list = threadMap.get(classification.threadId) ?? [];
    list.push(activity);
    threadMap.set(classification.threadId, list);
  }

  const projections: RelationshipStateProjectionV1[] = [];
  for (const threadId of [...threadMap.keys()].sort()) {
    const activities = [...threadMap.get(threadId)!].sort(activityCompare);
    const contactId = threadContacts.get(threadId)!;
    const classified = activities.map((activity) => ({ activity, evidence: classificationsById.get(activity.id)! }));
    const direct = classified.filter((entry) => entry.evidence.classification === "DIRECT_HUMAN");
    const latestDirect = direct.length ? direct[direct.length - 1] : null;

    const sameTimestampDirections = latestDirect
      ? new Set(direct.filter((entry) => entry.activity.effectiveTimestamp === latestDirect.activity.effectiveTimestamp).map((entry) => entry.evidence.direction))
      : new Set<RelationshipActivityDirectionV1>();
    const sequenceConflict = sameTimestampDirections.size > 1;

    const linkedOpportunityIds = uniq(activities.flatMap((activity) => activity.linkedEntities.filter((entity) => entity.entityType === "OPPORTUNITY").map((entity) => entity.entityId)));
    const threadOpportunityEvidence = normalizedOpportunities.filter((item) => item.contactId === contactId && linkedOpportunityIds.includes(item.opportunityId));
    const activeKnownOpportunities = threadOpportunityEvidence.filter((item) => item.active && currentKnown(item.truthState, item.freshnessState));
    const threadResolutions = normalizedResolutions.filter((item) => item.threadId === threadId && item.contactId === contactId).sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt) || a.evidenceRef.localeCompare(b.evidenceRef));
    const latestResolution = threadResolutions.length ? threadResolutions[threadResolutions.length - 1] : null;
    const threadValues = normalizedValues.filter((item) => valueMatches(item, threadId, contactId, linkedOpportunityIds));
    const highValue = threadValues.some((item) => currentKnown(item.truthState, item.freshnessState));

    const threadAsks = normalizedAsks.filter((item) => {
      if (item.threadId !== threadId || item.contactId !== contactId) return false;
      const classification = classificationsById.get(item.activityId);
      if (!classification || classification.threadId !== threadId || classification.classification !== "DIRECT_HUMAN") throw new Error(`active ask ${item.askId} is not tied to direct human evidence in its thread`);
      if (item.opportunityId && !linkedOpportunityIds.includes(item.opportunityId)) throw new Error(`active ask ${item.askId} references an unrelated opportunity`);
      return currentKnown(item.truthState, item.freshnessState);
    });
    const threadCommitments = normalizedCommitments.filter((item) => {
      if (item.threadId !== threadId || item.contactId !== contactId) return false;
      const classification = classificationsById.get(item.activityId);
      if (!classification || classification.threadId !== threadId || classification.classification !== "DIRECT_HUMAN") throw new Error(`commitment suggestion ${item.commitmentId} is not tied to direct human evidence in its thread`);
      return true;
    });

    let conflicted = sequenceConflict;
    let uncertain = false;
    const blockers: string[] = [];
    if (latestDirect) {
      const record = recordsById.get(latestDirect.activity.canonicalEmailId)!;
      if (latestDirect.activity.truthState === "CONFLICTED" || record.truthState === "CONFLICTED") conflicted = true;
      if (latestDirect.activity.truthState !== "KNOWN" || latestDirect.activity.freshnessState !== "CURRENT" || !record.decisionEligible) uncertain = true;
    }
    if (latestResolution) {
      if (latestResolution.truthState === "CONFLICTED") conflicted = true;
      if (!currentKnown(latestResolution.truthState, latestResolution.freshnessState)) uncertain = true;
    }
    if (sequenceConflict) blockers.push("CONTRADICTORY_DIRECT_SEQUENCE");
    if (conflicted) blockers.push("CONFLICTED_REQUIRED_EVIDENCE");
    if (uncertain) blockers.push("REQUIRED_EVIDENCE_NOT_CURRENT_KNOWN");

    const states = new Set<RelationshipStateV1>();
    const lastTimestamp = latestDirect?.activity.effectiveTimestamp ?? null;
    const resolutionCurrent = Boolean(latestResolution && currentKnown(latestResolution.truthState, latestResolution.freshnessState) && (!lastTimestamp || latestResolution.resolvedAt >= lastTimestamp));
    let primary: RelationshipStateProjectionV1["primaryState"];
    if (conflicted) {
      primary = "CONFLICTED";
      states.add("CONFLICTED");
    } else if (uncertain) {
      primary = "UNKNOWN";
      states.add("UNKNOWN");
    } else if (resolutionCurrent) {
      primary = "RESOLVED";
      states.add("RESOLVED");
    } else if (!latestDirect || !latestDirect.evidence.expectsReply) {
      primary = "NO_ACTION";
      states.add("NO_ACTION");
    } else if (latestDirect.evidence.direction === "INBOUND") {
      primary = "NEEDS_REPLY";
      states.add("NEEDS_REPLY");
    } else {
      primary = "WAITING_ON_CONTACT";
      states.add("WAITING_ON_CONTACT");
    }

    const ageMs = lastTimestamp ? nowMs - Date.parse(lastTimestamp) : null;
    const staleThread = Boolean(ageMs != null && primary !== "RESOLVED" && ageMs >= staleThreadDays * DAY_MS);
    const staleOpportunity = Boolean(ageMs != null && primary !== "RESOLVED" && activeKnownOpportunities.length > 0 && ageMs >= staleOpportunityDays * DAY_MS);
    if (staleThread) states.add("STALE_THREAD");
    if (staleOpportunity) states.add("STALE_OPPORTUNITY");
    if (highValue) states.add("HIGH_VALUE");
    if (threadAsks.length) states.add("ACTIVE_ASK");
    if (threadCommitments.length) states.add("COMMITMENT_SUGGESTED");
    const followUp = primary === "WAITING_ON_CONTACT" && (staleThread || staleOpportunity);
    if (followUp) states.add("FOLLOW_UP_SUGGESTED");

    const refs = uniq([
      ...activities.flatMap((activity) => activity.evidenceRefs),
      ...classified.map((entry) => entry.evidence.evidenceRef),
      ...activities.flatMap((activity) => activity.linkedEntities.flatMap((entity) => entity.evidenceRefs)),
      ...threadResolutions.map((item) => item.evidenceRef),
      ...threadOpportunityEvidence.map((item) => item.evidenceRef),
      ...threadValues.map((item) => item.evidenceRef),
      ...threadAsks.map((item) => item.evidenceRef),
      ...threadCommitments.map((item) => item.evidenceRef)
    ]);
    const fingerprint = evidenceFingerprint([
      ...classified.map(({ activity, evidence }) => [activity.id, activity.canonicalEmailId, activity.effectiveTimestamp, activity.sourceTimestamp, activity.truthState, activity.freshnessState, evidence.threadId, evidence.contactId, evidence.direction, evidence.classification, evidence.mailboxRole, String(evidence.expectsReply), evidence.evidenceRef, ...activity.evidenceRefs, ...activity.provenanceFingerprints].join("|")),
      ...threadResolutions.map((item) => [item.threadId, item.resolvedAt, item.truthState, item.freshnessState, item.evidenceRef].join("|")),
      ...threadOpportunityEvidence.map((item) => [item.opportunityId, String(item.active), item.truthState, item.freshnessState, item.evidenceRef].join("|")),
      ...threadValues.map((item) => [item.scopeType, item.scopeId, item.truthState, item.freshnessState, item.evidenceRef].join("|")),
      ...threadAsks.map((item) => [item.askId, item.activityId, item.evidenceRef].join("|")),
      ...threadCommitments.map((item) => [item.commitmentId, item.activityId, item.evidenceRef].join("|")),
      `staleThreadDays=${staleThreadDays}`,
      `staleOpportunityDays=${staleOpportunityDays}`
    ]);

    let outputTruth: EmailEvidenceTruthStateV1 = conflicted ? "CONFLICTED" : uncertain ? "UNKNOWN" : "KNOWN";
    let outputFreshness: EmailEvidenceFreshnessStateV1 = "CURRENT";
    if (latestDirect?.activity.freshnessState === "STALE") outputFreshness = "STALE";
    else if (latestDirect?.activity.freshnessState === "UNKNOWN" || uncertain) outputFreshness = "UNKNOWN";
    if (conflicted) outputTruth = "CONFLICTED";

    let move: RelationshipNextMoveV1;
    let status: RelationshipNextBestMoveV1["status"] = "SUGGESTED_UNVERIFIED";
    const whatWouldChange: string[] = [];
    if (primary === "CONFLICTED" || primary === "UNKNOWN") {
      move = "VERIFY_EVIDENCE";
      whatWouldChange.push("CURRENT_KNOWN_NON_CONFLICTING_EVIDENCE");
    } else if (primary === "NEEDS_REPLY") {
      move = "PREPARE_REPLY";
      blockers.push("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL");
      whatWouldChange.push("LATER_DIRECT_OUTBOUND_RESPONSE", "CURRENT_RESOLUTION_EVIDENCE");
    } else if (primary === "WAITING_ON_CONTACT" && followUp) {
      move = "PREPARE_FOLLOW_UP";
      blockers.push("OUTBOUND_ACTION_REQUIRES_SEPARATE_APPROVAL");
      whatWouldChange.push("LATER_DIRECT_INBOUND_REPLY", "CURRENT_RESOLUTION_EVIDENCE");
    } else if (primary === "WAITING_ON_CONTACT") {
      move = "WAIT_FOR_CONTACT";
      whatWouldChange.push("LATER_DIRECT_INBOUND_REPLY", "STALE_THRESHOLD_REACHED", "CURRENT_RESOLUTION_EVIDENCE");
    } else {
      move = "NO_ACTION";
      status = "NOT_APPLICABLE";
      whatWouldChange.push("NEW_MATERIAL_DIRECT_CORRESPONDENCE");
    }

    const stateList = orderedStates(states);
    const projectionId = `relationship_${digest(`${threadId}|${contactId}|${fingerprint}|${stateList.join(",")}`).slice(0, 24)}`;
    const prior = normalizedPrior.filter((item) => item.threadId === threadId).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt) || b.projectionId.localeCompare(a.projectionId))[0] ?? null;

    projections.push({
      projectionId,
      threadId,
      contactId,
      opportunityIds: linkedOpportunityIds,
      mailboxRoles: uniq(classified.map((entry) => entry.evidence.mailboxRole)) as IonosMailboxRoleV1[],
      primaryState: primary,
      states: stateList,
      lastMeaningfulInteraction: latestDirect ? {
        activityId: latestDirect.activity.id,
        canonicalEmailId: latestDirect.activity.canonicalEmailId,
        effectiveTimestamp: latestDirect.activity.effectiveTimestamp,
        direction: latestDirect.evidence.direction as "INBOUND" | "OUTBOUND",
        mailboxRole: latestDirect.evidence.mailboxRole,
        expectsReply: latestDirect.evidence.expectsReply
      } : null,
      truthState: outputTruth,
      freshnessState: outputFreshness,
      activeAskIds: uniq(threadAsks.map((item) => item.askId)),
      commitmentSuggestionIds: uniq(threadCommitments.map((item) => item.commitmentId)),
      evidenceRefs: refs,
      evidenceFingerprint: fingerprint,
      decisionEligible: !conflicted && !uncertain,
      nextBestMove: {
        move,
        status,
        evidenceRefs: refs,
        blockingConditions: uniq(blockers),
        whatWouldChange: uniq(whatWouldChange)
      },
      supersedesProjectionId: prior && prior.projectionId !== projectionId && prior.evidenceFingerprint !== fingerprint ? prior.projectionId : null,
      priorState: prior ? { projectionId: prior.projectionId, generatedAt: prior.generatedAt, states: prior.states } : null
    });
  }

  return {
    generatedAt: now,
    projections,
    telemetry: {
      projectionCount: projections.length,
      needsReplyCount: projections.filter((item) => item.states.includes("NEEDS_REPLY")).length,
      waitingOnContactCount: projections.filter((item) => item.states.includes("WAITING_ON_CONTACT")).length,
      staleThreadCount: projections.filter((item) => item.states.includes("STALE_THREAD")).length,
      staleOpportunityCount: projections.filter((item) => item.states.includes("STALE_OPPORTUNITY")).length,
      highValueCount: projections.filter((item) => item.states.includes("HIGH_VALUE")).length,
      unknownCount: projections.filter((item) => item.states.includes("UNKNOWN")).length,
      conflictedCount: projections.filter((item) => item.states.includes("CONFLICTED")).length,
      projectionFingerprints: projections.map((item) => item.evidenceFingerprint).sort()
    }
  };
}
