import type { ExternalEventV1 } from "@/lib/external-intelligence/contracts/external-event-v1";
import { detectOpportunityCandidatesFromEventV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";
import {
  evaluateOpportunityPlanningReadinessV1,
  type EvidenceTriStateV1,
  type OpportunityArtworkClassV1,
  type OpportunityCapacityFitV1,
  type OpportunityDifferentiationRoleV1,
  type OpportunityPlanningSignalClassV1,
  type OpportunityTruthStateV1,
  type StrategicUpsideLevelV1
} from "@/lib/opportunity-intelligence/planning-readiness-v1";

export const PRODUCTION_OPPORTUNITY_RADAR_POLICY_VERSION = "production_opportunity_radar_v1.0" as const;
const DAY_MS = 86_400_000;

export type CanonicalExternalEventRowV1 = {
  event_id: string;
  event_type: string;
  lifecycle_status: string;
  current_content_hash: string;
  content_hash: string;
  schema_version: string;
  policy_version: string;
  created_at: string | null;
  payload_json: unknown;
};

export type ProductionOpportunityRadarCandidateV1 = {
  opportunity_candidate_id: string;
  policy_version: typeof PRODUCTION_OPPORTUNITY_RADAR_POLICY_VERSION;
  state: "QUALIFIED_OPPORTUNITY";
  early_signal: string;
  likely_planning_timeline: string;
  why_keegan: string;
  planning_runway_days: number | null;
  planning_runway_bucket: string;
  production_demand: string;
  capacity_fit: string;
  differentiated_role: string;
  crowding_risk: string;
  economics_revenue_structure: string;
  strategic_upside: string;
  likely_decision_maker: string;
  access_path: string;
  single_best_next_move: string;
  why_now: string;
  evidence_refs: string[];
  confidence: "HIGH" | "MEDIUM";
  unknowns: string[];
  what_would_change: string[];
  score: number;
  no_external_action: true;
};

export type ProductionOpportunityRadarSuppressionV1 = {
  event_id: string;
  reason: string;
  evidence_refs: string[];
};

export type ProductionOpportunityRadarResultV1 = {
  policy_version: typeof PRODUCTION_OPPORTUNITY_RADAR_POLICY_VERSION;
  generated_at: string;
  source: "canonical_external_events_v1";
  inspected_count: number;
  qualified_count: number;
  surfaced_count: number;
  suppressed_count: number;
  source_freshness: { newest_evidence_at: string | null; state: "FRESH" | "STALE" | "UNKNOWN" };
  proof_status: "LIVE_PRECISION_PROVEN" | "IMPLEMENTED_NEEDS_LIVE_PROOF";
  candidates: ProductionOpportunityRadarCandidateV1[];
  suppressions: ProductionOpportunityRadarSuppressionV1[];
  safety: {
    read_only: true;
    no_outreach: true;
    no_spend: true;
    no_contract_or_booking: true;
    no_durable_write: true;
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function iso(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const time = Date.parse(candidate);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function attributes(payload: Record<string, unknown>): Map<string, string> {
  const output = new Map<string, string>();
  const rows = Array.isArray(payload.attributes) ? payload.attributes : [];
  for (const item of rows) {
    const row = record(item);
    const key = text(row?.key)?.toLowerCase();
    const value = text(row?.value);
    if (key && value && !output.has(key)) output.set(key, value);
  }
  return output;
}

function entityName(value: unknown): string {
  const ref = record(value);
  return text(ref?.canonical_name) ?? text(ref?.name) ?? "UNKNOWN";
}

function participants(payload: Record<string, unknown>): Array<{ role: string; name: string }> {
  const rows = Array.isArray(payload.participants) ? payload.participants : [];
  return rows.map((item) => {
    const row = record(item);
    return { role: text(row?.role) ?? "unknown", name: entityName(row?.entity_ref) };
  });
}

function enumOr<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return value && allowed.includes(value as T) ? value as T : fallback;
}

function tri(value: string | undefined): EvidenceTriStateV1 {
  return enumOr(value, ["YES", "NO", "UNKNOWN"] as const, "UNKNOWN");
}

function upside(value: string | undefined): StrategicUpsideLevelV1 {
  return enumOr(value, ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const, "UNKNOWN");
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function dedupeKey(row: CanonicalExternalEventRowV1, payload: Record<string, unknown>, attrs: Map<string, string>): string {
  const origin = attrs.get("originating_evidence_id") ?? attrs.get("source_url") ?? attrs.get("canonical_url");
  if (origin) return `origin:${canonicalUrl(origin)}`;
  const people = participants(payload).map((item) => `${item.role}:${item.name.toLowerCase()}`).sort().join("|");
  const role = (attrs.get("appointment_role") ?? "").toLowerCase();
  const times = record(payload.times);
  const date = (iso(times?.announcement_time) ?? iso(times?.event_time) ?? "unknown").slice(0, 10);
  return `semantic:${row.event_type}:${people}:${role}:${date}`;
}

function evidenceRef(row: CanonicalExternalEventRowV1): string {
  return `event:${row.event_id}@${row.content_hash}`;
}

function verificationTruth(payload: Record<string, unknown>): OpportunityTruthStateV1 {
  const state = text(payload.verification_state);
  if (state === "corroborated" || state === "corrected") return "KNOWN";
  if (state === "contradicted") return "CONFLICTED";
  return "UNKNOWN";
}

function productionRange(attrs: Map<string, string>): "UNKNOWN" | { minDays: number; maxDays: number } {
  const min = Number(attrs.get("production_window_min_days"));
  const max = Number(attrs.get("production_window_max_days"));
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min) return "UNKNOWN";
  return { minDays: min, maxDays: max };
}

function suppression(event_id: string, reason: string, refs: string[]): ProductionOpportunityRadarSuppressionV1 {
  return { event_id, reason, evidence_refs: refs };
}

function freshness(rows: CanonicalExternalEventRowV1[], nowIso: string): ProductionOpportunityRadarResultV1["source_freshness"] {
  const values = rows.flatMap((row) => {
    const payload = record(row.payload_json);
    const times = record(payload?.times);
    return [iso(times?.retrieved_at), iso(times?.announcement_time), iso(row.created_at)].filter((v): v is string => Boolean(v));
  }).sort().reverse();
  const newest = values[0] ?? null;
  if (!newest) return { newest_evidence_at: null, state: "UNKNOWN" };
  const ageDays = Math.floor((Date.parse(nowIso) - Date.parse(newest)) / DAY_MS);
  return { newest_evidence_at: newest, state: ageDays <= 45 ? "FRESH" : "STALE" };
}

function scoreCandidate(input: {
  runwayDays: number | null;
  confidence: "HIGH" | "MEDIUM";
  capacityFit: string;
  differentiation: string;
  accessPath: string;
  economics: string;
  unknownCount: number;
}): number {
  let score = 0;
  if (input.runwayDays != null && input.runwayDays >= 90 && input.runwayDays <= 730) score += 30;
  if (input.confidence === "HIGH") score += 15;
  if (input.capacityFit === "FIT") score += 15;
  else if (input.capacityFit === "TIGHT") score += 8;
  if (["DISTINCTIVE_LEAD_ARTIST", "EXCLUSIVE_OR_FEATURED_ARTIST"].includes(input.differentiation)) score += 18;
  else if (input.differentiation === "STRATEGIC_COLLABORATOR") score += 10;
  if (input.accessPath !== "UNKNOWN") score += 12;
  if (input.economics !== "UNKNOWN") score += 10;
  score -= Math.min(20, input.unknownCount * 4);
  return Math.max(0, score);
}

export function buildProductionOpportunityRadarV1(input: {
  rows: CanonicalExternalEventRowV1[];
  nowIso: string;
  limit?: number;
}): ProductionOpportunityRadarResultV1 {
  const now = iso(input.nowIso);
  if (!now) throw new Error("nowIso must be a valid timestamp");
  const limit = Math.max(1, Math.min(5, input.limit ?? 5));
  const qualified: ProductionOpportunityRadarCandidateV1[] = [];
  const suppressions: ProductionOpportunityRadarSuppressionV1[] = [];
  const seen = new Map<string, string[]>();

  for (const row of [...input.rows].sort((a, b) => a.event_id.localeCompare(b.event_id))) {
    const ref = evidenceRef(row);
    if (row.lifecycle_status !== "active") {
      suppressions.push(suppression(row.event_id, "INACTIVE_CANONICAL_EVENT", [ref]));
      continue;
    }
    if (row.current_content_hash !== row.content_hash) {
      suppressions.push(suppression(row.event_id, "NON_CURRENT_EVENT_VERSION", [ref]));
      continue;
    }
    const payload = record(row.payload_json);
    if (!payload || payload.schema_version !== "external_event_v1") {
      suppressions.push(suppression(row.event_id, "INVALID_CANONICAL_EVENT_PAYLOAD", [ref]));
      continue;
    }
    const attrs = attributes(payload);
    const key = dedupeKey(row, payload, attrs);
    const prior = seen.get(key);
    if (prior) {
      prior.push(ref);
      suppressions.push(suppression(row.event_id, "DUPLICATE_UNDERLYING_SIGNAL", [ref]));
      continue;
    }
    seen.set(key, [ref]);

    let detected;
    try {
      detected = detectOpportunityCandidatesFromEventV1({
        event: payload as ExternalEventV1,
        event_version_ref: {
          event_id: row.event_id,
          content_hash: row.content_hash,
          schema_version: "external_event_v1",
          policy_version: row.policy_version
        },
        includeRejections: true
      });
    } catch {
      suppressions.push(suppression(row.event_id, "CANONICAL_DETECTOR_REJECTED_PAYLOAD", [ref]));
      continue;
    }
    const candidate = detected.candidates[0];
    if (!candidate) {
      suppressions.push(suppression(row.event_id, detected.audit.reason_codes[0] ?? "NO_CANONICAL_OPPORTUNITY", [ref]));
      continue;
    }

    const times = record(payload.times);
    const detectedAt = iso(times?.announcement_time) ?? iso(times?.event_time) ?? iso(row.created_at) ?? now;
    const deliverBy = iso(attrs.get("deliver_by")) ?? iso(times?.effective_until);
    const engageBy = iso(attrs.get("engage_by")) ?? null;
    const planningSignalClass = enumOr<OpportunityPlanningSignalClassV1>(attrs.get("planning_signal_class"), [
      "MUSEUM_EXHIBITION", "ATHLETE_BRAND_CAMPAIGN", "EVENT_FESTIVAL", "CHARITY_BENEFIT", "COLLECTIBLES_PLATFORM", "GALLERY_OPEN_CALL", "OTHER"
    ], "OTHER");
    const artworkClass = enumOr<OpportunityArtworkClassV1>(attrs.get("artwork_class"), [
      "EXISTING_ARTWORK", "SMALL_FAST_ORIGINAL", "STANDARD_ORIGINAL", "MAJOR_ORIGINAL", "NON_ART_ACTIVATION", "UNKNOWN"
    ], "UNKNOWN");
    const capacityFit = enumOr<OpportunityCapacityFitV1>(attrs.get("capacity_fit"), ["FIT", "TIGHT", "NOT_FIT", "UNKNOWN"], "UNKNOWN");
    const differentiation = enumOr<OpportunityDifferentiationRoleV1>(attrs.get("differentiation_role"), [
      "DISTINCTIVE_LEAD_ARTIST", "EXCLUSIVE_OR_FEATURED_ARTIST", "STRATEGIC_COLLABORATOR", "ONE_OF_FEW_CURATED_ARTISTS", "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS", "OPEN_CALL_COMMODITY", "UNKNOWN"
    ], "UNKNOWN");
    const truthState = verificationTruth(payload);
    const readiness = evaluateOpportunityPlanningReadinessV1({
      opportunityId: candidate.opportunity_candidate_id,
      now,
      detectedAt,
      engageBy,
      deliverBy,
      planningSignalClass,
      artworkClass,
      productionWindowDays: productionRange(attrs),
      capacityFit,
      differentiationRole: differentiation,
      economics: {
        originalSaleAllowed: tri(attrs.get("original_sale_allowed")),
        printProceedsDonation: tri(attrs.get("print_proceeds_donation")),
        sponsorUnderwriting: tri(attrs.get("sponsor_underwriting")),
        artistFeeCostRecovery: tri(attrs.get("artist_fee_cost_recovery")),
        smallerFasterWorkOption: tri(attrs.get("smaller_faster_work_option"))
      },
      strategicUpside: {
        access: upside(attrs.get("strategic_upside_access")),
        prestige: upside(attrs.get("strategic_upside_prestige")),
        relationship: upside(attrs.get("strategic_upside_relationship")),
        charityImpact: upside(attrs.get("strategic_upside_charity_impact"))
      },
      collectibles: {
        genericSketchCard: tri(attrs.get("generic_sketch_card")),
        differentiatedRecurringPlatform: tri(attrs.get("differentiated_recurring_platform")),
        licensingAdvantage: tri(attrs.get("licensing_advantage")),
        marqueeRelationshipAccess: tri(attrs.get("marquee_relationship_access"))
      },
      evidenceRefs: [ref],
      truthState
    });

    const whyKeegan = attrs.get("why_keegan") ?? "UNKNOWN";
    const decisionMaker = attrs.get("likely_decision_maker") ?? "UNKNOWN";
    const accessPath = attrs.get("access_path") ?? "UNKNOWN";
    const nextMove = attrs.get("single_best_next_move") ?? "UNKNOWN";
    const whyNow = attrs.get("why_now") ?? "UNKNOWN";
    const economics = attrs.get("economics_revenue_structure") ?? "UNKNOWN";
    const strategicUpside = attrs.get("strategic_upside") ?? "UNKNOWN";
    const majorNewWork = ["STANDARD_ORIGINAL", "MAJOR_ORIGINAL"].includes(artworkClass);
    const shortWindow = readiness.planningRunwayDays != null && readiness.planningRunwayDays < 90;
    let reason: string | null = null;
    if (truthState !== "KNOWN") reason = `EVIDENCE_${truthState}`;
    else if (!deliverBy) reason = "PLANNING_WINDOW_UNKNOWN";
    else if (shortWindow && majorNewWork) reason = "LATE_SIGNAL_REQUIRES_MAJOR_NEW_ARTWORK";
    else if (readiness.missedPlanningWindow) reason = "MISSED_PLANNING_WINDOW";
    else if (["OPEN_CALL_COMMODITY", "ONE_OF_MANY_INTERCHANGEABLE_ARTISTS"].includes(differentiation)) reason = "CROWDED_OR_COMMODITY_ROLE";
    else if (whyKeegan === "UNKNOWN") reason = "WHY_KEEGAN_UNSUPPORTED";
    else if (decisionMaker === "UNKNOWN" || accessPath === "UNKNOWN") reason = "DECISION_MAKER_OR_ACCESS_PATH_UNKNOWN";
    else if (nextMove === "UNKNOWN" || whyNow === "UNKNOWN") reason = "NO_SPECIFIC_TIMELY_NEXT_MOVE";
    else if (!["ACTIONABLE", "PREPARE_EARLY"].includes(readiness.eligibility)) reason = `READINESS_${readiness.eligibility}`;
    if (reason) {
      suppressions.push(suppression(row.event_id, reason, [ref]));
      continue;
    }

    const unknowns = [
      economics === "UNKNOWN" ? "ECONOMICS_REVENUE_STRUCTURE" : null,
      strategicUpside === "UNKNOWN" ? "STRATEGIC_UPSIDE" : null,
      capacityFit === "UNKNOWN" ? "CAPACITY_FIT" : null
    ].filter((value): value is string => Boolean(value));
    const confidence = record(payload.extraction_confidence)?.level === "high" ? "HIGH" : "MEDIUM";
    qualified.push({
      opportunity_candidate_id: candidate.opportunity_candidate_id,
      policy_version: PRODUCTION_OPPORTUNITY_RADAR_POLICY_VERSION,
      state: "QUALIFIED_OPPORTUNITY",
      early_signal: candidate.hypothesis,
      likely_planning_timeline: `${engageBy ?? "UNKNOWN"} -> ${deliverBy}`,
      why_keegan: whyKeegan,
      planning_runway_days: readiness.planningRunwayDays,
      planning_runway_bucket: readiness.planningRunwayBucket,
      production_demand: readiness.productionDemand,
      capacity_fit: readiness.capacityFit,
      differentiated_role: readiness.differentiationRole,
      crowding_risk: readiness.crowdingRisk,
      economics_revenue_structure: economics,
      strategic_upside: strategicUpside,
      likely_decision_maker: decisionMaker,
      access_path: accessPath,
      single_best_next_move: nextMove,
      why_now: whyNow,
      evidence_refs: seen.get(key) ?? [ref],
      confidence,
      unknowns,
      what_would_change: [...readiness.whatWouldChange],
      score: scoreCandidate({
        runwayDays: readiness.planningRunwayDays,
        confidence,
        capacityFit,
        differentiation,
        accessPath,
        economics,
        unknownCount: unknowns.length
      }),
      no_external_action: true
    });
  }

  qualified.sort((a, b) => b.score - a.score || a.opportunity_candidate_id.localeCompare(b.opportunity_candidate_id));
  const candidates = qualified.slice(0, limit);
  const source_freshness = freshness(input.rows, now);
  const proofPass = candidates.length > 0 && suppressions.length > 0 && source_freshness.state === "FRESH";
  return {
    policy_version: PRODUCTION_OPPORTUNITY_RADAR_POLICY_VERSION,
    generated_at: now,
    source: "canonical_external_events_v1",
    inspected_count: input.rows.length,
    qualified_count: qualified.length,
    surfaced_count: candidates.length,
    suppressed_count: suppressions.length,
    source_freshness,
    proof_status: proofPass ? "LIVE_PRECISION_PROVEN" : "IMPLEMENTED_NEEDS_LIVE_PROOF",
    candidates,
    suppressions,
    safety: {
      read_only: true,
      no_outreach: true,
      no_spend: true,
      no_contract_or_booking: true,
      no_durable_write: true
    }
  };
}
