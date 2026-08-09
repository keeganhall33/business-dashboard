import type { EntityRef } from "@/lib/external-intelligence/contracts/entity-ref";
import type { CanonicalEntityV1 } from "@/lib/external-intelligence/entities/entity-v1";
import { EntityRepositoryV1 } from "@/lib/external-intelligence/persistence/supabase/entity.repository";
import { EntityResolutionLinkRepositoryV1 } from "@/lib/external-intelligence/persistence/supabase/entity-resolution-link.repository";

export type EntityRepoLikeV1 = {
  getById: (entity_id: string) => Promise<CanonicalEntityV1 | null>;
};

export type ResolutionLinkRepoLikeV1 = {
  getResolvedByProvisionalId: (
    provisional_entity_id: string
  ) => Promise<{
    link_id: string;
    provisional_entity_id: string;
    canonical_entity_id: string;
    status: string;
    confidence_json?: Record<string, unknown>;
    resolution_method: string;
  } | null>;
};

export type ResolveEntityRefV1Result = {
  original_entity_ref: EntityRef;

  resolution_status: "resolved" | "suggested" | "unresolved" | "conflict";
  resolution_confidence: Record<string, unknown>;
  resolution_method: string | null;

  canonical_entity: CanonicalEntityV1 | null;
  link: {
    link_id: string;
    provisional_entity_id: string;
    canonical_entity_id: string;
    status: string;
  } | null;
};

/**
 * Resolution overlay lookup.
 *
 * Does NOT mutate Claim payloads.
 * Fails safe: defaults to unresolved.
 */
export async function resolveEntityRefV1(input: {
  entity_ref: EntityRef;
  deps?: {
    entityRepo?: EntityRepoLikeV1;
    linkRepo?: ResolutionLinkRepoLikeV1;
  };
}): Promise<ResolveEntityRefV1Result> {
  const ref = input.entity_ref;

  const entityRepo: EntityRepoLikeV1 = input.deps?.entityRepo ?? new EntityRepositoryV1();
  const linkRepo: ResolutionLinkRepoLikeV1 = input.deps?.linkRepo ?? new EntityResolutionLinkRepositoryV1();

  // Only provisional ids resolve via overlay in V1.
  if (!ref.entity_id.startsWith("provisional:")) {
    return {
      original_entity_ref: ref,
      resolution_status: "unresolved",
      resolution_confidence: { reason: "non_provisional_entity_ref" },
      resolution_method: null,
      canonical_entity: null,
      link: null
    };
  }

  const resolved = await linkRepo.getResolvedByProvisionalId(ref.entity_id);
  if (!resolved) {
    return {
      original_entity_ref: ref,
      resolution_status: "unresolved",
      resolution_confidence: { reason: "no_link" },
      resolution_method: null,
      canonical_entity: null,
      link: null
    };
  }

  const canonical = await entityRepo.getById(resolved.canonical_entity_id);
  if (!canonical) {
    return {
      original_entity_ref: ref,
      resolution_status: "conflict",
      resolution_confidence: { reason: "link_points_to_missing_entity" },
      resolution_method: resolved.resolution_method,
      canonical_entity: null,
      link: {
        link_id: resolved.link_id,
        provisional_entity_id: resolved.provisional_entity_id,
        canonical_entity_id: resolved.canonical_entity_id,
        status: resolved.status
      }
    };
  }

  return {
    original_entity_ref: ref,
    resolution_status: "resolved",
    resolution_confidence: resolved.confidence_json ?? {},
    resolution_method: resolved.resolution_method,
    canonical_entity: canonical,
    link: {
      link_id: resolved.link_id,
      provisional_entity_id: resolved.provisional_entity_id,
      canonical_entity_id: resolved.canonical_entity_id,
      status: resolved.status
    }
  };
}
