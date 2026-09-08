import { createHash } from "node:crypto";

import type { IonosMailboxRoleV1 } from "@/lib/email/ionos-mailbox-config-v1";

export type HistoricalEmailDirectionV1 = "INBOUND" | "OUTBOUND" | "SELF" | "UNKNOWN";
export type HistoricalEmailIdentityBasisV1 = "MESSAGE_ID" | "FINGERPRINT";

export type HistoricalEmailParticipantsV1 = {
  from?: readonly string[];
  to?: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
};

export type HistoricalEmailBodyV1 =
  | { policy: "NONE" }
  | { policy: "REFERENCE"; reference: string }
  | { policy: "TEXT"; text: string; reference?: string | null };

export type HistoricalEmailAttachmentV1 = {
  contentHash: string;
  mimeType?: string | null;
  size?: number | null;
  filename?: string | null;
};

export type HistoricalEmailEnvelopeV1 = {
  mailboxId: string;
  role: IonosMailboxRoleV1;
  folder: string;
  uidValidity: string | number | bigint;
  uid: string | number | bigint;
  messageId?: string | null;
  direction: HistoricalEmailDirectionV1;
  participants: HistoricalEmailParticipantsV1;
  sentAt?: string | Date | null;
  receivedAt?: string | Date | null;
  subject?: string | null;
  inReplyTo?: string | null;
  references?: readonly string[] | null;
  body?: HistoricalEmailBodyV1 | null;
  attachments?: readonly HistoricalEmailAttachmentV1[] | null;
  sourceTimestamp: string | Date;
};

export type HistoricalEmailHorizonV1 = {
  startAt: string | Date;
  endAt: string | Date;
};

export type HistoricalBackfillScopeV1 = {
  mailboxId: string;
  role: IonosMailboxRoleV1;
  folder: string;
  uidValidity: string | number | bigint;
};

export type HistoricalBackfillCheckpointV1 = {
  mailboxId: string;
  folder: string;
  uidValidity: string;
  horizonStartAt: string;
  horizonEndAt: string;
  lastCompletedUid: string;
  updatedAt: string;
};

export type CanonicalEmailProvenanceV1 = {
  mailboxId: string;
  role: IonosMailboxRoleV1;
  folder: string;
  uidValidity: string;
  uid: string;
  sourceTimestamp: string;
  ingestFingerprint: string;
};

export type CanonicalEmailAttachmentV1 = {
  contentHash: string;
  mimeType: string | null;
  size: number | null;
};

export type CanonicalEmailRecordV1 = {
  id: string;
  identityBasis: HistoricalEmailIdentityBasisV1;
  messageId: string | null;
  dedupeKey: string;
  direction: HistoricalEmailDirectionV1;
  participants: {
    from: readonly string[];
    to: readonly string[];
    cc: readonly string[];
    bcc: readonly string[];
  };
  sentAt: string | null;
  receivedAt: string | null;
  subject: string | null;
  thread: {
    inReplyTo: string | null;
    references: readonly string[];
  };
  body: {
    policy: "NONE" | "REFERENCE" | "TEXT";
    reference: string | null;
    text: string | null;
  };
  attachments: readonly CanonicalEmailAttachmentV1[];
  provenance: readonly CanonicalEmailProvenanceV1[];
  qualityReasons: readonly HistoricalEmailQualityReasonV1[];
  firstSourceTimestamp: string;
  lastSourceTimestamp: string;
};

export type HistoricalEmailQualityReasonV1 =
  | "MISSING_MESSAGE_ID"
  | "MALFORMED_MESSAGE_ID"
  | "MALFORMED_THREAD_ID"
  | "CONFLICTING_DUPLICATE_FIELDS";

export type HistoricalEmailRejectionReasonV1 =
  | "MALFORMED_PARTICIPANTS"
  | "MALFORMED_TIMESTAMP"
  | "MALFORMED_ATTACHMENT"
  | "MALFORMED_BODY"
  | "UNSUPPORTED_ENVELOPE";

export type HistoricalEmailRejectionV1 = {
  sourceFingerprint: string;
  reason: HistoricalEmailRejectionReasonV1;
};

export type HistoricalEmailNormalizationResultV1 = {
  records: readonly CanonicalEmailRecordV1[];
  rejections: readonly HistoricalEmailRejectionV1[];
  consideredCount: number;
  skippedOutsideHorizonCount: number;
};

export type HistoricalBackfillCommitInputV1 = {
  scope: HistoricalBackfillScopeV1 & { uidValidity: string };
  expectedCheckpoint: HistoricalBackfillCheckpointV1 | null;
  nextCheckpoint: HistoricalBackfillCheckpointV1;
  records: readonly CanonicalEmailRecordV1[];
  rejections: readonly HistoricalEmailRejectionV1[];
};

export type HistoricalBackfillCommitResultV1 = {
  committed: boolean;
  insertedRecordCount: number;
  insertedProvenanceCount: number;
  recordedRejectionCount: number;
};

export type HistoricalBackfillStoreV1 = {
  readCheckpoint(scope: {
    mailboxId: string;
    folder: string;
  }): Promise<HistoricalBackfillCheckpointV1 | null>;
  commitBatch(input: HistoricalBackfillCommitInputV1): Promise<HistoricalBackfillCommitResultV1>;
};

export type HistoricalBackfillBatchResultV1 = {
  status: "COMMITTED" | "NO_WORK" | "STALE_CHECKPOINT" | "FAILED";
  reason:
    | "BATCH_COMMITTED"
    | "NO_ELIGIBLE_MESSAGES"
    | "CONCURRENT_CHECKPOINT_UPDATE"
    | "STORE_FAILURE";
  acceptedRecordCount: number;
  provenanceCount: number;
  rejectionCount: number;
  skippedOutsideHorizonCount: number;
  checkpointFingerprint: string | null;
  telemetry: {
    status: "COMMITTED" | "NO_WORK" | "STALE_CHECKPOINT" | "FAILED";
    reason:
      | "BATCH_COMMITTED"
      | "NO_ELIGIBLE_MESSAGES"
      | "CONCURRENT_CHECKPOINT_UPDATE"
      | "STORE_FAILURE";
    consideredCount: number;
    canonicalCount: number;
    provenanceCount: number;
    rejectionCount: number;
    skippedOutsideHorizonCount: number;
    checkpointFingerprint: string | null;
    recordFingerprints: readonly string[];
    rejectionFingerprints: readonly string[];
  };
};

const ROLE_SET = new Set<string>([
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
]);

const ENVELOPE_KEYS = new Set([
  "mailboxId",
  "role",
  "folder",
  "uidValidity",
  "uid",
  "messageId",
  "direction",
  "participants",
  "sentAt",
  "receivedAt",
  "subject",
  "inReplyTo",
  "references",
  "body",
  "attachments",
  "sourceTimestamp"
]);

const PARTICIPANT_KEYS = new Set(["from", "to", "cc", "bcc"]);
const ATTACHMENT_KEYS = new Set(["contentHash", "mimeType", "size", "filename"]);
const BODY_KEYS = new Set(["policy", "reference", "text"]);
const CHECKPOINT_KEYS = new Set([
  "mailboxId",
  "folder",
  "uidValidity",
  "horizonStartAt",
  "horizonEndAt",
  "lastCompletedUid",
  "updatedAt"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a string or null`);
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function canonicalTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return date.toISOString();
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value == null) return null;
  return canonicalTimestamp(value, label);
}

function canonicalUid(value: unknown, label: string): string {
  if (typeof value === "bigint") {
    if (value < BigInt(0)) throw new Error(`${label} must be non-negative`);
    return value.toString();
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return String(value);
  }
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    return value.replace(/^0+(?=\d)/, "");
  }
  throw new Error(`${label} must be a non-negative decimal UID`);
}

function compareDecimal(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeIntegerOrNull(value: unknown, label: string): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer or null`);
  }
  return value;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeAddress(value: unknown): string {
  if (typeof value !== "string") throw new Error("participant address must be a string");
  const address = value.trim().toLowerCase();
  if (
    !address ||
    address.length > 320 ||
    address.includes(" ") ||
    address.startsWith("@") ||
    address.endsWith("@") ||
    address.split("@").length !== 2
  ) {
    throw new Error("participant address is malformed");
  }
  return address;
}

function normalizeParticipants(value: unknown): CanonicalEmailRecordV1["participants"] {
  if (!isPlainObject(value)) throw new Error("participants must be a plain object");
  const unknownKeys = Object.keys(value).filter((key) => !PARTICIPANT_KEYS.has(key));
  if (unknownKeys.length > 0) throw new Error("participants contains unsupported keys");

  const read = (key: "from" | "to" | "cc" | "bcc"): string[] => {
    const raw = value[key];
    if (raw == null) return [];
    if (!Array.isArray(raw)) throw new Error(`participants.${key} must be an array`);
    return stableUnique(raw.map(normalizeAddress));
  };

  return { from: read("from"), to: read("to"), cc: read("cc"), bcc: read("bcc") };
}

function normalizeMessageId(value: unknown): {
  value: string | null;
  quality: HistoricalEmailQualityReasonV1 | null;
} {
  if (value == null || value === "") return { value: null, quality: "MISSING_MESSAGE_ID" };
  if (typeof value !== "string") return { value: null, quality: "MALFORMED_MESSAGE_ID" };

  let candidate = value.trim().toLowerCase();
  if (candidate.startsWith("<") && candidate.endsWith(">")) {
    candidate = candidate.slice(1, -1).trim();
  }
  if (
    !candidate ||
    candidate.length > 998 ||
    candidate.includes(" ") ||
    candidate.includes("<") ||
    candidate.includes(">") ||
    candidate.split("@").length !== 2 ||
    candidate.startsWith("@") ||
    candidate.endsWith("@")
  ) {
    return { value: null, quality: "MALFORMED_MESSAGE_ID" };
  }
  return { value: `<${candidate}>`, quality: null };
}

function normalizeThreadId(value: unknown): { value: string | null; malformed: boolean } {
  if (value == null || value === "") return { value: null, malformed: false };
  const normalized = normalizeMessageId(value);
  return normalized.value == null
    ? { value: null, malformed: true }
    : { value: normalized.value, malformed: false };
}

function normalizeBody(value: unknown): CanonicalEmailRecordV1["body"] {
  if (value == null) return { policy: "NONE", reference: null, text: null };
  if (!isPlainObject(value)) throw new Error("body must be a plain object");
  const unknownKeys = Object.keys(value).filter((key) => !BODY_KEYS.has(key));
  if (unknownKeys.length > 0) throw new Error("body contains unsupported keys");

  const policy = requiredString(value.policy, "body.policy");
  if (policy === "NONE") {
    if (value.reference != null || value.text != null) {
      throw new Error("NONE body policy cannot include content");
    }
    return { policy: "NONE", reference: null, text: null };
  }
  if (policy === "REFERENCE") {
    if (value.text != null) throw new Error("REFERENCE body policy cannot include text");
    return {
      policy: "REFERENCE",
      reference: requiredString(value.reference, "body.reference"),
      text: null
    };
  }
  if (policy === "TEXT") {
    const text = requiredString(value.text, "body.text");
    if (text.length > 100_000) throw new Error("body.text exceeds bounded policy size");
    return {
      policy: "TEXT",
      reference: value.reference == null ? null : requiredString(value.reference, "body.reference"),
      text
    };
  }
  throw new Error("body.policy is unsupported");
}

function normalizeAttachments(value: unknown): CanonicalEmailAttachmentV1[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("attachments must be an array");

  const attachments = value.map((raw, index) => {
    if (!isPlainObject(raw)) throw new Error(`attachments[${index}] must be a plain object`);
    const unknownKeys = Object.keys(raw).filter((key) => !ATTACHMENT_KEYS.has(key));
    if (unknownKeys.length > 0) throw new Error(`attachments[${index}] contains unsupported keys`);

    const contentHash = requiredString(raw.contentHash, `attachments[${index}].contentHash`).toLowerCase();
    if (!/^[a-f0-9]{32,128}$/.test(contentHash)) {
      throw new Error(`attachments[${index}].contentHash must be an evidence-safe hex digest`);
    }
    const mimeType = optionalString(raw.mimeType, `attachments[${index}].mimeType`);
    const size = nonNegativeIntegerOrNull(raw.size, `attachments[${index}].size`);
    if (raw.filename != null && typeof raw.filename !== "string") {
      throw new Error(`attachments[${index}].filename must be a string or null`);
    }
    return { contentHash, mimeType: mimeType?.toLowerCase() ?? null, size };
  });

  attachments.sort((left, right) => {
    const a = `${left.contentHash}|${left.mimeType ?? ""}|${left.size ?? ""}`;
    const b = `${right.contentHash}|${right.mimeType ?? ""}|${right.size ?? ""}`;
    return a.localeCompare(b);
  });
  return attachments;
}

function validateDirection(value: unknown): HistoricalEmailDirectionV1 {
  if (value === "INBOUND" || value === "OUTBOUND" || value === "SELF" || value === "UNKNOWN") {
    return value;
  }
  throw new Error("direction is unsupported");
}

function validateRole(value: unknown): IonosMailboxRoleV1 {
  const role = requiredString(value, "role");
  if (!ROLE_SET.has(role)) throw new Error("role is unsupported");
  return role as IonosMailboxRoleV1;
}

function canonicalHorizon(value: unknown): { startAt: string; endAt: string } {
  if (!isPlainObject(value)) throw new Error("horizon must be a plain object");
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "startAt" && key !== "endAt")) {
    throw new Error("horizon contains unsupported keys");
  }
  const startAt = canonicalTimestamp(value.startAt, "horizon.startAt");
  const endAt = canonicalTimestamp(value.endAt, "horizon.endAt");
  if (startAt > endAt) throw new Error("horizon.startAt must not be after horizon.endAt");
  return { startAt, endAt };
}

function sourceFingerprint(input: {
  mailboxId: string;
  folder: string;
  uidValidity: string;
  uid: string;
  sourceTimestamp: string;
}): string {
  return stableHash([
    input.mailboxId,
    input.folder,
    input.uidValidity,
    input.uid,
    input.sourceTimestamp
  ].join("\u001f"));
}

type NormalizedSource = {
  sourceKey: string;
  messageId: string | null;
  identityBasis: HistoricalEmailIdentityBasisV1;
  dedupeKey: string;
  direction: HistoricalEmailDirectionV1;
  participants: CanonicalEmailRecordV1["participants"];
  sentAt: string | null;
  receivedAt: string | null;
  subject: string | null;
  thread: CanonicalEmailRecordV1["thread"];
  body: CanonicalEmailRecordV1["body"];
  attachments: CanonicalEmailAttachmentV1[];
  provenance: CanonicalEmailProvenanceV1;
  qualityReasons: HistoricalEmailQualityReasonV1[];
};

function fallbackIdentity(input: {
  direction: HistoricalEmailDirectionV1;
  participants: CanonicalEmailRecordV1["participants"];
  sentAt: string | null;
  receivedAt: string | null;
  subject: string | null;
  thread: CanonicalEmailRecordV1["thread"];
  attachments: readonly CanonicalEmailAttachmentV1[];
}): string {
  const timestamp = input.sentAt ?? input.receivedAt ?? "UNKNOWN";
  return stableHash(JSON.stringify({
    direction: input.direction,
    participants: input.participants,
    timestamp,
    subject: input.subject?.toLowerCase() ?? null,
    thread: input.thread,
    attachmentHashes: input.attachments.map((attachment) => attachment.contentHash)
  }));
}

function normalizeEnvelope(value: unknown, index: number): NormalizedSource {
  if (!isPlainObject(value)) throw new Error(`messages[${index}] must be a plain object`);
  const unknownKeys = Object.keys(value).filter((key) => !ENVELOPE_KEYS.has(key));
  if (unknownKeys.length > 0) throw new Error(`messages[${index}] contains unsupported keys`);

  const mailboxId = requiredString(value.mailboxId, `messages[${index}].mailboxId`);
  const role = validateRole(value.role);
  const folder = requiredString(value.folder, `messages[${index}].folder`);
  const uidValidity = canonicalUid(value.uidValidity, `messages[${index}].uidValidity`);
  const uid = canonicalUid(value.uid, `messages[${index}].uid`);
  const sourceTimestamp = canonicalTimestamp(value.sourceTimestamp, `messages[${index}].sourceTimestamp`);

  const participants = normalizeParticipants(value.participants);
  const direction = validateDirection(value.direction);
  const sentAt = optionalTimestamp(value.sentAt, `messages[${index}].sentAt`);
  const receivedAt = optionalTimestamp(value.receivedAt, `messages[${index}].receivedAt`);
  const subject = optionalString(value.subject, `messages[${index}].subject`);
  const body = normalizeBody(value.body);
  const attachments = normalizeAttachments(value.attachments);

  const qualityReasons: HistoricalEmailQualityReasonV1[] = [];
  const normalizedMessageId = normalizeMessageId(value.messageId);
  if (normalizedMessageId.quality) qualityReasons.push(normalizedMessageId.quality);

  const inReplyTo = normalizeThreadId(value.inReplyTo);
  if (inReplyTo.malformed) qualityReasons.push("MALFORMED_THREAD_ID");

  let references: string[] = [];
  if (value.references != null) {
    if (!Array.isArray(value.references)) throw new Error(`messages[${index}].references must be an array`);
    for (const raw of value.references) {
      const normalized = normalizeThreadId(raw);
      if (normalized.malformed) {
        qualityReasons.push("MALFORMED_THREAD_ID");
      } else if (normalized.value) {
        references.push(normalized.value);
      }
    }
    references = stableUnique(references);
  }

  const thread = { inReplyTo: inReplyTo.value, references };
  const identityBasis: HistoricalEmailIdentityBasisV1 = normalizedMessageId.value ? "MESSAGE_ID" : "FINGERPRINT";
  const dedupeKey = normalizedMessageId.value
    ? `message-id:${normalizedMessageId.value}`
    : `fingerprint:${fallbackIdentity({
        direction,
        participants,
        sentAt,
        receivedAt,
        subject,
        thread,
        attachments
      })}`;

  const provenance: CanonicalEmailProvenanceV1 = {
    mailboxId,
    role,
    folder,
    uidValidity,
    uid,
    sourceTimestamp,
    ingestFingerprint: sourceFingerprint({ mailboxId, folder, uidValidity, uid, sourceTimestamp })
  };

  return {
    sourceKey: `${mailboxId}\u001f${folder}\u001f${uidValidity}\u001f${uid}`,
    messageId: normalizedMessageId.value,
    identityBasis,
    dedupeKey,
    direction,
    participants,
    sentAt,
    receivedAt,
    subject,
    thread,
    body,
    attachments,
    provenance,
    qualityReasons: stableUnique(qualityReasons) as HistoricalEmailQualityReasonV1[]
  };
}

function sourceEventTimestamp(source: NormalizedSource): string {
  return source.receivedAt ?? source.sentAt ?? source.provenance.sourceTimestamp;
}

function recordComparable(source: NormalizedSource): string {
  return JSON.stringify({
    direction: source.direction,
    participants: source.participants,
    sentAt: source.sentAt,
    receivedAt: source.receivedAt,
    subject: source.subject,
    thread: source.thread,
    body: source.body,
    attachments: source.attachments
  });
}

function toCanonicalRecord(group: readonly NormalizedSource[]): CanonicalEmailRecordV1 {
  const ordered = [...group].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  const primary = ordered[0];
  if (!primary) throw new Error("canonical group must contain at least one source");

  const qualityReasons = new Set<HistoricalEmailQualityReasonV1>();
  const comparable = recordComparable(primary);
  for (const source of ordered) {
    for (const reason of source.qualityReasons) qualityReasons.add(reason);
    if (recordComparable(source) !== comparable) qualityReasons.add("CONFLICTING_DUPLICATE_FIELDS");
  }

  const provenanceByFingerprint = new Map<string, CanonicalEmailProvenanceV1>();
  for (const source of ordered) {
    provenanceByFingerprint.set(source.provenance.ingestFingerprint, source.provenance);
  }
  const provenance = [...provenanceByFingerprint.values()].sort((left, right) => {
    const a = `${left.mailboxId}\u001f${left.folder}\u001f${left.uidValidity}`;
    const b = `${right.mailboxId}\u001f${right.folder}\u001f${right.uidValidity}`;
    const prefix = a.localeCompare(b);
    return prefix !== 0 ? prefix : compareDecimal(left.uid, right.uid);
  });

  const timestamps = provenance.map((item) => item.sourceTimestamp).sort();
  return {
    id: `email:${stableHash(primary.dedupeKey)}`,
    identityBasis: primary.identityBasis,
    messageId: primary.messageId,
    dedupeKey: primary.dedupeKey,
    direction: primary.direction,
    participants: primary.participants,
    sentAt: primary.sentAt,
    receivedAt: primary.receivedAt,
    subject: primary.subject,
    thread: primary.thread,
    body: primary.body,
    attachments: primary.attachments,
    provenance,
    qualityReasons: [...qualityReasons].sort(),
    firstSourceTimestamp: timestamps[0] ?? primary.provenance.sourceTimestamp,
    lastSourceTimestamp: timestamps[timestamps.length - 1] ?? primary.provenance.sourceTimestamp
  };
}

function rejectionFromKnownSource(
  value: unknown,
  index: number,
  reason: HistoricalEmailRejectionReasonV1
): HistoricalEmailRejectionV1 {
  if (!isPlainObject(value)) throw new Error(`messages[${index}] must be a plain object`);
  const mailboxId = requiredString(value.mailboxId, `messages[${index}].mailboxId`);
  const folder = requiredString(value.folder, `messages[${index}].folder`);
  const uidValidity = canonicalUid(value.uidValidity, `messages[${index}].uidValidity`);
  const uid = canonicalUid(value.uid, `messages[${index}].uid`);
  const sourceTimestamp = canonicalTimestamp(value.sourceTimestamp, `messages[${index}].sourceTimestamp`);
  return {
    sourceFingerprint: sourceFingerprint({ mailboxId, folder, uidValidity, uid, sourceTimestamp }),
    reason
  };
}

function classifyEnvelopeFailure(error: unknown): HistoricalEmailRejectionReasonV1 | null {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("participants") || message.includes("participant address")) return "MALFORMED_PARTICIPANTS";
  if (message.includes("sentAt") || message.includes("receivedAt")) return "MALFORMED_TIMESTAMP";
  if (message.includes("attachments")) return "MALFORMED_ATTACHMENT";
  if (message.includes("body")) return "MALFORMED_BODY";
  if (
    message.includes("direction") ||
    message.includes("references") ||
    message.includes("subject") ||
    message.includes("messageId")
  ) {
    return "UNSUPPORTED_ENVELOPE";
  }
  return null;
}

export function normalizeHistoricalEmailMessagesV1(input: {
  messages: readonly HistoricalEmailEnvelopeV1[];
  horizon: HistoricalEmailHorizonV1;
  batchSize: number;
}): HistoricalEmailNormalizationResultV1 {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  const unknownKeys = Object.keys(input).filter(
    (key) => key !== "messages" && key !== "horizon" && key !== "batchSize"
  );
  if (unknownKeys.length > 0) throw new Error("input contains unsupported keys");
  if (!Array.isArray(input.messages)) throw new Error("messages must be an array");
  const batchSize = positiveInteger(input.batchSize, "batchSize");
  const horizon = canonicalHorizon(input.horizon);

  const normalized: NormalizedSource[] = [];
  const rejections: HistoricalEmailRejectionV1[] = [];
  let skippedOutsideHorizonCount = 0;

  for (let index = 0; index < input.messages.length; index += 1) {
    const raw = input.messages[index];
    try {
      const source = normalizeEnvelope(raw, index);
      const eventTimestamp = sourceEventTimestamp(source);
      if (eventTimestamp < horizon.startAt || eventTimestamp > horizon.endAt) {
        skippedOutsideHorizonCount += 1;
        continue;
      }
      normalized.push(source);
    } catch (error) {
      const rejectionReason = classifyEnvelopeFailure(error);
      if (rejectionReason == null) throw error;
      rejections.push(rejectionFromKnownSource(raw, index, rejectionReason));
    }
  }

  normalized.sort((left, right) => {
    const uidOrder = compareDecimal(left.provenance.uid, right.provenance.uid);
    return uidOrder !== 0 ? uidOrder : left.sourceKey.localeCompare(right.sourceKey);
  });
  if (normalized.length + rejections.length > batchSize) {
    throw new Error("eligible historical batch exceeds batchSize");
  }

  const groups = new Map<string, NormalizedSource[]>();
  for (const source of normalized) {
    const group = groups.get(source.dedupeKey) ?? [];
    group.push(source);
    groups.set(source.dedupeKey, group);
  }

  const records = [...groups.values()]
    .map(toCanonicalRecord)
    .sort((left, right) => left.id.localeCompare(right.id));
  rejections.sort((left, right) => {
    const fingerprint = left.sourceFingerprint.localeCompare(right.sourceFingerprint);
    return fingerprint !== 0 ? fingerprint : left.reason.localeCompare(right.reason);
  });

  return {
    records,
    rejections,
    consideredCount: normalized.length + rejections.length,
    skippedOutsideHorizonCount
  };
}

function validateScope(value: unknown): HistoricalBackfillScopeV1 & { uidValidity: string } {
  if (!isPlainObject(value)) throw new Error("scope must be a plain object");
  const keys = Object.keys(value);
  if (keys.some((key) => !["mailboxId", "role", "folder", "uidValidity"].includes(key))) {
    throw new Error("scope contains unsupported keys");
  }
  return {
    mailboxId: requiredString(value.mailboxId, "scope.mailboxId"),
    role: validateRole(value.role),
    folder: requiredString(value.folder, "scope.folder"),
    uidValidity: canonicalUid(value.uidValidity, "scope.uidValidity")
  };
}

function validateCheckpoint(
  value: unknown,
  scope: HistoricalBackfillScopeV1 & { uidValidity: string },
  horizon: { startAt: string; endAt: string }
): HistoricalBackfillCheckpointV1 | null {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new Error("checkpoint must be a plain object");
  const unknownKeys = Object.keys(value).filter((key) => !CHECKPOINT_KEYS.has(key));
  if (unknownKeys.length > 0) throw new Error("checkpoint contains unsupported keys");

  const checkpoint: HistoricalBackfillCheckpointV1 = {
    mailboxId: requiredString(value.mailboxId, "checkpoint.mailboxId"),
    folder: requiredString(value.folder, "checkpoint.folder"),
    uidValidity: canonicalUid(value.uidValidity, "checkpoint.uidValidity"),
    horizonStartAt: canonicalTimestamp(value.horizonStartAt, "checkpoint.horizonStartAt"),
    horizonEndAt: canonicalTimestamp(value.horizonEndAt, "checkpoint.horizonEndAt"),
    lastCompletedUid: canonicalUid(value.lastCompletedUid, "checkpoint.lastCompletedUid"),
    updatedAt: canonicalTimestamp(value.updatedAt, "checkpoint.updatedAt")
  };

  if (
    checkpoint.mailboxId !== scope.mailboxId ||
    checkpoint.folder !== scope.folder ||
    checkpoint.uidValidity !== scope.uidValidity ||
    checkpoint.horizonStartAt !== horizon.startAt ||
    checkpoint.horizonEndAt !== horizon.endAt
  ) {
    throw new Error("checkpoint does not match scope, UIDVALIDITY, or historical horizon");
  }
  return checkpoint;
}

function checkpointFingerprint(checkpoint: HistoricalBackfillCheckpointV1 | null): string | null {
  return checkpoint == null
    ? null
    : stableHash([
        checkpoint.mailboxId,
        checkpoint.folder,
        checkpoint.uidValidity,
        checkpoint.horizonStartAt,
        checkpoint.horizonEndAt,
        checkpoint.lastCompletedUid
      ].join("\u001f"));
}

function validateCommitResult(value: unknown, maxRecords: number, maxProvenance: number, maxRejections: number) {
  if (!isPlainObject(value)) throw new Error("store commit result must be a plain object");
  const allowed = new Set([
    "committed",
    "insertedRecordCount",
    "insertedProvenanceCount",
    "recordedRejectionCount"
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("store commit result contains unsupported keys");
  }
  if (typeof value.committed !== "boolean") throw new Error("store commit result committed must be boolean");
  const insertedRecordCount = nonNegativeIntegerOrNull(value.insertedRecordCount, "insertedRecordCount");
  const insertedProvenanceCount = nonNegativeIntegerOrNull(value.insertedProvenanceCount, "insertedProvenanceCount");
  const recordedRejectionCount = nonNegativeIntegerOrNull(value.recordedRejectionCount, "recordedRejectionCount");
  if (insertedRecordCount == null || insertedProvenanceCount == null || recordedRejectionCount == null) {
    throw new Error("store commit counts are required");
  }
  if (insertedRecordCount > maxRecords || insertedProvenanceCount > maxProvenance || recordedRejectionCount > maxRejections) {
    throw new Error("store commit result exceeds attempted batch counts");
  }
  if (!value.committed && (insertedRecordCount !== 0 || insertedProvenanceCount !== 0 || recordedRejectionCount !== 0)) {
    throw new Error("uncommitted store result cannot report persisted changes");
  }
  return {
    committed: value.committed,
    insertedRecordCount,
    insertedProvenanceCount,
    recordedRejectionCount
  };
}

function makeTelemetry(input: {
  status: HistoricalBackfillBatchResultV1["status"];
  reason: HistoricalBackfillBatchResultV1["reason"];
  consideredCount: number;
  records: readonly CanonicalEmailRecordV1[];
  rejections: readonly HistoricalEmailRejectionV1[];
  skippedOutsideHorizonCount: number;
  checkpoint: HistoricalBackfillCheckpointV1 | null;
}): HistoricalBackfillBatchResultV1["telemetry"] {
  const provenanceCount = input.records.reduce((sum, record) => sum + record.provenance.length, 0);
  return {
    status: input.status,
    reason: input.reason,
    consideredCount: input.consideredCount,
    canonicalCount: input.records.length,
    provenanceCount,
    rejectionCount: input.rejections.length,
    skippedOutsideHorizonCount: input.skippedOutsideHorizonCount,
    checkpointFingerprint: checkpointFingerprint(input.checkpoint),
    recordFingerprints: input.records.map((record) => stableHash(record.id)).sort(),
    rejectionFingerprints: input.rejections.map((rejection) => rejection.sourceFingerprint).sort()
  };
}

export async function commitHistoricalEmailBackfillBatchV1(input: {
  scope: HistoricalBackfillScopeV1;
  messages: readonly HistoricalEmailEnvelopeV1[];
  horizon: HistoricalEmailHorizonV1;
  batchSize: number;
  store: HistoricalBackfillStoreV1;
  now?: () => number;
}): Promise<HistoricalBackfillBatchResultV1> {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  const unknownKeys = Object.keys(input).filter(
    (key) => !["scope", "messages", "horizon", "batchSize", "store", "now"].includes(key)
  );
  if (unknownKeys.length > 0) throw new Error("input contains unsupported keys");
  const scope = validateScope(input.scope);
  const horizon = canonicalHorizon(input.horizon);
  const batchSize = positiveInteger(input.batchSize, "batchSize");
  if (!Array.isArray(input.messages)) throw new Error("messages must be an array");
  if (!isPlainObject(input.store) && typeof input.store !== "object") throw new Error("store must be an object");
  if (
    input.store == null ||
    typeof input.store.readCheckpoint !== "function" ||
    typeof input.store.commitBatch !== "function"
  ) {
    throw new Error("store must implement readCheckpoint and commitBatch");
  }
  const now = input.now ?? Date.now;
  if (typeof now !== "function") throw new Error("now must be a function");

  let checkpoint: HistoricalBackfillCheckpointV1 | null;
  try {
    checkpoint = validateCheckpoint(
      await input.store.readCheckpoint({ mailboxId: scope.mailboxId, folder: scope.folder }),
      scope,
      horizon
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("checkpoint ")) throw error;
    return failedBatchResult("STORE_FAILURE", [], [], 0, 0, null);
  }

  const eligible: HistoricalEmailEnvelopeV1[] = [];
  let skippedOutsideHorizonCount = 0;
  for (let index = 0; index < input.messages.length; index += 1) {
    const raw = input.messages[index];
    if (!isPlainObject(raw)) throw new Error(`messages[${index}] must be a plain object`);
    const mailboxId = requiredString(raw.mailboxId, `messages[${index}].mailboxId`);
    const folder = requiredString(raw.folder, `messages[${index}].folder`);
    const role = validateRole(raw.role);
    const uidValidity = canonicalUid(raw.uidValidity, `messages[${index}].uidValidity`);
    const uid = canonicalUid(raw.uid, `messages[${index}].uid`);
    if (
      mailboxId !== scope.mailboxId ||
      folder !== scope.folder ||
      role !== scope.role ||
      uidValidity !== scope.uidValidity
    ) {
      throw new Error(`messages[${index}] does not match backfill scope`);
    }
    if (checkpoint != null && compareDecimal(uid, checkpoint.lastCompletedUid) <= 0) continue;

    let eventTimestamp: string;
    try {
      const receivedAt = optionalTimestamp(raw.receivedAt, `messages[${index}].receivedAt`);
      const sentAt = optionalTimestamp(raw.sentAt, `messages[${index}].sentAt`);
      eventTimestamp = receivedAt ?? sentAt ?? canonicalTimestamp(raw.sourceTimestamp, `messages[${index}].sourceTimestamp`);
    } catch {
      eventTimestamp = canonicalTimestamp(raw.sourceTimestamp, `messages[${index}].sourceTimestamp`);
    }
    if (eventTimestamp < horizon.startAt || eventTimestamp > horizon.endAt) {
      skippedOutsideHorizonCount += 1;
      continue;
    }
    eligible.push(raw as HistoricalEmailEnvelopeV1);
  }

  eligible.sort((left, right) => {
    const uidOrder = compareDecimal(canonicalUid(left.uid, "uid"), canonicalUid(right.uid, "uid"));
    if (uidOrder !== 0) return uidOrder;
    const leftFingerprint = sourceFingerprint({
      mailboxId: scope.mailboxId,
      folder: scope.folder,
      uidValidity: scope.uidValidity,
      uid: canonicalUid(left.uid, "uid"),
      sourceTimestamp: canonicalTimestamp(left.sourceTimestamp, "sourceTimestamp")
    });
    const rightFingerprint = sourceFingerprint({
      mailboxId: scope.mailboxId,
      folder: scope.folder,
      uidValidity: scope.uidValidity,
      uid: canonicalUid(right.uid, "uid"),
      sourceTimestamp: canonicalTimestamp(right.sourceTimestamp, "sourceTimestamp")
    });
    return leftFingerprint.localeCompare(rightFingerprint);
  });

  if (eligible.length === 0) {
    const telemetry = makeTelemetry({
      status: "NO_WORK",
      reason: "NO_ELIGIBLE_MESSAGES",
      consideredCount: 0,
      records: [],
      rejections: [],
      skippedOutsideHorizonCount,
      checkpoint
    });
    return {
      status: "NO_WORK",
      reason: "NO_ELIGIBLE_MESSAGES",
      acceptedRecordCount: 0,
      provenanceCount: 0,
      rejectionCount: 0,
      skippedOutsideHorizonCount,
      checkpointFingerprint: telemetry.checkpointFingerprint,
      telemetry
    };
  }

  const bounded = eligible.slice(0, batchSize);
  const normalization = normalizeHistoricalEmailMessagesV1({
    messages: bounded,
    horizon,
    batchSize
  });
  const lastCompletedUid = canonicalUid(bounded[bounded.length - 1]?.uid, "lastCompletedUid");
  if (checkpoint != null && compareDecimal(lastCompletedUid, checkpoint.lastCompletedUid) <= 0) {
    throw new Error("checkpoint advancement must be monotonic");
  }

  const nowMs = now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("now must return a non-negative safe integer");
  const nextCheckpoint: HistoricalBackfillCheckpointV1 = {
    mailboxId: scope.mailboxId,
    folder: scope.folder,
    uidValidity: scope.uidValidity,
    horizonStartAt: horizon.startAt,
    horizonEndAt: horizon.endAt,
    lastCompletedUid,
    updatedAt: new Date(nowMs).toISOString()
  };
  const attemptedProvenance = normalization.records.reduce((sum, record) => sum + record.provenance.length, 0);

  let commitResult: ReturnType<typeof validateCommitResult>;
  try {
    commitResult = validateCommitResult(
      await input.store.commitBatch({
        scope,
        expectedCheckpoint: checkpoint,
        nextCheckpoint,
        records: normalization.records,
        rejections: normalization.rejections
      }),
      normalization.records.length,
      attemptedProvenance,
      normalization.rejections.length
    );
  } catch {
    return failedBatchResult(
      "STORE_FAILURE",
      normalization.records,
      normalization.rejections,
      normalization.consideredCount,
      skippedOutsideHorizonCount,
      checkpoint
    );
  }

  if (!commitResult.committed) {
    const telemetry = makeTelemetry({
      status: "STALE_CHECKPOINT",
      reason: "CONCURRENT_CHECKPOINT_UPDATE",
      consideredCount: normalization.consideredCount,
      records: normalization.records,
      rejections: normalization.rejections,
      skippedOutsideHorizonCount,
      checkpoint
    });
    return {
      status: "STALE_CHECKPOINT",
      reason: "CONCURRENT_CHECKPOINT_UPDATE",
      acceptedRecordCount: 0,
      provenanceCount: 0,
      rejectionCount: 0,
      skippedOutsideHorizonCount,
      checkpointFingerprint: telemetry.checkpointFingerprint,
      telemetry
    };
  }

  const telemetry = makeTelemetry({
    status: "COMMITTED",
    reason: "BATCH_COMMITTED",
    consideredCount: normalization.consideredCount,
    records: normalization.records,
    rejections: normalization.rejections,
    skippedOutsideHorizonCount,
    checkpoint: nextCheckpoint
  });
  return {
    status: "COMMITTED",
    reason: "BATCH_COMMITTED",
    acceptedRecordCount: commitResult.insertedRecordCount,
    provenanceCount: commitResult.insertedProvenanceCount,
    rejectionCount: commitResult.recordedRejectionCount,
    skippedOutsideHorizonCount,
    checkpointFingerprint: telemetry.checkpointFingerprint,
    telemetry
  };
}

function failedBatchResult(
  reason: "STORE_FAILURE",
  records: readonly CanonicalEmailRecordV1[],
  rejections: readonly HistoricalEmailRejectionV1[],
  consideredCount: number,
  skippedOutsideHorizonCount: number,
  checkpoint: HistoricalBackfillCheckpointV1 | null
): HistoricalBackfillBatchResultV1 {
  const telemetry = makeTelemetry({
    status: "FAILED",
    reason,
    consideredCount,
    records,
    rejections,
    skippedOutsideHorizonCount,
    checkpoint
  });
  return {
    status: "FAILED",
    reason,
    acceptedRecordCount: 0,
    provenanceCount: 0,
    rejectionCount: 0,
    skippedOutsideHorizonCount,
    checkpointFingerprint: telemetry.checkpointFingerprint,
    telemetry
  };
}
