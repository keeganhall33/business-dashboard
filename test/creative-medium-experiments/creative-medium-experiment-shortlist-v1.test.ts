import assert from "node:assert/strict";
import test from "node:test";

import { buildCreativeMediumExperimentShortlistV1 } from "@/lib/creative-medium-experiments/adapter";
import { CREATIVE_MEDIUM_EXPERIMENT_FIXTURES_V1 } from "@/lib/creative-medium-experiments/fixtures";

test("CreativeExperimentOptionV1 fixtures compare three transparent medium experiments", () => {
  const shortlist = buildCreativeMediumExperimentShortlistV1();

  assert.equal(shortlist.contract_version, "creative_medium_experiment_shortlist_v1");
  assert.equal(shortlist.options.length, 3);
  assert.deepEqual(shortlist.options.map((option) => option.experiment_id), [
    "exp-graphite-only-refinement",
    "exp-graphite-controlled-color-material",
    "exp-small-dimensional-relief-study"
  ]);

  for (const option of shortlist.options) {
    assert.ok(option.medium_material.length > 20);
    assert.ok(option.differentiation_hypothesis.length > 20);
    assert.ok(option.market_evidence.summary.length > 20);
    assert.ok(option.institutional_fit.summary.length > 20);
    assert.ok(option.success_signal.length > 20);
    assert.ok(option.decision_notes.length > 0);
  }
});

test("reversible low-burden tests outrank high-burden medium shifts", () => {
  const shortlist = buildCreativeMediumExperimentShortlistV1();
  const graphite = shortlist.options.find((option) => option.experiment_id === "exp-graphite-only-refinement");
  const relief = shortlist.options.find((option) => option.experiment_id === "exp-small-dimensional-relief-study");

  assert.ok(graphite);
  assert.ok(relief);
  assert.equal(graphite.ordering, "TEST_NOW");
  assert.equal(relief.ordering, "DEFER");
  assert.ok(graphite.rank < relief.rank);
  assert.ok(graphite.score_breakdown.reversibility > relief.score_breakdown.reversibility);
  assert.ok(graphite.score_breakdown.learning_cost > relief.score_breakdown.learning_cost);
});

test("ordering changes when learning cost differentiation evidence or capacity changes", () => {
  const baseline = buildCreativeMediumExperimentShortlistV1();
  const revised = buildCreativeMediumExperimentShortlistV1(CREATIVE_MEDIUM_EXPERIMENT_FIXTURES_V1, {
    "exp-graphite-controlled-color-material": {
      learning_burden: "LOW",
      capacity_required: "LOW",
      differentiation_hypothesis_score: 3,
      market_evidence_confidence: "HIGH",
      market_evidence_truth_state: "KNOWN"
    }
  });

  assert.equal(baseline.options[0]?.experiment_id, "exp-graphite-only-refinement");
  assert.equal(revised.options[0]?.experiment_id, "exp-graphite-controlled-color-material");
  assert.equal(revised.options[0]?.ordering, "TEST_NOW");
});

test("market evidence remains separate from aesthetic hypothesis", () => {
  const color = buildCreativeMediumExperimentShortlistV1().options.find((option) => option.experiment_id === "exp-graphite-controlled-color-material");

  assert.ok(color);
  assert.match(color.market_evidence.summary, /Painting and color demand is noted/i);
  assert.match(color.differentiation_hypothesis, /signature/i);
  assert.notEqual(color.market_evidence.summary, color.differentiation_hypothesis);
  assert.ok(color.decision_notes.some((note) => /Market evidence and aesthetic hypothesis remain separate/i.test(note)));
});

test("UNKNOWN remains explicit and penalizes the dimensional relief study without coercing to zero", () => {
  const relief = buildCreativeMediumExperimentShortlistV1().options.find((option) => option.experiment_id === "exp-small-dimensional-relief-study");

  assert.ok(relief);
  assert.equal(relief.market_evidence.truth_state, "UNKNOWN");
  assert.equal(relief.market_evidence.confidence, "UNKNOWN");
  assert.equal(relief.production_time_days_range.truth_state, "UNKNOWN");
  assert.equal(relief.production_time_days_range.min, null);
  assert.equal(relief.production_time_days_range.max, null);
  assert.ok(relief.score_breakdown.unknown_penalty > 0);
  assert.match(relief.decision_notes.join(" "), /UNKNOWN production time/);
});

test("dashboard projection exposes TEST_NOW DEVELOP_NEXT DEFER and next verification", () => {
  const projection = buildCreativeMediumExperimentShortlistV1().dashboard_projection;

  assert.deepEqual(projection.TEST_NOW, ["exp-graphite-only-refinement"]);
  assert.deepEqual(projection.DEVELOP_NEXT, ["exp-graphite-controlled-color-material"]);
  assert.deepEqual(projection.DEFER, ["exp-small-dimensional-relief-study"]);
  assert.match(projection.WHAT_CHANGED, /small reversible experiments/);
  assert.match(projection.WHY_IT_MATTERS, /protect graphite authority/);
  assert.ok(projection.WHAT_TO_VERIFY_NEXT.some((item) => /graphite mastery first/i.test(item)));
});
