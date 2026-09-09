import { createHash } from "node:crypto";

import { ImapFlow } from "imapflow";

import type { HistoricalEmailEnvelopeV1 } from "@/lib/email/ionos-email-normalization-v1";
import type { EmailIngestCandidateV1 } from "@/lib/email/ionos-incremental-sync-v1";
import type { IonosMailboxRuntimeV1 } from "@/lib/email/ionos-mailbox-config-v1";

export type IonosEvidenceAddressV1 = string | { address?: string | null };

export type IonosProviderMessageEvidenceV1 = {
  uid: string | number | bigint;
  messageId: string | null;
  internalDate: string | Date | null;
  sentAt: string | Date | null;
  subject: string | null;
  from: readonly IonosEvidenceAddressV1[];
  to: readonly IonosEvidenceAddressV1[];
  cc: readonly IonosEvidenceAddressV1[];
  bcc: readonly IonosEvidenceAddressV1[];
  inReplyTo: string | null;
  references: readonly string[];
};

export type IonosMessageEvidenceProviderV1 = {
  fetchExact(
    mailbox: IonosMailboxRuntimeV1,
    uids: readonly string[],
    context: { deadlineAtMs: number; now: () => number }
  ): Promise<readonly IonosProviderMessageEvidenceV1[]>;
};

export type IonosMessageEvidenceResultV1 = {
  envelopes: readonly HistoricalEmailEnvelopeV1[];
  telemetry: {
    status: "COMPLETE";
    requestedCount: number;
    envelopeCount: number;
    evidenceFingerprints: readonly string[];
  };
};

type ImapEnvelopeLike = {
  messageId?: string | null;
  date?: string | Date | null;
  subject?: string | null;
  from?: readonly IonosEvidenceAddressV1[];
  to?: readonly IonosEvidenceAddressV1[];
  cc?: readonly IonosEvidenceAddressV1[];
  bcc?: readonly IonosEvidenceAddressV1[];
  inReplyTo?: string | null;
};

type ImapItemLike = {
  uid?: string | number | bigint;
  envelope?: ImapEnvelopeLike | null;
  internalDate?: string | Date | null;
  headers?: Uint8Array | string | null;
};

type ImapClientLike = {
  connect(): Promise<unknown>;
  mailboxOpen(path: string, options: { readOnly: true }): Promise<unknown>;
  fetch(
    range: string,
    query: { uid: true; envelope: true; internalDate: true; headers: readonly ["references"] },
    options: { uid: true }
  ): AsyncIterable<ImapItemLike>;
  logout(): Promise<unknown>;
};

type ImapFlowConstructor = new (options: {
  host: string;
  port: number;
  secure: true;
  tls: { minVersion: "TLSv1.2" | "TLSv1.3" };
  auth: { user: string; pass: string };
  logger: false;
}) => ImapClientLike;

const CANDIDATE_KEYS = new Set([
  "id",
  "mailboxId",
  "role",
  "uidValidity",
  "uid",
  "messageId",
  "internalDate",
  "size"
]);

const PROVIDER_KEYS = new Set([
  "uid",
  "messageId",
  "internalDate",
  "sentAt",
  "subject",
  "from",
  "to",
  "cc",
  "bcc",
  "inReplyTo",
  "references"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(code: string): never {
  throw new Error(code);
}

function canonicalUid(value: unknown): string {
  if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value).toString();
  return fail("IONOS_EVIDENCE_UID_INVALID");
}

function timestamp(value: unknown, code: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return fail(code);
  return date.toISOString();
}

function nullableTimestamp(value: unknown, code: string): string | null {
  return value == null ? null : timestamp(value, code);
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.trim();
}

function nullableText(value: unknown, code: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return fail(code);
  return value.trim() || null;
}

function nowValue(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) return fail("IONOS_EVIDENCE_CLOCK_INVALID");
  return value;
}

function remainingMs(deadlineAtMs: number, now: () => number): number {
  if (!Number.isSafeInteger(deadlineAtMs) || deadlineAtMs < 1) {
    return fail("IONOS_EVIDENCE_DEADLINE_INVALID");
  }
  const remaining = deadlineAtMs - nowValue(now);
  if (remaining <= 0) return fail("IONOS_EVIDENCE_DEADLINE_EXHAUSTED");
  return remaining;
}

async function bounded<T>(work: () => Promise<T>, deadlineAtMs: number, now: () => number): Promise<T> {
  const duration = Math.min(remainingMs(deadlineAtMs, now), 2_147_483_647);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("IONOS_EVIDENCE_DEADLINE_EXHAUSTED")), duration);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fingerprint(mailboxId: string, uidValidity: string, uid: string): string {
  return createHash("sha256")
    .update(`${mailboxId}\0${uidValidity}\0${uid}`, "utf8")
    .digest("hex");
}

function normalizeAddress(value: unknown): string {
  const raw = typeof value === "string"
    ? value
    : isPlainObject(value) && (typeof value.address === "string" || value.address == null)
      ? value.address
      : undefined;
  if (typeof raw !== "string") return fail("IONOS_EVIDENCE_PARTICIPANT_INVALID");
  const address = raw.trim().toLowerCase();
  if (
    !address ||
    address.length > 320 ||
    address.includes(" ") ||
    address.startsWith("@") ||
    address.endsWith("@") ||
    address.split("@").length !== 2
  ) {
    return fail("IONOS_EVIDENCE_PARTICIPANT_INVALID");
  }
  return address;
}

function addresses(value: unknown): string[] {
  if (!Array.isArray(value)) return fail("IONOS_EVIDENCE_PARTICIPANTS_MISSING");
  return [...new Set(value.map(normalizeAddress))].sort((a, b) => a.localeCompare(b));
}

function direction(
  mailboxAddress: string,
  from: readonly string[],
  recipients: readonly string[]
): HistoricalEmailEnvelopeV1["direction"] {
  const fromSelf = from.filter((address) => address === mailboxAddress).length;
  const fromExternal = from.length - fromSelf;
  const recipientSelf = recipients.includes(mailboxAddress);
  const recipientExternal = recipients.some((address) => address !== mailboxAddress);

  if (from.length !== 1) return "UNKNOWN";
  if (fromSelf === 1 && recipientExternal) return "OUTBOUND";
  if (fromSelf === 1 && !recipientExternal && recipientSelf) return "SELF";
  if (fromExternal === 1 && recipientSelf) return "INBOUND";
  return "UNKNOWN";
}

function normalizeCandidate(
  raw: unknown,
  mailbox: IonosMailboxRuntimeV1,
  index: number
): EmailIngestCandidateV1 {
  if (!isPlainObject(raw)) return fail("IONOS_EVIDENCE_CANDIDATE_INVALID");
  if (Object.keys(raw).some((key) => !CANDIDATE_KEYS.has(key))) {
    return fail("IONOS_EVIDENCE_CANDIDATE_INVALID");
  }
  const uid = canonicalUid(raw.uid);
  const uidValidity = canonicalUid(raw.uidValidity);
  const id = requiredText(raw.id, "IONOS_EVIDENCE_CANDIDATE_INVALID");
  if (
    raw.mailboxId !== mailbox.id ||
    raw.role !== mailbox.role ||
    id !== `ionos:${mailbox.id}:${uidValidity}:${uid}`
  ) {
    return fail("IONOS_EVIDENCE_CANDIDATE_SCOPE_MISMATCH");
  }
  const messageId = nullableText(raw.messageId, "IONOS_EVIDENCE_CANDIDATE_INVALID");
  const internalDate = nullableTimestamp(raw.internalDate, "IONOS_EVIDENCE_CANDIDATE_INVALID");
  if (raw.size != null && (
    typeof raw.size !== "number" ||
    !Number.isSafeInteger(raw.size) ||
    raw.size < 0
  )) {
    return fail("IONOS_EVIDENCE_CANDIDATE_INVALID");
  }
  void index;
  return {
    id,
    mailboxId: mailbox.id,
    role: mailbox.role,
    uidValidity,
    uid,
    messageId,
    internalDate,
    size: raw.size == null ? null : raw.size as number
  };
}

function normalizeProviderEvidence(
  raw: unknown,
  candidate: EmailIngestCandidateV1,
  mailbox: IonosMailboxRuntimeV1
): HistoricalEmailEnvelopeV1 {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !PROVIDER_KEYS.has(key))) {
    return fail("IONOS_EVIDENCE_PROVIDER_RESPONSE_INVALID");
  }
  const uid = canonicalUid(raw.uid);
  if (uid !== candidate.uid) return fail("IONOS_EVIDENCE_PROVIDER_UID_MISMATCH");

  const messageId = requiredText(raw.messageId, "IONOS_EVIDENCE_MESSAGE_ID_MISSING");
  if (candidate.messageId != null && candidate.messageId.trim().toLowerCase() !== messageId.toLowerCase()) {
    return fail("IONOS_EVIDENCE_MESSAGE_ID_MISMATCH");
  }

  const receivedAt = timestamp(raw.internalDate, "IONOS_EVIDENCE_INTERNAL_DATE_MISSING");
  if (candidate.internalDate != null && candidate.internalDate !== receivedAt) {
    return fail("IONOS_EVIDENCE_INTERNAL_DATE_MISMATCH");
  }
  const sentAt = nullableTimestamp(raw.sentAt, "IONOS_EVIDENCE_SENT_DATE_INVALID");
  const subject = nullableText(raw.subject, "IONOS_EVIDENCE_SUBJECT_INVALID");
  const from = addresses(raw.from);
  const to = addresses(raw.to);
  const cc = addresses(raw.cc);
  const bcc = addresses(raw.bcc);
  const inReplyTo = nullableText(raw.inReplyTo, "IONOS_EVIDENCE_THREAD_INVALID");
  if (!Array.isArray(raw.references)) return fail("IONOS_EVIDENCE_THREAD_INVALID");
  const references = raw.references.map((value) =>
    requiredText(value, "IONOS_EVIDENCE_THREAD_INVALID")
  );

  return {
    mailboxId: mailbox.id,
    role: mailbox.role,
    folder: mailbox.folder,
    uidValidity: candidate.uidValidity,
    uid,
    messageId,
    direction: direction(mailbox.user.trim().toLowerCase(), from, [...to, ...cc, ...bcc]),
    participants: { from, to, cc, bcc },
    sentAt,
    receivedAt,
    subject,
    inReplyTo,
    references,
    body: { policy: "NONE" },
    attachments: [],
    sourceTimestamp: receivedAt
  };
}

function parseReferences(headers: Uint8Array | string | null | undefined): string[] {
  if (headers == null) return [];
  const text = typeof headers === "string" ? headers : new TextDecoder().decode(headers);
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  const line = unfolded.match(/^references\s*:\s*(.*)$/im)?.[1] ?? "";
  return line.match(/<[^<>\s]+@[^<>\s]+>/g) ?? [];
}

function createDefaultProvider(
  ImapFlowCtor: ImapFlowConstructor = ImapFlow as unknown as ImapFlowConstructor
): IonosMessageEvidenceProviderV1 {
  return {
    async fetchExact(mailbox, uids, { deadlineAtMs, now }) {
      if (mailbox.smtpEnabled !== false) return fail("IONOS_EVIDENCE_SMTP_MUST_BE_DISABLED");
      remainingMs(deadlineAtMs, now);
      const client = new ImapFlowCtor({
        host: mailbox.host,
        port: mailbox.port,
        secure: true,
        tls: { minVersion: mailbox.minVersion },
        auth: { user: mailbox.user, pass: mailbox.pass },
        logger: false
      });
      let connected = false;
      try {
        await bounded(() => client.connect().then(() => undefined), deadlineAtMs, now);
        connected = true;
        await bounded(
          () => client.mailboxOpen(mailbox.folder, { readOnly: true }).then(() => undefined),
          deadlineAtMs,
          now
        );
        const iterable = client.fetch(
          uids.join(","),
          { uid: true, envelope: true, internalDate: true, headers: ["references"] },
          { uid: true }
        );
        const iterator = iterable[Symbol.asyncIterator]();
        const messages: IonosProviderMessageEvidenceV1[] = [];
        for (;;) {
          const step = await bounded(() => iterator.next(), deadlineAtMs, now);
          if (step.done) break;
          const item = step.value;
          const envelope = item.envelope;
          if (!envelope) return fail("IONOS_EVIDENCE_PROVIDER_RESPONSE_INVALID");
          messages.push({
            uid: item.uid ?? fail("IONOS_EVIDENCE_PROVIDER_RESPONSE_INVALID"),
            messageId: envelope.messageId ?? null,
            internalDate: item.internalDate ?? null,
            sentAt: envelope.date ?? null,
            subject: envelope.subject ?? null,
            from: envelope.from ?? [],
            to: envelope.to ?? [],
            cc: envelope.cc ?? [],
            bcc: envelope.bcc ?? [],
            inReplyTo: envelope.inReplyTo ?? null,
            references: parseReferences(item.headers)
          });
        }
        return messages;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("IONOS_EVIDENCE_")) throw error;
        throw new Error("IONOS_EVIDENCE_PROVIDER_FAILURE");
      } finally {
        if (connected) {
          try {
            const remaining = deadlineAtMs - nowValue(now);
            if (remaining > 0) {
              await bounded(() => client.logout().then(() => undefined), deadlineAtMs, now);
            } else {
              void client.logout().catch(() => undefined);
            }
          } catch {
            // Cleanup must not expose provider diagnostics or replace the primary outcome.
          }
        }
      }
    }
  };
}

export async function fetchIonosMessageEvidenceV1({
  mailbox,
  candidates,
  batchSize,
  deadlineAtMs,
  provider = createDefaultProvider(),
  now = Date.now
}: {
  mailbox: IonosMailboxRuntimeV1;
  candidates: readonly EmailIngestCandidateV1[];
  batchSize: number;
  deadlineAtMs: number;
  provider?: IonosMessageEvidenceProviderV1;
  now?: () => number;
}): Promise<IonosMessageEvidenceResultV1> {
  if (!isPlainObject(mailbox) || mailbox.smtpEnabled !== false) {
    return fail("IONOS_EVIDENCE_MAILBOX_INVALID");
  }
  requiredText(mailbox.id, "IONOS_EVIDENCE_MAILBOX_INVALID");
  const mailboxAddress = requiredText(mailbox.user, "IONOS_EVIDENCE_MAILBOX_INVALID").toLowerCase();
  normalizeAddress(mailboxAddress);
  if (!Array.isArray(candidates)) return fail("IONOS_EVIDENCE_CANDIDATES_INVALID");
  if (typeof batchSize !== "number" || !Number.isSafeInteger(batchSize) || batchSize < 1) {
    return fail("IONOS_EVIDENCE_BATCH_SIZE_INVALID");
  }
  if (candidates.length > batchSize) return fail("IONOS_EVIDENCE_BATCH_LIMIT_EXCEEDED");
  if (!isPlainObject(provider) || typeof provider.fetchExact !== "function") {
    return fail("IONOS_EVIDENCE_PROVIDER_INVALID");
  }
  remainingMs(deadlineAtMs, now);

  const normalized = candidates.map((candidate, index) =>
    normalizeCandidate(candidate, mailbox, index)
  );
  const seen = new Set<string>();
  for (const candidate of normalized) {
    const key = `${candidate.uidValidity}:${candidate.uid}`;
    if (seen.has(key)) return fail("IONOS_EVIDENCE_DUPLICATE_CANDIDATE");
    seen.add(key);
  }
  normalized.sort((left, right) => {
    const a = BigInt(left.uid);
    const b = BigInt(right.uid);
    return a < b ? -1 : a > b ? 1 : 0;
  });

  if (normalized.length === 0) {
    return {
      envelopes: [],
      telemetry: {
        status: "COMPLETE",
        requestedCount: 0,
        envelopeCount: 0,
        evidenceFingerprints: []
      }
    };
  }

  let rawEvidence: readonly IonosProviderMessageEvidenceV1[];
  try {
    rawEvidence = await bounded(
      () => provider.fetchExact(mailbox, normalized.map((candidate) => candidate.uid), {
        deadlineAtMs,
        now
      }),
      deadlineAtMs,
      now
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("IONOS_EVIDENCE_")) throw error;
    throw new Error("IONOS_EVIDENCE_PROVIDER_FAILURE");
  }
  remainingMs(deadlineAtMs, now);
  if (!Array.isArray(rawEvidence) || rawEvidence.length !== normalized.length) {
    return fail("IONOS_EVIDENCE_PROVIDER_CARDINALITY_MISMATCH");
  }

  const byUid = new Map<string, unknown>();
  for (const item of rawEvidence) {
    if (!isPlainObject(item)) return fail("IONOS_EVIDENCE_PROVIDER_RESPONSE_INVALID");
    const uid = canonicalUid(item.uid);
    if (byUid.has(uid)) return fail("IONOS_EVIDENCE_PROVIDER_DUPLICATE_UID");
    byUid.set(uid, item);
  }

  const envelopes = normalized.map((candidate) => {
    const evidence = byUid.get(candidate.uid);
    if (evidence == null) return fail("IONOS_EVIDENCE_PROVIDER_UID_MISSING");
    remainingMs(deadlineAtMs, now);
    return normalizeProviderEvidence(evidence, candidate, mailbox);
  });

  return {
    envelopes,
    telemetry: {
      status: "COMPLETE",
      requestedCount: normalized.length,
      envelopeCount: envelopes.length,
      evidenceFingerprints: normalized.map((candidate) =>
        fingerprint(mailbox.id, candidate.uidValidity, candidate.uid)
      )
    }
  };
}
