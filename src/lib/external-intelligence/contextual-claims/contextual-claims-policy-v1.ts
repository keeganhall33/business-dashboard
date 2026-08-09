import type { ClaimQualifierV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";

export const CONTEXTUAL_CLAIMS_POLICY_VERSION_V1 = "contextual_claims_v1.policy";

export const CONTEXTUAL_CLAIM_PREDICATES_V1 = ["classified_as", "provides_service_to"] as const;
export type ContextualClaimPredicateV1 = (typeof CONTEXTUAL_CLAIM_PREDICATES_V1)[number];

export const CLASSIFICATION_KINDS_V1 = ["organization_type", "business_domain"] as const;
export type ClassificationKindV1 = (typeof CLASSIFICATION_KINDS_V1)[number];

export const ORGANIZATION_TYPE_VALUES_V1 = [
  "company",
  "agency",
  "sports_organization",
  "league_or_tour",
  "team",
  "foundation",
  "charity",
  "institution",
  "retailer",
  "hospitality_business",
  "media_company",
  "event_organizer",
  "other"
] as const;
export type OrganizationTypeV1 = (typeof ORGANIZATION_TYPE_VALUES_V1)[number];

export const BUSINESS_DOMAIN_VALUES_V1 = [
  "sports",
  "entertainment",
  "music",
  "technology",
  "hospitality",
  "retail",
  "financial_services",
  "consumer_goods",
  "media",
  "professional_services",
  "other"
] as const;
export type BusinessDomainV1 = (typeof BUSINESS_DOMAIN_VALUES_V1)[number];

export const SERVICE_SCOPE_VALUES_V1 = [
  "digital_marketing",
  "content",
  "social_media",
  "creative",
  "brand_marketing",
  "campaign_strategy",
  "partnerships",
  "sponsorship",
  "experiential",
  "events",
  "public_relations",
  "media",
  "csr_philanthropy",
  "licensing",
  "other"
] as const;
export type ServiceScopeV1 = (typeof SERVICE_SCOPE_VALUES_V1)[number];

export type PredicateQualifierPolicyV1 = {
  predicate: ContextualClaimPredicateV1;
  required_qualifier_keys: string[];
  optional_qualifier_keys: string[];
  identity_qualifier_keys: string[];
};

export const CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1: Record<ContextualClaimPredicateV1, PredicateQualifierPolicyV1> = {
  classified_as: {
    predicate: "classified_as",
    required_qualifier_keys: ["classification_kind"],
    optional_qualifier_keys: ["source_label", "normalization_policy_version", "normalization_confidence"],
    identity_qualifier_keys: ["classification_kind"]
  },
  provides_service_to: {
    predicate: "provides_service_to",
    required_qualifier_keys: ["service_scope"],
    optional_qualifier_keys: ["service_scope_label", "normalization_policy_version", "normalization_confidence"],
    identity_qualifier_keys: ["service_scope"]
  }
};

export function getContextualClaimQualifierPolicyV1(predicate: string): PredicateQualifierPolicyV1 | null {
  if (predicate === "classified_as") return CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1.classified_as;
  if (predicate === "provides_service_to") return CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1.provides_service_to;
  return null;
}

export function assertAllowedQualifierKeysV1(input: { predicate: ContextualClaimPredicateV1; qualifiers: ClaimQualifierV2[] }) {
  const policy = CONTEXTUAL_CLAIM_QUALIFIER_POLICY_V1[input.predicate];
  const allowed = new Set([...policy.required_qualifier_keys, ...policy.optional_qualifier_keys]);
  const got = input.qualifiers.map((q) => q.key);

  for (const key of policy.required_qualifier_keys) {
    if (!got.includes(key)) throw new Error("missing_required_qualifier");
  }

  for (const k of got) {
    if (!allowed.has(k)) throw new Error("unexpected_qualifier_key");
  }
}
