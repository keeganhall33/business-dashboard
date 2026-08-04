import type { FusionCandidate } from "@/lib/fusion-v1/contracts";
import { normalizeConfidenceTo01 } from "@/lib/fusion-v1/confidence-normalization";

export type FusionRunStatus =
  | "completed_with_decision"
  | "completed_hold"
  | "completed_monitor"
  | "insufficient_candidates"
  | "no_fresh_candidates"
  | "blocked_by_data_quality"
  | "failed";

export type FusionExecutionMode = "comparative" | "single_candidate" | "no_candidate";

export type FusionRunPolicyDecision = {
  status: FusionRunStatus;
  execution_mode: FusionExecutionMode;
  reason_codes: string[];
  next_review_at: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function decideRunPolicy(input: {
  nowIso: string;
  eligibleClusters: FusionCandidate[];
  gatedCount: number;
  freshCount: number;
  staleCount: number;
  sourcesInspected: string[];
}): FusionRunPolicyDecision {
  const now = new Date(input.nowIso).getTime();
  const next_review_at = new Date(now + 24 * 3600 * 1000).toISOString();

  if (input.freshCount === 0) {
    if (input.staleCount > 0) {
      return {
        status: "no_fresh_candidates",
        execution_mode: "no_candidate",
        reason_codes: ["no_fresh_candidates"],
        next_review_at
      };
    }
    return {
      status: "insufficient_candidates",
      execution_mode: "no_candidate",
      reason_codes: ["no_candidates"],
      next_review_at
    };
  }

  // Minimum threshold for comparative decision.
  if (input.eligibleClusters.length < 2) {
    const only = input.eligibleClusters[0] ?? null;
    if (!only) {
      return {
        status: "insufficient_candidates",
        execution_mode: "no_candidate",
        reason_codes: ["no_eligible_candidates"],
        next_review_at
      };
    }

    const { normalized: conf01 } = normalizeConfidenceTo01(only.confidence);
    const missingPenalty = clamp01(only.missing_evidence.length / 8);

    // Single-candidate behavior: never claim comparative superiority.
    if (only.information_gain_value >= 0.5) {
      return {
        status: "completed_monitor",
        execution_mode: "single_candidate",
        reason_codes: ["single_candidate", "information_gain_only"],
        next_review_at
      };
    }

    if (conf01 >= 0.8 && missingPenalty <= 0.25) {
      return {
        status: "completed_monitor",
        execution_mode: "single_candidate",
        reason_codes: ["single_candidate", "strong_evidence_but_no_comparison"],
        next_review_at
      };
    }

    if (conf01 < 0.5 || missingPenalty >= 0.5) {
      return {
        status: "blocked_by_data_quality",
        execution_mode: "single_candidate",
        reason_codes: ["single_candidate", "insufficient_evidence"],
        next_review_at
      };
    }

    return {
      status: "completed_hold",
      execution_mode: "single_candidate",
      reason_codes: ["single_candidate", "hold_until_more_intelligence"],
      next_review_at
    };
  }

  // Comparative path: require at least one candidate with sufficient evidence for an operating/info-gain decision.
  const hasSufficient = input.eligibleClusters.some((c) => {
    const { normalized: conf01 } = normalizeConfidenceTo01(c.confidence);
    const missingPenalty = clamp01(c.missing_evidence.length / 8);
    return conf01 >= 0.5 && missingPenalty <= 0.5 && Boolean(c.proposed_action);
  });

  if (!hasSufficient) {
    return {
      status: "blocked_by_data_quality",
      execution_mode: "comparative",
      reason_codes: ["comparative_candidates_present", "none_sufficient"],
      next_review_at
    };
  }

  return {
    status: "completed_with_decision",
    execution_mode: "comparative",
    reason_codes: ["comparative"],
    next_review_at
  };
}

