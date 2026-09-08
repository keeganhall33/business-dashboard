import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import type {
  EmailCursorStoreV1,
  EmailSyncCursorV1
} from "@/lib/email/ionos-incremental-sync-v1";

type CursorStateV1 = {
  version: 1;
  cursors: Record<string, EmailSyncCursorV1>;
};

const ROOT_KEYS = new Set(["version", "cursors"]);
const CURSOR_KEYS = new Set(["mailboxId", "uidValidity", "lastSeenUid", "updatedAt"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mailboxId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a safe mailbox id`);
  }
  return value;
}

function decimalUid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal UID string`);
  }
  return BigInt(value).toString();
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be an ISO timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function cursor(value: unknown, expectedMailboxId: string): EmailSyncCursorV1 {
  if (!isPlainObject(value)) throw new Error(`cursor for ${expectedMailboxId} must be a plain object`);
  const unknown = Object.keys(value).filter((key) => !CURSOR_KEYS.has(key));
  if (unknown.length) throw new Error(`cursor for ${expectedMailboxId} contains unsupported keys`);
  const storedMailboxId = mailboxId(value.mailboxId, "cursor.mailboxId");
  if (storedMailboxId !== expectedMailboxId) throw new Error(`cursor mailbox id mismatch for ${expectedMailboxId}`);
  return {
    mailboxId: storedMailboxId,
    uidValidity: decimalUid(value.uidValidity, "cursor.uidValidity"),
    lastSeenUid: decimalUid(value.lastSeenUid, "cursor.lastSeenUid"),
    updatedAt: isoTimestamp(value.updatedAt, "cursor.updatedAt")
  };
}

function emptyState(): CursorStateV1 {
  return { version: 1, cursors: {} };
}

function parseState(raw: string): CursorStateV1 {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("IONOS_CURSOR_STATE_MALFORMED_JSON");
  }
  if (!isPlainObject(value)) throw new Error("IONOS_CURSOR_STATE_MUST_BE_OBJECT");
  const unknown = Object.keys(value).filter((key) => !ROOT_KEYS.has(key));
  if (unknown.length) throw new Error("IONOS_CURSOR_STATE_UNSUPPORTED_KEYS");
  if (value.version !== 1) throw new Error("IONOS_CURSOR_STATE_VERSION_UNSUPPORTED");
  if (!isPlainObject(value.cursors)) throw new Error("IONOS_CURSOR_STATE_CURSORS_INVALID");
  const cursors: Record<string, EmailSyncCursorV1> = {};
  for (const [key, rawCursor] of Object.entries(value.cursors)) {
    const id = mailboxId(key, "cursor key");
    cursors[id] = cursor(rawCursor, id);
  }
  return { version: 1, cursors };
}

function sameCursor(left: EmailSyncCursorV1 | null, right: EmailSyncCursorV1 | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function assertRegularOrMissing(filePath: string): Promise<"MISSING" | "REGULAR"> {
  try {
    const stat = await lstat(filePath);
    if (stat.isSymbolicLink()) throw new Error("IONOS_CURSOR_STATE_SYMLINK_REJECTED");
    if (!stat.isFile()) throw new Error("IONOS_CURSOR_STATE_NOT_REGULAR_FILE");
    return "REGULAR";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "MISSING";
    throw error;
  }
}

async function load(filePath: string): Promise<CursorStateV1> {
  if ((await assertRegularOrMissing(filePath)) === "MISSING") return emptyState();
  return parseState(await readFile(filePath, "utf8"));
}

async function persist(filePath: string, state: CursorStateV1): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertRegularOrMissing(filePath);
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    await chmod(filePath, 0o600);
    const directoryHandle = await open(directory, constants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export function createIonosFileCursorStoreV1(filePath: string): EmailCursorStoreV1 {
  if (!path.isAbsolute(filePath)) throw new Error("IONOS_CURSOR_STATE_PATH_MUST_BE_ABSOLUTE");
  let serialized = Promise.resolve<unknown>(undefined);
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const result = serialized.then(work, work);
    serialized = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    read(requestedMailboxId) {
      return run(async () => {
        const id = mailboxId(requestedMailboxId, "mailboxId");
        const state = await load(filePath);
        const stored = state.cursors[id];
        return stored == null ? null : structuredClone(stored);
      });
    },
    compareAndSet(requestedMailboxId, expected, next) {
      return run(async () => {
        const id = mailboxId(requestedMailboxId, "mailboxId");
        const expectedCursor = expected == null ? null : cursor(expected, id);
        const nextCursor = cursor(next, id);
        const state = await load(filePath);
        const current = state.cursors[id] ?? null;
        if (!sameCursor(current, expectedCursor)) return false;
        state.cursors[id] = nextCursor;
        await persist(filePath, state);
        return true;
      });
    }
  };
}
