import "@/lib/server-only";

import crypto from "node:crypto";

import type { ExternalEventV1, EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { ExternalEventV1Schema } from "@/lib/external-intelligence/contracts/external-event-v1";
import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import { getExternalIntelligenceSupabaseClient } from "@/lib/external-intelligence/persistence/supabase/client";
import { EXTERNAL_INTELLIGENCE_RPCS, runRpc } from "@/lib/external-intelligence/persistence/supabase/transactions";
import { computeEventContentHashV1, computeEventFingerprintV1, projectEventForFingerprintV1 } from "@/lib/external-intelligence/events/event-fingerprint-v1";

export class EventRepositoryV1 {
  generateSupportLinkId(): string {
    return `evcl:${crypto.randomUUID()}`;
  }

  async persistEventFromClaim(input: {
    event: ExternalEventV1;
    supporting_claim: { claim_id: string; claim_content_hash: string; claim: Claim };
    opts?: { client?: ReturnType<typeof getExternalIntelligenceSupabaseClient> };
  }): Promise<{
    event_ref: EventVersionRefV1;
    created_new_event: boolean;
    created_new_version: boolean;
    idempotent_replay: boolean;
    support_link_created: boolean;
  }> {
    const parsed = ExternalEventV1Schema.parse(input.event);

    const fingerprint = computeEventFingerprintV1(parsed);
    const content_hash = computeEventContentHashV1(parsed);

    // Deterministic content hash must match declared event id projection, but we do not
    // enforce a separate event_fingerprint field inside payload.
    void fingerprint;

    const supabase = getExternalIntelligenceSupabaseClient({ client: input.opts?.client });

    const link_id = this.generateSupportLinkId();

    const res = await runRpc<
      Array<{
        event_id: string;
        content_hash: string;
        created_new_event: boolean;
        created_new_version: boolean;
        idempotent_replay: boolean;
        support_link_created: boolean;
      }>
    >({
      client: supabase,
      fn: EXTERNAL_INTELLIGENCE_RPCS.persistEvent,
      args: {
        in_event_id: parsed.event_id,
        in_content_hash: content_hash,
        in_schema_version: parsed.schema_version,
        in_event_fingerprint: fingerprint,
        in_policy_version: parsed.policy_version,
        in_event_type: parsed.event_type,
        in_payload_json: projectEventForFingerprintV1(parsed),
        in_payload_available: true,
        in_announcement_time: parsed.times.announcement_time,
        in_event_time: parsed.times.event_time,
        in_effective_from: parsed.times.effective_from,
        in_effective_until: parsed.times.effective_until,
        in_verification_state: parsed.verification_state,
        in_lifecycle_status: "active",
        in_correction_status: "none",
        in_claim_id: input.supporting_claim.claim_id,
        in_claim_content_hash: input.supporting_claim.claim_content_hash,
        in_link_id: link_id
      }
    });

    const row = res[0];
    if (!row) throw new Error("unknown_db_error");

    const event_ref: EventVersionRefV1 = {
      object_type: "event",
      event_id: row.event_id,
      content_hash: row.content_hash,
      schema_version: "external_event_v1",
      policy_version: parsed.policy_version,
      created_at: new Date().toISOString()
    };

    return Object.freeze({
      event_ref: Object.freeze(event_ref),
      created_new_event: row.created_new_event,
      created_new_version: row.created_new_version,
      idempotent_replay: row.idempotent_replay,
      support_link_created: row.support_link_created
    });
  }
}
