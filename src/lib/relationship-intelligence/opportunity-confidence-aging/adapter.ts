import {
  RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_VERSION_V1,
  type RelationshipOpportunityConfidenceAgingInputV1,
  type RelationshipOpportunityConfidenceAgingReasonV1,
  type RelationshipOpportunityConfidenceAgingV1
} from "./contracts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MATERIAL_IMPORTANCE = new Set(["CRITICAL", "HIGH"]);
const LOW_CONFIDENCE = new Set(["possible", "insufficient_evidence"]);
const RISKY_TRUTH_STATES = new Set(["UNKNOWN", "STALE", "CONFLICTED"]);

function daysSince(value: string | null, now: Date) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / MS_PER_DAY));
}

function maxKnownAge(values: Array<string | null>, now: Date) {
  const ages = values.map((value) => daysSince(value, now)).filter((age): age is number => age !== null);
  return ages.length > 0 ? Math.max(...ages) : null;
}

function aged(ageDays: number | null, reviewWindowDays: number | null) {
  return ageDays !== null && reviewWindowDays !== null && ageDays >= reviewWindowDays;
}

function reviewReasons(
  input: RelationshipOpportunityConfidenceAgingInputV1,
  evidenceAgeDays: number | null,
  confidenceAgeDays: number | null,
  timingAgeDays: number | null
): RelationshipOpportunityConfidenceAgingReasonV1[] {
  const reasons: RelationshipOpportunityConfidenceAgingReasonV1[] = [];
  const hasUnknownEvidence = input.evidence_refs.some((ref) => ref.truth_state === "UNKNOWN" || ref.quality === "UNKNOWN" || ref.observed_at === null);

  if (aged(evidenceAgeDays, input.review_window_days)) reasons.push("EVIDENCE_AGED");
  if (aged(timingAgeDays, input.review_window_days)) reasons.push("TIMING_AGED");
  if (aged(confidenceAgeDays, input.review_window_days) && LOW_CONFIDENCE.has(input.confidence)) reasons.push("CONFIDENCE_OUTDATED");
  if (hasUnknownEvidence) reasons.push("UNKNOWN_EVIDENCE");
  if (RISKY_TRUTH_STATES.has(input.truth_state)) reasons.push("TRUTH_STATE_RISK");
  if (reasons.length === 0 && !MATERIAL_IMPORTANCE.has(input.opportunity_importance)) reasons.push("LOW_PRIORITY_DEFER");

  return reasons;
}

function unknowns(input: RelationshipOpportunityConfidenceAgingInputV1, evidenceAgeDays: number | null, confidenceAgeDays: number | null, timingAgeDays: number | null) {
  const missing: string[] = [];
  if (evidenceAgeDays === null) missing.push("Evidence age is UNKNOWN because no observed_at date is available.");
  if (confidenceAgeDays === null) missing.push("Confidence age is UNKNOWN because confidence_last_reviewed_at is missing.");
  if (timingAgeDays === null) missing.push("Timing age is UNKNOWN because timing_last_checked_at is missing.");
  if (input.truth_state === "UNKNOWN") missing.push("Relationship truth state is UNKNOWN.");
  if (input.timing_state === "UNKNOWN") missing.push("Opportunity timing is UNKNOWN.");
  return missing;
}

function whatAged(input: RelationshipOpportunityConfidenceAgingInputV1, evidenceAgeDays: number | null, confidenceAgeDays: number | null, timingAgeDays: number | null) {
  return [
    `Evidence age: ${evidenceAgeDays ?? "UNKNOWN"} days against ${input.review_window_days ?? "UNKNOWN"} day review window.`,
    `Confidence review age: ${confidenceAgeDays ?? "UNKNOWN"} days.`,
    `Timing check age: ${timingAgeDays ?? "UNKNOWN"} days.`
  ];
}

function whyItMatters(input: RelationshipOpportunityConfidenceAgingInputV1, reasons: RelationshipOpportunityConfidenceAgingReasonV1[]) {
  if (reasons.includes("UNKNOWN_EVIDENCE") || reasons.includes("TRUTH_STATE_RISK")) {
    return `${input.opportunity_label} cannot rely on aged or uncertain relationship evidence; keep confidence review explicit before any external action.`;
  }
  if (reasons.includes("EVIDENCE_AGED") || reasons.includes("TIMING_AGED") || reasons.includes("CONFIDENCE_OUTDATED")) {
    return `${input.opportunity_label} is ${input.opportunity_importance} importance, so stale evidence or timing could change the relationship opportunity decision.`;
  }
  return `${input.opportunity_label} does not need immediate review; preserve the current read-only confidence state.`;
}

export function resolveRelationshipOpportunityConfidenceAgingV1(
  input: RelationshipOpportunityConfidenceAgingInputV1,
  { now = new Date("2026-08-25T12:00:00.000Z") } = {}
): RelationshipOpportunityConfidenceAgingV1 {
  const evidenceAgeDays = maxKnownAge(input.evidence_refs.map((ref) => ref.observed_at), now);
  const confidenceAgeDays = daysSince(input.confidence_last_reviewed_at, now);
  const timingAgeDays = daysSince(input.timing_last_checked_at, now);
  const reasons = reviewReasons(input, evidenceAgeDays, confidenceAgeDays, timingAgeDays);
  const reviewRequired = MATERIAL_IMPORTANCE.has(input.opportunity_importance) && reasons.some((reason) => reason !== "LOW_PRIORITY_DEFER");

  return {
    contract_version: RELATIONSHIP_OPPORTUNITY_CONFIDENCE_AGING_VERSION_V1,
    opportunity_id: input.opportunity_id,
    target_label: input.target_label,
    opportunity_label: input.opportunity_label,
    evidence_age_days: evidenceAgeDays,
    confidence_age_days: confidenceAgeDays,
    timing_age_days: timingAgeDays,
    confidence: input.confidence,
    truth_state: input.truth_state,
    timing_state: input.timing_state,
    REVIEW_REQUIRED: reviewRequired,
    REVIEW_REASON: reasons,
    WHAT_AGED: whatAged(input, evidenceAgeDays, confidenceAgeDays, timingAgeDays),
    WHY_IT_MATTERS: whyItMatters(input, reasons),
    NEXT_SAFE_INTERNAL_ACTION: reviewRequired ? input.next_internal_action : "Defer outreach; keep monitoring internally with no external action.",
    UNKNOWN: unknowns(input, evidenceAgeDays, confidenceAgeDays, timingAgeDays),
    external_action_allowed: false
  };
}
