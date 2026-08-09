import crypto from "node:crypto";

import type { EntityRelationshipTypeV1, EntityRelationshipV1 } from "@/lib/external-intelligence/entities/entity-relationship-v1";
import { getExternalIntelligenceSupabaseClient, type SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class EntityRelationshipRepositoryV1 {
  constructor(private readonly deps?: { client?: SupabaseServerClient }) {}

  private get client(): SupabaseServerClient {
    return getExternalIntelligenceSupabaseClient({ client: this.deps?.client });
  }

  generateRelationshipId(): string {
    return `rel:${crypto.randomUUID()}`;
  }

  async create(input: {
    subject_entity_id: string;
    relationship_type: EntityRelationshipTypeV1;
    object_entity_id: string;
    valid_from?: string | null;
    valid_until?: string | null;
    confidence_json?: Record<string, unknown>;
    provenance_json?: Record<string, unknown>;
  }): Promise<EntityRelationshipV1> {
    const relationship_id = this.generateRelationshipId();

    const { data, error } = await this.client
      .from("entity_relationships_v1")
      .insert({
        relationship_id,
        subject_entity_id: input.subject_entity_id,
        relationship_type: input.relationship_type,
        object_entity_id: input.object_entity_id,
        valid_from: input.valid_from ?? null,
        valid_until: input.valid_until ?? null,
        confidence_json: input.confidence_json ?? {},
        provenance_json: input.provenance_json ?? {}
      })
      .select(
        "relationship_id,subject_entity_id,relationship_type,object_entity_id,valid_from,valid_until,confidence_json,provenance_json,created_at,updated_at"
      )
      .single();

    if (error) throw error;
    return data as unknown as EntityRelationshipV1;
  }
}
