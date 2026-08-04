import type { CandidateGateResult, FusionCandidate, StrategicConstraintsSnapshot } from "@/lib/fusion-v1/types";
import { normalizeConfidenceTo01 } from "@/lib/fusion-v1/confidence-normalization";

export function applyGates(input: {
  candidate: FusionCandidate;
  nowIso: string;
  constraints: StrategicConstraintsSnapshot;
  activeActionKeys: string[]; // read-only: action keys already underway
}): CandidateGateResult {
  const reasons: CandidateGateResult["reasons"] = [];
  const eligible_action_modes: CandidateGateResult["eligible_action_modes"] = ["operating", "information_gain", "hold"];

  const now = new Date(input.nowIso).getTime();
  const expires = input.candidate.relevance_expires_at ? new Date(input.candidate.relevance_expires_at).getTime() : null;
  if (expires != null && Number.isFinite(expires) && expires < now) {
    reasons.push({ code: "expired_relevance", detail: "Candidate relevance_expires_at is in the past." });
  }

  // Blocked domain enforcement.
  const blocked = new Set(input.constraints.blocked_domains);
  if (blocked.has("meta_attribution") && input.candidate.blocked_domain_constraints.includes("meta_attribution_blocked")) {
    reasons.push({ code: "blocked_domain", detail: "Meta attribution is blocked; candidate relies on Meta ROAS/purchases." });
  }

  // Strategic guardrails.
  if (input.candidate.strategic_guardrail_violations.includes("premium_positioning_violation")) {
    reasons.push({ code: "premium_positioning_violation", detail: "Candidate violates premium positioning constraints." });
  }
  if (input.candidate.strategic_guardrail_violations.includes("scarcity_violation")) {
    reasons.push({ code: "scarcity_violation", detail: "Candidate violates scarcity protection constraints." });
  }
  if (input.candidate.strategic_guardrail_violations.includes("licensing_ip_review_required")) {
    reasons.push({
      code: "licensing_ip_review_required",
      detail: "Candidate requires licensing/IP review; cannot proceed as operating action without review."
    });
  }

  // Capacity/budget gating (nullable allowed).
  if (input.candidate.proposed_action) {
    const hoursAvail = input.constraints.capacity.available_hours_today;
    if (
      typeof hoursAvail === "number" &&
      typeof input.candidate.proposed_action.estimated_effort_hours === "number" &&
      input.candidate.proposed_action.estimated_effort_hours > hoursAvail
    ) {
      reasons.push({ code: "capacity_infeasible", detail: "Estimated effort exceeds available hours today." });
    }
    const budgetAvail = input.constraints.capacity.available_discretionary_budget_cents_today;
    if (
      typeof budgetAvail === "number" &&
      typeof input.candidate.proposed_action.estimated_cost_cents === "number" &&
      input.candidate.proposed_action.estimated_cost_cents > budgetAvail
    ) {
      reasons.push({ code: "budget_infeasible", detail: "Estimated cost exceeds available discretionary budget today." });
    }
  }

  // Actions already underway.
  if (input.candidate.proposed_action?.action_key && input.activeActionKeys.includes(input.candidate.proposed_action.action_key)) {
    reasons.push({ code: "action_already_underway", detail: "An action with the same action_key is already underway." });
  }

  // Mutually exclusive actions.
  const actionKey = input.candidate.proposed_action?.action_key ?? null;
  if (actionKey) {
    for (const [group, keys] of Object.entries(input.constraints.mutually_exclusive_action_groups ?? {})) {
      if (keys.includes(actionKey)) {
        const underwayInGroup = input.activeActionKeys.find((k) => keys.includes(k));
        if (underwayInGroup && underwayInGroup !== actionKey) {
          reasons.push({
            code: "mutually_exclusive",
            detail: `Action is mutually exclusive with underway action in group ${group}.`
          });
        }
      }
    }
  }

  // Insufficient evidence for direct operating action.
  const { normalized: conf01 } = normalizeConfidenceTo01(input.candidate.confidence);
  const missingCount = input.candidate.missing_evidence.length;

  const lowConfidence = conf01 < 0.5;
  const highMissing = missingCount >= 4;
  if (lowConfidence || highMissing) {
    // Only information-gain or hold can win.
    const filtered = eligible_action_modes.filter((m) => m !== "operating");
    eligible_action_modes.splice(0, eligible_action_modes.length, ...filtered);
    reasons.push({
      code: "insufficient_evidence_for_operating_action",
      detail: "Confidence is low or missing evidence is high; direct operating action is not eligible."
    });
  }

  // If any hard gate exists, candidate can still remain as monitor/ignored but is gated for winning.
  const gated_out = reasons.some((r) =>
    [
      "expired_relevance",
      "blocked_domain",
      "premium_positioning_violation",
      "scarcity_violation",
      "capacity_infeasible",
      "budget_infeasible",
      "action_already_underway",
      "mutually_exclusive"
    ].includes(r.code)
  );

  return { gated_out, reasons, eligible_action_modes };
}
