import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";
import type { ExternalSourceClassV1 } from "@/lib/external-intelligence/targeted-research/targeted-research-contracts-v1";

export const PROGRAM_SURFACE_POLICY_VERSION_V1 = "program_surface_v1.policy";

export const PROGRAM_SURFACE_PREDICATES_V1 = [
  "operates_event_program",
  "runs_partner_activations",
  "offers_vip_hospitality",
  "runs_relationship_recognition",
  "operates_physical_environment",
  "runs_philanthropy_program",
  "operates_merchandising",
  "operates_licensing",
  "operates_retail_distribution",
  "runs_art_culture_design_program",
  "runs_commemoration_program"
] as const;

export type ProgramSurfacePredicateV1 = (typeof PROGRAM_SURFACE_PREDICATES_V1)[number];

export const RECURRENCE_VALUES_V1 = ["annual", "periodic"] as const;
export type RecurrenceV1 = (typeof RECURRENCE_VALUES_V1)[number];

export const OPERATION_RELATION_VALUES_V1 = ["owned", "operated"] as const;
export type OperationRelationV1 = (typeof OPERATION_RELATION_VALUES_V1)[number];

export const EVENT_PROGRAM_TYPE_VALUES_V1 = ["tour", "tournament_series", "event_series", "experience_series"] as const;
export type EventProgramTypeV1 = (typeof EVENT_PROGRAM_TYPE_VALUES_V1)[number];

export const PARTNER_ACTIVATION_TYPE_VALUES_V1 = [
  "branded_experience",
  "campaign_integration",
  "sponsor_programming",
  "partner_programming"
] as const;
export type PartnerActivationTypeV1 = (typeof PARTNER_ACTIVATION_TYPE_VALUES_V1)[number];

export const VIP_HOSPITALITY_TYPE_VALUES_V1 = [
  "vip_packages",
  "hospitality_packages",
  "membership_program",
  "premium_guest_program"
] as const;
export type VipHospitalityTypeV1 = (typeof VIP_HOSPITALITY_TYPE_VALUES_V1)[number];

export const RELATIONSHIP_RECOGNITION_TYPE_VALUES_V1 = [
  "partner_recognition",
  "client_gifting",
  "executive_recognition",
  "donor_member_recognition",
  "talent_gifting",
  "commemorative_gifting",
  "award_recognition"
] as const;
export type RelationshipRecognitionTypeV1 = (typeof RELATIONSHIP_RECOGNITION_TYPE_VALUES_V1)[number];

export const PHYSICAL_ENVIRONMENT_TYPE_VALUES_V1 = [
  "headquarters",
  "corporate_office",
  "sports_venue",
  "event_venue",
  "private_club",
  "hotel",
  "resort",
  "hospitality_property",
  "retail_space",
  "institutional_space",
  "museum_or_gallery",
  "public_space"
] as const;
export type PhysicalEnvironmentTypeV1 = (typeof PHYSICAL_ENVIRONMENT_TYPE_VALUES_V1)[number];

export const PHILANTHROPY_PROGRAM_TYPE_VALUES_V1 = [
  "foundation",
  "charity_program",
  "social_impact_program",
  "fundraising_program"
] as const;
export type PhilanthropyProgramTypeV1 = (typeof PHILANTHROPY_PROGRAM_TYPE_VALUES_V1)[number];

export const MERCHANDISING_TYPE_VALUES_V1 = ["official_shop", "merchandise_line", "collectibles"] as const;
export type MerchandisingTypeV1 = (typeof MERCHANDISING_TYPE_VALUES_V1)[number];

export const LICENSING_TYPE_VALUES_V1 = ["brand_ip_licensing", "product_licensing", "content_media_licensing"] as const;
export type LicensingTypeV1 = (typeof LICENSING_TYPE_VALUES_V1)[number];

export const RETAIL_DISTRIBUTION_TYPE_VALUES_V1 = [
  "retail_channels",
  "wholesale",
  "marketplace",
  "distribution_partnerships"
] as const;
export type RetailDistributionTypeV1 = (typeof RETAIL_DISTRIBUTION_TYPE_VALUES_V1)[number];

export const ART_CULTURE_DESIGN_PROGRAM_TYPE_VALUES_V1 = [
  "art_commissions",
  "exhibitions",
  "cultural_partnerships",
  "design_initiatives",
  "artist_collabs"
] as const;
export type ArtCultureDesignProgramTypeV1 = (typeof ART_CULTURE_DESIGN_PROGRAM_TYPE_VALUES_V1)[number];

export const COMMEMORATION_PROGRAM_TYPE_VALUES_V1 = [
  "awards_program",
  "induction_program",
  "recognition_program",
  "legacy_program"
] as const;
export type CommemorationProgramTypeV1 = (typeof COMMEMORATION_PROGRAM_TYPE_VALUES_V1)[number];

export type ProgramSurfaceObjectValueV1 =
  | EventProgramTypeV1
  | PartnerActivationTypeV1
  | VipHospitalityTypeV1
  | RelationshipRecognitionTypeV1
  | PhysicalEnvironmentTypeV1
  | PhilanthropyProgramTypeV1
  | MerchandisingTypeV1
  | LicensingTypeV1
  | RetailDistributionTypeV1
  | ArtCultureDesignProgramTypeV1
  | CommemorationProgramTypeV1;

export type ProgramSurfaceEvidenceDomainV1 = "EXTERNAL" | "FIRST_PARTY";

export type ProgramSurfacePredicatePolicyV1 = {
  predicate: ProgramSurfacePredicateV1;
  allowed_object_values: readonly string[];
  required_qualifier_keys: string[];
  optional_qualifier_keys: string[];
  identity_qualifier_keys: string[];
  require_high_confidence_for_persistence: true;
  allowed_evidence_domains: ProgramSurfaceEvidenceDomainV1[];
  allowed_external_source_classes: ExternalSourceClassV1[];
  event_boundary_notes: string;
  rejection_examples: string[];
};

export const PROGRAM_SURFACE_PREDICATE_POLICY_V1: Record<ProgramSurfacePredicateV1, ProgramSurfacePredicatePolicyV1> = {
  operates_event_program: {
    predicate: "operates_event_program",
    allowed_object_values: EVENT_PROGRAM_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: ["recurrence"],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_EVENT_PAGE", "OFFICIAL_WEBSITE", "AUTHORITATIVE_TRADE"],
    event_boundary_notes: "Program surface only. One-off hosted event belongs in Events, not operates_event_program.",
    rejection_examples: ["Hosted a tournament once", "Event announcement for a single date"]
  },
  runs_partner_activations: {
    predicate: "runs_partner_activations",
    allowed_object_values: PARTNER_ACTIVATION_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_PARTNER_PAGE", "OFFICIAL_WEBSITE", "AUTHORITATIVE_TRADE"],
    event_boundary_notes: "Requires activation behavior evidence (campaign/integration/programming). Partner roster alone is insufficient.",
    rejection_examples: ["Official partners include X/Y/Z (roster only)"]
  },
  offers_vip_hospitality: {
    predicate: "offers_vip_hospitality",
    allowed_object_values: VIP_HOSPITALITY_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_EVENT_PAGE", "OFFICIAL_WEBSITE", "OFFICIAL_NEWSROOM"],
    event_boundary_notes: "Must describe an offering/program (VIP packages, hospitality, membership). Mere VIP attendance is not enough.",
    rejection_examples: ["VIPs attended the event (no offering described)"]
  },
  runs_relationship_recognition: {
    predicate: "runs_relationship_recognition",
    allowed_object_values: RELATIONSHIP_RECOGNITION_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OFFICIAL_NEWSROOM", "AUTHORITATIVE_TRADE"],
    event_boundary_notes: "Often private. Persist only when explicitly evidenced. Bounded web research failure is not absence.",
    rejection_examples: ["They have clients/partners (no recognition mechanism)", "They value relationships (marketing)"]
  },
  operates_physical_environment: {
    predicate: "operates_physical_environment",
    allowed_object_values: PHYSICAL_ENVIRONMENT_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: ["operation_relation"],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OFFICIAL_EVENT_PAGE", "AUTHORITATIVE_TRADE"],
    event_boundary_notes: "Must mean operational control (owned/operated). Hosting an event at a third-party venue must not qualify.",
    rejection_examples: ["Held a tournament at Arena X (no operational control)", "hosts_in is prohibited"]
  },
  runs_philanthropy_program: {
    predicate: "runs_philanthropy_program",
    allowed_object_values: PHILANTHROPY_PROGRAM_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OFFICIAL_NEWSROOM", "AUTHORITATIVE_TRADE", "HIGH_QUALITY_NEWS"],
    event_boundary_notes: "Program surface only. A single dated fundraiser/campaign is an Event and must not be normalized into runs_philanthropy_program.",
    rejection_examples: ["One fundraising campaign (single dated occurrence)"]
  },
  operates_merchandising: {
    predicate: "operates_merchandising",
    allowed_object_values: MERCHANDISING_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OTHER_PUBLIC"],
    event_boundary_notes: "Requires an actual merchandising surface (e.g., official shop).",
    rejection_examples: ["Fans wear merch (no shop/surface)"]
  },
  operates_licensing: {
    predicate: "operates_licensing",
    allowed_object_values: LICENSING_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "AUTHORITATIVE_TRADE", "HIGH_QUALITY_NEWS"],
    event_boundary_notes: "Requires explicit licensing surface (official licensing page or equivalent).",
    rejection_examples: ["They sell products (not licensing)"]
  },
  operates_retail_distribution: {
    predicate: "operates_retail_distribution",
    allowed_object_values: RETAIL_DISTRIBUTION_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "AUTHORITATIVE_TRADE", "HIGH_QUALITY_NEWS", "OTHER_PUBLIC"],
    event_boundary_notes: "Distinct from merchandising; represents distribution/retail channels.",
    rejection_examples: ["They have an online shop only (merchandising, not distribution)"]
  },
  runs_art_culture_design_program: {
    predicate: "runs_art_culture_design_program",
    allowed_object_values: ART_CULTURE_DESIGN_PROGRAM_TYPE_VALUES_V1,
    required_qualifier_keys: [],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OFFICIAL_NEWSROOM", "AUTHORITATIVE_TRADE", "HIGH_QUALITY_NEWS"],
    event_boundary_notes: "Must be explicit program (commissions/exhibitions/design initiatives), not generic branding.",
    rejection_examples: ["Creative brand language only"]
  },
  runs_commemoration_program: {
    predicate: "runs_commemoration_program",
    allowed_object_values: COMMEMORATION_PROGRAM_TYPE_VALUES_V1,
    required_qualifier_keys: ["recurrence"],
    optional_qualifier_keys: [],
    identity_qualifier_keys: [],
    require_high_confidence_for_persistence: true,
    allowed_evidence_domains: ["EXTERNAL", "FIRST_PARTY"],
    allowed_external_source_classes: ["OFFICIAL_WEBSITE", "OFFICIAL_NEWSROOM", "AUTHORITATIVE_TRADE", "HIGH_QUALITY_NEWS"],
    event_boundary_notes: "Recurring program only. One-time anniversaries/openings/championships are Events, not this predicate.",
    rejection_examples: ["50th anniversary celebration (one-time)"]
  }
} as const;

export function getProgramSurfacePredicatePolicyV1(predicate: string): ProgramSurfacePredicatePolicyV1 | null {
  return (PROGRAM_SURFACE_PREDICATE_POLICY_V1 as Record<string, ProgramSurfacePredicatePolicyV1 | undefined>)[predicate] ?? null;
}

export function assertAllowedQualifierKeysProgramSurfaceV1(input: {
  predicate: ProgramSurfacePredicateV1;
  qualifiers: ClaimQualifierV2[];
}) {
  const policy = PROGRAM_SURFACE_PREDICATE_POLICY_V1[input.predicate];
  const allowed = new Set([...policy.required_qualifier_keys, ...policy.optional_qualifier_keys]);
  const got = input.qualifiers.map((q) => q.key);

  for (const key of policy.required_qualifier_keys) {
    if (!got.includes(key)) throw new Error("missing_required_qualifier");
  }

  for (const k of got) {
    if (!allowed.has(k)) throw new Error("unexpected_qualifier_key");
  }
}

export function assertProgramSurfaceObjectAllowedV1(input: {
  predicate: ProgramSurfacePredicateV1;
  object_value: string;
}) {
  const policy = PROGRAM_SURFACE_PREDICATE_POLICY_V1[input.predicate];
  if (input.object_value === "unknown") throw new Error("unknown_object_value_prohibited");
  if (!policy.allowed_object_values.includes(input.object_value)) throw new Error("invalid_object_value");
}

export function assertProgramSurfaceSourceEligibleV1(input: {
  predicate: ProgramSurfacePredicateV1;
  evidence_domain: ProgramSurfaceEvidenceDomainV1;
  external_source_class: ExternalSourceClassV1;
}) {
  const policy = PROGRAM_SURFACE_PREDICATE_POLICY_V1[input.predicate];
  if (!policy.allowed_evidence_domains.includes(input.evidence_domain)) throw new Error("evidence_domain_not_allowed");

  if (input.evidence_domain === "FIRST_PARTY") return;

  if (!policy.allowed_external_source_classes.includes(input.external_source_class)) {
    throw new Error("source_class_not_allowed");
  }

  if (input.external_source_class === "UNKNOWN") throw new Error("unknown_source_class_not_allowed");
}

export function assertProgramSurfaceQualifierValuesV1(input: {
  predicate: ProgramSurfacePredicateV1;
  qualifiers: ClaimQualifierV2[];
}) {
  for (const q of input.qualifiers) {
    if (q.key === "recurrence") {
      if (q.value_type !== "string") throw new Error("invalid_recurrence_value_type");
      if (!(RECURRENCE_VALUES_V1 as readonly string[]).includes(q.value)) throw new Error("invalid_recurrence_value");
    }

    if (q.key === "operation_relation") {
      if (q.value_type !== "string") throw new Error("invalid_operation_relation_value_type");
      if (!(OPERATION_RELATION_VALUES_V1 as readonly string[]).includes(q.value)) {
        throw new Error("invalid_operation_relation_value");
      }
      if (q.value === "hosts_in") throw new Error("hosts_in_prohibited");
    }
  }
}

