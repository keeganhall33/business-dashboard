export type EntityRelationshipTypeV1 = "parent_of" | "subsidiary_of" | "brand_of" | "division_of" | "acquired_by";

export type EntityRelationshipV1 = {
  relationship_id: string;

  subject_entity_id: string;
  relationship_type: EntityRelationshipTypeV1;
  object_entity_id: string;

  valid_from: string | null; // ISO-8601
  valid_until: string | null; // ISO-8601

  confidence_json: Record<string, unknown>;
  provenance_json: Record<string, unknown>;

  created_at: string; // ISO-8601
  updated_at: string; // ISO-8601
};
