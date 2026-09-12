import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { validateIonosMailboxConfigV1 } from "@/lib/email/ionos-mailbox-config-v1";
import {
  runIonosHistoricalIntelligencePreviewV1,
  type IonosHistoricalPreviewInputV1,
  type IonosHistoricalPreviewRangeV1,
  type IonosHistoricalPreviewResultV1
} from "@/lib/email/ionos-historical-intelligence-runner-v1";
import type { IonosReadonlyIntelligencePipelineInputV1 } from "@/lib/email/ionos-readonly-intelligence-pipeline-v1";
import type { RelationshipActivityClassificationEvidenceV1 } from "@/lib/email/ionos-relationship-state-v1";

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
type PreviewRunnerV1 = (
  input: IonosHistoricalPreviewInputV1
) => Promise<IonosHistoricalPreviewResultV1>;

type PreviewJsonV1 = {
  ranges: readonly IonosHistoricalPreviewRangeV1[];
  pipeline: Omit<IonosReadonlyIntelligencePipelineInputV1, "messages" | "classifyActivities"> & {
    activityClassifications: readonly RelationshipActivityClassificationEvidenceV1[];
  };
};

export type IonosHistoricalPreviewCommandInputV1 = {
  env: Record<string, string | undefined>;
  runCommand?: CommandRunnerV1;
  runPreview?: PreviewRunnerV1;
  writeStdout?: (text: string) => void;
  now?: () => number;
};

const INPUT_KEYS = new Set(["env", "runCommand", "runPreview", "writeStdout", "now"]);
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
    throw new Error("IONOS_HISTORICAL_PREVIEW_CLOCK_INVALID");
  }
  return value;
}

function requiredEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`IONOS_HISTORICAL_PREVIEW_MISSING_ENV_${key}`);
  }
  return value.trim();
}

function commandTimeout(env: Record<string, string | undefined>): number {
  const raw = env.IONOS_HISTORICAL_PREVIEW_TIMEOUT_MS;
  if (raw == null || raw === "") return DEFAULT_TIMEOUT_MS;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error("IONOS_HISTORICAL_PREVIEW_TIMEOUT_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new Error("IONOS_HISTORICAL_PREVIEW_TIMEOUT_INVALID");
  }
  return value;
}

function mailboxConfig(env: Record<string, string | undefined>): unknown {
  const raw = requiredEnv(env, "IONOS_MAILBOX_CONFIG_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("IONOS_HISTORICAL_PREVIEW_MAILBOX_CONFIG_JSON_INVALID");
  }
  validateIonosMailboxConfigV1(parsed);
  return parsed;
}

function previewConfig(env: Record<string, string | undefined>): PreviewJsonV1 {
  const raw = requiredEnv(env, "IONOS_HISTORICAL_PREVIEW_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("IONOS_HISTORICAL_PREVIEW_JSON_INVALID");
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.ranges) || !isPlainObject(parsed.pipeline)) {
    throw new Error("IONOS_HISTORICAL_PREVIEW_JSON_INVALID");
  }
  if (!Array.isArray(parsed.pipeline.activityClassifications)) {
    throw new Error("IONOS_HISTORICAL_PREVIEW_CLASSIFICATIONS_INVALID");
  }
  return parsed as unknown as PreviewJsonV1;
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
  if (error == null || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; killed?: unknown };
  return (
    candidate.code === "ETIMEDOUT" ||
    candidate.code === "ERR_CHILD_PROCESS_TIMEOUT" ||
    candidate.killed === true
  );
}

function redactedError(error: unknown): Error {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/op:\/\/[^\s,;]+/gi, "[REDACTED_REFERENCE]");
  message = message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  return new Error(message);
}

function validateCommandInput(input: IonosHistoricalPreviewCommandInputV1): void {
  if (!isPlainObject(input)) throw new Error("IONOS_HISTORICAL_PREVIEW_COMMAND_INPUT_INVALID");
  const unsupported = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unsupported.length) {
    throw new Error(`IONOS_HISTORICAL_PREVIEW_COMMAND_UNSUPPORTED_KEYS: ${unsupported.join(", ")}`);
  }
  if (!isPlainObject(input.env)) throw new Error("IONOS_HISTORICAL_PREVIEW_COMMAND_ENV_INVALID");
  if (input.runCommand != null && typeof input.runCommand !== "function") {
    throw new Error("IONOS_HISTORICAL_PREVIEW_COMMAND_RUNNER_INVALID");
  }
  if (input.runPreview != null && typeof input.runPreview !== "function") {
    throw new Error("IONOS_HISTORICAL_PREVIEW_RUNNER_INVALID");
  }
  if (input.writeStdout != null && typeof input.writeStdout !== "function") {
    throw new Error("IONOS_HISTORICAL_PREVIEW_STDOUT_INVALID");
  }
  if (input.now != null && typeof input.now !== "function") {
    throw new Error("IONOS_HISTORICAL_PREVIEW_CLOCK_INVALID");
  }
}

export async function runIonosHistoricalIntelligencePreviewCommandV1(
  input: IonosHistoricalPreviewCommandInputV1
): Promise<IonosHistoricalPreviewResultV1["telemetry"]> {
  try {
    validateCommandInput(input);
    const now = input.now ?? Date.now;
    const startedAt = safeNow(now);
    const timeoutMs = commandTimeout(input.env);
    const deadlineAtMs = startedAt + timeoutMs;
    if (!Number.isSafeInteger(deadlineAtMs)) {
      throw new Error("IONOS_HISTORICAL_PREVIEW_DEADLINE_INVALID");
    }

    const config = mailboxConfig(input.env);
    const preview = previewConfig(input.env);
    const runCommand = input.runCommand ?? defaultCommandRunner;
    const runPreview = input.runPreview ?? runIonosHistoricalIntelligencePreviewV1;
    const writeStdout = input.writeStdout ?? ((text: string) => process.stdout.write(text));

    const resolveSecretRef = async (reference: string): Promise<string> => {
      const remaining = deadlineAtMs - safeNow(now);
      if (remaining <= 0) throw new Error("IONOS_HISTORICAL_PREVIEW_TOTAL_DEADLINE_EXHAUSTED");
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
        if (result == null || typeof result.stdout !== "string" || result.stdout.length === 0) {
          throw new Error("IONOS_HISTORICAL_PREVIEW_SECRET_EMPTY");
        }
        return result.stdout;
      } catch (error) {
        if (commandTimedOut(error)) throw new Error("IONOS_HISTORICAL_PREVIEW_SECRET_TIMEOUT");
        if (error instanceof Error && error.message === "IONOS_HISTORICAL_PREVIEW_SECRET_EMPTY") throw error;
        throw new Error("IONOS_HISTORICAL_PREVIEW_SECRET_FAILED");
      }
    };

    const { activityClassifications, ...pipelineBase } = preview.pipeline;
    const result = await runPreview({
      mailboxConfig: config,
      resolveSecretRef,
      ranges: preview.ranges,
      deadlineAtMs,
      pipeline: {
        ...pipelineBase,
        classifyActivities: () => activityClassifications
      },
      now
    });

    if (safeNow(now) >= deadlineAtMs) {
      throw new Error("IONOS_HISTORICAL_PREVIEW_TOTAL_DEADLINE_EXHAUSTED");
    }

    writeStdout(`${JSON.stringify(result.telemetry)}\n`);
    if (result.telemetry.failedMailboxCount > 0) {
      throw new Error("IONOS_HISTORICAL_PREVIEW_PARTIAL_FAILURE");
    }
    return result.telemetry;
  } catch (error) {
    throw redactedError(error);
  }
}

export async function mainIonosHistoricalIntelligencePreviewV1(): Promise<void> {
  try {
    await runIonosHistoricalIntelligencePreviewCommandV1({ env: { ...process.env } });
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
  void mainIonosHistoricalIntelligencePreviewV1();
}
