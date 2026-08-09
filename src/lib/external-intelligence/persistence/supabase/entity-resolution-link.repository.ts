import crypto from "node:crypto";

import type { EntityResolutionLinkStatusV1, EntityResolutionLinkV1 } from "@/lib/external-intelligence/entities/entity-resolution-link-v1";
import { getExternalIntelligenceSupabaseClient, type SupabaseServerClient } from "@/lib/external-intelligence/persistence/supabase/client";

export class EntityResolutionLinkRepositoryV1 {
  constructor(private readonly deps?: { client?: SupabaseServerClient }) {}

  private get client(): SupabaseServerClient {
    return getExternalIntelligenceSupabaseClient({ client: this.deps?.client });
  }

  generateLinkId(): string {
    return `link:${crypto.randomUUID()}`;
  }

  async listByProvisionalId(provisional_entity_id: string): Promise<EntityResolutionLinkV1[]> {
    const { data, error } = await this.client
      .from("entity_resolution_links_v1")
      .select(
        "link_id,provisional_entity_id,canonical_entity_id,status,confidence_json,resolution_method,provenance_json,created_at,updated_at"
      )
      .eq("provisional_entity_id", provisional_entity_id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as EntityResolutionLinkV1[];
  }

  async getResolvedByProvisionalId(provisional_entity_id: string): Promise<EntityResolutionLinkV1 | null> {
    const { data, error } = await this.client
      .from("entity_resolution_links_v1")
      .select(
        "link_id,provisional_entity_id,canonical_entity_id,status,confidence_json,resolution_method,provenance_json,created_at,updated_at"
      )
      .eq("provisional_entity_id", provisional_entity_id)
      .eq("status", "resolved")
      .maybeSingle();

    if (error) throw error;
    return (data as unknown as EntityResolutionLinkV1) ?? null;
  }

  async create(input: {
    provisional_entity_id: string;
    canonical_entity_id: string;
    status: EntityResolutionLinkStatusV1;
    resolution_method: string;
    confidence_json?: Record<string, unknown>;
    provenance_json?: Record<string, unknown>;
  }): Promise<EntityResolutionLinkV1> {
    const link_id = this.generateLinkId();

    const { data, error } = await this.client
      .from("entity_resolution_links_v1")
      .insert({
        link_id,
        provisional_entity_id: input.provisional_entity_id,
        canonical_entity_id: input.canonical_entity_id,
        status: input.status,
        resolution_method: input.resolution_method,
        confidence_json: input.confidence_json ?? {},
        provenance_json: input.provenance_json ?? {}
      })
      .select(
        "link_id,provisional_entity_id,canonical_entity_id,status,confidence_json,resolution_method,provenance_json,created_at,updated_at"
      )
      .single();

    if (error) throw error;
    return data as unknown as EntityResolutionLinkV1;
  }
}
