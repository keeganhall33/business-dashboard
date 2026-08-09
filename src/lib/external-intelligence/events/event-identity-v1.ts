import crypto from "node:crypto";

import type { ExternalEventV1, ExternalEventTypeV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { EVENT_TYPE_POLICIES_V1 } from "@/lib/external-intelligence/events/event-type-policy-v1";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function dayKey(iso: string): string {
  // Deterministic day granularity (UTC date portion).
  return iso.slice(0, 10);
}

export type EventIdentityPolicyV1 = {
  // precedence: event_time > announcement_time
  date_key_precedence: Array<"event_time" | "announcement_time">;
};

export const DEFAULT_EVENT_IDENTITY_POLICY_V1: EventIdentityPolicyV1 = {
  date_key_precedence: ["event_time", "announcement_time"]
};

function getDateKey(input: { times: ExternalEventV1["times"]; policy: EventIdentityPolicyV1 }): string | null {
  for (const k of input.policy.date_key_precedence) {
    const v = input.times[k];
    if (v) return dayKey(v);
  }
  return null;
}

function getParticipantId(event: ExternalEventV1, role: string): string {
  const p = event.participants.find((x) => x.role === role);
  const ref = p?.entity_ref as unknown as { entity_id?: unknown };
  const id = String(ref?.entity_id ?? "");
  if (!id) throw new Error(`missing_participant_entity_id:${role}`);
  return id;
}

function getAttributeValue(event: ExternalEventV1, key: string): string {
  const v = event.attributes.find((a) => a.key === key)?.value ?? "";
  const n = normalizeWhitespace(v);
  if (!n) throw new Error(`missing_required_attribute:${key}`);
  return n;
}

/**
 * Deterministic provisional event identity.
 *
 * - MUST NOT include retrieved_at.
 * - Partnership is symmetric: parties are sorted.
 * - Appointment is directional: do not sort roles.
 */
export function computeProvisionalEventIdV1(input: {
  event_type: ExternalEventTypeV1;
  event: ExternalEventV1;
  identity_policy?: EventIdentityPolicyV1;
}): string {
  const policy = EVENT_TYPE_POLICIES_V1[input.event_type];
  const datePolicy = input.identity_policy ?? DEFAULT_EVENT_IDENTITY_POLICY_V1;
  const dateKey = getDateKey({ times: input.event.times, policy: datePolicy });

  const participantIds = policy.required_participant_roles.map((r) => getParticipantId(input.event, r));

  const canonicalParticipantIds = policy.symmetric_participants ? [...participantIds].sort() : participantIds;

  const identityAttributes = policy.identity_attribute_keys.map((k) => ({ key: k, value: getAttributeValue(input.event, k) }));

  const identity = {
    v: "provisional_event_v1",
    event_type: input.event_type,
    participants: canonicalParticipantIds,
    attributes: identityAttributes,
    date_key: dateKey
  };

  const hash = sha256Hex(JSON.stringify(identity));
  return `provisional_event:${input.event_type}:${hash.slice(0, 24)}`;
}
