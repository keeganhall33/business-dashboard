import type { FusionCandidate, FusionReversibility } from "@/lib/fusion-v1/contracts";
import { normalizeConfidenceTo01 } from "@/lib/fusion-v1/confidence-normalization";

export const FUSION_SCORE_FORMULA_V1 =
  "score = 100*(0.22*valuePotential + 0.18*confidenceNorm + 0.12*urgencyNorm + 0.10*strategicFit + 0.08*evidenceQuality + 0.08*informationGain + 0.06*outcomePrior + 0.05*effortInverse + 0.05*costInverse + 0.04*riskInverse + 0.02*reversibility) - 100*(0.10*contradictionPenalty + 0.10*missingEvidencePenalty + 0.05*regimeMismatchPenalty) + 100*(0.05*expirationPressure + 0.05*riskIfIgnored)";

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function urgencyTo01(u: FusionCandidate["urgency"]): number {
  return u === "high" ? 1 : u === "medium" ? 0.6 : 0.3;
}

function riskToInverse01(r: FusionCandidate["risk"]): number {
  return r === "high" ? 0.2 : r === "medium" ? 0.5 : 0.8;
}

function reversibilityTo01(r: FusionReversibility): number {
  if (r === "irreversible") return 0.0;
  if (r === "partially_reversible") return 0.6;
  return 1.0;
}

export function computeContradictionPenalty(candidate: FusionCandidate): number {
  const support = candidate.supporting_evidence_fact_ids.length;
  const contra = candidate.contradicting_evidence_fact_ids.length;
  const ratio = contra / Math.max(1, support);
  return clamp01(0.5 * ratio + 0.5 * (contra >= 2 ? 1 : 0));
}

export function computeMissingEvidencePenalty(candidate: FusionCandidate): number {
  return clamp01(candidate.missing_evidence.length / 8);
}

export function computeFeatureValues(candidate: FusionCandidate, nowIso: string) {
  const { normalized: confidenceNorm } = normalizeConfidenceTo01(candidate.confidence);

  const effortHours = candidate.proposed_action?.estimated_effort_hours;
  const costCents = candidate.proposed_action?.estimated_cost_cents;

  const effortInverse = effortHours == null ? 0.5 : clamp01(1 - Math.min(1, effortHours / 8));
  const costInverse = costCents == null ? 0.5 : clamp01(1 - Math.min(1, costCents / 500_00));

  const evidenceQuality = clamp01(1 - computeMissingEvidencePenalty(candidate));
  const contradictionPenalty = computeContradictionPenalty(candidate);

  const expires = candidate.relevance_expires_at ? new Date(candidate.relevance_expires_at).getTime() : null;
  const now = new Date(nowIso).getTime();
  const daysToExpire = expires == null || !Number.isFinite(expires) ? null : Math.max(0, (expires - now) / (24 * 3600 * 1000));
  const expirationPressure = daysToExpire == null ? 0.0 : clamp01(1 - Math.min(1, daysToExpire / 14));

  const reversibility = candidate.proposed_action ? reversibilityTo01(candidate.proposed_action.reversibility) : 0.5;

  return {
    features: {
      valuePotential: clamp01(candidate.value_potential_proxy),
      confidenceNorm: clamp01(confidenceNorm),
      urgencyNorm: clamp01(urgencyTo01(candidate.urgency)),
      strategicFit: clamp01(candidate.strategic_fit),
      evidenceQuality,
      outcomePrior: 0.5, // v1 neutral (no learning)
      effortInverse,
      costInverse,
      riskInverse: clamp01(riskToInverse01(candidate.risk)),
      reversibility,
      informationGain: clamp01(candidate.information_gain_value),
      expirationPressure,
      riskIfIgnored: clamp01(candidate.value_potential_proxy * 0.6 + (candidate.urgency === "high" ? 0.2 : 0.0))
    },
    penalties: {
      contradictionPenalty,
      missingEvidencePenalty: computeMissingEvidencePenalty(candidate),
      regimeMismatchPenalty: 0.0
    }
  };
}

export function scoreCandidateV1(candidate: FusionCandidate, nowIso: string) {
  const { features, penalties } = computeFeatureValues(candidate, nowIso);
  const base =
    100 *
    (0.22 * features.valuePotential +
      0.18 * features.confidenceNorm +
      0.12 * features.urgencyNorm +
      0.1 * features.strategicFit +
      0.08 * features.evidenceQuality +
      0.08 * features.informationGain +
      0.06 * features.outcomePrior +
      0.05 * features.effortInverse +
      0.05 * features.costInverse +
      0.04 * features.riskInverse +
      0.02 * features.reversibility);

  const penalty =
    100 * (0.1 * penalties.contradictionPenalty + 0.1 * penalties.missingEvidencePenalty + 0.05 * penalties.regimeMismatchPenalty);

  const add = 100 * (0.05 * features.expirationPressure + 0.05 * features.riskIfIgnored);

  const final = base - penalty + add;
  return {
    score_before_penalties: base + add,
    final_score: Math.round(final * 10) / 10,
    features,
    penalties
  };
}
