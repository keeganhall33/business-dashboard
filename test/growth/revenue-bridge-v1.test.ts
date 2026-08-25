import assert from "node:assert/strict";
import test from "node:test";

import { orderRevenueBridgePathsV1, scoreRevenueBridgePathV1 } from "@/lib/growth/revenue-bridge/contracts";
import {
  REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_FIXTURE_V1,
  REVENUE_BRIDGE_BASE_FIXTURE_V1,
  REVENUE_BRIDGE_FIXTURES_V1,
  REVENUE_BRIDGE_LICENSING_VALIDATED_FIXTURE_V1
} from "@/lib/growth/revenue-bridge/fixtures";
import { toRevenueBridgeProjectionV1 } from "@/lib/growth/revenue-bridge/projection";

test("RevenueBridgeV1 exposes the required bridge fields and three scalable path comparisons", () => {
  const bridge = REVENUE_BRIDGE_BASE_FIXTURE_V1;

  assert.equal(bridge.contract_version, "revenue_bridge_v1.0");
  assert.ok(bridge.TARGET_STATE);
  assert.ok(bridge.CURRENT_TRAJECTORY);
  assert.ok(bridge.GAP);
  assert.ok(bridge.BOTTLENECK);
  assert.ok(bridge.NEXT_MILESTONE);
  assert.ok(bridge.LEADING_INDICATORS.length > 0);
  assert.ok(bridge.WHAT_WOULD_CHANGE_PATH.length > 0);
  assert.equal(bridge.PATHS.length, 3);
  assert.deepEqual(
    bridge.PATHS.map((path) => path.kind).sort(),
    ["ARTIST_HOURS_HEAVY_ORIGINALS", "LICENSING_IP_COLLECTIBLES", "PARTNERSHIPS_DISTRIBUTION_DIRECT_COLLECTOR"].sort()
  );
});

test("target remains objective, not forecast, and gap economics preserve UNKNOWN", () => {
  const bridge = REVENUE_BRIDGE_BASE_FIXTURE_V1;

  assert.equal(bridge.TARGET_STATE.objective_not_forecast, true);
  assert.equal(bridge.guardrails.target_is_objective_not_forecast, true);
  assert.equal(bridge.GAP.annual_revenue_gap_range.currency, "UNKNOWN");
  assert.equal(bridge.GAP.annual_revenue_gap_range.low_cents, null);
  assert.equal(bridge.GAP.annual_revenue_gap_range.high_cents, null);
  assert.match(bridge.GAP.summary, /not a forecast/i);
});

test("UNKNOWN licensing economics stay explicit instead of fake precision", () => {
  const licensing = REVENUE_BRIDGE_BASE_FIXTURE_V1.PATHS.find((path) => path.path_id === "path-licensing-ip-collectibles");

  assert.ok(licensing);
  assert.equal(licensing.truth_state, "UNKNOWN");
  assert.equal(licensing.revenue_contribution_range.currency, "UNKNOWN");
  assert.equal(licensing.revenue_contribution_range.low_cents, null);
  assert.equal(licensing.prestige_or_relationship_upside.qualitative_only, true);
  assert.match(licensing.key_economic_unknown, /UNKNOWN/);
});

test("artist-hours-heavy originals are explicitly not infinitely scalable", () => {
  const originals = REVENUE_BRIDGE_BASE_FIXTURE_V1.PATHS.find((path) => path.path_id === "path-artist-hours-heavy-originals-commissions");

  assert.ok(originals);
  assert.equal(originals.scalability_ceiling.artist_hours_bound, true);
  assert.equal(originals.scalability_ceiling.can_be_treated_as_infinite_scale, false);
  assert.equal(REVENUE_BRIDGE_BASE_FIXTURE_V1.guardrails.artist_hours_heavy_path_not_infinite_scale, true);
  assert.match(originals.scalability_ceiling.summary, /scarce artist hours/i);
});

test("path ordering changes when economics and capacity assumptions change", () => {
  assert.deepEqual(REVENUE_BRIDGE_BASE_FIXTURE_V1.PATH_ORDER, [
    "path-partnerships-distribution-direct-collector",
    "path-artist-hours-heavy-originals-commissions",
    "path-licensing-ip-collectibles"
  ]);
  assert.deepEqual(REVENUE_BRIDGE_LICENSING_VALIDATED_FIXTURE_V1.PATH_ORDER, [
    "path-licensing-ip-collectibles",
    "path-partnerships-distribution-direct-collector",
    "path-artist-hours-heavy-originals-commissions"
  ]);
  assert.deepEqual(REVENUE_BRIDGE_ARTIST_CAPACITY_UPSIDE_FIXTURE_V1.PATH_ORDER, [
    "path-artist-hours-heavy-originals-commissions",
    "path-partnerships-distribution-direct-collector",
    "path-licensing-ip-collectibles"
  ]);

  const reordered = orderRevenueBridgePathsV1(REVENUE_BRIDGE_BASE_FIXTURE_V1.PATHS, REVENUE_BRIDGE_BASE_FIXTURE_V1.assumption_set);
  assert.deepEqual(reordered.map((path) => path.path_id), REVENUE_BRIDGE_BASE_FIXTURE_V1.PATH_ORDER);
  assert.ok(scoreRevenueBridgePathV1(reordered[0]!, REVENUE_BRIDGE_BASE_FIXTURE_V1.assumption_set) > scoreRevenueBridgePathV1(reordered[2]!, REVENUE_BRIDGE_BASE_FIXTURE_V1.assumption_set));
});

test("dashboard projection is deterministic and keeps Keegan action gated off", () => {
  const first = toRevenueBridgeProjectionV1(REVENUE_BRIDGE_BASE_FIXTURE_V1);
  const second = toRevenueBridgeProjectionV1(REVENUE_BRIDGE_BASE_FIXTURE_V1);

  assert.deepEqual(first, second);
  assert.equal(first.view_version, "revenue_bridge_projection_v1.0");
  assert.equal(first.keegan_action_required, "NO");
  assert.equal(first.ordered_paths.length, 3);
  assert.equal(first.ordered_paths[0]?.path_id, REVENUE_BRIDGE_BASE_FIXTURE_V1.PATH_ORDER[0]);
  assert.match(first.next_milestone, /premium-safe distribution route|collector conversion/i);
});

test("fixtures avoid guaranteed wealth language and keep upside qualitative until supported", () => {
  const serialized = JSON.stringify(REVENUE_BRIDGE_FIXTURES_V1).toLowerCase();

  assert.equal(REVENUE_BRIDGE_BASE_FIXTURE_V1.guardrails.prestige_and_relationship_upside_qualitative_until_supported, true);
  assert.doesNotMatch(serialized, /\bguaranteed\b.*\b(wealth|rich|famous|millions)\b/);
  assert.doesNotMatch(serialized, /\bwill become\b.*\b(wealthy|rich|famous)\b/);
  assert.ok(REVENUE_BRIDGE_FIXTURES_V1.flatMap((fixture) => fixture.PATHS).every((path) => path.prestige_or_relationship_upside.qualitative_only));
});
