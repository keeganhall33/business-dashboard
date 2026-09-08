import type {
  IonosMailboxRoleV1,
  IonosMailboxRuntimeV1
} from "@/lib/email/ionos-mailbox-config-v1";

export type EmailSyncCursorV1 = {
  mailboxId: string;
  uidValidity: string;
  lastSeenUid: string;
  updatedAt: string;
};

export type EmailMetadataV1 = {
  uid: string | number | bigint;
  messageId?: string | null;
  internalDate?: string | Date | null;
  size?: number | null;
};

export type EmailReadStatusV1 = {
  uidValidity: string | number | bigint;
  uidNext: string | number | bigint;
};

export type EmailReadSessionV1 = {
  status(): Promise<EmailReadStatusV1>;
  fetchMetadata(input: {
    fromUid: string;
    toUid: string;
    limit: number;
  }): Promise<{
    complete: boolean;
    messages: readonly EmailMetadataV1[];
  }>;
  close(): Promise<void>;
};

export type EmailProviderAdapterV1 = {
  openReadOnly(
    mailbox: IonosMailboxRuntimeV1,
    context: { deadlineAtMs: number }
  ): Promise<EmailReadSessionV1>;
};

export type EmailCursorStoreV1 = {
  read(mailboxId: string): Promise<EmailSyncCursorV1 | null>;
  compareAndSet(
    mailboxId: string,
    expected: EmailSyncCursorV1 | null,
    next: EmailSyncCursorV1
  ): Promise<boolean>;
};

export type EmailIngestCandidateV1 = {
  id: string;
  mailboxId: string;
  role: IonosMailboxRoleV1;
  uidValidity: string;
  uid: string;
  messageId: string | null;
  internalDate: string | null;
  size: number | null;
};

export type EmailMailboxSyncResultV1 = {
  mailboxId: string;
  role: IonosMailboxRoleV1;
  status: "BASELINED" | "SYNCED" | "NO_NEW_MAIL" | "UIDVALIDITY_RESET" | "FAILED";
  reason:
    | "INITIAL_CURSOR_ESTABLISHED"
    | "NEW_MESSAGES_COMMITTED"
    | "NO_NEW_MESSAGES"
    | "UIDVALIDITY_CHANGED"
    | "CONCURRENT_CURSOR_UPDATE"
    | "PROVIDER_RETRY_EXHAUSTED"
    | "RETRY_DEADLINE_EXHAUSTED";
  fetchedCount: number;
  candidateCount: number;
  retryCount: number;
  cursorFingerprint: string | null;
  candidates: readonly EmailIngestCandidateV1[];
};

export type IncrementalSyncOptionsV1 = {
  batchSize: number;
  maxAttempts: number;
  retryDelayMs: number;
  maxElapsedMs: number;
};

const DEFAULT_OPTIONS: IncrementalSyncOptionsV1 = Object.freeze({
  batchSize: 100,
  maxAttempts: 2,
  retryDelayMs: 100,
  maxElapsedMs: 10_000
});

const RUNTIME_KEYS = new Set([
  "id",
  "role",
  "user",
  "pass",
  "host",
  "port",
  "folder",
  "minVersion",
  "smtpEnabled"
]);

const ROLE_SET = new Set<string>([
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function canonicalUid(value: unknown, label: string): string {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} must be non-negative`);
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return String(value);
  }

  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) {
    return BigInt(value).toString();
  }

  throw new Error(`${label} must be a non-negative decimal UID`);
}

function canonicalTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return date.toISOString();
}

function validateMailbox(value: unknown, index: number): IonosMailboxRuntimeV1 {
  const label = `mailboxes[${index}]`;
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);

  const unknownKeys = Object.keys(value).filter((key) => !RUNTIME_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unknownKeys.join(", ")}`);
  }

  const role = nonEmptyString(value.role, `${label}.role`);
  if (!ROLE_SET.has(role)) throw new Error(`${label}.role is unsupported`);
  if (value.smtpEnabled !== false) throw new Error(`${label}.smtpEnabled must be false`);

  const port = positiveInteger(value.port, `${label}.port`);
  if (port > 65535) throw new Error(`${label}.port must not exceed 65535`);

  const minVersion = value.minVersion;
  if (minVersion !== "TLSv1.2" && minVersion !== "TLSv1.3") {
    throw new Error(`${label}.minVersion is unsupported`);
  }

  return {
    id: nonEmptyString(value.id, `${label}.id`),
    role: role as IonosMailboxRoleV1,
    user: nonEmptyString(value.user, `${label}.user`),
    pass: nonEmptyString(value.pass, `${label}.pass`),
    host: nonEmptyString(value.host, `${label}.host`),
    port,
    folder: nonEmptyString(value.folder, `${label}.folder`),
    minVersion,
    smtpEnabled: false
  };
}

function validateMailboxes(value: unknown): IonosMailboxRuntimeV1[] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("mailboxes must contain exactly three resolved mailboxes");
  }

  const mailboxes = value.map(validateMailbox);
  const ids = new Set<string>();
  const roles = new Set<IonosMailboxRoleV1>();

  for (const mailbox of mailboxes) {
    if (ids.has(mailbox.id)) throw new Error(`duplicate mailbox id ${mailbox.id}`);
    if (roles.has(mailbox.role)) throw new Error(`duplicate mailbox role ${mailbox.role}`);
    ids.add(mailbox.id);
    roles.add(mailbox.role);
  }

  return mailboxes;
}

function validateOptions(value: Partial<IncrementalSyncOptionsV1> | undefined): IncrementalSyncOptionsV1 {
  if (value != null && !isPlainObject(value)) {
    throw new Error("options must be a plain object");
  }

  const allowed = new Set(["batchSize", "maxAttempts", "retryDelayMs", "maxElapsedMs"]);
  const unknownKeys = Object.keys(value ?? {}).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`options contains unsupported keys: ${unknownKeys.join(", ")}`);
  }

  const options = { ...DEFAULT_OPTIONS, ...value };
  return {
    batchSize: positiveInteger(options.batchSize, "options.batchSize"),
    maxAttempts: positiveInteger(options.maxAttempts, "options.maxAttempts"),
    retryDelayMs: nonNegativeInteger(options.retryDelayMs, "options.retryDelayMs"),
    maxElapsedMs: positiveInteger(options.maxElapsedMs, "options.maxElapsedMs")
  };
}

function validateCursor(value: unknown, mailboxId: string): EmailSyncCursorV1 | null {
  if (value === null) return null;
  if (!isPlainObject(value)) throw new Error(`cursor for ${mailboxId} must be a plain object`);

  const keys = Object.keys(value);
  const allowed = new Set(["mailboxId", "uidValidity", "lastSeenUid", "updatedAt"]);
  const unknown = keys.filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`cursor for ${mailboxId} contains unsupported keys`);

  const storedMailboxId = nonEmptyString(value.mailboxId, "cursor.mailboxId");
  if (storedMailboxId !== mailboxId) throw new Error(`cursor mailbox id mismatch for ${mailboxId}`);

  return {
    mailboxId,
    uidValidity: canonicalUid(value.uidValidity, "cursor.uidValidity"),
    lastSeenUid: canonicalUid(value.lastSeenUid, "cursor.lastSeenUid"),
    updatedAt: canonicalTimestamp(value.updatedAt, "cursor.updatedAt")
  };
}

function nowValue(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("now must return a non-negative safe integer");
  }
  return value;
}

function cursorFingerprint(cursor: EmailSyncCursorV1 | null): string | null {
  return cursor == null
    ? null
    : `${cursor.mailboxId}:${cursor.uidValidity}:${cursor.lastSeenUid}`;
}

function nextCursor(
  mailboxId: string,
  uidValidity: string,
  lastSeenUid: string,
  atMs: number
): EmailSyncCursorV1 {
  return {
    mailboxId,
    uidValidity,
    lastSeenUid,
    updatedAt: new Date(atMs).toISOString()
  };
}

function failedResult(
  mailbox: IonosMailboxRuntimeV1,
  reason: "PROVIDER_RETRY_EXHAUSTED" | "RETRY_DEADLINE_EXHAUSTED",
  retryCount: number,
  cursor: EmailSyncCursorV1 | null
): EmailMailboxSyncResultV1 {
  return {
    mailboxId: mailbox.id,
    role: mailbox.role,
    status: "FAILED",
    reason,
    fetchedCount: 0,
    candidateCount: 0,
    retryCount,
    cursorFingerprint: cursorFingerprint(cursor),
    candidates: []
  };
}

function normalizeMessages(
  value: unknown,
  mailbox: IonosMailboxRuntimeV1,
  uidValidity: string,
  fromUid: bigint,
  toUid: bigint
): EmailIngestCandidateV1[] {
  if (!Array.isArray(value)) throw new Error("provider messages must be an array");

  const seen = new Set<string>();
  const candidates = value.map((item, index) => {
    if (!isPlainObject(item)) throw new Error(`provider messages[${index}] must be a plain object`);

    const allowed = new Set(["uid", "messageId", "internalDate", "size"]);
    const unknown = Object.keys(item).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new Error(`provider messages[${index}] contains unsupported keys`);

    const uid = canonicalUid(item.uid, `provider messages[${index}].uid`);
    const numericUid = BigInt(uid);
    if (numericUid < fromUid || numericUid > toUid) {
      throw new Error(`provider messages[${index}].uid is outside the requested range`);
    }
    if (seen.has(uid)) throw new Error(`provider returned duplicate UID ${uid}`);
    seen.add(uid);

    const messageId =
      item.messageId == null ? null : nonEmptyString(item.messageId, `provider messages[${index}].messageId`);
    const internalDate =
      item.internalDate == null ? null : canonicalTimestamp(item.internalDate, `provider messages[${index}].internalDate`);
    const size =
      item.size == null ? null : nonNegativeInteger(item.size, `provider messages[${index}].size`);

    return {
      id: `ionos:${mailbox.id}:${uidValidity}:${uid}`,
      mailboxId: mailbox.id,
      role: mailbox.role,
      uidValidity,
      uid,
      messageId,
      internalDate,
      size
    };
  });

  candidates.sort((left, right) => {
    const a = BigInt(left.uid);
    const b = BigInt(right.uid);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return candidates;
}

async function syncMailbox(
  mailbox: IonosMailboxRuntimeV1,
  adapter: EmailProviderAdapterV1,
  cursorStore: EmailCursorStoreV1,
  options: IncrementalSyncOptionsV1,
  now: () => number,
  sleep: (milliseconds: number) => Promise<void>
): Promise<EmailMailboxSyncResultV1> {
  const startedAt = nowValue(now);
  const deadlineAtMs = startedAt + options.maxElapsedMs;
  if (!Number.isSafeInteger(deadlineAtMs)) throw new Error("sync deadline exceeds safe integer range");

  let lastCursor: EmailSyncCursorV1 | null = null;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const currentTime = nowValue(now);
    if (currentTime >= deadlineAtMs) {
      return failedResult(mailbox, "RETRY_DEADLINE_EXHAUSTED", attempt - 1, lastCursor);
    }

    let session: EmailReadSessionV1 | null = null;
    try {
      lastCursor = validateCursor(await cursorStore.read(mailbox.id), mailbox.id);
      session = await adapter.openReadOnly(mailbox, { deadlineAtMs });
      if (
        session == null ||
        typeof session.status !== "function" ||
        typeof session.fetchMetadata !== "function" ||
        typeof session.close !== "function"
      ) {
        throw new Error("provider returned an invalid read-only session");
      }

      const statusValue = await session.status();
      if (!isPlainObject(statusValue)) throw new Error("provider status must be a plain object");
      const statusKeys = Object.keys(statusValue);
      if (statusKeys.some((key) => key !== "uidValidity" && key !== "uidNext")) {
        throw new Error("provider status contains unsupported keys");
      }

      const uidValidity = canonicalUid(statusValue.uidValidity, "provider status.uidValidity");
      const uidNext = canonicalUid(statusValue.uidNext, "provider status.uidNext");
      const baseline = BigInt(uidNext) > 0n ? (BigInt(uidNext) - 1n).toString() : "0";
      const committedAt = nowValue(now);

      if (lastCursor == null) {
        const next = nextCursor(mailbox.id, uidValidity, baseline, committedAt);
        const committed = await cursorStore.compareAndSet(mailbox.id, null, next);
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          status: committed ? "BASELINED" : "FAILED",
          reason: committed ? "INITIAL_CURSOR_ESTABLISHED" : "CONCURRENT_CURSOR_UPDATE",
          fetchedCount: 0,
          candidateCount: 0,
          retryCount: attempt - 1,
          cursorFingerprint: committed ? cursorFingerprint(next) : null,
          candidates: []
        };
      }

      if (lastCursor.uidValidity !== uidValidity) {
        const next = nextCursor(mailbox.id, uidValidity, baseline, committedAt);
        const committed = await cursorStore.compareAndSet(mailbox.id, lastCursor, next);
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          status: committed ? "UIDVALIDITY_RESET" : "FAILED",
          reason: committed ? "UIDVALIDITY_CHANGED" : "CONCURRENT_CURSOR_UPDATE",
          fetchedCount: 0,
          candidateCount: 0,
          retryCount: attempt - 1,
          cursorFingerprint: committed ? cursorFingerprint(next) : cursorFingerprint(lastCursor),
          candidates: []
        };
      }

      const fromUid = BigInt(lastCursor.lastSeenUid) + 1n;
      const observedLastUid = BigInt(uidNext) > 0n ? BigInt(uidNext) - 1n : 0n;
      if (fromUid > observedLastUid) {
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          status: "NO_NEW_MAIL",
          reason: "NO_NEW_MESSAGES",
          fetchedCount: 0,
          candidateCount: 0,
          retryCount: attempt - 1,
          cursorFingerprint: cursorFingerprint(lastCursor),
          candidates: []
        };
      }

      const requestedTo =
        fromUid + BigInt(options.batchSize) - 1n < observedLastUid
          ? fromUid + BigInt(options.batchSize) - 1n
          : observedLastUid;
      const fetched = await session.fetchMetadata({
        fromUid: fromUid.toString(),
        toUid: requestedTo.toString(),
        limit: options.batchSize
      });

      if (!isPlainObject(fetched) || typeof fetched.complete !== "boolean" || fetched.complete !== true) {
        throw new Error("provider fetch must be explicitly complete");
      }
      const candidates = normalizeMessages(
        fetched.messages,
        mailbox,
        uidValidity,
        fromUid,
        requestedTo
      );
      if (candidates.length > options.batchSize) throw new Error("provider exceeded the requested batch size");

      const next = nextCursor(mailbox.id, uidValidity, requestedTo.toString(), nowValue(now));
      const committed = await cursorStore.compareAndSet(mailbox.id, lastCursor, next);
      if (!committed) {
        return {
          mailboxId: mailbox.id,
          role: mailbox.role,
          status: "FAILED",
          reason: "CONCURRENT_CURSOR_UPDATE",
          fetchedCount: candidates.length,
          candidateCount: 0,
          retryCount: attempt - 1,
          cursorFingerprint: cursorFingerprint(lastCursor),
          candidates: []
        };
      }

      return {
        mailboxId: mailbox.id,
        role: mailbox.role,
        status: "SYNCED",
        reason: "NEW_MESSAGES_COMMITTED",
        fetchedCount: candidates.length,
        candidateCount: candidates.length,
        retryCount: attempt - 1,
        cursorFingerprint: cursorFingerprint(next),
        candidates
      };
    } catch {
      if (attempt >= options.maxAttempts) {
        return failedResult(mailbox, "PROVIDER_RETRY_EXHAUSTED", attempt - 1, lastCursor);
      }

      const beforeSleep = nowValue(now);
      if (beforeSleep + options.retryDelayMs >= deadlineAtMs) {
        return failedResult(mailbox, "RETRY_DEADLINE_EXHAUSTED", attempt - 1, lastCursor);
      }
      await sleep(options.retryDelayMs);
    } finally {
      if (session != null) {
        try {
          await session.close();
        } catch {
          // Closing a read-only session cannot turn a committed cursor into duplicate work.
        }
      }
    }
  }

  return failedResult(mailbox, "PROVIDER_RETRY_EXHAUSTED", options.maxAttempts - 1, lastCursor);
}

export async function syncIonosMailboxesV1(input: {
  mailboxes: readonly IonosMailboxRuntimeV1[];
  adapter: EmailProviderAdapterV1;
  cursorStore: EmailCursorStoreV1;
  options?: Partial<IncrementalSyncOptionsV1>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<EmailMailboxSyncResultV1[]> {
  if (!isPlainObject(input)) throw new Error("input must be a plain object");
  const allowed = new Set(["mailboxes", "adapter", "cursorStore", "options", "now", "sleep"]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`input contains unsupported keys: ${unknown.join(", ")}`);

  const mailboxes = validateMailboxes(input.mailboxes);
  if (input.adapter == null || typeof input.adapter.openReadOnly !== "function") {
    throw new Error("adapter must expose openReadOnly");
  }
  if (
    input.cursorStore == null ||
    typeof input.cursorStore.read !== "function" ||
    typeof input.cursorStore.compareAndSet !== "function"
  ) {
    throw new Error("cursorStore must expose read and compareAndSet");
  }

  const options = validateOptions(input.options);
  const now = input.now ?? Date.now;
  const sleep =
    input.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  if (typeof now !== "function") throw new Error("now must be a function");
  if (typeof sleep !== "function") throw new Error("sleep must be a function");

  return Promise.all(
    mailboxes.map((mailbox) =>
      syncMailbox(mailbox, input.adapter, input.cursorStore, options, now, sleep)
    )
  );
}
