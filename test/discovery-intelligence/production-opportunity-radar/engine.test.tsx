import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionOpportunityRadarV1,
  type CanonicalExternalEventRowV1
} from "@/lib/discovery-intelligence/production-opportunity-radar/engine";

const NOW = "2026-09-10T20:00:00.000Z";
const HASH = "a".repeat(64);

function row(input: {
  id: string;
  deliverBy: string;
  origin?: string;
  artwork?: string;
  differentiation?: string;
  verification?: string;
  overrides?: Record<string, string>;
}): CanonicalExternalEventRowV1 {
  const attributes = {
    appointment_role: "brand partnership strategy",
    originating_evidence_id: input.origin ?? input.id,
    deliver_by: input.deliverBy,
    engage_by: "2026-11-01T00:00:00.000Z",
    planning_signal_class: "ATHLETE_BRAND_CAMPAIGN",
    artwork_class: input.artwork ?? "STANDARD_ORIGINAL",
    production_window_min_days: "45",
    production_window_max_days: "120",
    capacity_fit: "FIT",
    differentiation_role: input.differentiation ?? "DISTINCTIVE_LEAD_ARTIST",
    original_sale_allowed: "YES",
    print_proceeds_donation: "UNKNOWN",
    sponsor_underwriting: "YES",
    artist_fee_cost_recovery: "YES",
    smaller_faster_work_option: "YES",
    strategic_upside_access: "HIGH",
    strategic_upside_prestige: "HIGH",
    strategic_upside_relationship: "HIGH",
    strategic_upside_charity_impact: "LOW",
    generic_sketch_card: "NO",
    differentiated_recurring_platform: "NO",
    licensing_advantage: "UNKNOWN",
    marquee_relationship_access: "YES",
    why_keegan: "A distinctive one-of-one sports portrait gives the campaign an ownable cultural asset.",
    likely_decision_maker: "Brand partnerships lead",
    access_path: "Named agency partnership team",
    single_best_next_move: "Prepare a private one-page concept and evidence brief for internal review.",
    why_now: "The planning window opens before production must begin.",
    economics_revenue_structure: "Commission fee plus retained original-sale option.",
    strategic_upside: "Creates a repeatable athlete-brand commission path.",
    ...input.overrides
  };
  return {
    event_id: input.id,
    event_type: "entity_appointed_to_role",
    lifecycle_status: "active",
    current_content_hash: HASH,
    content_hash: HASH,
    schema_version: "external_event_v1",
    policy_version: "external_event_v1.test",
    created_at: "2026-09-10T19:00:00.000Z",
    payload_json: {
      schema_version: "external_event_v1",
      event_id: input.id,
      event_type: "entity_appointed_to_role",
      participants: [
        { role: "appointed_entity", entity_ref: { entity_id: `agency-${input.id}`, entity_type: "organization", canonical_name: "Example Agency" } },
        { role: "appointing_entity", entity_ref: { entity_id: `brand-${input.id}`, entity_type: "organization", canonical_name: "Example Brand" } }
      ],
      attributes: Object.entries(attributes).map(([key, value]) => ({ key, value })),
      times: {
        announcement_time: "2026-09-10T18:00:00.000Z",
        event_time: "2026-09-10T18:00:00.000Z",
        retrieved_at: "2026-09-10T19:00:00.000Z",
        effective_from: null,
        effective_until: null
      },
      verification_state: input.verification ?? "corroborated",
      extraction_confidence: { level: "high", reasons: ["primary source"] },
      policy_version: "external_event_v1.test"
    }
  };
}

test("surfaces a precise six-month canonical opportunity with a safe internal next move", () => {
  const result = buildProductionOpportunityRadarV1({ rows: [row({ id: "six-month", deliverBy: "2027-03-10T00:00:00.000Z" })], nowIso: NOW });
  assert.equal(result.surfaced_count, 1);
  assert.equal(result.candidates[0]?.state, "QUALIFIED_OPPORTUNITY");
  assert.equal(result.candidates[0]?.planning_runway_bucket, "SIX_TO_TWELVE_MONTHS");
  assert.equal(result.candidates[0]?.no_external_action, true);
  assert.equal(result.safety.no_durable_write, true);
});

test("suppresses a 17-day signal that requires a major original", () => {
  const result = buildProductionOpportunityRadarV1({
    rows: [row({
      id: "late",
      deliverBy: "2026-09-27T20:00:00.000Z",
      artwork: "MAJOR_ORIGINAL",
      overrides: { engage_by: "2026-09-15T00:00:00.000Z" }
    })],
    nowIso: NOW
  });
  assert.equal(result.surfaced_count, 0);
  assert.equal(result.suppressions[0]?.reason, "LATE_SIGNAL_REQUIRES_MAJOR_NEW_ARTWORK");
});

test("deduplicates syndicated evidence instead of inflating confidence", () => {
  const first = row({ id: "wire-a", origin: "https://brand.example/announcement", deliverBy: "2027-04-10T00:00:00.000Z" });
  const second = row({ id: "wire-b", origin: "https://brand.example/announcement?utm_source=wire", deliverBy: "2027-04-10T00:00:00.000Z" });
  const result = buildProductionOpportunityRadarV1({ rows: [first, second], nowIso: NOW });
  assert.equal(result.qualified_count, 1);
  assert.equal(result.suppressions.some((item) => item.reason === "DUPLICATE_UNDERLYING_SIGNAL"), true);
  assert.equal(result.candidates[0]?.confidence, "HIGH");
});

test("suppresses generic crowded work even with a long runway", () => {
  const result = buildProductionOpportunityRadarV1({
    rows: [row({ id: "open-call", deliverBy: "2027-06-01T00:00:00.000Z", differentiation: "OPEN_CALL_COMMODITY" })],
    nowIso: NOW
  });
  assert.equal(result.surfaced_count, 0);
  assert.equal(result.suppressions[0]?.reason, "CROWDED_OR_COMMODITY_ROLE");
});

test("fails closed on unverified evidence and caps output at five", () => {
  const rows = Array.from({ length: 7 }, (_, index) => row({
    id: `candidate-${index}`,
    deliverBy: "2027-04-10T00:00:00.000Z"
  }));
  rows.push(row({ id: "unverified", deliverBy: "2027-04-10T00:00:00.000Z", verification: "unverified" }));
  const result = buildProductionOpportunityRadarV1({ rows, nowIso: NOW });
  assert.equal(result.surfaced_count, 5);
  assert.equal(result.suppressions.some((item) => item.reason === "EVIDENCE_UNKNOWN"), true);
  assert.equal(result.proof_status, "LIVE_PRECISION_PROVEN");
});
