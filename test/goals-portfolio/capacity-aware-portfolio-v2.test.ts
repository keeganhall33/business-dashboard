import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAPACITY_AWARE_PORTFOLIO_V2_MAX_OPPORTUNITIES,
  buildCapacityAwarePortfolioV2,
  type CapacityAwareOpportunityV2,
  type CapacityAwarePortfolioInputV2
} from "../../src/lib/goals-portfolio/capacity-aware-portfolio-v2";

function opportunity(
  overrides: Partial<CapacityAwareOpportunityV2> & Pick<CapacityAwareOpportunityV2, "opportunity_id" | "priority_score">
): CapacityAwareOpportunityV2 {
  return {
    opportunity_id: overrides.opportunity_id,
    title: overrides.title ?? overrides.opportunity_id,
    priority_score: overrides.priority_score,
    preferred_lane: overrides.preferred_lane ?? "NOW",
    eligible: overrides.eligible ?? true,
    resource_demand: overrides.resource_demand ?? { cash: 0, keegan_hours: 0, energy: 0 },
    owner_dependence: overrides.owner_dependence ?? "KEEGAN_REQUIRED",
    delegation: overrides.delegation ?? null,
    direct_economics: overrides.direct_economics ?? {
      currency: null,
      potential_value_range: null,
      evidence_refs: []
    },
    qualitative_value: overrides.qualitative_value ?? [],
    evidence_refs: overrides.evidence_refs ?? []
  };
}

function baseInput(opportunities: CapacityAwareOpportunityV2[]): CapacityAwarePortfolioInputV2 {
  return {
    capacity: { cash: 100, keegan_hours: 10, energy: 10 },
    opportunities
  };
}

test("capacity-aware portfolio refuses an overloaded NOW and names displacement", () => {
  const result = buildCapacityAwarePortfolioV2(
    baseInput([
      opportunity({
        opportunity_id: "alpha",
        priority_score: 90,
        resource_demand: { cash: 20, keegan_hours: 8, energy: 4 }
      }),
      opportunity({
        opportunity_id: "beta",
        priority_score: 80,
        resource_demand: { cash: 10, keegan_hours: 7, energy: 3 }
      })
    ])
  );

  assert.deepEqual(result.lanes.NOW, ["alpha"]);
  assert.deepEqual(result.lanes.NEXT, ["beta"]);
  assert.deepEqual(result.items[1]!.constraint_codes, ["KEEGAN_HOURS_CAPACITY"]);
  assert.deepEqual(result.items[1]!.required_displacement, ["alpha"]);
  assert.equal(result.remaining_capacity.keegan_hours, 2);
  assert.equal(result.external_action_authorized, false);
  assert.equal(result.decision_support_only, true);
});

test("capacity-aware portfolio refuses impossible displacement plans", () => {
  const result = buildCapacityAwarePortfolioV2(
    baseInput([
      opportunity({
        opportunity_id: "alpha",
        priority_score: 90,
        resource_demand: { cash: 20, keegan_hours: 8, energy: 4 }
      }),
      opportunity({
        opportunity_id: "oversized",
        priority_score: 80,
        resource_demand: { cash: 10, keegan_hours: 12, energy: 3 }
      })
    ])
  );

  assert.deepEqual(result.lanes.NOW, ["alpha"]);
  assert.deepEqual(result.lanes.NEXT, ["oversized"]);
  assert.deepEqual(result.items[1]!.constraint_codes, ["KEEGAN_HOURS_CAPACITY"]);
  assert.deepEqual(result.items[1]!.required_displacement, []);
  assert.match(result.items[1]!.rationale, /no feasible displacement plan exists/i);
  assert.equal(result.remaining_capacity.keegan_hours, 2);
  assert.equal(result.external_action_authorized, false);
  assert.equal(result.decision_support_only, true);
});

test("capacity-aware portfolio permits NOW when an evidenced delegation option makes it feasible", () => {
  const input: CapacityAwarePortfolioInputV2 = {
    capacity: { cash: 50, keegan_hours: 2, energy: 3 },
    opportunities: [
      opportunity({
        opportunity_id: "delegatable",
        priority_score: 95,
        resource_demand: { cash: 10, keegan_hours: 6, energy: 4 },
        owner_dependence: "DELEGATABLE",
        delegation: {
          owner: "PARTNER",
          available: true,
          resource_demand: { cash: 10, keegan_hours: 1, energy: 2 },
          evidence_refs: ["evidence:delegation-confirmed"]
        }
      })
    ]
  };

  const result = buildCapacityAwarePortfolioV2(input);
  const item = result.items[0]!;
  assert.equal(item.lane, "NOW");
  assert.equal(item.delegated, true);
  assert.equal(item.execution_owner, "PARTNER");
  assert.deepEqual(item.effective_resource_demand, { cash: 10, keegan_hours: 1, energy: 2 });
  assert.equal(result.remaining_capacity.keegan_hours, 1);
});

test("capacity-aware portfolio preserves UNKNOWN capacity instead of inventing availability", () => {
  const result = buildCapacityAwarePortfolioV2({
    capacity: { cash: 100, keegan_hours: null, energy: 10 },
    opportunities: [
      opportunity({
        opportunity_id: "unknown-hours",
        priority_score: 90,
        resource_demand: { cash: 5, keegan_hours: 2, energy: 1 }
      })
    ]
  });

  assert.equal(result.capacity_truth.keegan_hours, "UNKNOWN");
  assert.deepEqual(result.unknown_capacity_inputs, ["keegan_hours"]);
  assert.equal(result.items[0]!.lane, "NEXT");
  assert.deepEqual(result.items[0]!.constraint_codes, ["UNKNOWN_KEEGAN_HOURS_CAPACITY"]);
  assert.deepEqual(result.items[0]!.required_displacement, []);
  assert.match(result.items[0]!.rationale, /UNKNOWN/);
});

test("capacity-aware portfolio keeps direct economics separate from qualitative value", () => {
  const result = buildCapacityAwarePortfolioV2(
    baseInput([
      opportunity({
        opportunity_id: "prestige-bet",
        priority_score: 70,
        preferred_lane: "NEXT",
        direct_economics: {
          currency: "USD",
          potential_value_range: { min: 1000, max: 3000 },
          evidence_refs: ["evidence:commercial-range"]
        },
        qualitative_value: [
          {
            kind: "PRESTIGE",
            label: "Institutional credibility",
            not_monetized: true,
            evidence_refs: ["evidence:institutional-fit"]
          }
        ]
      })
    ])
  );

  const item = result.items[0]!;
  assert.deepEqual(item.direct_economics.potential_value_range, { min: 1000, max: 3000 });
  assert.equal(item.qualitative_value[0]!.not_monetized, true);
  assert.equal(item.qualitative_value[0]!.label, "Institutional credibility");
});

test("capacity-aware portfolio is deterministic, bounded, and immutable", () => {
  const alpha = opportunity({ opportunity_id: "alpha", priority_score: 80, preferred_lane: "NEXT" });
  const beta = opportunity({ opportunity_id: "beta", priority_score: 80, preferred_lane: "LATER" });
  const input = baseInput([beta, alpha]);
  const before = JSON.stringify(input);

  const first = buildCapacityAwarePortfolioV2(input);
  const second = buildCapacityAwarePortfolioV2(baseInput([alpha, beta]));

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(first.items.map((item) => item.opportunity_id), ["alpha", "beta"]);

  const tooMany = Array.from({ length: CAPACITY_AWARE_PORTFOLIO_V2_MAX_OPPORTUNITIES + 1 }, (_, index) =>
    opportunity({ opportunity_id: `op-${index}`, priority_score: 50 })
  );
  assert.throws(() => buildCapacityAwarePortfolioV2(baseInput(tooMany)), /at most 50 opportunities/);
});

test("capacity-aware portfolio ignores ineligible work without reserving capacity", () => {
  const result = buildCapacityAwarePortfolioV2(
    baseInput([
      opportunity({
        opportunity_id: "ineligible",
        priority_score: 100,
        eligible: false,
        resource_demand: { cash: 100, keegan_hours: 10, energy: 10 }
      }),
      opportunity({
        opportunity_id: "valid",
        priority_score: 90,
        resource_demand: { cash: 10, keegan_hours: 2, energy: 1 }
      })
    ])
  );

  assert.deepEqual(result.lanes.IGNORE, ["ineligible"]);
  assert.deepEqual(result.lanes.NOW, ["valid"]);
  assert.deepEqual(result.remaining_capacity, { cash: 90, keegan_hours: 8, energy: 9 });
});
