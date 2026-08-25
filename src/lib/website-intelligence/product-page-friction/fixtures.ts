import type { ProductPageFrictionEvidenceV1 } from "./contracts";

export const PRODUCT_PAGE_FRICTION_EVIDENCE_FIXTURES_V1: ProductPageFrictionEvidenceV1[] = [
  {
    id: "ppf-interest-checkout-gap",
    funnel_stage: "CHECKOUT_PROGRESSION",
    observed_signal: "Product-page engagement is strong, but fixture checkout progression is weak.",
    evidence_source: "website_conversion_fixture.product_page_to_checkout",
    source_freshness: "FRESH",
    truth_state: "KNOWN",
    confidence: "HIGH",
    severity: "HIGH",
    plausible_mechanism: "Buyers may be interested in the work but need a clearer path from product intent to checkout confidence.",
    mechanism_truth_state: "HYPOTHESIS",
    next_measurement: "Measure product page view to add-to-cart and checkout-start rates by product.",
    recommended_test: "Test a clearer product-page purchase path and checkout confidence block on a single read-only experiment plan.",
    notes: ["Observed conversion friction is evidence-backed; mechanism remains hypothesis until measured."]
  },
  {
    id: "ppf-scarcity-value-unclear",
    funnel_stage: "VALUE_SCARCITY_COMPREHENSION",
    observed_signal: "Scarcity and value cues are present but not clearly connected to why the piece is premium.",
    evidence_source: "website_copy_fixture.product_page_value_review",
    source_freshness: "FRESH",
    truth_state: "INFERRED",
    confidence: "MEDIUM",
    severity: "MEDIUM",
    plausible_mechanism: "Visitors may not understand edition scarcity, proof of craft, or why now matters before they reach checkout.",
    mechanism_truth_state: "HYPOTHESIS",
    next_measurement: "Measure scroll depth and clicks on scarcity/value sections before checkout intent.",
    recommended_test: "Test a tighter scarcity/value module without changing price, inventory, checkout, or live site settings.",
    notes: ["Qualitative value communication is separated from direct checkout evidence."]
  },
  {
    id: "ppf-tracking-gap",
    funnel_stage: "TRACKING_COVERAGE",
    observed_signal: "Checkout event continuity is incomplete, so true conversion loss cannot be quantified.",
    evidence_source: "website_analytics_fixture.tracking_gap",
    source_freshness: "UNKNOWN",
    truth_state: "UNKNOWN",
    confidence: "UNKNOWN",
    severity: "UNKNOWN",
    plausible_mechanism: null,
    mechanism_truth_state: "UNKNOWN",
    next_measurement: "Verify product view, add-to-cart, checkout-start, and purchase event continuity.",
    recommended_test: "Do not launch a conversion test until the measurement gap is verified.",
    notes: ["UNKNOWN is not zero conversion loss and not proof of no friction."]
  }
];
