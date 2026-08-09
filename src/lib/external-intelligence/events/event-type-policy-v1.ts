import { z } from "zod";

import { EXTERNAL_EVENT_TYPES_V1, type ExternalEventTypeV1 } from "@/lib/external-intelligence/contracts/external-event-v1";

export type EventTypePolicyV1 = {
  event_type: ExternalEventTypeV1;

  required_participant_roles: string[];

  required_attribute_keys: string[];
  identity_attribute_keys: string[];

  // When true, participant roles are treated as symmetric for identity purposes.
  symmetric_participants: boolean;
};

export const EventTypePolicyV1Schema = z
  .object({
    event_type: z.enum(EXTERNAL_EVENT_TYPES_V1),
    required_participant_roles: z.array(z.string().min(1)).min(2),
    required_attribute_keys: z.array(z.string().min(1)),
    identity_attribute_keys: z.array(z.string().min(1)),
    symmetric_participants: z.boolean()
  })
  .strict();

export const EVENT_TYPE_POLICIES_V1: Record<ExternalEventTypeV1, EventTypePolicyV1> = {
  partnership_formed: {
    event_type: "partnership_formed",
    required_participant_roles: ["party_a", "party_b"],
    required_attribute_keys: [],
    identity_attribute_keys: [],
    symmetric_participants: true
  },
  entity_appointed_to_role: {
    event_type: "entity_appointed_to_role",
    required_participant_roles: ["appointing_entity", "appointed_entity"],
    required_attribute_keys: ["appointment_role"],
    identity_attribute_keys: ["appointment_role"],
    symmetric_participants: false
  }
} as const;
