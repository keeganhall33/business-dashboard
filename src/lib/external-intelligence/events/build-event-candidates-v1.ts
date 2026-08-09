import type { Claim } from "@/lib/external-intelligence/contracts/claim";
import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { ExternalEventV1, ExternalEventTypeV1, EventAttributeV1, EventParticipantV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { ExternalEventV1Schema } from "@/lib/external-intelligence/contracts/external-event-v1";
import { canonicalizeClaimQualifiersV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import { computeProvisionalEventIdV1 } from "@/lib/external-intelligence/events/event-identity-v1";

const EVENT_POLICY_VERSION_V1 = "event_v1.policy";

type ClaimV2Like = Claim & { schema_version: "claim_v2"; qualifiers: Array<{ key: string; value: unknown }> };

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function asEntityRefSnapshot(v: unknown): EntityRef {
  return v as EntityRef;
}

function getObjectEntityRef(claim: Claim): EntityRef {
  const obj = claim.object as unknown as { kind?: unknown; entity?: unknown };
  if (obj?.kind !== "entity") throw new Error("precondition_failed:expected_object_entity");
  return asEntityRefSnapshot(obj.entity);
}

function buildBase(input: {
  event_type: ExternalEventTypeV1;
  participants: EventParticipantV1[];
  attributes: EventAttributeV1[];
  claim: Claim;
}): ExternalEventV1 {
  const draft: ExternalEventV1 = {
    schema_version: "external_event_v1",
    event_id: "pending",
    event_type: input.event_type,
    participants: input.participants,
    attributes: input.attributes,
    times: {
      announcement_time: input.claim.announcement_time,
      event_time: input.claim.event_time,
      retrieved_at: input.claim.retrieved_at,
      effective_from: null,
      effective_until: null
    },
    verification_state: input.claim.verification_state,
    extraction_confidence: input.claim.extraction_confidence,
    policy_version: EVENT_POLICY_VERSION_V1
  };

  const event_id = computeProvisionalEventIdV1({ event_type: input.event_type, event: { ...draft, event_id: "pending" } });
  const withId: ExternalEventV1 = { ...draft, event_id };
  return ExternalEventV1Schema.parse(withId);
}

export function buildEventCandidatesFromClaimV1(input: { claim: Claim }): ExternalEventV1[] {
  const c = input.claim;

  // Supported predicates only.
  if (c.predicate === "partnered_with") {
    const subject = asEntityRefSnapshot(c.subject);
    const object = getObjectEntityRef(c);

    const ev = buildBase({
      event_type: "partnership_formed",
      participants: [
        { role: "party_a", entity_ref: subject },
        { role: "party_b", entity_ref: object }
      ],
      attributes: [],
      claim: c
    });

    return [ev];
  }

  if (c.predicate === "appointed") {
    // Appointment exists only in Claim V2, but keep guard for safety.
    const subject = asEntityRefSnapshot(c.subject);
    const object = getObjectEntityRef(c);

    const qualifiers = c.schema_version === "claim_v2" ? canonicalizeClaimQualifiersV2((c as ClaimV2Like).qualifiers ?? []) : [];
    const role = qualifiers.find((q) => q.key === "appointment_role")?.value ?? "";
    const appointment_role = normalizeWhitespace(String(role));

    if (!appointment_role) return [];

    const ev = buildBase({
      event_type: "entity_appointed_to_role",
      participants: [
        { role: "appointing_entity", entity_ref: subject },
        { role: "appointed_entity", entity_ref: object }
      ],
      attributes: [{ key: "appointment_role", value: appointment_role }],
      claim: c
    });

    return [ev];
  }

  return [];
}
