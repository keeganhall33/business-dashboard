export type EntityAliasTypeV1 =
  | "canonical_variant"
  | "acronym"
  | "legal_name"
  | "common_name"
  | "brand_name"
  | "manual";

export type EntityAliasV1 = {
  alias_id: string;
  canonical_entity_id: string;

  alias: string;
  alias_type: EntityAliasTypeV1;

  confidence_json: Record<string, unknown>;
  provenance_json: Record<string, unknown>;

  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
  last_verified_at: string | null; // ISO-8601
};
