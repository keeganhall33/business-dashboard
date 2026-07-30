import type { MetricExplanation } from "./explanation-contract";
import type { Opportunity, OpportunityType, ExpectedImpactRange } from "./recommendation-contract";

function mkImpactRange(partial: Partial<ExpectedImpactRange>): ExpectedImpactRange {
  return {
    currency: partial.currency ?? "UNKNOWN",
    horizon: partial.horizon ?? "unknown",
    low_incremental_revenue_cents: partial.low_incremental_revenue_cents ?? null,
    expected_incremental_revenue_cents: partial.expected_incremental_revenue_cents ?? null,
    high_incremental_revenue_cents: partial.high_incremental_revenue_cents ?? null,
    notes: partial.notes ?? [],
    assumptions: partial.assumptions ?? []
  };
}

function opp(
  type: OpportunityType,
  title: string,
  detection_rule: string,
  evidence: Opportunity["evidence"],
  confidence: Opportunity["confidence"],
  estimated_upside: ExpectedImpactRange,
  effort: Opportunity["effort"],
  cost: Opportunity["cost"],
  urgency: Opportunity["urgency"],
  recommended_action: string,
  dependencies: string[] = []
): Opportunity {
  return {
    id: `opp_${type}_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    type,
    title,
    detection_rule,
    evidence,
    confidence,
    estimated_upside,
    effort,
    cost,
    urgency,
    dependencies,
    recommended_action,
    review_date: null,
    expiration: null
  };
}

export function detectOpportunities(input: {
  explanation: MetricExplanation;
  missingSources: string[];
}): Opportunity[] {
  const ex = input.explanation;

  const opportunities: Opportunity[] = [];

  // Insufficient evidence opportunity
  if (ex.confidence === "insufficient_evidence") {
    opportunities.push(
      opp(
        "insufficient_evidence",
        "Insufficient evidence to act",
        "confidence == insufficient_evidence",
        ex.evidence,
        "insufficient_evidence",
        mkImpactRange({ horizon: "unknown", notes: ["Best action is to wait or improve telemetry."], assumptions: [] }),
        "low",
        { money_cents: 0, notes: [] },
        "medium",
        "Wait, collect more data, or connect missing source"
      )
    );
    return opportunities;
  }

  // Traffic/conversion divergence inference from driver labels.
  const primary = ex.primary_driver?.label ?? "";
  if (primary.includes("Traffic")) {
    opportunities.push(
      opp(
        "missing_data_connection",
        "Traffic-driven change: verify campaign activity",
        "primary driver indicates traffic (sessions) change",
        ex.evidence,
        ex.confidence,
        mkImpactRange({ horizon: "7d", notes: ["Validate traffic drivers before scaling spend."], assumptions: [] }),
        "low",
        { money_cents: null, notes: ["No spend implied (read-only)" ] },
        "high",
        "Identify which channel(s) increased/decreased traffic; avoid scaling without attribution"
      )
    );
  }
  if (primary.includes("Conversion")) {
    opportunities.push(
      opp(
        "high_traffic_low_conversion",
        "Conversion shift: landing-page alignment opportunity",
        "primary driver indicates conversion rate change",
        ex.evidence,
        ex.confidence,
        mkImpactRange({ horizon: "14d", notes: ["Fix conversion before buying more traffic."], assumptions: [] }),
        "medium",
        { money_cents: 0, notes: ["Primarily time/ops cost" ] },
        "high",
        "Inspect landing page/product page alignment; test CTA and product positioning"
      )
    );
  }
  if (primary.includes("Average order value")) {
    opportunities.push(
      opp(
        "bundle_opportunity",
        "AOV shift: bundle / premium feature opportunity",
        "primary driver indicates AOV change",
        ex.evidence,
        ex.confidence,
        mkImpactRange({ horizon: "14d", notes: ["AOV improvements can increase revenue without more traffic."], assumptions: [] }),
        "medium",
        { money_cents: 0, notes: [] },
        "medium",
        "Prepare bundle concept or premium edition feature to lift AOV"
      )
    );
  }

  // Attribution blind spot always relevant while matchback/email missing.
  if (input.missingSources.includes("email")) {
    opportunities.push(
      opp(
        "missing_data_connection",
        "Email telemetry missing",
        "email source not connected",
        ex.evidence,
        "strongly_supported",
        mkImpactRange({ horizon: "30d", notes: ["Email is a top explanation driver but is currently invisible."], assumptions: [] }),
        "low",
        { money_cents: null, notes: ["Integration work" ] },
        "high",
        "Connect email telemetry (read-only first)",
        ["identify vendor"]
      )
    );
  }
  if (input.missingSources.includes("matchback")) {
    opportunities.push(
      opp(
        "attribution_blind_spot",
        "No Meta↔Woo matchback",
        "matchback not implemented",
        ex.evidence,
        "strongly_supported",
        mkImpactRange({ horizon: "30d", notes: ["Without matchback, scaling spend is risky."], assumptions: [] }),
        "medium",
        { money_cents: null, notes: ["Engineering/analytics effort" ] },
        "high",
        "Implement matchback attribution join keys"
      )
    );
  }

  return opportunities;
}

