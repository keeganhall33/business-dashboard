import crypto from "node:crypto";

import type { EntityAliasTypeV1, EntityAliasV1 } from "@/lib/external-intelligence/entities/entity-alias-v1";
import { getExternalIntelligenceSupabaseClient, type SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class EntityAliasRepositoryV1 {
  constructor(private readonly deps?: { client?: SupabaseServerClient }) {}

  private get client(): SupabaseServerClient {
    return getExternalIntelligenceSupabaseClient({ client: this.deps?.client });
  }

  generateAliasId(): string {
    return `alias:${crypto.randomUUID()}`;
  }

  async create(input: {
    canonical_entity_id: string;
    alias: string;
    alias_type: EntityAliasTypeV1;
    confidence_json?: Record<string, unknown>;
    provenance_json?: Record<string, unknown>;
    last_verified_at?: string | null;
  }): Promise<EntityAliasV1> {
    const alias_id = this.generateAliasId();

    const { data, error } = await this.client
      .from("entity_aliases_v1")
      .insert({
        alias_id,
        canonical_entity_id: input.canonical_entity_id,
        alias: input.alias,
        alias_type: input.alias_type,
        confidence_json: input.confidence_json ?? {},
        provenance_json: input.provenance_json ?? {},
        last_verified_at: input.last_verified_at ?? null
      })
      .select("alias_id,canonical_entity_id,alias,alias_type,confidence_json,provenance_json,created_at,updated_at,last_verified_at")
      .single();

    if (error) throw error;
    return data as unknown as EntityAliasV1;
  }
}
