import test from "node:test";
import assert from "node:assert/strict";

import {
  parseStrategicConstraintsV1FromJsonString,
  STRATEGIC_CONSTRAINTS_SCHEMA_VERSION
} from "@/lib/fusion-v1/strategic-constraints";

test("strategic constraints validator: malformed JSON fails safely", () => {
  assert.throws(() => parseStrategicConstraintsV1FromJsonString("{"), /malformed/i);
});

test("strategic constraints validator: missing required fields fails safely", () => {
  const bad = JSON.stringify({ schema_version: STRATEGIC_CONSTRAINTS_SCHEMA_VERSION });
  assert.throws(() => parseStrategicConstraintsV1FromJsonString(bad));
});

test("strategic constraints validator: unknown prohibited action categories are rejected", () => {
  const bad = {
    schema_version: STRATEGIC_CONSTRAINTS_SCHEMA_VERSION,
    config_version: "v1.0",
    premium_positioning: { protected: true, prohibited_action_categories: ["not_a_real_category"], notes: [] },
    scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
    licensing_ip: { requires_review: true, notes: [] },
    blocked_domains: ["meta_attribution"],
    capacity: { available_hours_today: 1, available_discretionary_budget_cents_today: null },
    prohibited_action_categories: ["unauthorized_scraping"],
    mutually_exclusive_action_groups: {}
  };
  assert.throws(() => parseStrategicConstraintsV1FromJsonString(JSON.stringify(bad)));
});

test("strategic constraints hashing: semantic equality produces same hash", () => {
  const a = {
    schema_version: STRATEGIC_CONSTRAINTS_SCHEMA_VERSION,
    config_version: "v1.0",
    premium_positioning: { protected: true, prohibited_action_categories: ["mass_market_pricing", "discounting"], notes: [] },
    scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
    licensing_ip: { requires_review: true, notes: [] },
    blocked_domains: ["meta_attribution"],
    capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
    prohibited_action_categories: ["impersonation", "unauthorized_scraping"],
    mutually_exclusive_action_groups: { pricing: ["lower_price", "raise_price"] }
  };

  const b = {
    ...a,
    premium_positioning: { ...a.premium_positioning, prohibited_action_categories: [...a.premium_positioning.prohibited_action_categories].reverse() },
    prohibited_action_categories: [...a.prohibited_action_categories].reverse(),
    mutually_exclusive_action_groups: { pricing: [...(a.mutually_exclusive_action_groups.pricing ?? [])].reverse() }
  };

  const ha = parseStrategicConstraintsV1FromJsonString(JSON.stringify(a)).constraints_hash;
  const hb = parseStrategicConstraintsV1FromJsonString(JSON.stringify(b)).constraints_hash;
  assert.equal(ha, hb);
});

test("strategic constraints hashing: changed content produces different hash", () => {
  const a = {
    schema_version: STRATEGIC_CONSTRAINTS_SCHEMA_VERSION,
    config_version: "v1.0",
    premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
    scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
    licensing_ip: { requires_review: true, notes: [] },
    blocked_domains: ["meta_attribution"],
    capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
    prohibited_action_categories: ["unauthorized_scraping"],
    mutually_exclusive_action_groups: {}
  };
  const b = { ...a, prohibited_action_categories: ["unauthorized_scraping", "impersonation"] };
  const ha = parseStrategicConstraintsV1FromJsonString(JSON.stringify(a)).constraints_hash;
  const hb = parseStrategicConstraintsV1FromJsonString(JSON.stringify(b)).constraints_hash;
  assert.notEqual(ha, hb);
});

