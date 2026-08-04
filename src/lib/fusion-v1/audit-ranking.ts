import type { FusionCandidate, RankedCandidate, CandidateGateResult, CandidatePenaltyBreakdown, CandidateFeatureValues } from "@/lib/fusion-v1/contracts";
import type { StrategicConstraintsSnapshot } from "@/lib/fusion-v1/types";
import { applyGates } from "@/lib/fusion-v1/gates";
import { scoreCandidateV1 } from "@/lib/fusion-v1/scoring";

type Freshness = "fresh" | "monitor_only" | "stale";

export type CandidateMeta = {
  source: string;
  freshness: Freshness;
};

function buildWhyRankedLower(rc: RankedCandidate): string {
  if (rc.gated.gated_out) {
    return `Gated out: ${rc.gated.reasons.map((r) => r.code).join(", ")}.`;
  }
  return `Ranked lower by score and tie-break rules (final_score=${rc.final_score}).`;
}

export function rankCandidatesForAuditV1(input: {
  nowIso: string;
  candidates: FusionCandidate[];
  constraints: StrategicConstraintsSnapshot;
  activeActionKeys: string[];
  candidateMetaById: Record<string, CandidateMeta | undefined>;
  clusterIdByCandidateId: Record<string, string | undefined>;
  // When true, freshness policy is enforced as a hard gate (candidate is not actionable).
  enforceFreshnessPolicy: boolean;
}): RankedCandidate[] {
  const ranked: RankedCandidate[] = input.candidates.map((candidate) => {
    const baseGate = applyGates({
      candidate,
      nowIso: input.nowIso,
      constraints: input.constraints,
      activeActionKeys: input.activeActionKeys
    });

    const meta = input.candidateMetaById[candidate.candidate_id];
    const freshness: Freshness = meta?.freshness ?? "stale";

    const gated: CandidateGateResult = {
      gated_out: baseGate.gated_out,
      reasons: [...baseGate.reasons],
      eligible_action_modes: [...baseGate.eligible_action_modes]
    };

    if (input.enforceFreshnessPolicy) {
      if (freshness === "stale") {
        gated.gated_out = true;
        gated.reasons.push({
          code: "stale_candidate",
          detail: "Excluded by production freshness policy (candidate is stale)."
        });
      } else if (freshness === "monitor_only") {
        gated.gated_out = true;
        gated.reasons.push({
          code: "monitor_only_candidate",
          detail: "Excluded by production freshness policy (monitor-only freshness)."
        });
      }
    }

    const scored = scoreCandidateV1(candidate, input.nowIso);

    const penalties: CandidatePenaltyBreakdown = {
      contradiction_penalty: scored.penalties.contradictionPenalty,
      missing_evidence_penalty: scored.penalties.missingEvidencePenalty,
      regime_mismatch_penalty: scored.penalties.regimeMismatchPenalty,
      fatigue_penalty: 0,
      outcome_prior_penalty: 0
    };
    const features: CandidateFeatureValues = {
      valuePotential: scored.features.valuePotential,
      confidenceNorm: scored.features.confidenceNorm,
      urgencyNorm: scored.features.urgencyNorm,
      strategicFit: scored.features.strategicFit,
      evidenceQuality: scored.features.evidenceQuality,
      outcomePrior: scored.features.outcomePrior,
      effortInverse: scored.features.effortInverse,
      costInverse: scored.features.costInverse,
      riskInverse: scored.features.riskInverse,
      reversibility: scored.features.reversibility,
      informationGain: scored.features.informationGain,
      expirationPressure: scored.features.expirationPressure,
      riskIfIgnored: scored.features.riskIfIgnored
    };

    return {
      candidate_id: candidate.candidate_id,
      cluster_id: input.clusterIdByCandidateId[candidate.candidate_id] ?? null,
      gated,
      score_before_penalties: Math.round(scored.score_before_penalties * 10) / 10,
      penalties,
      features,
      final_score: scored.final_score,
      tie_break: { used: false, reason: null },
      why_ranked_lower: null
    };
  });

  // Deterministic sort (mirrors engine v1 tie-break ordering).
  ranked.sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    const lowA = a.features.confidenceNorm < 0.5;
    const lowB = b.features.confidenceNorm < 0.5;
    if (lowA || lowB) {
      if (b.features.informationGain !== a.features.informationGain) return b.features.informationGain - a.features.informationGain;
    }
    if (b.features.expirationPressure !== a.features.expirationPressure) return b.features.expirationPressure - a.features.expirationPressure;
    if (b.features.effortInverse !== a.features.effortInverse) return b.features.effortInverse - a.features.effortInverse;
    return a.candidate_id.localeCompare(b.candidate_id);
  });

  for (let i = 0; i < ranked.length; i++) {
    const rc = ranked[i]!;
    if (i > 0) rc.why_ranked_lower = buildWhyRankedLower(rc);
  }

  return ranked;
}

