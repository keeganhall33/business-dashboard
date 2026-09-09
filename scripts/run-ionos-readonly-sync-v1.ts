import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  validateIonosMailboxConfigV1
} from "@/lib/email/ionos-mailbox-config-v1";
import {
  runIonosReadonlySyncV1,
  type IonosReadonlySyncRunResultV1,
  type IonosReadonlySyncRunnerInputV1
} from "@/lib/email/ionos-readonly-sync-runner-v1";

type CommandResultV1 = { stdout: string };
type CommandRunnerV1 = (
  file: string,
  args: readonly string[],
  options: {
    shell: false;
    timeout: number;
    maxBuffer: number;
    encoding: "utf8";
  }
) => Promise<CommandResultV1>;
type SyncRunnerV1 = (
  input: IonosReadonlySyncRunnerInputV1
) => Promise<IonosReadonlySyncRunResultV1>;

export type IonosReadonlySyncCommandInputV1 = {
  env: Record<string, string | undefined>;
  runCommand?: CommandRunnerV1;
  runSync?: SyncRunnerV1;
  writeStdout?: (text: string) => void;
  now?: () => number;
};

const INPUT_KEYS = new Set(["env", "runCommand", "runSync", "writeStdout", "now"]);
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_SECRET_BYTES = 64 * 1024;
const execFileAsync = promisify(execFile);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("IONOS_SYNC_CLOCK_INVALID");
  }
  return value;
}

function requiredEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`IONOS_SYNC_MISSING_ENV_${key}`);
  }
  return value.trim();
}

function commandTimeout(env: Record<string, string | undefined>): number {
  const raw = env.IONOS_SYNC_TIMEOUT_MS;
  if (raw == null || raw === "") return DEFAULT_TIMEOUT_MS;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error("IONOS_SYNC_TIMEOUT_INVALID");
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_TIMEOUT_MS ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new Error("IONOS_SYNC_TIMEOUT_INVALID");
  }
  return value;
}

function mailboxConfig(env: Record<string, string | undefined>): unknown {
  const raw = requiredEnv(env, "IONOS_MAILBOX_CONFIG_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("IONOS_SYNC_MAILBOX_CONFIG_JSON_INVALID");
  }
  validateIonosMailboxConfigV1(parsed);
  return parsed;
}

function cursorPath(env: Record<string, string | undefined>): string {
  const value = requiredEnv(env, "IONOS_CURSOR_STATE_PATH");
  if (!path.isAbsolute(value)) {
    throw new Error("IONOS_SYNC_CURSOR_PATH_MUST_BE_ABSOLUTE");
  }
  return value;
}

async function defaultCommandRunner(
  file: string,
  args: readonly string[],
  options: {
    shell: false;
    timeout: number;
    maxBuffer: number;
    encoding: "utf8";
  }
): Promise<CommandResultV1> {
  const result = await execFileAsync(file, [...args], options);
  return { stdout: String(result.stdout) };
}

function commandTimedOut(error: unknown): boolean {
  if (!isPlainObject(error)) return false;
  return (
    error.code === "ETIMEDOUT" ||
    error.code === "ERR_CHILD_PROCESS_TIMEOUT" ||
    error.killed === true
  );
}

function redactedError(error: unknown): Error {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/op:\/\/[^\s,;]+/gi, "[REDACTED_REFERENCE]");
  message = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  return new Error(message);
}

function validateCommandInput(input: IonosReadonlySyncCommandInputV1): void {
  if (!isPlainObject(input)) throw new Error("IONOS_SYNC_COMMAND_INPUT_MUST_BE_OBJECT");
  const unsupported = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`IONOS_SYNC_COMMAND_UNSUPPORTED_KEYS: ${unsupported.join(", ")}`);
  }
  if (!isPlainObject(input.env)) throw new Error("IONOS_SYNC_COMMAND_ENV_INVALID");
  if (input.runCommand != null && typeof input.runCommand !== "function") {
    throw new Error("IONOS_SYNC_COMMAND_RUNNER_INVALID");
  }
  if (input.runSync != null && typeof input.runSync !== "function") {
    throw new Error("IONOS_SYNC_RUNNER_INVALID");
  }
  if (input.writeStdout != null && typeof input.writeStdout !== "function") {
    throw new Error("IONOS_SYNC_STDOUT_INVALID");
  }
  if (input.now != null && typeof input.now !== "function") {
    throw new Error("IONOS_SYNC_CLOCK_INVALID");
  }
}

export async function runIonosReadonlySyncCommandV1(
  input: IonosReadonlySyncCommandInputV1
): Promise<IonosReadonlySyncRunResultV1["summary"]> {
  try {
    validateCommandInput(input);
    const now = input.now ?? Date.now;
    const startedAt = safeNow(now);
    const timeoutMs = commandTimeout(input.env);
    const deadlineAtMs = startedAt + timeoutMs;
    if (!Number.isSafeInteger(deadlineAtMs)) {
      throw new Error("IONOS_SYNC_DEADLINE_INVALID");
    }

    const config = mailboxConfig(input.env);
    const statePath = cursorPath(input.env);
    const runCommand = input.runCommand ?? defaultCommandRunner;
    const runSync = input.runSync ?? runIonosReadonlySyncV1;
    const writeStdout = input.writeStdout ?? ((text: string) => process.stdout.write(text));

    const resolveSecretRef = async (reference: string): Promise<string> => {
      const current = safeNow(now);
      const remaining = deadlineAtMs - current;
      if (remaining <= 0) throw new Error("IONOS_SYNC_TOTAL_DEADLINE_EXHAUSTED");
      try {
        const result = await runCommand(
          "op",
          ["read", "--no-newline", reference],
          {
            shell: false,
            timeout: remaining,
            maxBuffer: MAX_SECRET_BYTES,
            encoding: "utf8"
          }
        );
        if (
          result == null ||
          typeof result.stdout !== "string" ||
          result.stdout.length === 0
        ) {
          throw new Error("IONOS_SECRET_RESOLUTION_EMPTY");
        }
        return result.stdout;
      } catch (error) {
        if (commandTimedOut(error)) {
          throw new Error("IONOS_SECRET_RESOLUTION_TIMEOUT");
        }
        if (error instanceof Error && error.message === "IONOS_SECRET_RESOLUTION_EMPTY") {
          throw error;
        }
        throw new Error("IONOS_SECRET_RESOLUTION_FAILED");
      }
    };

    const remainingForSync = deadlineAtMs - safeNow(now);
    if (remainingForSync <= 0) {
      throw new Error("IONOS_SYNC_TOTAL_DEADLINE_EXHAUSTED");
    }

    const result = await runSync({
      mailboxConfig: config,
      resolveSecretRef,
      cursorStatePath: statePath,
      options: { maxElapsedMs: remainingForSync },
      now
    });

    if (safeNow(now) >= deadlineAtMs) {
      throw new Error("IONOS_SYNC_TOTAL_DEADLINE_EXHAUSTED");
    }

    const serialized = `${JSON.stringify(result.summary)}\n`;
    writeStdout(serialized);
    if (result.summary.failedMailboxCount > 0) {
      throw new Error("IONOS_SYNC_MAILBOX_FAILURE");
    }
    return result.summary;
  } catch (error) {
    throw redactedError(error);
  }
}

export async function mainIonosReadonlySyncV1(): Promise<void> {
  try {
    await runIonosReadonlySyncCommandV1({ env: process.env });
  } catch (error) {
    const safe = redactedError(error);
    process.stderr.write(`${safe.message}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  void mainIonosReadonlySyncV1();
}
