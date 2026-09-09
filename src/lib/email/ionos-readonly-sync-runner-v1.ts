import path from "node:path";

import {
  resolveIonosMailboxConfigV1,
  type IonosMailboxRuntimeV1
} from "@/lib/email/ionos-mailbox-config-v1";
import {
  syncIonosMailboxesV1,
  type EmailCursorStoreV1,
  type EmailMailboxSyncResultV1,
  type EmailProviderAdapterV1,
  type IncrementalSyncOptionsV1
} from "@/lib/email/ionos-incremental-sync-v1";
import { createIonosImapReadAdapterV1 } from "@/lib/email/ionos-imap-read-adapter-v1";
import { createIonosFileCursorStoreV1 } from "@/lib/email/ionos-file-cursor-store-v1";

export type IonosReadonlySyncSummaryV1 = {
  mailboxCount: 3;
  successfulMailboxCount: number;
  failedMailboxCount: number;
  totalFetchedCount: number;
  totalCandidateCount: number;
  mailboxes: Array<{
    mailboxId: string;
    role: IonosMailboxRuntimeV1["role"];
    status: EmailMailboxSyncResultV1["status"];
    reason: EmailMailboxSyncResultV1["reason"];
    fetchedCount: number;
    candidateCount: number;
    retryCount: number;
    cursorFingerprint: string | null;
  }>;
};

export type IonosReadonlySyncRunResultV1 = {
  results: EmailMailboxSyncResultV1[];
  summary: IonosReadonlySyncSummaryV1;
};

type RunnerDependenciesV1 = {
  createAdapter?: (input: { now?: () => number }) => EmailProviderAdapterV1;
  createCursorStore?: (filePath: string) => EmailCursorStoreV1;
};

export type IonosReadonlySyncRunnerInputV1 = {
  mailboxConfig: unknown;
  resolveSecretRef: (reference: string) => string | Promise<string>;
  cursorStatePath: string;
  options?: Partial<IncrementalSyncOptionsV1>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  dependencies?: RunnerDependenciesV1;
};

const INPUT_KEYS = new Set([
  "mailboxConfig",
  "resolveSecretRef",
  "cursorStatePath",
  "options",
  "now",
  "sleep",
  "dependencies"
]);
const DEPENDENCY_KEYS = new Set(["createAdapter", "createCursorStore"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertFactoryResult(
  adapter: EmailProviderAdapterV1,
  cursorStore: EmailCursorStoreV1
): void {
  if (adapter == null || typeof adapter.openReadOnly !== "function") {
    throw new Error("IONOS_SYNC_ADAPTER_INVALID");
  }
  if (
    cursorStore == null ||
    typeof cursorStore.read !== "function" ||
    typeof cursorStore.compareAndSet !== "function"
  ) {
    throw new Error("IONOS_SYNC_CURSOR_STORE_INVALID");
  }
}

function validateInput(input: IonosReadonlySyncRunnerInputV1): void {
  if (!isPlainObject(input)) throw new Error("IONOS_SYNC_INPUT_MUST_BE_OBJECT");
  const unsupported = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`IONOS_SYNC_INPUT_UNSUPPORTED_KEYS: ${unsupported.join(", ")}`);
  }
  if (typeof input.resolveSecretRef !== "function") {
    throw new Error("IONOS_SYNC_SECRET_RESOLVER_INVALID");
  }
  if (typeof input.cursorStatePath !== "string" || !path.isAbsolute(input.cursorStatePath)) {
    throw new Error("IONOS_SYNC_CURSOR_PATH_MUST_BE_ABSOLUTE");
  }
  if (input.now != null && typeof input.now !== "function") {
    throw new Error("IONOS_SYNC_CLOCK_INVALID");
  }
  if (input.sleep != null && typeof input.sleep !== "function") {
    throw new Error("IONOS_SYNC_SLEEP_INVALID");
  }
  if (input.dependencies != null) {
    if (!isPlainObject(input.dependencies)) {
      throw new Error("IONOS_SYNC_DEPENDENCIES_MUST_BE_OBJECT");
    }
    const unsupportedDependencies = Object.keys(input.dependencies).filter(
      (key) => !DEPENDENCY_KEYS.has(key)
    );
    if (unsupportedDependencies.length) {
      throw new Error(
        `IONOS_SYNC_DEPENDENCIES_UNSUPPORTED_KEYS: ${unsupportedDependencies.join(", ")}`
      );
    }
    if (
      input.dependencies.createAdapter != null &&
      typeof input.dependencies.createAdapter !== "function"
    ) {
      throw new Error("IONOS_SYNC_ADAPTER_FACTORY_INVALID");
    }
    if (
      input.dependencies.createCursorStore != null &&
      typeof input.dependencies.createCursorStore !== "function"
    ) {
      throw new Error("IONOS_SYNC_CURSOR_STORE_FACTORY_INVALID");
    }
  }
}

function summary(results: EmailMailboxSyncResultV1[]): IonosReadonlySyncSummaryV1 {
  const mailboxes = results.map((result) => ({
    mailboxId: result.mailboxId,
    role: result.role,
    status: result.status,
    reason: result.reason,
    fetchedCount: result.fetchedCount,
    candidateCount: result.candidateCount,
    retryCount: result.retryCount,
    cursorFingerprint: result.cursorFingerprint
  }));
  return {
    mailboxCount: 3,
    successfulMailboxCount: mailboxes.filter((mailbox) => mailbox.status !== "FAILED").length,
    failedMailboxCount: mailboxes.filter((mailbox) => mailbox.status === "FAILED").length,
    totalFetchedCount: mailboxes.reduce((total, mailbox) => total + mailbox.fetchedCount, 0),
    totalCandidateCount: mailboxes.reduce((total, mailbox) => total + mailbox.candidateCount, 0),
    mailboxes
  };
}

function redact(error: unknown, secrets: ReadonlySet<string>): Error {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message.replace(/op:\/\/[^\s,;]+/gi, "[REDACTED_REFERENCE]");
  return new Error(message);
}

export async function runIonosReadonlySyncV1(
  input: IonosReadonlySyncRunnerInputV1
): Promise<IonosReadonlySyncRunResultV1> {
  const secrets = new Set<string>();
  try {
    validateInput(input);
    const mailboxes = await resolveIonosMailboxConfigV1(
      input.mailboxConfig,
      async (reference) => {
        const value = await input.resolveSecretRef(reference);
        if (typeof value === "string" && value) secrets.add(value);
        return value;
      }
    );

    const createAdapter =
      input.dependencies?.createAdapter ??
      (({ now }: { now?: () => number }) => createIonosImapReadAdapterV1({ now }));
    const createCursorStore =
      input.dependencies?.createCursorStore ?? createIonosFileCursorStoreV1;
    const adapter = createAdapter({ now: input.now });
    const cursorStore = createCursorStore(input.cursorStatePath);
    assertFactoryResult(adapter, cursorStore);

    const results = await syncIonosMailboxesV1({
      mailboxes,
      adapter,
      cursorStore,
      options: input.options,
      now: input.now,
      sleep: input.sleep
    });

    return { results, summary: summary(results) };
  } catch (error) {
    throw redact(error, secrets);
  }
}
