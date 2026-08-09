import { z } from "zod";

import type { ClaimVerificationState } from "@/lib/external-intelligence/contracts/enums";

export const EXTERNAL_EVENT_TYPES_V1 = ["partnership_formed", "entity_appointed_to_role"] as const;
export type ExternalEventTypeV1 = (typeof EXTERNAL_EVENT_TYPES_V1)[number];

export type EventParticipantV1 = {
  role: string;
  entity_ref: unknown; // Snapshot of immutable Claim EntityRef payload.
};

export type EventTimesV1 = {
  announcement_time: string | null; // ISO-8601
  event_time: string | null; // ISO-8601
  retrieved_at: string | null; // ISO-8601 (provenance/processing time; excluded from fingerprint)
  effective_from: string | null; // ISO-8601
  effective_until: string | null; // ISO-8601
};

export type EventAttributeV1 = { key: string; value: string };

export type ExternalEventV1 = {
  schema_version: "external_event_v1";

  event_id: string;
  event_type: ExternalEventTypeV1;

  participants: EventParticipantV1[];
  attributes: EventAttributeV1[];
  times: EventTimesV1;

  verification_state: ClaimVerificationState;
  extraction_confidence: {
    level: "high" | "medium" | "low";
    reasons: string[];
  };

  policy_version: string;
};

export const EventAttributeV1Schema = z
  .object({
    key: z.string().min(1).max(64),
    value: z.string().min(1).max(512)
  })
  .strict();

export const EventTimesV1Schema = z
  .object({
    announcement_time: z.string().datetime({ offset: true }).nullable(),
    event_time: z.string().datetime({ offset: true }).nullable(),
    retrieved_at: z.string().datetime({ offset: true }).nullable(),
    effective_from: z.string().datetime({ offset: true }).nullable(),
    effective_until: z.string().datetime({ offset: true }).nullable()
  })
  .strict();

export const EventParticipantV1Schema = z
  .object({
    role: z.string().min(1).max(64),
    // Claim EntityRef snapshots already have their own schema; we intentionally do not
    // enforce it here to avoid coupling Event persistence to entity-resolution evolution.
    entity_ref: z.unknown()
  })
  .strict();

export const ExternalEventV1Schema = z
  .object({
    schema_version: z.literal("external_event_v1"),
    event_id: z.string().min(1),
    event_type: z.enum(EXTERNAL_EVENT_TYPES_V1),
    participants: z.array(EventParticipantV1Schema).min(2),
    attributes: z.array(EventAttributeV1Schema),
    times: EventTimesV1Schema,
    verification_state: z.enum(["unverified", "developing", "corroborated", "contradicted", "corrected", "retracted"]),
    extraction_confidence: z
      .object({
        level: z.enum(["high", "medium", "low"]),
        reasons: z.array(z.string())
      })
      .strict(),
    policy_version: z.string().min(1)
  })
  .strict();

export type EventVersionRefV1 = {
  object_type: "event";
  event_id: string;
  content_hash: string;
  schema_version: "external_event_v1";
  policy_version: string;
  created_at: string;
};
