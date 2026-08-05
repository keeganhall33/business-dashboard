import "@/lib/server-only";

import type { SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";
import {
  PersistenceIdempotencyConflictError,
  PersistenceContentHashMismatchError,
  PersistenceInvalidArgumentError,
  PersistenceLegalHoldBlockedError,
  PersistenceLinkedVersionNotFoundError,
  PersistenceObjectTypeMismatchError,
  PersistencePolicyMismatchError,
  PersistenceRunCompletionBlockedError,
  PersistenceUnauthorizedError,
  PersistenceUnknownDatabaseError,
  PersistenceVersionRefMismatchError
} from "@/lib/external-intelligence/persistence/errors";

export const EXTERNAL_INTELLIGENCE_RPCS = {
  persistEvidence: "persist_external_evidence_reference_v1",
  persistClaim: "persist_external_claim_v1",
  persistSignalWriteSet: "persist_external_signal_write_set_v1",
  completeRun: "complete_external_processing_run_v1",
  redactEvidence: "redact_external_evidence_payload_v1",
  redactClaim: "redact_external_claim_payload_v1",
  redactSignal: "redact_external_signal_payload_v1"
} as const;

type RpcErrorLike = { message?: string; code?: string };

function mapRpcError(error: RpcErrorLike): Error {
  const msg = String(error.message ?? "");

  // Prefer stable machine-readable message codes emitted by the RPC layer.
  switch (msg) {
    case "unauthorized":
      return new PersistenceUnauthorizedError(msg);
    case "invalid_argument":
      return new PersistenceInvalidArgumentError(msg);
    case "integrity_conflict":
      return new PersistenceIdempotencyConflictError(msg);
    case "linked_version_not_found":
      return new PersistenceLinkedVersionNotFoundError(msg);
    case "object_type_mismatch":
      return new PersistenceObjectTypeMismatchError(msg);
    case "version_ref_mismatch":
      return new PersistenceVersionRefMismatchError(msg);
    case "content_hash_mismatch":
      return new PersistenceContentHashMismatchError(msg);
    case "policy_mismatch":
      return new PersistencePolicyMismatchError(msg);
    case "legal_hold_block":
      return new PersistenceLegalHoldBlockedError(msg);
    case "run_completion_blocked":
      return new PersistenceRunCompletionBlockedError(msg);
    case "incomplete_write_set":
      return new PersistenceRunCompletionBlockedError(msg);
    default:
      // Do not leak payload contents; only surface stable codes.
      return new PersistenceUnknownDatabaseError(msg || String(error.code ?? "unknown_db_error"));
  }
}

/**
 * Transaction mechanism (authoritative): one RPC call == one atomic DB transaction.
 *
 * PostgREST multi-call sequences are NOT treated as transactions.
 */
export async function runRpc<T>(input: {
  client: SupabaseServerClient;
  fn: string;
  args: Record<string, unknown>;
}): Promise<T> {
  const res = await input.client.rpc(input.fn, input.args);
  if (res.error) throw mapRpcError(res.error as RpcErrorLike);
  return res.data as T;
}
