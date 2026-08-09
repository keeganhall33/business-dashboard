import crypto from "node:crypto";
import { z } from "zod";

import type { EventVersionRefV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { EXTERNAL_EVENT_TYPES_V1 } from "@/lib/external-intelligence/contracts/external-event-v1";

export const OPPORTUNITY_TYPES_V1 = ["agency_relationship_signal"] as const;
export type OpportunityTypeV1 = (typeof OPPORTUNITY_TYPES_V1)[number];

export const DETECTOR_CLASSIFICATIONS_V1 = [
  "CLEAR",
  "PLAUSIBLE_NEEDS_CONTEXT",
  "REJECTED_NO_OPPORTUNITY"
] as const;
export type DetectorClassificationV1 = (typeof DETECTOR_CLASSIFICATIONS_V1)[number];

export const FUNCTIONAL_RELEVANCE_V1 = [
  "marketing",
  "brand_marketing",
  "partnerships",
  "sponsorship_activation",
  "experiential_events",
  "creative_content",
  "csr_philanthropy",
  "licensing_merch",
  "finance_accounting",
  "tax_audit",
  "it_security",
  "hr_ops",
  "unknown"
] as const;
export type FunctionalRelevanceV1 = (typeof FUNCTIONAL_RELEVANCE_V1)[number];

export const OPPORTUNITY_REASON_CODES_V1 = [
  "relevant_marketing_appointment",
  "relevant_brand_marketing_appointment",
  "relevant_partnerships_appointment",
  "relevant_experiential_appointment",
  "relevant_creative_content_appointment",
  "relevant_csr_philanthropy_appointment",
  "relevant_licensing_merch_appointment",
  "irrelevant_function",
  "function_unresolved",
  "partnership_requires_context",
  "unsupported_event_type",
  "missing_appointment_role"
] as const;
export type OpportunityReasonCodeV1 = (typeof OPPORTUNITY_REASON_CODES_V1)[number];

export type OpportunityDerivedSignalV1 =
  | { key: "appointment_role"; value: string }
  | { key: "functional_relevance"; value: FunctionalRelevanceV1 }
  | { key: "relationship_pattern"; value: "agency_or_service_provider_appointment" };

export type OpportunityMissingIntelligenceCategoryV1 =
  | "organization_business_context"
  | "agency_scope"
  | "experiential_scope"
  | "partnership_scope"
  | "philanthropy_scope"
  | "art_or_cultural_fit"
  | "existing_relationship"
  | "existing_project_history"
  | "relevant_person"
  | "planning_window"
  | "commercial_model_fit";

export type EntityRefSnapshotV1 = {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
};

export type OpportunityCandidateV1 = {
  opportunity_candidate_id: string;
  opportunity_type: OpportunityTypeV1;

  detector_classification: DetectorClassificationV1;

  focal_entity_refs: EntityRefSnapshotV1[];
  context_entity_refs: EntityRefSnapshotV1[];

  relevant_functions: FunctionalRelevanceV1[];

  hypothesis: string;
  reason_codes: OpportunityReasonCodeV1[];
  derived_signals: OpportunityDerivedSignalV1[];
  assumptions: string[];
  missing_intelligence: OpportunityMissingIntelligenceCategoryV1[];

  trigger_event_version_refs: Array<Pick<EventVersionRefV1, "event_id" | "content_hash" | "schema_version" | "policy_version">>;
  detector_policy_version: string;
  detected_at: string; // ISO-8601

  relevance_window: { start: string | null; end: string | null } | null;
};

export const EntityRefSnapshotV1Schema = z
  .object({
    entity_id: z.string().min(1),
    entity_type: z.string().min(1),
    canonical_name: z.string().min(1)
  })
  .strict();

export const OpportunityCandidateV1Schema = z
  .object({
    opportunity_candidate_id: z.string().min(1),
    opportunity_type: z.enum(OPPORTUNITY_TYPES_V1),
    detector_classification: z.enum(DETECTOR_CLASSIFICATIONS_V1),

    focal_entity_refs: z.array(EntityRefSnapshotV1Schema).min(1),
    context_entity_refs: z.array(EntityRefSnapshotV1Schema).min(1),

    relevant_functions: z.array(z.enum(FUNCTIONAL_RELEVANCE_V1)),

    hypothesis: z.string().min(1),
    reason_codes: z.array(z.enum(OPPORTUNITY_REASON_CODES_V1)),
    derived_signals: z.array(z.unknown()),
    assumptions: z.array(z.string()),
    missing_intelligence: z.array(z.string()),

    trigger_event_version_refs: z
      .array(
        z
          .object({
            event_id: z.string().min(1),
            content_hash: z.string().regex(/^[a-f0-9]{64}$/),
            schema_version: z.literal("external_event_v1"),
            policy_version: z.string().min(1)
          })
          .strict()
      )
      .min(1),

    detector_policy_version: z.string().min(1),
    detected_at: z.string().datetime({ offset: true }),

    relevance_window: z
      .object({
        start: z.string().datetime({ offset: true }).nullable(),
        end: z.string().datetime({ offset: true }).nullable()
      })
      .strict()
      .nullable()
  })
  .strict();

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stableSortStrings(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b));
}

export function computeOpportunityCandidateIdV1(input: {
  opportunity_type: OpportunityTypeV1;
  focal_entity_ids: string[];
  context_entity_ids: string[];
  relevant_function: FunctionalRelevanceV1;
  event_id: string;
}): string {
  const projection = {
    v: "oppcand_v1",
    opportunity_type: input.opportunity_type,
    focal_entity_ids: stableSortStrings(input.focal_entity_ids),
    context_entity_ids: stableSortStrings(input.context_entity_ids),
    relevant_function: input.relevant_function,
    event_id: input.event_id
  };
  const h = sha256Hex(JSON.stringify(projection));
  return `oppcand:${input.opportunity_type}:${h.slice(0, 24)}`;
}

export const SUPPORTED_EVENT_TYPES_FOR_V1 = EXTERNAL_EVENT_TYPES_V1;
