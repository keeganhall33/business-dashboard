export type EntityResolutionLinkStatusV1 = "resolved" | "suggested" | "rejected" | "ambiguous";

export type EntityResolutionMethodV1 =
  | "manual_confirm_same"
  | "manual_keep_separate"
  | "manual_confirm_alias"
  | "verified_external_identifier"
  | "verified_official_domain"
  | "verified_official_profile"
  | "source_native_id"
  | "name_normalization_suggest";

export type EntityResolutionLinkV1 = {
  link_id: string;

  provisional_entity_id: string;
  canonical_entity_id: string;

  status: EntityResolutionLinkStatusV1;
  confidence_json: Record<string, unknown>;
  resolution_method: EntityResolutionMethodV1 | string;
  provenance_json: Record<string, unknown>;

  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
};
