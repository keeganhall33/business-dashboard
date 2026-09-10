import { createHash } from "node:crypto";

import type {
  IonosMailboxRoleV1,
  IonosMailboxRuntimeV1
} from "@/lib/email/ionos-mailbox-config-v1";
import {
  normalizeEmailIngestCandidatesV1,
  type EmailIngestCandidateV1,
  type EmailProviderAdapterV1,
  type EmailReadSessionV1
} from "@/lib/email/ionos-incremental-sync-v1";

export type IonosHistoricalCandidateScanTelemetryV1 = {
  status: "SCANNED" | "NO_MESSAGES";
  fetchedCount: number;
  candidateCount: number;
  requestedRangeFingerprint: string;
  effectiveRangeFingerprint: string | null;
};

export type IonosHistoricalCandidateScanResultV1 = {
  mailboxId: string;
  role: IonosMailboxRoleV1;
  candidates: readonly EmailIngestCandidateV1[];
  telemetry: IonosHistoricalCandidateScanTelemetryV1;
};

const ROLE_SET = new Set<string>([
  "PERSONAL_HIGH_VALUE_RELATIONSHIP",
  "ASSISTANT_CUSTOMER_SERVICE_OUTREACH",
  "MARKETING_FUNNELKIT"
]);

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalDecimal(value: unknown, positive: boolean): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    fail("IONOS_HISTORICAL_SCAN_RANGE_INVALID");
  }
  const canonical = BigInt(value).toString();
  if (positive && BigInt(canonical) < BigInt(1)) {
    fail("IONOS_HISTORICAL_SCAN_RANGE_INVALID");
  }
  return canonical;
}

function canonicalProviderUid(value: unknown): string {
  try {
    if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value).toString();
  } catch {
    // Fall through to a privacy-safe provider validation failure.
  }
  fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
}

function validateMailbox(value: unknown): IonosMailboxRuntimeV1 {
  if (!isPlainObject(value)) fail("IONOS_HISTORICAL_SCAN_MAILBOX_INVALID");
  if (
    typeof value.id !== "string" || !value.id.trim() ||
    typeof value.role !== "string" || !ROLE_SET.has(value.role) ||
    typeof value.user !== "string" || !value.user.trim() ||
    typeof value.pass !== "string" || !value.pass.trim() ||
    typeof value.host !== "string" || !value.host.trim() ||
    typeof value.folder !== "string" || !value.folder.trim() ||
    typeof value.port !== "number" || !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535 ||
    (value.minVersion !== "TLSv1.2" && value.minVersion !== "TLSv1.3") ||
    value.smtpEnabled !== false
  ) {
    fail("IONOS_HISTORICAL_SCAN_MAILBOX_INVALID");
  }
  return value as IonosMailboxRuntimeV1;
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 16);
}

function validateNow(now: () => number): number {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) fail("IONOS_HISTORICAL_SCAN_CLOCK_INVALID");
  return value;
}

function assertBeforeDeadline(now: () => number, deadlineAtMs: number): void {
  if (validateNow(now) >= deadlineAtMs) fail("IONOS_HISTORICAL_SCAN_DEADLINE_EXHAUSTED");
}

function validateSession(value: unknown): EmailReadSessionV1 {
  if (
    value == null || typeof value !== "object" ||
    typeof (value as EmailReadSessionV1).status !== "function" ||
    typeof (value as EmailReadSessionV1).fetchMetadata !== "function" ||
    typeof (value as EmailReadSessionV1).close !== "function"
  ) {
    fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
  }
  return value as EmailReadSessionV1;
}

export async function scanIonosHistoricalCandidatesV1(input: {
  mailbox: IonosMailboxRuntimeV1;
  adapter: EmailProviderAdapterV1;
  fromUid: string;
  toUid: string;
  batchSize: number;
  deadlineAtMs: number;
  expectedUidValidity: string;
  now?: () => number;
}): Promise<IonosHistoricalCandidateScanResultV1> {
  if (!isPlainObject(input)) fail("IONOS_HISTORICAL_SCAN_INPUT_INVALID");
  const allowed = new Set([
    "mailbox",
    "adapter",
    "fromUid",
    "toUid",
    "batchSize",
    "deadlineAtMs",
    "expectedUidValidity",
    "now"
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail("IONOS_HISTORICAL_SCAN_INPUT_INVALID");

  const mailbox = validateMailbox(input.mailbox);
  if (input.adapter == null || typeof input.adapter.openReadOnly !== "function") {
    fail("IONOS_HISTORICAL_SCAN_ADAPTER_INVALID");
  }
  if (typeof input.batchSize !== "number" || !Number.isSafeInteger(input.batchSize) || input.batchSize < 1) {
    fail("IONOS_HISTORICAL_SCAN_BATCH_INVALID");
  }
  if (typeof input.deadlineAtMs !== "number" || !Number.isSafeInteger(input.deadlineAtMs) || input.deadlineAtMs < 1) {
    fail("IONOS_HISTORICAL_SCAN_DEADLINE_INVALID");
  }
  const now = input.now ?? Date.now;
  if (typeof now !== "function") fail("IONOS_HISTORICAL_SCAN_CLOCK_INVALID");

  const fromUid = canonicalDecimal(input.fromUid, true);
  const toUid = canonicalDecimal(input.toUid, true);
  const expectedUidValidity = canonicalDecimal(input.expectedUidValidity, false);
  const from = BigInt(fromUid);
  const to = BigInt(toUid);
  if (from > to) fail("IONOS_HISTORICAL_SCAN_RANGE_INVALID");

  const requestedRangeFingerprint = fingerprint(fromUid, toUid, String(input.batchSize));
  assertBeforeDeadline(now, input.deadlineAtMs);

  let session: EmailReadSessionV1 | null = null;
  try {
    try {
      session = validateSession(await input.adapter.openReadOnly(mailbox, { deadlineAtMs: input.deadlineAtMs }));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("IONOS_HISTORICAL_SCAN_")) throw error;
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_FAILED");
    }

    assertBeforeDeadline(now, input.deadlineAtMs);
    let statusValue: unknown;
    try {
      statusValue = await session.status();
    } catch {
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_FAILED");
    }
    if (!isPlainObject(statusValue)) fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
    if (Object.keys(statusValue).some((key) => key !== "uidValidity" && key !== "uidNext")) {
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
    }

    const currentUidValidity = canonicalProviderUid(statusValue.uidValidity);
    const uidNext = canonicalProviderUid(statusValue.uidNext);
    if (currentUidValidity !== expectedUidValidity) fail("IONOS_HISTORICAL_SCAN_UIDVALIDITY_MISMATCH");

    const observedLastUid = BigInt(uidNext) > BigInt(0) ? BigInt(uidNext) - BigInt(1) : BigInt(0);
    if (from > observedLastUid) {
      return {
        mailboxId: mailbox.id,
        role: mailbox.role,
        candidates: [],
        telemetry: {
          status: "NO_MESSAGES",
          fetchedCount: 0,
          candidateCount: 0,
          requestedRangeFingerprint,
          effectiveRangeFingerprint: null
        }
      };
    }

    const batchEnd = from + BigInt(input.batchSize) - BigInt(1);
    let effectiveTo = to;
    if (batchEnd < effectiveTo) effectiveTo = batchEnd;
    if (observedLastUid < effectiveTo) effectiveTo = observedLastUid;
    const effectiveToUid = effectiveTo.toString();
    const effectiveRangeFingerprint = fingerprint(fromUid, effectiveToUid);

    assertBeforeDeadline(now, input.deadlineAtMs);
    let fetched: unknown;
    try {
      fetched = await session.fetchMetadata({
        fromUid,
        toUid: effectiveToUid,
        limit: input.batchSize
      });
    } catch {
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_FAILED");
    }
    assertBeforeDeadline(now, input.deadlineAtMs);

    if (!isPlainObject(fetched) || fetched.complete !== true || !Array.isArray(fetched.messages)) {
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
    }

    let candidates: EmailIngestCandidateV1[];
    try {
      candidates = normalizeEmailIngestCandidatesV1(
        fetched.messages,
        mailbox,
        currentUidValidity,
        from,
        effectiveTo
      );
    } catch {
      fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");
    }
    if (candidates.length > input.batchSize) fail("IONOS_HISTORICAL_SCAN_PROVIDER_INVALID");

    return {
      mailboxId: mailbox.id,
      role: mailbox.role,
      candidates,
      telemetry: {
        status: "SCANNED",
        fetchedCount: candidates.length,
        candidateCount: candidates.length,
        requestedRangeFingerprint,
        effectiveRangeFingerprint
      }
    };
  } finally {
    if (session != null) {
      try {
        await session.close();
      } catch {
        // Read-only cleanup failure cannot mutate mailbox or candidate state.
      }
    }
  }
}
