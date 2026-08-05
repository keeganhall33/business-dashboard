import "@/lib/server-only";

import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";

export type RedactionTombstoneResult = Readonly<{
  kind: "redaction_tombstone";
  object_type: VersionRef["object_type"];
  object_id: string;
  content_hash: string;
  payload_available: false;
  content_redacted_at: string;
  redaction_reason: string;
}>;

function assertNonEmptyReason(reason: string): void {
  if (!reason || reason.trim().length === 0) throw new Error("invalid_argument");
}

function tombstone(input: {
  object_type: VersionRef["object_type"];
  object_id: string;
  content_hash: string;
  content_redacted_at: string;
  redaction_reason: string;
}): RedactionTombstoneResult {
  return Object.freeze({
    kind: "redaction_tombstone",
    object_type: input.object_type,
    object_id: input.object_id,
    content_hash: input.content_hash,
    payload_available: false,
    content_redacted_at: input.content_redacted_at,
    redaction_reason: input.redaction_reason
  });
}

export class LegalRedactionRepository {
  async redactEvidencePayload(input: {
    evidence_reference_id: string;
    content_hash: string;
    reason: string;
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<RedactionTombstoneResult> {
    assertNonEmptyReason(input.reason);
    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });
    const res = await runRpc<
      Array<{
        evidence_reference_id: string;
        content_hash: string;
        content_redacted_at: string;
        redaction_reason: string;
      }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.redactEvidence,
      args: {
        in_evidence_reference_id: input.evidence_reference_id,
        in_content_hash: input.content_hash,
        in_reason: input.reason
      }
    });
    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    return tombstone({
      object_type: "evidence_reference",
      object_id: row.evidence_reference_id,
      content_hash: row.content_hash,
      content_redacted_at: row.content_redacted_at,
      redaction_reason: row.redaction_reason
    });
  }

  async redactClaimPayload(input: {
    claim_id: string;
    content_hash: string;
    reason: string;
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<RedactionTombstoneResult> {
    assertNonEmptyReason(input.reason);
    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });
    const res = await runRpc<
      Array<{ claim_id: string; content_hash: string; content_redacted_at: string; redaction_reason: string }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.redactClaim,
      args: { in_claim_id: input.claim_id, in_content_hash: input.content_hash, in_reason: input.reason }
    });
    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    return tombstone({
      object_type: "claim",
      object_id: row.claim_id,
      content_hash: row.content_hash,
      content_redacted_at: row.content_redacted_at,
      redaction_reason: row.redaction_reason
    });
  }

  async redactSignalPayload(input: {
    signal_id: string;
    content_hash: string;
    reason: string;
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<RedactionTombstoneResult> {
    assertNonEmptyReason(input.reason);
    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });
    const res = await runRpc<
      Array<{ signal_id: string; content_hash: string; content_redacted_at: string; redaction_reason: string }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.redactSignal,
      args: { in_signal_id: input.signal_id, in_content_hash: input.content_hash, in_reason: input.reason }
    });
    const row = res[0];
    if (!row) throw new Error("unknown_db_error");
    return tombstone({
      object_type: "signal",
      object_id: row.signal_id,
      content_hash: row.content_hash,
      content_redacted_at: row.content_redacted_at,
      redaction_reason: row.redaction_reason
    });
  }
}
