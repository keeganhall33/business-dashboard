import type { ClaimQualifierValueTypeV2 } from "@/lib/external-intelligence/contracts/claim-qualifiers-v2";

export type PredicateQualifierPolicyV2 = {
  predicate: string;
  allowed_keys: readonly string[];
  required_keys: readonly string[];
  identity_keys: readonly string[];
  allowed_value_types_by_key: Record<string, readonly ClaimQualifierValueTypeV2[]>;
  allow_null: boolean;
};

export const APPOINTED_QUALIFIER_POLICY_V2: PredicateQualifierPolicyV2 = Object.freeze({
  predicate: "appointed",
  allowed_keys: ["appointment_role"],
  required_keys: ["appointment_role"],
  identity_keys: ["appointment_role"],
  allowed_value_types_by_key: {
    appointment_role: ["string"] as const
  },
  allow_null: false
});

export function getPredicateQualifierPolicyV2(predicate: string): PredicateQualifierPolicyV2 | null {
  if (predicate === APPOINTED_QUALIFIER_POLICY_V2.predicate) return APPOINTED_QUALIFIER_POLICY_V2;
  return null;
}
