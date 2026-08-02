import type { ExplanationConfidence, ExplanationEvidenceItem } from "./explanation-contract";

export type ApprovalLevel =
  | "L0_INSIGHT"
  | "L1_RECOMMENDATION"
  | "L2_DRAFT_PREPARED"
  | "L3_READY_FOR_APPROVAL"
  | "L4_APPROVED_FOR_EXECUTION"
  | "L5_EXECUTED_AND_MEASURED";

export type RecommendationStatus =
  | "detected"
  | "analyzed"
  | "recommended"
  | "draft_prepared"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "snoozed"
  | "expired"
  | "executed"
  | "measuring"
  | "successful"
  | "unsuccessful"
  | "inconclusive";

export type RecommendationCategory =
  | "scale"
  | "pause"
  | "refresh"
  | "retarget"
  | "email"
  | "social"
  | "website"
  | "product"
  | "pricing_experiment"
  | "bundle"
  | "collector_outreach"
  | "lead_follow_up"
  | "abandoned_cart"
  | "inventory"
  | "media"
  | "partnership"
  | "measurement"
  | "data_connection"
  | "do_nothing";

export type OpportunityType =
  | "high_conversion_low_traffic"
  | "high_traffic_low_conversion"
  | "profitable_campaign_scale"
  | "ad_fatigue"
  | "underused_retargeting"
  | "strong_organic_no_promo"
  | "historical_demand_no_recent_campaign"
  | "high_engagement_weak_lp_conversion"
  | "abandoned_cart_recovery"
  | "repeat_customer_cross_sell"
  | "collector_follow_up"
  | "high_value_lead_follow_up"
  | "bundle_opportunity"
  | "geo_demand_concentration"
  | "email_segment_opportunity"
  | "content_format_opportunity"
  | "upcoming_moment"
  | "inventory_scarcity"
  | "underperforming_price_point"
  | "attribution_blind_spot"
  | "missing_data_connection"
  | "operational_bottleneck"
  | "unnecessary_spending"
  | "insufficient_evidence";

export type ExpectedImpactRange = {
  currency: "USD" | "UNKNOWN";
  horizon: "48h" | "7d" | "14d" | "30d" | "unknown";
  low_incremental_revenue_cents: number | null;
  expected_incremental_revenue_cents: number | null;
  high_incremental_revenue_cents: number | null;
  notes: string[];
  assumptions: string[];
};

export type PriorityBreakdown = {
  revenuePotential: number; // 0-1
  confidence: number; // 0-1
  urgency: number; // 0-1
  timeToImpact: number; // 0-1
  effortInverse: number; // 0-1
  costInverse: number; // 0-1
  riskInverse: number; // 0-1
  strategicFit: number; // 0-1
  executionReadiness: number; // 0-1
  overallScore: number; // 0-100
  formula: string;
};

export type RecommendationDraftAsset = {
  id: string;
  label: string;
  kind: "meta" | "email" | "website" | "social" | "sales" | "data";
  content: Record<string, unknown>;
  watermark: "DRAFT_NOT_APPROVED";
};

export type Recommendation = {
  id: string;
  title: string;
  category: RecommendationCategory;
  recommended_action: string;
  reason: string;
  supporting_evidence: ExplanationEvidenceItem[];

  affected_products: string[];
  affected_channels: string[];
  affected_audiences: string[];

  expected_outcome: string;
  estimated_incremental_revenue: ExpectedImpactRange;
  estimated_incremental_profit: ExpectedImpactRange | null;
  estimated_cost: { money_cents: number | null; notes: string[] };
  estimated_effort: { hours: number | null; level: "low" | "medium" | "high"; notes: string[] };
  time_to_impact: "hours" | "days" | "weeks" | "unknown";

  confidence: ExplanationConfidence;
  confidence_reasons: string[];
  urgency: "low" | "medium" | "high";
  priority_score: PriorityBreakdown;
  risk: "low" | "medium" | "high";
  downside: string[];

  prerequisites: string[];
  execution_steps: string[];
  prepared_assets: RecommendationDraftAsset[];
  approval_level: ApprovalLevel;

  measurement_plan: string;
  success_threshold: string;
  stop_condition: string;
  review_date: string | null;

  data_used: Array<{ source: string; notes: string }>;
  data_missing: string[];
  assumptions: string[];
  limitations: string[];

  status: RecommendationStatus;
};

export type Opportunity = {
  id: string;
  type: OpportunityType;
  title: string;
  detection_rule: string;
  evidence: ExplanationEvidenceItem[];
  confidence: ExplanationConfidence;
  estimated_upside: ExpectedImpactRange;
  effort: "low" | "medium" | "high";
  cost: { money_cents: number | null; notes: string[] };
  urgency: "low" | "medium" | "high";
  dependencies: string[];
  recommended_action: string;
  review_date: string | null;
  expiration: string | null;
};

export type OpportunitiesResponse = {
  ok: boolean;
  generatedAt: string;
  dataMode?: "LIVE_DATA" | "PARTIAL_LIVE_DATA" | "SEED_DATA" | "UNAVAILABLE";
  window: { startDate: string; endDate: string };
  opportunities: Opportunity[];
  warnings: string[];
};

export type RecommendationsResponse = {
  ok: boolean;
  generatedAt: string;
  dataMode?: "LIVE_DATA" | "PARTIAL_LIVE_DATA" | "SEED_DATA" | "UNAVAILABLE";
  window: { startDate: string; endDate: string };
  recommendations: Recommendation[];
  guardrailsTriggered: string[];
  warnings: string[];
};
