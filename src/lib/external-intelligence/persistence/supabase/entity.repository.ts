import crypto from "node:crypto";

import type { CanonicalEntityTypeV1, CanonicalEntityV1 } from "@/lib/external-intelligence/entities/entity-v1";
import { getExternalIntelligenceSupabaseClient, type SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class EntityRepositoryV1 {
  constructor(private readonly deps?: { client?: SupabaseServerClient }) {}

  private get client(): SupabaseServerClient {
    return getExternalIntelligenceSupabaseClient({ client: this.deps?.client });
  }

  generateEntityId(type: CanonicalEntityTypeV1): string {
    const uuid = crypto.randomUUID();
    return type === "organization" ? `org:${uuid}` : `person:${uuid}`;
  }

  async create(input: { entity_id: string; entity_type: CanonicalEntityTypeV1; canonical_name: string }): Promise<CanonicalEntityV1> {
    const { data, error } = await this.client
      .from("entities_v1")
      .insert({
        entity_id: input.entity_id,
        entity_type: input.entity_type,
        canonical_name: input.canonical_name,
        resolution_status: "active"
      })
      .select("entity_id,entity_type,canonical_name,resolution_status,created_at,updated_at")
      .single();

    if (error) throw error;
    return data as unknown as CanonicalEntityV1;
  }

  async getById(entity_id: string): Promise<CanonicalEntityV1 | null> {
    const { data, error } = await this.client
      .from("entities_v1")
      .select("entity_id,entity_type,canonical_name,resolution_status,created_at,updated_at")
      .eq("entity_id", entity_id)
      .maybeSingle();

    if (error) throw error;
    return (data as unknown as CanonicalEntityV1) ?? null;
  }
}
