import type { EntityResolutionStatus } from "@/lib/external-intelligence/contracts/enums";
import type { ConfidenceAxis } from "@/lib/external-intelligence/contracts/confidence-axes";

export type EntityRef = {
  entity_id: string;
  entity_type: string;
  canonical_name: string;

  aliases: string[];
  source_specific_ids: Record<string, string>; // { source_id: source_native_id }

  resolution_status: EntityResolutionStatus;
  resolution_confidence: ConfidenceAxis;

  ambiguity_flags: string[];
  possible_entity_ids: string[];

  alias_provenance: Array<{ alias: string; source_id: string; evidence_reference_id?: string | null }>;
  entity_resolution_version: string;

  last_verified_at: string | null; // ISO-8601
  valid_from: string | null; // ISO-8601
  valid_until: string | null; // ISO-8601
};

export function isAmbiguousEntity(ref: EntityRef): boolean {
  return ref.resolution_status === "ambiguous" || ref.resolution_status === "unresolved";
}
