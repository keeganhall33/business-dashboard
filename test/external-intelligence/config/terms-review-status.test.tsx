import test from "node:test";
import assert from "node:assert/strict";

import { SourceRegistrySourceSchema } from "@/lib/external-intelligence/config/contracts";

test("terms_review_status: prohibited is valid", () => {
  const parsed = SourceRegistrySourceSchema.parse({
    source_id: "x",
    display_name: "x",
    description: "x",
    registry_schema_version: "source_registry_v1",
    source_config_version: "v1.0.0",
    lifecycle_status: "proposed",
    enabled: false,
    enabled_by_default: false,
    owner: "x",
    domains: ["brand"],
    source_sets: [],
    source_type: "official",
    authority_level: "primary",
    geography: "global",
    languages: ["en"],
    supported_entity_types: [],
    supported_event_types: [],
    supported_relationship_types: [],
    supported_signal_classes: [],
    expected_opportunity_classes: [],
    expected_risk_classes: [],
    access_method: "public_webpage_manual_review",
    authentication_required: false,
    paywalled: false,
    licensing_required: false,
    automation_suitability: "prohibited",
    terms_review_status: "prohibited",
    copyright_handling: "link_only",
    approved_fallback_method: "manual_review",
    legal_risk_level: "high",
    expected_cadence: "weekly",
    max_acceptable_latency: "30d",
    freshness_threshold: "90d",
    expected_noise: "high",
    expected_duplication: "high",
    implementation_wave: "wave_3",
    implementation_status: "unimplemented",
    credibility_prior: "low"
  });

  assert.equal(parsed.terms_review_status, "prohibited");
});

test("terms_review_status: unknown value fails closed", () => {
  assert.throws(() =>
    SourceRegistrySourceSchema.parse({
      source_id: "x",
      display_name: "x",
      description: "x",
      registry_schema_version: "source_registry_v1",
      source_config_version: "v1.0.0",
      lifecycle_status: "proposed",
      enabled: false,
      enabled_by_default: false,
      owner: "x",
      domains: ["brand"],
      source_sets: [],
      source_type: "official",
      authority_level: "primary",
      geography: "global",
      languages: ["en"],
      supported_entity_types: [],
      supported_event_types: [],
      supported_relationship_types: [],
      supported_signal_classes: [],
      expected_opportunity_classes: [],
      expected_risk_classes: [],
      access_method: "public_webpage_manual_review",
      authentication_required: false,
      paywalled: false,
      licensing_required: false,
      automation_suitability: "manual_only",
      terms_review_status: "unknown",
      copyright_handling: "link_only",
      approved_fallback_method: "manual_review",
      legal_risk_level: "low",
      expected_cadence: "weekly",
      max_acceptable_latency: "30d",
      freshness_threshold: "90d",
      expected_noise: "high",
      expected_duplication: "high",
      implementation_wave: "wave_1",
      implementation_status: "unimplemented",
      credibility_prior: "low"
    })
  );
});
