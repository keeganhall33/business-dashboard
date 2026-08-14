import { z } from "zod";

// #299A foundation: deterministic, draft/test-only campaign definitions.
// No live send wiring, no invented economics, no external calls.

export const CAMPAIGN_DEFINITION_SCHEMA_VERSION_V1 = "campaign_definition_v1" as const;

export const CampaignStateV1Schema = z.enum(["DRAFT", "TEST"]);
export type CampaignStateV1 = z.infer<typeof CampaignStateV1Schema>;

export const CampaignClassV1Schema = z.enum([
  "WELCOME_PREFERENCE_DISCOVERY",
  "REPEAT_BUYER_NURTURE"
]);
export type CampaignClassV1 = z.infer<typeof CampaignClassV1Schema>;

export const CtaClassV1Schema = z.enum(["VIEW_COLLECTION", "TAKE_QUIZ", "READ_STORY", "SHOP_PRINTS"]);
export type CtaClassV1 = z.infer<typeof CtaClassV1Schema>;

export const OfferClassV1Schema = z.enum(["NONE", "EDUCATIONAL", "COLLECTOR_EDITION", "PRINT_DROP"]);
export type OfferClassV1 = z.infer<typeof OfferClassV1Schema>;

export const ReadinessStateV1Schema = z.enum(["NEEDS_CREATIVE", "NEEDS_COPY_REVIEW", "READY_FOR_TEST"]);
export type ReadinessStateV1 = z.infer<typeof ReadinessStateV1Schema>;

export const CampaignDefinitionV1Schema = z
  .object({
    schema_version: z.literal(CAMPAIGN_DEFINITION_SCHEMA_VERSION_V1),

    campaign_id: z.string().min(3).max(64),
    campaign_version: z.string().min(1).max(32),
    campaign_class: CampaignClassV1Schema,

    state: CampaignStateV1Schema,
    live_send_enabled: z.literal(false),

    audience_summary: z.string().min(1).max(300),
    eligibility_summary: z.string().min(1).max(300),

    subject_line: z.string().min(1).max(120),
    preview_text: z.string().min(1).max(160),

    body_plaintext: z.string().min(1).max(4000),
    cta: z
      .object({
        cta_class: CtaClassV1Schema,
        label: z.string().min(1).max(60)
      })
      .strict(),

    creative_reference_rule: z.string().min(1).max(220),
    offer_class: OfferClassV1Schema,

    trigger: z
      .object({
        trigger_class: z.enum(["ON_SIGNUP", "AFTER_PURCHASE"]),
        trigger_summary: z.string().min(1).max(220)
      })
      .strict(),

    schedule: z
      .object({
        delays: z
          .array(
            z
              .object({
                step: z.string().min(1).max(64),
                delay_hours: z.number().int().min(0).max(24 * 14)
              })
              .strict()
          )
          .min(1),
        send_window: z
          .object({
            tz: z.string().min(1).max(64),
            start_hour_local: z.number().int().min(0).max(23),
            end_hour_local: z.number().int().min(0).max(23)
          })
          .strict(),
        max_touches: z.number().int().min(1).max(12)
      })
      .strict(),

    suppression_and_frequency: z.string().min(1).max(300),
    goals: z.array(z.string().min(1).max(160)).min(1),
    exits: z.array(z.string().min(1).max(160)).min(1),

    unresolved_assumptions: z.array(z.string().min(1).max(200)).default([]),
    readiness_state: ReadinessStateV1Schema
  })
  .strict();

export type CampaignDefinitionV1 = z.infer<typeof CampaignDefinitionV1Schema>;

