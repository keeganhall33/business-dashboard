import { createHash } from "node:crypto";

import type { CanonicalEmailRecordV1 } from "@/lib/email/ionos-email-normalization-v1";

export type EmailParticipantResolutionStatusV1 = "RESOLVED" | "UNKNOWN" | "AMBIGUOUS";
export type EmailCompanyResolutionStatusV1 = "RESOLVED" | "UNKNOWN" | "CONFLICTED";
export type EmailEvidenceTruthStateV1 = "KNOWN" | "UNKNOWN" | "CONFLICTED";
export type EmailEvidenceFreshnessStateV1 = "CURRENT" | "STALE" | "UNKNOWN";
export type EmailLinkedEntityTypeV1 =
  | "OPPORTUNITY"
  | "PROJECT"
  | "ARTWORK"
  | "PRODUCT"
  | "ORGANIZATION"
  | "RELATIONSHIP";

export type EmailContactCompanyMembershipEvidenceV1 = {
  companyId: string;
  evidenceRef: string;
};

export type EmailContactIdentityEvidenceV1 = {
  contactId: string;
  email: string;
  evidenceRef: string;
  observedAt: string | Date;
  companyMembership?: EmailContactCompanyMembershipEvidenceV1 | null;
};

export type EmailCompanyDomainEvidenceV1 = {
  companyId: string;
  domain: string;
  evidenceRef: string;
  observedAt: string | Date;
};

export type EmailEntityLinkEvidenceV1 = {
  canonicalEmailId: string;
  entityType: EmailLinkedEntityTypeV1;
  entityId: string;
  evidenceRef: string;
  observedAt: string | Date;
};

export type EmailRecordStateEvidenceV1 = {
  canonicalEmailId: string;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRef: string;
  observedAt: string | Date;
};

export type EmailCorrectionEvidenceV1 = {
  canonicalEmailId: string;
  supersedesCanonicalEmailId: string;
  evidenceRef: string;
  observedAt: string | Date;
};

export type CanonicalEmailCrmLinkInputV1 = {
  records: readonly CanonicalEmailRecordV1[];
  contacts: readonly EmailContactIdentityEvidenceV1[];
  companyDomains?: readonly EmailCompanyDomainEvidenceV1[];
  entityLinks?: readonly EmailEntityLinkEvidenceV1[];
  recordStates?: readonly EmailRecordStateEvidenceV1[];
  corrections?: readonly EmailCorrectionEvidenceV1[];
  now: string | Date;
};

export type EmailParticipantResolutionV1 = {
  participantFingerprint: string;
  status: EmailParticipantResolutionStatusV1;
  contactId: string | null;
  companyStatus: EmailCompanyResolutionStatusV1;
  companyId: string | null;
  evidenceRefs: readonly string[];
};

export type EmailLinkedEntityV1 = {
  entityType: EmailLinkedEntityTypeV1;
  entityId: string;
  evidenceRefs: readonly string[];
};

export type CanonicalEmailCrmRecordProjectionV1 = {
  canonicalEmailId: string;
  participantResolutions: readonly EmailParticipantResolutionV1[];
  linkedEntities: readonly EmailLinkedEntityV1[];
  sourceTimestamp: string;
  effectiveTimestamp: string;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRefs: readonly string[];
  provenanceFingerprints: readonly string[];
  supersedesCanonicalEmailId: string | null;
  decisionEligible: boolean;
};

export type EmailActivityProjectionV1 = {
  id: string;
  canonicalEmailId: string;
  contactId: string;
  companyId: string | null;
  linkedEntities: readonly EmailLinkedEntityV1[];
  sourceTimestamp: string;
  effectiveTimestamp: string;
  truthState: EmailEvidenceTruthStateV1;
  freshnessState: EmailEvidenceFreshnessStateV1;
  evidenceRefs: readonly string[];
  provenanceFingerprints: readonly string[];
  supersedesCanonicalEmailId: string | null;
};

export type EmailContactTimelineV1 = {
  contactId: string;
  activities: readonly EmailActivityProjectionV1[];
};

export type CanonicalEmailCrmLinkResultV1 = {
  records: readonly CanonicalEmailCrmRecordProjectionV1[];
  activities: readonly EmailActivityProjectionV1[];
  contactTimelines: readonly EmailContactTimelineV1[];
  telemetry: {
    recordCount: number;
    activityCount: number;
    resolvedContactCount: number;
    unknownParticipantCount: number;
    ambiguousParticipantCount: number;
    conflictedCompanyCount: number;
    linkedEntityCount: number;
    correctionCount: number;
    recordFingerprints: readonly string[];
  };
};

const CANONICAL_RECORD_KEYS = new Set([
  "id",
  "identityBasis",
  "messageId",
  "dedupeKey",
  "direction",
  "participants",
  "sentAt",
  "receivedAt",
  "subject",
  "thread",
  "body",
  "attachments",
  "provenance",
  "qualityReasons",
  "firstSourceTimestamp",
  "lastSourceTimestamp"
]);
const PARTICIPANT_KEYS = new Set(["from", "to", "cc", "bcc"]);
const PROVENANCE_KEYS = new Set([
  "mailboxId",
  "role",
  "folder",
  "uidValidity",
  "uid",
  "sourceTimestamp",
  "ingestFingerprint"
]);
const CONTACT_KEYS = new Set(["contactId", "email", "evidenceRef", "observedAt", "companyMembership"]);
const MEMBERSHIP_KEYS = new Set(["companyId", "evidenceRef"]);
const DOMAIN_KEYS = new Set(["companyId", "domain", "evidenceRef", "observedAt"]);
const ENTITY_LINK_KEYS = new Set(["canonicalEmailId", "entityType", "entityId", "evidenceRef", "observedAt"]);
const RECORD_STATE_KEYS = new Set([
  "canonicalEmailId",
  "truthState",
  "freshnessState",
  "evidenceRef",
  "observedAt"
]);
const CORRECTION_KEYS = new Set(["canonicalEmailId", "supersedesCanonicalEmailId", "evidenceRef", "observedAt"]);
const ENTITY_TYPES = new Set<EmailLinkedEntityTypeV1>([
  "OPPORTUNITY",
  "PROJECT",
  "ARTWORK",
  "PRODUCT",
  "ORGANIZATION",
  "RELATIONSHIP"
]);
const TRUTH_STATES = new Set<EmailEvidenceTruthStateV1>(["KNOWN", "UNKNOWN", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<EmailEvidenceFreshnessStateV1>(["CURRENT", "STALE", "UNKNOWN"]);

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

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  return canonicalTimestamp(value, label);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${sha256(value).slice(0, 24)}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function normalizeEmail(value: unknown, label: string): string {
  const email = requiredString(value, label).toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${label} must be a valid email address`);
  }
  return email;
}

function normalizeDomain(value: unknown, label: string): string {
  const domain = requiredString(value, label).toLowerCase().replace(/^\.+|\.+$/g, "");
  if (
    domain.length > 253 ||
    !domain.includes(".") ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain) ||
    domain.includes("..")
  ) {
    throw new Error(`${label} must be a valid governed domain`);
  }
  return domain;
}

function assertNotFuture(timestamp: string, nowMs: number, label: string): void {
  if (Date.parse(timestamp) > nowMs) throw new Error(`${label} must not be future-dated`);
}

function participantEmails(record: CanonicalEmailRecordV1): string[] {
  const participantObject = record.participants as unknown;
  assertKeys(participantObject, PARTICIPANT_KEYS, `record ${record.id} participants`);
  const result: string[] = [];
  for (const key of ["from", "to", "cc", "bcc"] as const) {
    const values = record.participants[key] as unknown;
    if (!Array.isArray(values)) throw new Error(`record ${record.id} participants.${key} must be an array`);
    for (const value of values) result.push(normalizeEmail(value, `record ${record.id} participants.${key}`));
  }
  return uniqueSorted(result);
}

function validateCanonicalRecord(record: CanonicalEmailRecordV1, nowMs: number): {
  effectiveTimestamp: string;
  sourceTimestamp: string;
  participantEmails: string[];
  provenanceFingerprints: string[];
} {
  assertKeys(record as unknown, CANONICAL_RECORD_KEYS, "canonical email record");
  const id = requiredString(record.id, "canonical email record id");
  requiredString(record.dedupeKey, `record ${id} dedupeKey`);
  if (record.identityBasis !== "MESSAGE_ID" && record.identityBasis !== "FINGERPRINT") {
    throw new Error(`record ${id} has unsupported identity basis`);
  }
  if (!["INBOUND", "OUTBOUND", "SELF", "UNKNOWN"].includes(record.direction)) {
    throw new Error(`record ${id} has unsupported direction`);
  }

  const firstSourceTimestamp = canonicalTimestamp(record.firstSourceTimestamp, `record ${id} firstSourceTimestamp`);
  const lastSourceTimestamp = canonicalTimestamp(record.lastSourceTimestamp, `record ${id} lastSourceTimestamp`);
  assertNotFuture(firstSourceTimestamp, nowMs, `record ${id} firstSourceTimestamp`);
  assertNotFuture(lastSourceTimestamp, nowMs, `record ${id} lastSourceTimestamp`);
  if (Date.parse(lastSourceTimestamp) < Date.parse(firstSourceTimestamp)) {
    throw new Error(`record ${id} source timestamps are non-monotonic`);
  }

  const sentAt = optionalTimestamp(record.sentAt, `record ${id} sentAt`);
  const receivedAt = optionalTimestamp(record.receivedAt, `record ${id} receivedAt`);
  if (sentAt) assertNotFuture(sentAt, nowMs, `record ${id} sentAt`);
  if (receivedAt) assertNotFuture(receivedAt, nowMs, `record ${id} receivedAt`);
  const effectiveTimestamp = sentAt ?? receivedAt ?? firstSourceTimestamp;

  if (!Array.isArray(record.provenance) || record.provenance.length === 0) {
    throw new Error(`record ${id} must contain provenance`);
  }
  const provenanceFingerprints: string[] = [];
  for (const [index, source] of record.provenance.entries()) {
    assertKeys(source as unknown, PROVENANCE_KEYS, `record ${id} provenance ${index}`);
    requiredString(source.mailboxId, `record ${id} provenance mailboxId`);
    requiredString(source.folder, `record ${id} provenance folder`);
    requiredString(source.uidValidity, `record ${id} provenance uidValidity`);
    requiredString(source.uid, `record ${id} provenance uid`);
    const sourceTimestamp = canonicalTimestamp(source.sourceTimestamp, `record ${id} provenance sourceTimestamp`);
    assertNotFuture(sourceTimestamp, nowMs, `record ${id} provenance sourceTimestamp`);
    provenanceFingerprints.push(requiredString(source.ingestFingerprint, `record ${id} provenance ingestFingerprint`));
  }
  if (new Set(provenanceFingerprints).size !== provenanceFingerprints.length) {
    throw new Error(`record ${id} contains duplicate provenance fingerprints`);
  }

  return {
    effectiveTimestamp,
    sourceTimestamp: lastSourceTimestamp,
    participantEmails: participantEmails(record),
    provenanceFingerprints: uniqueSorted(provenanceFingerprints)
  };
}

function observedAt(value: unknown, nowMs: number, label: string): string {
  const timestamp = canonicalTimestamp(value, label);
  assertNotFuture(timestamp, nowMs, label);
  return timestamp;
}

function compareActivities(a: EmailActivityProjectionV1, b: EmailActivityProjectionV1): number {
  return (
    a.effectiveTimestamp.localeCompare(b.effectiveTimestamp) ||
    a.sourceTimestamp.localeCompare(b.sourceTimestamp) ||
    a.id.localeCompare(b.id)
  );
}

export function projectCanonicalEmailToCrmV1(input: CanonicalEmailCrmLinkInputV1): CanonicalEmailCrmLinkResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  const allowedInputKeys = new Set([
    "records",
    "contacts",
    "companyDomains",
    "entityLinks",
    "recordStates",
    "corrections",
    "now"
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) throw new Error(`input contains unsupported key ${key}`);
  }

  const now = canonicalTimestamp(input.now, "now");
  const nowMs = Date.parse(now);
  if (!Array.isArray(input.records)) throw new Error("records must be an array");
  if (!Array.isArray(input.contacts)) throw new Error("contacts must be an array");
  const companyDomains = input.companyDomains ?? [];
  const entityLinks = input.entityLinks ?? [];
  const recordStates = input.recordStates ?? [];
  const corrections = input.corrections ?? [];
  if (!Array.isArray(companyDomains) || !Array.isArray(entityLinks) || !Array.isArray(recordStates) || !Array.isArray(corrections)) {
    throw new Error("optional evidence collections must be arrays");
  }

  const records = [...input.records].sort((a, b) => a.id.localeCompare(b.id));
  const recordIds = new Set<string>();
  const recordFacts = new Map<string, ReturnType<typeof validateCanonicalRecord>>();
  for (const record of records) {
    const id = requiredString(record.id, "canonical email record id");
    if (recordIds.has(id)) throw new Error(`duplicate canonical email id ${id}`);
    recordIds.add(id);
    recordFacts.set(id, validateCanonicalRecord(record, nowMs));
  }

  const contactsByEmail = new Map<string, EmailContactIdentityEvidenceV1[]>();
  const seenContactEvidence = new Set<string>();
  for (const contact of input.contacts) {
    assertKeys(contact as unknown, CONTACT_KEYS, "contact evidence");
    const contactId = requiredString(contact.contactId, "contact evidence contactId");
    const email = normalizeEmail(contact.email, "contact evidence email");
    const evidenceRef = requiredString(contact.evidenceRef, "contact evidence evidenceRef");
    observedAt(contact.observedAt, nowMs, "contact evidence observedAt");
    const evidenceKey = `${contactId}\u0000${email}`;
    if (seenContactEvidence.has(evidenceKey)) throw new Error(`duplicate contact identity evidence for ${contactId}`);
    seenContactEvidence.add(evidenceKey);

    let companyMembership: EmailContactCompanyMembershipEvidenceV1 | null = null;
    if (contact.companyMembership != null) {
      assertKeys(contact.companyMembership as unknown, MEMBERSHIP_KEYS, "company membership evidence");
      companyMembership = {
        companyId: requiredString(contact.companyMembership.companyId, "company membership companyId"),
        evidenceRef: requiredString(contact.companyMembership.evidenceRef, "company membership evidenceRef")
      };
    }
    const normalized: EmailContactIdentityEvidenceV1 = {
      contactId,
      email,
      evidenceRef,
      observedAt: canonicalTimestamp(contact.observedAt, "contact evidence observedAt"),
      companyMembership
    };
    const bucket = contactsByEmail.get(email) ?? [];
    bucket.push(normalized);
    contactsByEmail.set(email, bucket);
  }
  for (const bucket of contactsByEmail.values()) bucket.sort((a, b) => a.contactId.localeCompare(b.contactId));

  const domainsByDomain = new Map<string, EmailCompanyDomainEvidenceV1[]>();
  const seenDomainEvidence = new Set<string>();
  for (const domainEvidence of companyDomains) {
    assertKeys(domainEvidence as unknown, DOMAIN_KEYS, "company domain evidence");
    const companyId = requiredString(domainEvidence.companyId, "company domain companyId");
    const domain = normalizeDomain(domainEvidence.domain, "company domain");
    const evidenceRef = requiredString(domainEvidence.evidenceRef, "company domain evidenceRef");
    observedAt(domainEvidence.observedAt, nowMs, "company domain observedAt");
    const key = `${domain}\u0000${companyId}`;
    if (seenDomainEvidence.has(key)) throw new Error(`duplicate company domain evidence for ${domain}`);
    seenDomainEvidence.add(key);
    const normalized = { companyId, domain, evidenceRef, observedAt: canonicalTimestamp(domainEvidence.observedAt, "company domain observedAt") };
    const bucket = domainsByDomain.get(domain) ?? [];
    bucket.push(normalized);
    domainsByDomain.set(domain, bucket);
  }
  for (const bucket of domainsByDomain.values()) bucket.sort((a, b) => a.companyId.localeCompare(b.companyId));

  const linksByRecord = new Map<string, EmailLinkedEntityV1[]>();
  const seenEntityLinks = new Set<string>();
  for (const link of entityLinks) {
    assertKeys(link as unknown, ENTITY_LINK_KEYS, "entity link evidence");
    const canonicalEmailId = requiredString(link.canonicalEmailId, "entity link canonicalEmailId");
    if (!recordIds.has(canonicalEmailId)) throw new Error(`entity link references missing record ${canonicalEmailId}`);
    if (!ENTITY_TYPES.has(link.entityType)) throw new Error(`unsupported entity link type ${String(link.entityType)}`);
    const entityId = requiredString(link.entityId, "entity link entityId");
    const evidenceRef = requiredString(link.evidenceRef, "entity link evidenceRef");
    observedAt(link.observedAt, nowMs, "entity link observedAt");
    const key = `${canonicalEmailId}\u0000${link.entityType}\u0000${entityId}\u0000${evidenceRef}`;
    if (seenEntityLinks.has(key)) throw new Error(`duplicate entity link evidence for ${canonicalEmailId}`);
    seenEntityLinks.add(key);
    const bucket = linksByRecord.get(canonicalEmailId) ?? [];
    const existing = bucket.find((item) => item.entityType === link.entityType && item.entityId === entityId);
    if (existing) {
      (existing.evidenceRefs as string[]).push(evidenceRef);
      (existing.evidenceRefs as string[]).sort((a, b) => a.localeCompare(b));
    } else {
      bucket.push({ entityType: link.entityType, entityId, evidenceRefs: [evidenceRef] });
    }
    linksByRecord.set(canonicalEmailId, bucket);
  }
  for (const bucket of linksByRecord.values()) {
    bucket.sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId));
  }

  const stateByRecord = new Map<string, EmailRecordStateEvidenceV1>();
  for (const state of recordStates) {
    assertKeys(state as unknown, RECORD_STATE_KEYS, "record state evidence");
    const canonicalEmailId = requiredString(state.canonicalEmailId, "record state canonicalEmailId");
    if (!recordIds.has(canonicalEmailId)) throw new Error(`record state references missing record ${canonicalEmailId}`);
    if (stateByRecord.has(canonicalEmailId)) throw new Error(`duplicate record state evidence for ${canonicalEmailId}`);
    if (!TRUTH_STATES.has(state.truthState)) throw new Error(`unsupported truth state ${String(state.truthState)}`);
    if (!FRESHNESS_STATES.has(state.freshnessState)) throw new Error(`unsupported freshness state ${String(state.freshnessState)}`);
    const evidenceRef = requiredString(state.evidenceRef, "record state evidenceRef");
    const timestamp = observedAt(state.observedAt, nowMs, "record state observedAt");
    stateByRecord.set(canonicalEmailId, { ...state, canonicalEmailId, evidenceRef, observedAt: timestamp });
  }

  const correctionByRecord = new Map<string, EmailCorrectionEvidenceV1>();
  for (const correction of corrections) {
    assertKeys(correction as unknown, CORRECTION_KEYS, "correction evidence");
    const canonicalEmailId = requiredString(correction.canonicalEmailId, "correction canonicalEmailId");
    const supersedesCanonicalEmailId = requiredString(
      correction.supersedesCanonicalEmailId,
      "correction supersedesCanonicalEmailId"
    );
    if (!recordIds.has(canonicalEmailId) || !recordIds.has(supersedesCanonicalEmailId)) {
      throw new Error("correction references missing canonical email record");
    }
    if (canonicalEmailId === supersedesCanonicalEmailId) throw new Error("correction cannot supersede itself");
    if (correctionByRecord.has(canonicalEmailId)) throw new Error(`duplicate correction evidence for ${canonicalEmailId}`);
    const evidenceRef = requiredString(correction.evidenceRef, "correction evidenceRef");
    const timestamp = observedAt(correction.observedAt, nowMs, "correction observedAt");
    const currentFacts = recordFacts.get(canonicalEmailId)!;
    const previousFacts = recordFacts.get(supersedesCanonicalEmailId)!;
    if (
      Date.parse(timestamp) < Date.parse(currentFacts.effectiveTimestamp) ||
      Date.parse(timestamp) < Date.parse(previousFacts.effectiveTimestamp)
    ) {
      throw new Error("correction evidence is non-monotonic");
    }
    correctionByRecord.set(canonicalEmailId, {
      canonicalEmailId,
      supersedesCanonicalEmailId,
      evidenceRef,
      observedAt: timestamp
    });
  }
  for (const id of correctionByRecord.keys()) {
    const seen = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor) {
      if (seen.has(cursor)) throw new Error("correction chain contains a cycle");
      seen.add(cursor);
      cursor = correctionByRecord.get(cursor)?.supersedesCanonicalEmailId;
    }
  }

  let unknownParticipantCount = 0;
  let ambiguousParticipantCount = 0;
  let conflictedCompanyCount = 0;
  const recordProjections: CanonicalEmailCrmRecordProjectionV1[] = [];
  const activities: EmailActivityProjectionV1[] = [];
  const activityIds = new Set<string>();

  for (const record of records) {
    const facts = recordFacts.get(record.id)!;
    const resolutions: EmailParticipantResolutionV1[] = facts.participantEmails.map((email) => {
      const participantFingerprint = stableId("participant", email);
      const candidates = contactsByEmail.get(email) ?? [];
      if (candidates.length === 0) {
        unknownParticipantCount += 1;
        return {
          participantFingerprint,
          status: "UNKNOWN" as const,
          contactId: null,
          companyStatus: "UNKNOWN" as const,
          companyId: null,
          evidenceRefs: []
        };
      }
      if (candidates.length > 1) {
        ambiguousParticipantCount += 1;
        return {
          participantFingerprint,
          status: "AMBIGUOUS" as const,
          contactId: null,
          companyStatus: "UNKNOWN" as const,
          companyId: null,
          evidenceRefs: uniqueSorted(candidates.map((candidate) => candidate.evidenceRef))
        };
      }

      const candidate = candidates[0];
      const evidenceRefs = [candidate.evidenceRef];
      if (candidate.companyMembership) {
        evidenceRefs.push(candidate.companyMembership.evidenceRef);
        return {
          participantFingerprint,
          status: "RESOLVED" as const,
          contactId: candidate.contactId,
          companyStatus: "RESOLVED" as const,
          companyId: candidate.companyMembership.companyId,
          evidenceRefs: uniqueSorted(evidenceRefs)
        };
      }

      const domain = email.slice(email.lastIndexOf("@") + 1);
      const domainCandidates = domainsByDomain.get(domain) ?? [];
      if (domainCandidates.length === 0) {
        return {
          participantFingerprint,
          status: "RESOLVED" as const,
          contactId: candidate.contactId,
          companyStatus: "UNKNOWN" as const,
          companyId: null,
          evidenceRefs: uniqueSorted(evidenceRefs)
        };
      }
      const companyIds = uniqueSorted(domainCandidates.map((entry) => entry.companyId));
      evidenceRefs.push(...domainCandidates.map((entry) => entry.evidenceRef));
      if (companyIds.length > 1) {
        conflictedCompanyCount += 1;
        return {
          participantFingerprint,
          status: "RESOLVED" as const,
          contactId: candidate.contactId,
          companyStatus: "CONFLICTED" as const,
          companyId: null,
          evidenceRefs: uniqueSorted(evidenceRefs)
        };
      }
      return {
        participantFingerprint,
        status: "RESOLVED" as const,
        contactId: candidate.contactId,
        companyStatus: "RESOLVED" as const,
        companyId: companyIds[0],
        evidenceRefs: uniqueSorted(evidenceRefs)
      };
    });

    const state = stateByRecord.get(record.id);
    const truthState = state?.truthState ?? "KNOWN";
    const freshnessState = state?.freshnessState ?? "UNKNOWN";
    const linkedEntities = linksByRecord.get(record.id) ?? [];
    const correction = correctionByRecord.get(record.id);
    const stateEvidenceRefs = state ? [state.evidenceRef] : [];
    const correctionEvidenceRefs = correction ? [correction.evidenceRef] : [];
    const entityEvidenceRefs = linkedEntities.flatMap((link) => link.evidenceRefs);
    const participantEvidenceRefs = resolutions.flatMap((resolution) => resolution.evidenceRefs);
    const evidenceRefs = uniqueSorted([
      ...facts.provenanceFingerprints,
      ...stateEvidenceRefs,
      ...correctionEvidenceRefs,
      ...entityEvidenceRefs,
      ...participantEvidenceRefs
    ]);
    const hasResolvedContact = resolutions.some((resolution) => resolution.status === "RESOLVED");
    const hasAmbiguousIdentity = resolutions.some((resolution) => resolution.status === "AMBIGUOUS");
    const hasConflictedCompany = resolutions.some((resolution) => resolution.companyStatus === "CONFLICTED");
    const decisionEligible = truthState === "KNOWN" && hasResolvedContact && !hasAmbiguousIdentity && !hasConflictedCompany;

    recordProjections.push({
      canonicalEmailId: record.id,
      participantResolutions: resolutions,
      linkedEntities,
      sourceTimestamp: facts.sourceTimestamp,
      effectiveTimestamp: facts.effectiveTimestamp,
      truthState,
      freshnessState,
      evidenceRefs,
      provenanceFingerprints: facts.provenanceFingerprints,
      supersedesCanonicalEmailId: correction?.supersedesCanonicalEmailId ?? null,
      decisionEligible
    });

    const byContact = new Map<string, EmailParticipantResolutionV1[]>();
    for (const resolution of resolutions) {
      if (resolution.status !== "RESOLVED" || !resolution.contactId) continue;
      const bucket = byContact.get(resolution.contactId) ?? [];
      bucket.push(resolution);
      byContact.set(resolution.contactId, bucket);
    }
    for (const [contactId, contactResolutions] of [...byContact.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const companyIds = uniqueSorted(
        contactResolutions.flatMap((resolution) => (resolution.companyStatus === "RESOLVED" && resolution.companyId ? [resolution.companyId] : []))
      );
      if (companyIds.length > 1) throw new Error(`contradictory company evidence for contact ${contactId}`);
      const id = stableId("email_activity", `${record.id}\u0000${contactId}`);
      if (activityIds.has(id)) throw new Error(`duplicate activity id ${id}`);
      activityIds.add(id);
      activities.push({
        id,
        canonicalEmailId: record.id,
        contactId,
        companyId: companyIds[0] ?? null,
        linkedEntities,
        sourceTimestamp: facts.sourceTimestamp,
        effectiveTimestamp: facts.effectiveTimestamp,
        truthState,
        freshnessState,
        evidenceRefs,
        provenanceFingerprints: facts.provenanceFingerprints,
        supersedesCanonicalEmailId: correction?.supersedesCanonicalEmailId ?? null
      });
    }
  }

  activities.sort(compareActivities);
  recordProjections.sort((a, b) => a.canonicalEmailId.localeCompare(b.canonicalEmailId));
  const timelinesByContact = new Map<string, EmailActivityProjectionV1[]>();
  for (const activity of activities) {
    const bucket = timelinesByContact.get(activity.contactId) ?? [];
    bucket.push(activity);
    timelinesByContact.set(activity.contactId, bucket);
  }
  const contactTimelines: EmailContactTimelineV1[] = [...timelinesByContact.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([contactId, timelineActivities]) => ({
      contactId,
      activities: [...timelineActivities].sort(compareActivities)
    }));

  const resolvedContactCount = new Set(activities.map((activity) => activity.contactId)).size;
  const linkedEntityCount = recordProjections.reduce((total, record) => total + record.linkedEntities.length, 0);
  return {
    records: recordProjections,
    activities,
    contactTimelines,
    telemetry: {
      recordCount: recordProjections.length,
      activityCount: activities.length,
      resolvedContactCount,
      unknownParticipantCount,
      ambiguousParticipantCount,
      conflictedCompanyCount,
      linkedEntityCount,
      correctionCount: correctionByRecord.size,
      recordFingerprints: recordProjections.map((record) => stableId("record", record.canonicalEmailId)).sort((a, b) => a.localeCompare(b))
    }
  };
}
