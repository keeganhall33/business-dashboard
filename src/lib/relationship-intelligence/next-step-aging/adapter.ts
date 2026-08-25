import {
  RELATIONSHIP_NEXT_STEP_AGING_VERSION_V1,
  type RelationshipNextStepAgingInputV1,
  type RelationshipNextStepAgingV1,
  type RelationshipTimingTriggerV1
} from "./contracts";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IMPORTANT = new Set(["CRITICAL", "HIGH"]);

function daysSince(value: string | null, now: Date) {
  if (!value) return null;
  const started = Date.parse(value);
  if (!Number.isFinite(started)) return null;
  return Math.max(0, Math.floor((now.getTime() - started) / MS_PER_DAY));
}

function isIntentionalDefer(input: RelationshipNextStepAgingInputV1, now: Date) {
  const deferUntil = Date.parse(input.next_step.intentional_defer_until ?? "");
  return Number.isFinite(deferUntil) && deferUntil >= now.getTime() && Boolean(input.next_step.defer_rationale);
}

function triggerFor(input: RelationshipNextStepAgingInputV1, ageDays: number | null, now: Date): RelationshipTimingTriggerV1 {
  if (input.timing_window.evidence_state === "UNKNOWN" || input.timing_window.label === null || ageDays === null || input.next_step.useful_window_days === null) {
    return "UNKNOWN";
  }
  if (isIntentionalDefer(input, now) || input.timing_window.evidence_state === "STALE" && input.timing_window.label === "INTENTIONAL_HOLD") {
    return "DORMANT_INTENTIONAL";
  }
  return ageDays >= input.next_step.useful_window_days ? "AGING" : "TIMELY";
}

function whatAged(input: RelationshipNextStepAgingInputV1, ageDays: number | null) {
  if (ageDays === null) return [`${input.next_step.label}: age UNKNOWN because created_at is missing.`];
  return [
    `${input.next_step.label}: ${ageDays} days old against ${input.next_step.useful_window_days ?? "UNKNOWN"} day useful window.`,
    `Evidence freshness is ${input.last_meaningful_interaction.freshness}; relationship state is ${input.relationship_state}.`
  ];
}

function whyItMatters(input: RelationshipNextStepAgingInputV1, trigger: RelationshipTimingTriggerV1) {
  if (trigger === "DORMANT_INTENTIONAL") return `Intentional defer is preserved: ${input.next_step.defer_rationale}`;
  if (trigger === "UNKNOWN") return `Timing remains UNKNOWN for ${input.target_label}; do not infer urgency or safety from missing timing evidence.`;
  if (trigger === "AGING") return `${input.target_label} is ${input.opportunity_importance} importance, so the next step should be reviewed before relationship context goes stale.`;
  return `${input.target_label} is still inside its useful window; keep the internal next step visible without escalating.`;
}

function nextSafeInternalAction(input: RelationshipNextStepAgingInputV1, trigger: RelationshipTimingTriggerV1) {
  if (trigger === "AGING") return `Review the internal next step and refresh evidence before any outreach: ${input.next_step.label}`;
  if (trigger === "UNKNOWN") return `Clarify timing evidence internally before ranking this relationship: ${input.key_unknown_or_blocker}`;
  if (trigger === "DORMANT_INTENTIONAL") return `Keep deferred internally until ${input.next_step.intentional_defer_until}; no external action.`;
  return input.active_ask_or_commitment.summary ?? "Keep monitoring internally; no outreach or durable write.";
}

export function resolveRelationshipNextStepAgingV1(
  input: RelationshipNextStepAgingInputV1,
  { now = new Date("2026-08-25T12:00:00.000Z") } = {}
): RelationshipNextStepAgingV1 {
  const ageDays = daysSince(input.next_step.created_at, now);
  const timingTrigger = triggerFor(input, ageDays, now);
  const reviewRequired = timingTrigger === "AGING" && IMPORTANT.has(input.opportunity_importance);

  return {
    contract_version: RELATIONSHIP_NEXT_STEP_AGING_VERSION_V1,
    target_id: input.target_id,
    target_label: input.target_label,
    next_step_label: input.next_step.label,
    next_step_age_days: ageDays,
    useful_window_days: input.next_step.useful_window_days,
    timing_trigger: timingTrigger,
    relationship_state: input.relationship_state,
    evidence_freshness: input.last_meaningful_interaction.freshness,
    opportunity_importance: input.opportunity_importance,
    REVIEW_REQUIRED: reviewRequired,
    WHAT_AGED: whatAged(input, ageDays),
    WHY_IT_MATTERS: whyItMatters(input, timingTrigger),
    NEXT_SAFE_INTERNAL_ACTION: nextSafeInternalAction(input, timingTrigger),
    timing_state: input.timing_window.evidence_state === "UNKNOWN" ? "UNKNOWN" : input.timing_window.label === "INTENTIONAL_HOLD" ? "WAIT" : "WATCH",
    unknown_timing_explicit: timingTrigger === "UNKNOWN",
    intentional_defer_preserved: timingTrigger === "DORMANT_INTENTIONAL",
    external_action_allowed: false
  };
}
