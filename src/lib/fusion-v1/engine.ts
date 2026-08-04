import type { DailyDecisionPackage, FusionCandidate, RankedCandidate, CandidatePenaltyBreakdown, CandidateFeatureValues } from "@/lib/fusion-v1/contracts";
import { FUSION_POLICY_VERSION_V1 as POLICY_V, FUSION_SCORE_VERSION_V1 as SCORE_V } from "@/lib/fusion-v1/contracts";
import { computeFusionCandidateFingerprint, computeFusionInputSetFingerprint } from "@/lib/fusion-v1/fingerprinting";
import { dedupeAndCluster } from "@/lib/fusion-v1/dedupe";
import { applyGates } from "@/lib/fusion-v1/gates";
import { scoreCandidateV1 } from "@/lib/fusion-v1/scoring";
import type { StrategicConstraintsV1 } from "@/lib/fusion-v1/strategic-constraints";
import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

function runIdFromInputSetFingerprint(input_set_fingerprint: string): string {
  // Deterministic id: stable for identical input set + policy/score/constraints versions.
  return canonicalJsonSha256Hex({ input_set_fingerprint }).slice(0, 24);
}

function buildWhyRankedLower(rc: RankedCandidate): string {
  if (rc.gated.gated_out) {
    return `Gated out: ${rc.gated.reasons.map((r) => r.code).join(", ")}.`;
  }
  return `Ranked lower by score and tie-break rules (final_score=${rc.final_score}).`;
}

export function runFusionV1(input: {
  nowIso: string;
  candidates: FusionCandidate[];
  constitution_hash: string;
  roadmap_hash: string;
  strategic_constraints: { constraints: StrategicConstraintsV1; constraints_hash: string };
  external_context_snapshot: Record<string, unknown>;
  competitor_context_snapshot: Record<string, unknown>;
  activeActionKeys: string[];
}): {
  decision: DailyDecisionPackage;
  candidateFingerprints: Record<string, string>;
  input_set_fingerprint: string;
  decision_deterministic_bytes: string;
  decision_deterministic_hash: string;
} {
  const candidateFingerprints: Record<string, string> = {};
  for (const c of input.candidates) candidateFingerprints[c.candidate_id] = computeFusionCandidateFingerprint(c);

  const input_set_fingerprint = computeFusionInputSetFingerprint({
    policy_version: POLICY_V,
    score_version: SCORE_V,
    strategic_constraints_hash: input.strategic_constraints.constraints_hash,
    candidates: input.candidates.map((c) => ({
      candidate_id: c.candidate_id,
      candidate_fingerprint: candidateFingerprints[c.candidate_id]!
    }))
  });

  const { clustered, dedupe_decisions } = dedupeAndCluster({
    candidates: input.candidates,
    candidateFingerprintById: candidateFingerprints
  });

  // Conflict detection + deterministic resolution notes.
  const conflicts_identified: Array<Record<string, unknown>> = [];
  const conflictByCandidateId: Record<string, Record<string, unknown>> = {};

  // Conflict rule (v1): if there is a traffic-quality diagnostic candidate and a scale_spend candidate,
  // treat them as mutually exclusive within the same decision window/domains, and block scaling.
  const diag = clustered.find((c) => c.merged.proposed_action?.action_key === "diagnose_traffic_quality_segments");
  const scaler = clustered.find((c) => c.merged.proposed_action?.action_key === "scale_spend");
  if (diag && scaler) {
    const group_id = "conflict_traffic_quality_vs_scaling";
    conflicts_identified.push({
      group_id,
      type: "opposing_actions",
      member_candidate_ids: [diag.merged.candidate_id, scaler.merged.candidate_id].sort(),
      resolution: {
        chosen: diag.merged.candidate_id,
        blocked: scaler.merged.candidate_id,
        reason:
          "Scaling acquisition is not eligible while a credible traffic-quality risk remains unresolved; prioritize diagnostic information-gain first."
      }
    });
    conflictByCandidateId[scaler.merged.candidate_id] = { group_id, status: "blocked", reason: "traffic_quality_unresolved" };
    conflictByCandidateId[diag.merged.candidate_id] = { group_id, status: "chosen", reason: "information_gain_priority" };
  }

  const ranked: RankedCandidate[] = clustered.map((cluster) => {
    const gated = applyGates({
      candidate: cluster.merged,
      nowIso: input.nowIso,
      constraints: input.strategic_constraints.constraints,
      activeActionKeys: input.activeActionKeys
    });

    // Apply conflict-based gating (v1). This is deterministic and must be persisted.
    const conflict = conflictByCandidateId[cluster.merged.candidate_id];
    if (conflict && conflict.status === "blocked") {
      gated.gated_out = true;
      gated.reasons.push({
        code: "mutually_exclusive",
        detail: "Blocked by conflict-resolution policy: traffic-quality diagnostic must run before scaling."
      });
    }

    const scored = scoreCandidateV1(cluster.merged, input.nowIso);

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
      candidate_id: cluster.merged.candidate_id,
      cluster_id: cluster.cluster_id,
      gated,
      score_before_penalties: Math.round(scored.score_before_penalties * 10) / 10,
      penalties,
      features,
      final_score: scored.final_score,
      tie_break: { used: false, reason: null },
      why_ranked_lower: null
    };
  });

  // Deterministic sort.
  ranked.sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    // tie-break #2: info gain when confidence is low
    const lowA = a.features.confidenceNorm < 0.5;
    const lowB = b.features.confidenceNorm < 0.5;
    if (lowA || lowB) {
      if (b.features.informationGain !== a.features.informationGain) return b.features.informationGain - a.features.informationGain;
    }
    // tie-break #3: expiration pressure
    if (b.features.expirationPressure !== a.features.expirationPressure) return b.features.expirationPressure - a.features.expirationPressure;
    // tie-break #4: lower effort wins => higher inverse wins
    if (b.features.effortInverse !== a.features.effortInverse) return b.features.effortInverse - a.features.effortInverse;
    // tie-break #5
    return a.candidate_id.localeCompare(b.candidate_id);
  });

  // Rank assignment and why_ranked_lower.
  for (let i = 0; i < ranked.length; i++) {
    const rc = ranked[i]!;
    if (i > 0) rc.why_ranked_lower = buildWhyRankedLower(rc);
  }

  // Select winner: first non-gated candidate; if all gated, hold.
  const winner = ranked.find((r) => !r.gated.gated_out) ?? null;

  const constraintsSnapshot = input.strategic_constraints.constraints;

  let selectedCandidate: FusionCandidate | null = null;
  let selectedHeadline = "Hold";
  let selectedAction = "Do nothing today. Monitor and wait for more evidence.";
  let success_metrics: Array<{ metric_id: string; note: string | null }> = [];
  let evaluation_window: { startDate: string; endDate: string } | null = null;
  let stop_condition: string | null = null;
  let review_by: string | null = null;
  let confidence: FusionCandidate["confidence"] = {
    system: "explanation_confidence",
    level: "insufficient_evidence",
    score: null,
    reasons: ["All operating candidates are gated or too uncertain."],
    blockers: []
  };

  if (winner) {
    const cluster = clustered.find((c) => c.merged.candidate_id === winner.candidate_id)!;
    selectedCandidate = cluster.merged;
    selectedHeadline = selectedCandidate.proposed_action?.headline ?? selectedCandidate.candidate_id;
    selectedAction = selectedCandidate.proposed_action?.recommended_action ?? "Hold.";
    success_metrics = selectedCandidate.proposed_action?.success_metrics ?? [];
    evaluation_window = selectedCandidate.proposed_action?.evaluation_window ?? null;
    stop_condition = selectedCandidate.proposed_action?.stop_condition ?? null;
    review_by = selectedCandidate.proposed_action?.review_by ?? selectedCandidate.relevance_expires_at;
    confidence = selectedCandidate.confidence;
  } else {
    // Hold decision must include a review time and what would change it.
    review_by = new Date(new Date(input.nowIso).getTime() + 24 * 3600 * 1000).toISOString();
  }

  const decision: DailyDecisionPackage = {
    run_id: runIdFromInputSetFingerprint(input_set_fingerprint),
    generated_at: input.nowIso,
    fusion_policy_version: POLICY_V,
    fusion_score_version: SCORE_V,
    constitution_hash: input.constitution_hash,
    roadmap_hash: input.roadmap_hash,
    strategic_constraints_hash: input.strategic_constraints.constraints_hash,
    strategic_constraints_version: constraintsSnapshot.config_version,
    external_context_snapshot: input.external_context_snapshot,
    competitor_context_snapshot: input.competitor_context_snapshot,
    strategic_constraints_snapshot: constraintsSnapshot as unknown as Record<string, unknown>,
    all_candidate_ids: input.candidates.map((c) => c.candidate_id).sort(),
    deduplication_decisions: dedupe_decisions,
    conflicts_identified,
    ranking: ranked,
    selected: {
      candidate_id: selectedCandidate?.candidate_id ?? "hold",
      headline: selectedHeadline,
      recommended_action: selectedAction,
      why_binding_priority:
        selectedCandidate?.candidate_id != null
          ? "This is the best use of attention today because it resolves the highest-impact uncertainty while respecting strategy and data constraints."
          : "No candidate is safe to execute today; holding preserves optionality.",
      supporting_fact_ids: selectedCandidate?.supporting_evidence_fact_ids ?? [],
      contradicting_fact_ids: selectedCandidate?.contradicting_evidence_fact_ids ?? [],
      missing_evidence: selectedCandidate?.missing_evidence ?? [],
      confidence,
      success_metrics,
      evaluation_window,
      stop_condition,
      review_by,
      what_changes_my_mind:
        selectedCandidate?.missing_evidence ??
        ranked.flatMap((r) => r.gated.reasons.map((x) => `Remove gate: ${x.code}`)).slice(0, 8),
      do_not_do: [
        ...(constraintsSnapshot.premium_positioning.prohibited_action_categories ?? []).map((c) => `Do not do: ${c}`),
        ...(constraintsSnapshot.scarcity.prohibited_action_categories ?? []).map((c) => `Do not do: ${c}`)
      ]
    },
    next_best: ranked.length >= 2 ? { candidate_id: ranked[1]!.candidate_id, headline: ranked[1]!.candidate_id, trigger_condition: "If evidence improves or constraints change." } : null,
    alternatives_considered: ranked.slice(1, 5).map((r) => ({ candidate_id: r.candidate_id, headline: r.candidate_id, why_ranked_lower: r.why_ranked_lower ?? "" })),
    monitor: ranked.filter((r) => r.gated.gated_out).map((r) => ({ candidate_id: r.candidate_id, reason: r.gated.reasons.map((x) => x.code).join(", "), review_by: null })),
    ignored: [],
    generated_narrative: {
      situation_summary: "Five candidates were evaluated. One decision was selected deterministically under policy and constraints.",
      why_winner: "Winner selected by deterministic gates and scoring.",
      why_alternatives: ranked.slice(1).map((r) => ({ candidate_id: r.candidate_id, why: r.why_ranked_lower ?? "" })),
      do_not_do: ["Do not react to competitor discounting with discounts.", "Do not scale spend based on blocked attribution."]
    }
  };

  // Deterministic daily decision package hash can be derived by storage layer.
  decision.generated_narrative.do_not_do = Array.from(new Set(decision.generated_narrative.do_not_do));
  decision.selected.do_not_do = Array.from(new Set(decision.selected.do_not_do));

  // Deterministic decision identity: exclude volatile fields.
  const decision_deterministic_view = {
    ...decision,
    generated_at: "__redacted__",
    generated_narrative: "__redacted__"
  };
  const decision_deterministic_bytes = JSON.stringify(decision_deterministic_view);
  const decision_deterministic_hash = canonicalJsonSha256Hex(decision_deterministic_view);

  return { decision, candidateFingerprints, input_set_fingerprint, decision_deterministic_bytes, decision_deterministic_hash };
}
