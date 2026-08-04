import "server-only";

import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

export type PayloadConflictResult =
  | { kind: "idempotent_success" }
  | { kind: "integrity_conflict"; message: string };

/**
 * Detect same-hash/different-payload conflicts.
 *
 * DB uniqueness prevents duplicate (id,hash) rows, but cannot prove payload equality.
 * We must compare canonical bytes when we hit a uniqueness conflict.
 */
export function verifySameHashSamePayload(input: {
  expectedPayload: unknown;
  existingPayload: unknown;
  label: string;
}): PayloadConflictResult {
  const a = canonicalJsonSha256Hex(input.expectedPayload);
  const b = canonicalJsonSha256Hex(input.existingPayload);
  if (a === b) return { kind: "idempotent_success" };
  return {
    kind: "integrity_conflict",
    message: `${input.label}: same content_hash but payload bytes differ (expected_sha=${a}, existing_sha=${b})`
  };
}
