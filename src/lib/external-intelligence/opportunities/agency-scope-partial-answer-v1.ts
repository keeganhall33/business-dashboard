import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { VersionRef } from "@/lib/external-intelligence/contracts/version-ref";

export type PartialAgencyScopeAnswerV1 = {
  status: "PARTIALLY_ANSWERED";
  appointment_role: string;
  supporting_claim_version_refs: VersionRef[];
};

export type AgencyScopeAnswerFromExistingClaimsV1 =
  | { status: "UNKNOWN"; supporting_claim_version_refs: [] }
  | PartialAgencyScopeAnswerV1;

/**
 * Read-only helper: recognizes existing appointed claims as partial scope context.
 *
 * Does not normalize into provides_service_to.
 * Does not create new claims.
 */
export function getAgencyScopeAnswerFromExistingClaimsV1(input: {
  claims: Array<{ stable: { claim_id: string; current_content_hash: string; schema_version: string; interpretation_policy_version: string }; payload: Claim }>;
  context_entity_id: string;
  focal_entity_id: string;
}): AgencyScopeAnswerFromExistingClaimsV1 {
  for (const c of input.claims) {
    if (c.payload.predicate !== "appointed") continue;
    const subj = c.payload.subject;
    const obj = c.payload.object;
    if (!subj || obj.kind !== "entity") continue;
    if (subj.entity_id !== input.context_entity_id) continue;
    if (obj.entity.entity_id !== input.focal_entity_id) continue;

    const appointment = (c.payload.schema_version === "claim_v2" ? c.payload.qualifiers ?? [] : []).find(
      (q) => q.key === "appointment_role" && q.value_type === "string"
    );
    const appointment_role = appointment?.value_type === "string" ? String(appointment.value) : null;
    if (!appointment_role) continue;

    const ref: VersionRef = {
      object_type: "claim",
      object_id: c.stable.claim_id,
      version_id: null,
      content_hash: c.stable.current_content_hash,
      schema_version: c.stable.schema_version,
      policy_version: c.stable.interpretation_policy_version,
      created_at: new Date().toISOString()
    };

    return {
      status: "PARTIALLY_ANSWERED",
      appointment_role,
      supporting_claim_version_refs: [Object.freeze(ref)]
    };
  }

  return { status: "UNKNOWN", supporting_claim_version_refs: [] };
}
