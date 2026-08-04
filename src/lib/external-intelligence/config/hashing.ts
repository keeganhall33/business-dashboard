import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import type { SourceRegistryFile, SourceSetsFile, PolicyFile } from "@/lib/external-intelligence/config/contracts";
import { createPolicyRefContentHash } from "@/lib/external-intelligence/hashing/content-hash";

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].slice().sort((a, b) => a.localeCompare(b));
}

/**
 * Registry config content hash (deterministic).
 * - excludes generated_at
 * - normalizes set-like arrays and ordering of sources
 */
export function createSourceRegistryContentHash(file: SourceRegistryFile): string {
  const sources = file.sources
    .map((s) => ({
      ...s,
      domains: sortedUnique(s.domains),
      source_sets: sortedUnique(s.source_sets),
      languages: sortedUnique(s.languages),
      supported_entity_types: sortedUnique(s.supported_entity_types),
      supported_event_types: sortedUnique(s.supported_event_types),
      supported_relationship_types: sortedUnique(s.supported_relationship_types),
      supported_signal_classes: sortedUnique(s.supported_signal_classes),
      expected_opportunity_classes: sortedUnique(s.expected_opportunity_classes),
      expected_risk_classes: sortedUnique(s.expected_risk_classes)
    }))
    .slice()
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  return canonicalJsonSha256Hex({
    schema_version: file.schema_version,
    registry_config_version: file.registry_config_version,
    fixture_status: file.fixture_status,
    production_eligibility: file.production_eligibility,
    sources
  });
}

/**
 * Source sets config content hash (deterministic).
 * - excludes generated_at
 * - normalizes set-like arrays and ordering of sets/memberships
 */
export function createSourceSetsContentHash(file: SourceSetsFile): string {
  const source_sets = file.source_sets
    .map((s) => ({
      ...s,
      domains: sortedUnique(s.domains),
      inclusion_reasons: sortedUnique(s.inclusion_reasons),
      member_source_ids: sortedUnique(s.member_source_ids)
    }))
    .slice()
    .sort((a, b) => a.source_set_id.localeCompare(b.source_set_id));

  const memberships = file.memberships
    .map((m) => ({ ...m }))
    .slice()
    .sort((a, b) => {
      const ak = `${a.source_set_id}::${a.source_id}`;
      const bk = `${b.source_set_id}::${b.source_id}`;
      return ak.localeCompare(bk);
    });

  return canonicalJsonSha256Hex({
    schema_version: file.schema_version,
    source_sets_config_version: file.source_sets_config_version,
    fixture_status: file.fixture_status,
    production_eligibility: file.production_eligibility,
    source_sets,
    memberships
  });
}

export function createLoadedPolicyContentHash(file: PolicyFile): string {
  return createPolicyRefContentHash(file);
}
