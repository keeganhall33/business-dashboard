import { deepFreeze } from "@/lib/external-intelligence/config/freeze";
import {
  CAMPAIGN_DEFINITION_SCHEMA_VERSION_V1,
  type CampaignDefinitionV1
} from "@/lib/lifecycle-marketing/campaign-definition-v1";

export const DRAFT_CAMPAIGNS_V1: CampaignDefinitionV1[] = deepFreeze([
  {
    schema_version: CAMPAIGN_DEFINITION_SCHEMA_VERSION_V1,
    campaign_id: "welcome_preference_discovery",
    campaign_version: "v1",
    campaign_class: "WELCOME_PREFERENCE_DISCOVERY",

    state: "DRAFT",
    live_send_enabled: false,

    audience_summary: "New subscribers who have not expressed collecting preferences yet.",
    eligibility_summary: "Triggered on signup; suppressed if the user has already completed preference discovery.",

    subject_line: "Welcome — what kind of work do you want to see next?",
    preview_text: "Two quick questions so I can send you the right pieces (draft/test only).",

    body_plaintext: [
      "Thanks for joining.",
      "\n",
      "I make hyper-realistic graphite originals and limited editions.",
      "\n",
      "If you tell me what you’re most interested in, I’ll send fewer emails — and only the work that fits.",
      "\n",
      "CTA: Take the collector preferences quiz (draft).",
      "\n",
      "— Keegan"
    ].join("\n"),
    cta: { cta_class: "TAKE_QUIZ", label: "Set my preferences" },

    creative_reference_rule: "NEEDS_CREATIVE: use a single hero image of a current graphite piece; no pricing/discount callouts.",
    offer_class: "EDUCATIONAL",

    trigger: { trigger_class: "ON_SIGNUP", trigger_summary: "Immediately after email signup (draft/test only)." },

    schedule: {
      delays: [
        { step: "welcome_email", delay_hours: 0 },
        { step: "preference_followup", delay_hours: 48 }
      ],
      send_window: { tz: "America/Los_Angeles", start_hour_local: 9, end_hour_local: 17 },
      max_touches: 2
    },

    suppression_and_frequency: "Suppress if user unsubscribed; suppress if preference quiz completed; max 2 touches in 14 days.",
    goals: ["Preference discovery", "Set expectations for limited work", "Drive qualified traffic to collection"],
    exits: ["Preference quiz completed", "Unsubscribed", "Bounced"],
    unresolved_assumptions: [
      "Preference quiz URL exists and is stable",
      "Preference completion signal is recorded"
    ],
    readiness_state: "NEEDS_CREATIVE"
  },
  {
    schema_version: CAMPAIGN_DEFINITION_SCHEMA_VERSION_V1,
    campaign_id: "repeat_buyer_nurture",
    campaign_version: "v1",
    campaign_class: "REPEAT_BUYER_NURTURE",

    state: "TEST",
    live_send_enabled: false,

    audience_summary: "Recent buyers (repeat buyers or high-intent collectors) eligible for nurture content.",
    eligibility_summary: "Triggered after a verified purchase; suppressed if another nurture sequence is active.",

    subject_line: "Collector update — what I’m drawing next",
    preview_text: "A behind-the-scenes note + what’s coming (draft/test only).",

    body_plaintext: [
      "Thank you again for collecting.",
      "\n",
      "This is a short studio update: what I’m working on next, why it matters, and when to watch for the next release.",
      "\n",
      "No discounts, no urgency gimmicks — just the work and the story.",
      "\n",
      "CTA: View the current collection (draft).",
      "\n",
      "— Keegan"
    ].join("\n"),
    cta: { cta_class: "VIEW_COLLECTION", label: "View the collection" },

    creative_reference_rule: "NEEDS_CREATIVE: include 1 studio photo + 1 close-up crop; avoid price anchoring.",
    offer_class: "NONE",

    trigger: { trigger_class: "AFTER_PURCHASE", trigger_summary: "24h after a verified purchase event (draft/test only)." },

    schedule: {
      delays: [
        { step: "post_purchase_thanks", delay_hours: 24 },
        { step: "studio_update", delay_hours: 168 }
      ],
      send_window: { tz: "America/Los_Angeles", start_hour_local: 9, end_hour_local: 17 },
      max_touches: 2
    },

    suppression_and_frequency: "Suppress if unsubscribed; suppress if purchase refunded; max 2 touches in 21 days.",
    goals: ["Increase repeat purchase intent", "Strengthen collector relationship", "Promote story-led collecting"],
    exits: ["Unsubscribed", "Bounced"],
    unresolved_assumptions: [
      "Purchase event signal exists in the system",
      "Refund/chargeback suppression signal exists"
    ],
    readiness_state: "NEEDS_COPY_REVIEW"
  }
]);

