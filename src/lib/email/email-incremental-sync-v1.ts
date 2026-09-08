export type EmailUidLikeV1 = string | number | bigint;

export type EmailSyncTargetV1 = {
  id: string;
  role: string;
  folder: string;
};

export type EmailSyncCursorV1 = {
  mailboxId: string;
  folder: string;
  uidValidity: string;
  newestUid: string;
  updatedAt: string;
};

export type EmailProviderStatusV1 = {
  uidValidity: EmailUidLikeV1;
  uidNext: EmailUidLikeV1;
};

export type EmailProviderFetchResultV1 = {
  messages: readonly unknown[];
  completeThroughUid: EmailUidLikeV1;
};

export type EmailMetadataCandidateV1 = {
  candidateId: string;
  mailboxId: string;
  role: string;
  folder: string;
  uidValidity: string;
  uid: string;
  messageId: string | null;
  internalDate: string | null;
  from: string | null;
  to: string | null;
  subject: string | null;
  size: number | null;
};

export interface EmailProviderAdapterV1 {
  connect(): Promise<void>;
  openMailbox(folder: string, options: { readOnly: true }): Promise<void>;
  status(folder: string): Promise<EmailProviderStatusV1>;
  fetchMetadataByUid(input: {
    folder: string;
    fromUid: string;
    toUid: string;
    limit: number;
  }): Promise<EmailProviderFetchResultV1>;
  disconnect(): Promise<void>;
}

export interface EmailCursorStoreV1 {
  load(mailboxId: string, folder: string): Promise<EmailSyncCursorV1 | null>;
  save(cursor: EmailSyncCursorV1): Promise<void>;
}

export type EmailMailboxSyncStatusV1 =
  | "CURSOR_ESTABLISHED"
  | "UIDVALIDITY_RESET"
  | "NO_NEW_MAIL"
  | "SYNCED"
  | "FAILED";

export type EmailSyncFreshnessV1 = "FRESH" | "STALE" | "UNKNOWN";

export type EmailSyncErrorCodeV1 =
  | "INVALID_INPUT"
  | "INVALID_CURSOR"
  | "INVALID_PROVIDER_RESPONSE"
  | "PROVIDER_FAILURE"
  | "CURSOR_STORE_FAILURE";

export type EmailMailboxSyncTelemetryV1 = {
  lastSyncAt: string;
  lastSuccessfulSyncAt: string | null;
  newestUid: string | null;
  fetchedCount: number;
  freshness: EmailSyncFreshnessV1;
  attempts: number;
  errorCode: EmailSyncErrorCodeV1 | null;
};

export type EmailMailboxSyncResultV1 = {
  mailboxId: string;
  role: string;
  folder: string;
  status: EmailMailboxSyncStatusV1;
  cursorBefore: EmailSyncCursorV1 | null;
  cursorAfter: EmailSyncCursorV1 | null;
  candidates: EmailMetadataCandidateV1[];
  telemetry: EmailMailboxSyncTelemetryV1;
};

export type EmailSyncBatchResultV1 = {
  mailboxCount: number;
  successCount: number;
  failureCount: number;
  mailboxes: EmailMailboxSyncResultV1[];
};

export type EmailIncrementalSyncOptionsV1 = {
  adapterFactory: (target: EmailSyncTargetV1) => EmailProviderAdapterV1 | Promise<EmailProviderAdapterV1>;
  cursorStore: EmailCursorStoreV1;
  maxMessagesPerMailbox?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
};

class EmailSyncBoundaryError extends Error {
  readonly code: EmailSyncErrorCodeV1;

  constructor(code: EmailSyncErrorCodeV1) {
    super(code);
    this.name = "EmailSyncBoundaryError";
    this.code = code;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new EmailSyncBoundaryError("INVALID_INPUT");
  return value.trim();
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const candidate = value == null ? fallback : value;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) {
    throw new EmailSyncBoundaryError("INVALID_INPUT");
  }
  return candidate;
}

function canonicalNow(now: () => Date): string {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new EmailSyncBoundaryError("INVALID_INPUT");
  }
  return value.toISOString();
}

function normalizeUid(value: unknown, { allowZero = false }: { allowZero?: boolean } = {}): bigint {
  let parsed: bigint;
  if (typeof value === "bigint") parsed = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value);
  else if (typeof value === "string" && /^\d+$/.test(value.trim())) parsed = BigInt(value.trim());
  else throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");

  if (parsed < 0n || (!allowZero && parsed === 0n)) {
    throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
  }
  return parsed;
}

function normalizeCursor(cursor: EmailSyncCursorV1, target: EmailSyncTargetV1): EmailSyncCursorV1 {
  if (!isPlainObject(cursor)) throw new EmailSyncBoundaryError("INVALID_CURSOR");
  if (cursor.mailboxId !== target.id || cursor.folder !== target.folder) {
    throw new EmailSyncBoundaryError("INVALID_CURSOR");
  }

  let uidValidity: bigint;
  let newestUid: bigint;
  try {
    uidValidity = normalizeUid(cursor.uidValidity);
    newestUid = normalizeUid(cursor.newestUid, { allowZero: true });
  } catch {
    throw new EmailSyncBoundaryError("INVALID_CURSOR");
  }

  if (typeof cursor.updatedAt !== "string" || Number.isNaN(Date.parse(cursor.updatedAt))) {
    throw new EmailSyncBoundaryError("INVALID_CURSOR");
  }

  return {
    mailboxId: target.id,
    folder: target.folder,
    uidValidity: uidValidity.toString(),
    newestUid: newestUid.toString(),
    updatedAt: new Date(cursor.updatedAt).toISOString()
  };
}

function normalizeTargets(targets: readonly EmailSyncTargetV1[]): EmailSyncTargetV1[] {
  if (!Array.isArray(targets) || targets.length === 0) throw new EmailSyncBoundaryError("INVALID_INPUT");
  const ids = new Set<string>();

  return targets.map((target) => {
    if (!isPlainObject(target)) throw new EmailSyncBoundaryError("INVALID_INPUT");
    const normalized = {
      id: requiredString(target.id),
      role: requiredString(target.role),
      folder: requiredString(target.folder)
    };
    if (ids.has(normalized.id)) throw new EmailSyncBoundaryError("INVALID_INPUT");
    ids.add(normalized.id);
    return normalized;
  });
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function optionalIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
  return date.toISOString();
}

function optionalSize(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
  }
  return value;
}

function normalizeCandidates(
  rawMessages: readonly unknown[],
  target: EmailSyncTargetV1,
  uidValidity: bigint,
  fromUid: bigint,
  completeThroughUid: bigint
): EmailMetadataCandidateV1[] {
  if (!Array.isArray(rawMessages)) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");

  const seen = new Set<string>();
  const candidates = rawMessages.map((raw) => {
    if (!isPlainObject(raw)) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
    const uid = normalizeUid(raw.uid);
    if (uid < fromUid || uid > completeThroughUid) {
      throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
    }

    const uidText = uid.toString();
    if (seen.has(uidText)) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
    seen.add(uidText);

    return {
      candidateId: `${target.id}:${uidValidity}:${uidText}`,
      mailboxId: target.id,
      role: target.role,
      folder: target.folder,
      uidValidity: uidValidity.toString(),
      uid: uidText,
      messageId: optionalText(raw.messageId),
      internalDate: optionalIsoDate(raw.internalDate),
      from: optionalText(raw.from),
      to: optionalText(raw.to),
      subject: optionalText(raw.subject),
      size: optionalSize(raw.size)
    };
  });

  candidates.sort((left, right) => {
    const leftUid = BigInt(left.uid);
    const rightUid = BigInt(right.uid);
    return leftUid < rightUid ? -1 : leftUid > rightUid ? 1 : 0;
  });
  return candidates;
}

async function loadCursor(store: EmailCursorStoreV1, target: EmailSyncTargetV1): Promise<EmailSyncCursorV1 | null> {
  try {
    const cursor = await store.load(target.id, target.folder);
    return cursor == null ? null : normalizeCursor(cursor, target);
  } catch (error) {
    if (error instanceof EmailSyncBoundaryError && error.code === "INVALID_CURSOR") throw error;
    throw new EmailSyncBoundaryError("CURSOR_STORE_FAILURE");
  }
}

async function saveCursor(store: EmailCursorStoreV1, cursor: EmailSyncCursorV1): Promise<void> {
  try {
    await store.save(cursor);
  } catch {
    throw new EmailSyncBoundaryError("CURSOR_STORE_FAILURE");
  }
}

async function providerCall<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof EmailSyncBoundaryError) throw error;
    throw new EmailSyncBoundaryError("PROVIDER_FAILURE");
  }
}

function successResult(input: {
  target: EmailSyncTargetV1;
  status: Exclude<EmailMailboxSyncStatusV1, "FAILED">;
  cursorBefore: EmailSyncCursorV1 | null;
  cursorAfter: EmailSyncCursorV1;
  candidates: EmailMetadataCandidateV1[];
  nowIso: string;
  attempts: number;
}): EmailMailboxSyncResultV1 {
  return {
    mailboxId: input.target.id,
    role: input.target.role,
    folder: input.target.folder,
    status: input.status,
    cursorBefore: input.cursorBefore,
    cursorAfter: input.cursorAfter,
    candidates: input.candidates,
    telemetry: {
      lastSyncAt: input.nowIso,
      lastSuccessfulSyncAt: input.nowIso,
      newestUid: input.cursorAfter.newestUid,
      fetchedCount: input.candidates.length,
      freshness: "FRESH",
      attempts: input.attempts,
      errorCode: null
    }
  };
}

async function syncMailboxAttempt(input: {
  target: EmailSyncTargetV1;
  adapterFactory: EmailIncrementalSyncOptionsV1["adapterFactory"];
  cursorStore: EmailCursorStoreV1;
  maxMessages: number;
  nowIso: string;
  attempts: number;
}): Promise<EmailMailboxSyncResultV1> {
  const cursorBefore = await loadCursor(input.cursorStore, input.target);
  const adapter = await providerCall(() => input.adapterFactory(input.target));
  let connected = false;

  try {
    await providerCall(() => adapter.connect());
    connected = true;
    await providerCall(() => adapter.openMailbox(input.target.folder, { readOnly: true }));
    const status = await providerCall(() => adapter.status(input.target.folder));
    const uidValidity = normalizeUid(status.uidValidity);
    const uidNext = normalizeUid(status.uidNext);
    const currentNewest = uidNext > 1n ? uidNext - 1n : 0n;

    if (cursorBefore == null) {
      const cursorAfter: EmailSyncCursorV1 = {
        mailboxId: input.target.id,
        folder: input.target.folder,
        uidValidity: uidValidity.toString(),
        newestUid: currentNewest.toString(),
        updatedAt: input.nowIso
      };
      await saveCursor(input.cursorStore, cursorAfter);
      return successResult({
        target: input.target,
        status: "CURSOR_ESTABLISHED",
        cursorBefore,
        cursorAfter,
        candidates: [],
        nowIso: input.nowIso,
        attempts: input.attempts
      });
    }

    const cursorUidValidity = BigInt(cursorBefore.uidValidity);
    const cursorNewest = BigInt(cursorBefore.newestUid);

    if (cursorUidValidity !== uidValidity) {
      const cursorAfter: EmailSyncCursorV1 = {
        mailboxId: input.target.id,
        folder: input.target.folder,
        uidValidity: uidValidity.toString(),
        newestUid: currentNewest.toString(),
        updatedAt: input.nowIso
      };
      await saveCursor(input.cursorStore, cursorAfter);
      return successResult({
        target: input.target,
        status: "UIDVALIDITY_RESET",
        cursorBefore,
        cursorAfter,
        candidates: [],
        nowIso: input.nowIso,
        attempts: input.attempts
      });
    }

    if (currentNewest < cursorNewest) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");

    if (currentNewest === cursorNewest) {
      const cursorAfter: EmailSyncCursorV1 = { ...cursorBefore, updatedAt: input.nowIso };
      await saveCursor(input.cursorStore, cursorAfter);
      return successResult({
        target: input.target,
        status: "NO_NEW_MAIL",
        cursorBefore,
        cursorAfter,
        candidates: [],
        nowIso: input.nowIso,
        attempts: input.attempts
      });
    }

    const fromUid = cursorNewest + 1n;
    const boundedEnd = cursorNewest + BigInt(input.maxMessages);
    const toUid = currentNewest < boundedEnd ? currentNewest : boundedEnd;
    const fetched = await providerCall(() =>
      adapter.fetchMetadataByUid({
        folder: input.target.folder,
        fromUid: fromUid.toString(),
        toUid: toUid.toString(),
        limit: input.maxMessages
      })
    );

    if (!isPlainObject(fetched) || !Array.isArray(fetched.messages)) {
      throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");
    }
    const completeThroughUid = normalizeUid(fetched.completeThroughUid, { allowZero: true });
    if (completeThroughUid !== toUid) throw new EmailSyncBoundaryError("INVALID_PROVIDER_RESPONSE");

    const candidates = normalizeCandidates(fetched.messages, input.target, uidValidity, fromUid, completeThroughUid);
    const cursorAfter: EmailSyncCursorV1 = {
      mailboxId: input.target.id,
      folder: input.target.folder,
      uidValidity: uidValidity.toString(),
      newestUid: completeThroughUid.toString(),
      updatedAt: input.nowIso
    };
    await saveCursor(input.cursorStore, cursorAfter);

    return successResult({
      target: input.target,
      status: "SYNCED",
      cursorBefore,
      cursorAfter,
      candidates,
      nowIso: input.nowIso,
      attempts: input.attempts
    });
  } finally {
    if (connected) {
      try {
        await adapter.disconnect();
      } catch {
        // Cursor/candidate commit semantics must not be reversed by a cleanup-only failure.
        // Provider-specific telemetry may report disconnect health outside this core contract.
      }
    }
  }
}

function retryable(code: EmailSyncErrorCodeV1): boolean {
  return code === "PROVIDER_FAILURE" || code === "CURSOR_STORE_FAILURE";
}

async function failureResult(input: {
  target: EmailSyncTargetV1;
  cursorStore: EmailCursorStoreV1;
  nowIso: string;
  attempts: number;
  errorCode: EmailSyncErrorCodeV1;
}): Promise<EmailMailboxSyncResultV1> {
  let prior: EmailSyncCursorV1 | null = null;
  try {
    prior = await loadCursor(input.cursorStore, input.target);
  } catch {
    prior = null;
  }

  return {
    mailboxId: input.target.id,
    role: input.target.role,
    folder: input.target.folder,
    status: "FAILED",
    cursorBefore: prior,
    cursorAfter: prior,
    candidates: [],
    telemetry: {
      lastSyncAt: input.nowIso,
      lastSuccessfulSyncAt: prior?.updatedAt ?? null,
      newestUid: prior?.newestUid ?? null,
      fetchedCount: 0,
      freshness: prior == null ? "UNKNOWN" : "STALE",
      attempts: input.attempts,
      errorCode: input.errorCode
    }
  };
}

async function syncMailboxWithRetry(input: {
  target: EmailSyncTargetV1;
  options: Required<Pick<EmailIncrementalSyncOptionsV1, "maxMessagesPerMailbox" | "maxAttempts" | "retryBackoffMs" | "sleep" | "now">> &
    Pick<EmailIncrementalSyncOptionsV1, "adapterFactory" | "cursorStore">;
}): Promise<EmailMailboxSyncResultV1> {
  let lastCode: EmailSyncErrorCodeV1 = "PROVIDER_FAILURE";
  let attempts = 0;

  while (attempts < input.options.maxAttempts) {
    attempts += 1;
    const nowIso = canonicalNow(input.options.now);
    try {
      return await syncMailboxAttempt({
        target: input.target,
        adapterFactory: input.options.adapterFactory,
        cursorStore: input.options.cursorStore,
        maxMessages: input.options.maxMessagesPerMailbox,
        nowIso,
        attempts
      });
    } catch (error) {
      lastCode = error instanceof EmailSyncBoundaryError ? error.code : "PROVIDER_FAILURE";
      if (!retryable(lastCode) || attempts >= input.options.maxAttempts) {
        return failureResult({
          target: input.target,
          cursorStore: input.options.cursorStore,
          nowIso,
          attempts,
          errorCode: lastCode
        });
      }
      await input.options.sleep(input.options.retryBackoffMs * attempts);
    }
  }

  throw new EmailSyncBoundaryError(lastCode);
}

export async function syncEmailMailboxesIncrementallyV1(
  targets: readonly EmailSyncTargetV1[],
  options: EmailIncrementalSyncOptionsV1
): Promise<EmailSyncBatchResultV1> {
  if (!isPlainObject(options) || typeof options.adapterFactory !== "function" || !isPlainObject(options.cursorStore)) {
    throw new EmailSyncBoundaryError("INVALID_INPUT");
  }
  if (typeof options.cursorStore.load !== "function" || typeof options.cursorStore.save !== "function") {
    throw new EmailSyncBoundaryError("INVALID_INPUT");
  }

  const normalizedTargets = normalizeTargets(targets);
  const maxMessagesPerMailbox = boundedInteger(options.maxMessagesPerMailbox, 100, 1, 1000);
  const maxAttempts = boundedInteger(options.maxAttempts, 2, 1, 5);
  const retryBackoffMs = boundedInteger(options.retryBackoffMs, 250, 0, 60_000);
  const sleep = options.sleep ?? (async (milliseconds: number) => {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  });
  const now = options.now ?? (() => new Date());
  if (typeof sleep !== "function" || typeof now !== "function") throw new EmailSyncBoundaryError("INVALID_INPUT");

  const normalizedOptions = {
    adapterFactory: options.adapterFactory,
    cursorStore: options.cursorStore,
    maxMessagesPerMailbox,
    maxAttempts,
    retryBackoffMs,
    sleep,
    now
  };

  const mailboxes: EmailMailboxSyncResultV1[] = [];
  for (const target of normalizedTargets) {
    mailboxes.push(await syncMailboxWithRetry({ target, options: normalizedOptions }));
  }

  const failureCount = mailboxes.filter((mailbox) => mailbox.status === "FAILED").length;
  return {
    mailboxCount: mailboxes.length,
    successCount: mailboxes.length - failureCount,
    failureCount,
    mailboxes
  };
}
