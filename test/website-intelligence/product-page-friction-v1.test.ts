import assert from "node:assert/strict";
import test from "node:test";

import { buildProductPageFrictionSnapshotV1 } from "../../src/lib/website-intelligence/product-page-friction/adapter";
import { PRODUCT_PAGE_FRICTION_EVIDENCE_FIXTURES_V1 } from "../../src/lib/website-intelligence/product-page-friction/fixtures";

function snapshot() {
  return buildProductPageFrictionSnapshotV1({
    generatedAt: "2026-08-25T00:00:00.000Z",
    pageScope: "product pages fixture",
    evidence: PRODUCT_PAGE_FRICTION_EVIDENCE_FIXTURES_V1
  });
}

test("ranks product page checkout progression friction above softer value communication", () => {
  const out = snapshot();

  assert.equal(out.v, "ProductPageFrictionSnapshotV1");
  assert.equal(out.source_mode, "DETERMINISTIC_FIXTURE");
  assert.equal(out.evidence[0]?.id, "ppf-interest-checkout-gap");
  assert.equal(out.evidence[0]?.severity, "HIGH");
  assert.equal(out.evidence[0]?.truth_state, "KNOWN");
  assert.match(out.projection.TOP_FRICTION, /CHECKOUT_PROGRESSION/);
  assert.match(out.projection.NEXT_BEST_TEST, /purchase path/);
});

test("tracking gap remains UNKNOWN and caps projection confidence", () => {
  const out = snapshot();
  const gap = out.evidence.find((item) => item.id === "ppf-tracking-gap");

  assert.ok(gap);
  assert.equal(gap.truth_state, "UNKNOWN");
  assert.equal(gap.confidence, "UNKNOWN");
  assert.equal(gap.severity, "UNKNOWN");
  assert.equal(gap.plausible_mechanism, null);
  assert.equal(gap.mechanism_truth_state, "UNKNOWN");
  assert.equal(out.projection.CONFIDENCE, "MEDIUM");
  assert.match(out.projection.WHY_IT_MATTERS, /tracking UNKNOWN/);
});

test("observed evidence stays separate from causal hypothesis", () => {
  const out = snapshot();
  const top = out.evidence[0];

  assert.equal(out.guardrails.observed_evidence_separate_from_hypothesis, true);
  assert.equal(out.guardrails.no_live_site_change, true);
  assert.equal(out.guardrails.tracking_gap_preserved_as_unknown, true);
  assert.match(top?.observed_signal ?? "", /engagement is strong/);
  assert.match(top?.plausible_mechanism ?? "", /may be interested/);
  assert.equal(top?.mechanism_truth_state, "HYPOTHESIS");
  assert.notEqual(top?.truth_state, top?.mechanism_truth_state);
});

test("does not turn unknown tracking into zero friction or a false causal conclusion", () => {
  const unknownOnly = PRODUCT_PAGE_FRICTION_EVIDENCE_FIXTURES_V1.filter((item) => item.id === "ppf-tracking-gap");
  const out = buildProductPageFrictionSnapshotV1({
    generatedAt: "2026-08-25T00:00:00.000Z",
    pageScope: "tracking gap fixture",
    evidence: unknownOnly
  });

  assert.equal(out.projection.TRUTH_STATE, "UNKNOWN");
  assert.equal(out.projection.CONFIDENCE, "UNKNOWN");
  assert.match(out.projection.TOP_FRICTION, /TRACKING_COVERAGE/);
  assert.match(out.projection.NEXT_BEST_TEST, /Do not launch/);
});
