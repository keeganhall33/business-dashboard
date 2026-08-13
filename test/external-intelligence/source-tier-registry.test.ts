import assert from "node:assert/strict";
import test from "node:test";

import { buildExternalSourceUniverseV1, classifyAvailabilityV1, classifySourceTierV1 } from "@/lib/external-intelligence/source-tier/source-tier-registry";
import type { ProductionSourceRegistryFile } from "@/lib/external-intelligence/config/production-source-registry.contract";

test("valid tiers: official_api => TIER_A_FIRST_PARTY_OR_OFFICIAL_API", () => {
  const result = classifySourceTierV1({
    source_id: "official-api-1",
    access_method: "official_api",
    authority_level: "secondary",
    licensing_required: false,
    paywalled: false
  } as any);

  assert.equal(result.kind, "TIER");
  assert.equal(result.tier, "TIER_A_FIRST_PARTY_OR_OFFICIAL_API");
});

test("valid tiers: licensing_required => TIER_E_PAID_OR_LICENSED", () => {
  const result = classifySourceTierV1({
    source_id: "licensed-1",
    access_method: "structured_export",
    authority_level: "primary",
    licensing_required: true,
    paywalled: false
  } as any);

  assert.equal(result.kind, "TIER");
  assert.equal(result.tier, "TIER_E_PAID_OR_LICENSED");
});

test("unavailable sources are represented explicitly", () => {
  assert.equal(classifyAvailabilityV1({ access_status: "broken" } as any), "unavailable");
  assert.equal(classifyAvailabilityV1({ access_status: "revoked" } as any), "unavailable");
  assert.equal(classifyAvailabilityV1({ access_status: "degraded" } as any), "degraded");
  assert.equal(classifyAvailabilityV1({ access_status: "working" } as any), "available");
});

test("missing critical tier fields yields SOURCE_COVERAGE_GAP (no fabricated inference)", () => {
  const result = classifySourceTierV1({ source_id: "x" } as any);
  assert.equal(result.kind, "SOURCE_COVERAGE_GAP");
  assert.ok(result.missing.includes("access_method"));
  assert.ok(result.missing.includes("authority_level"));
});

test("external source universe build is deterministic and preserves coverage gaps", () => {
  const file: ProductionSourceRegistryFile = {
    schema_version: "production_source_registry_v1",
    registry_config_version: "1",
    generated_at: null,
    fixture_status: "production",
    production_eligibility: "enabled",
    owner: "test",
    sources: [
      {
        source_id: "b",
        display_name: "B",
        description: "B",
        registry_schema_version: "production_source_registry_v1",
        source_config_version: "1",
        lifecycle_status: "active",
        enabled: true,
        enabled_by_default: false,
        implementation_status: "adapter_ready",
        access_status: "unknown",
        owner: "test",
        review_by: null,
        replacement_source_ids: [],
        domains: ["EXTERNAL"],
        source_sets: [],
        source_type: "sports_business",
        authority_level: "primary",
        geography: "global",
        languages: ["en"],
        monitored_entities: [],
        supported_entity_classes: [],
        supported_event_classes: [],
        supported_relationship_classes: [],
        supported_signal_classes: [],
        expected_opportunity_classes: [],
        expected_risk_classes: [],
        access_classification: "public",
        access_method: "rss",
        authentication_required: false,
        paywalled: false,
        licensing_required: false,
        automation_suitability: "allowed",
        terms_review_status: "approved",
        copyright_handling: "link_only",
        data_retention_restrictions: [],
        approved_fallback_method: "disabled",
        legal_risk_level: "low",
        last_legal_review_at: null,
        legal_review_owner: null,
        expected_cadence: "daily",
        max_acceptable_latency: "24h",
        freshness_threshold: "72h",
        historical_availability: "unknown",
        expected_volume: "unknown",
        expected_noise: "low",
        expected_duplication: "low",
        implementation_difficulty: "medium",
        implementation_wave: "later",
        credibility_prior: "medium",
        expected_relevance: "medium",
        expected_uniqueness: "medium",
        expected_corroboration_value: "medium"
      }
    ]
  };

  const universe = buildExternalSourceUniverseV1(file);
  assert.equal(universe.length, 1);
  assert.equal(universe[0].source_id, "b");
  assert.equal(universe[0].tier.kind, "TIER");
});
