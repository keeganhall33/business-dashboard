import { withJobRun } from "@/lib/scheduler/jobLogger";
import { loadStrategicConstraintsV1 } from "@/lib/fusion-v1/strategic-constraints";
import { loadProductionFusionCandidates } from "@/lib/fusion-v1/production/candidate-loaders";
import { dedupeAndCluster } from "@/lib/fusion-v1/dedupe";
import { computeFusionCandidateFingerprint, computeFusionInputSetFingerprint } from "@/lib/fusion-v1/fingerprinting";
import { decideRunPolicy } from "@/lib/fusion-v1/production/run-policy";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { persistFusionRunV1, type FusionDbClient } from "@/lib/fusion-v1/persistence";
import { FUSION_POLICY_VERSION_V1, FUSION_SCORE_VERSION_V1 } from "@/lib/fusion-v1/contracts";

const JOB_KEY = "fusion-daily-decision-v1";

export async function runFusionDailyDecisionV1() {
  return withJobRun({
    jobKey: JOB_KEY,
    fn: async () => {
      const nowIso = new Date().toISOString();
      const { constraints, constraints_hash } = loadStrategicConstraintsV1();

      const load = await loadProductionFusionCandidates({ nowIso, strategic_constraints_blocked_domains: constraints.blocked_domains });

      const candidateFingerprints: Record<string, string> = {};
      for (const c of load.candidates) candidateFingerprints[c.candidate_id] = computeFusionCandidateFingerprint(c);

      const { clustered } = dedupeAndCluster({ candidates: load.candidates, candidateFingerprintById: candidateFingerprints });
      const independent_cluster_count = clustered.length;

      const freshCandidates = clustered.map((c) => c.merged);

      const policy = decideRunPolicy({
        nowIso,
        eligibleClusters: freshCandidates,
        gatedCount: 0,
        freshCount: load.candidates.length,
        staleCount: load.sources_stale.length,
        sourcesInspected: load.sources_inspected
      });

      const input_set_fingerprint = computeFusionInputSetFingerprint({
        policy_version: FUSION_POLICY_VERSION_V1,
        score_version: FUSION_SCORE_VERSION_V1,
        strategic_constraints_hash: constraints_hash,
        candidates: Object.entries(candidateFingerprints).map(([candidate_id, candidate_fingerprint]) => ({ candidate_id, candidate_fingerprint }))
      });

      const supabase = getSupabaseServerClient();

      // Build a decision package. If policy says no comparative decision, produce an honest hold/monitor package.
      let decisionPackage;
      const conflictsByCandidateId: Record<string, unknown> = {};
      if (policy.status === "completed_with_decision") {
        const out = runFusionV1({
          nowIso,
          candidates: freshCandidates,
          constitution_hash: "unknown",
          roadmap_hash: "unknown",
          strategic_constraints: { constraints, constraints_hash },
          external_context_snapshot: { sources_inspected: load.sources_inspected },
          competitor_context_snapshot: {},
          activeActionKeys: []
        });
        decisionPackage = out.decision;
      } else {
        // Honest non-decision package.
        decisionPackage = {
          run_id: input_set_fingerprint.slice(0, 24),
          generated_at: nowIso,
          fusion_policy_version: FUSION_POLICY_VERSION_V1,
          fusion_score_version: FUSION_SCORE_VERSION_V1,
          constitution_hash: "unknown",
          roadmap_hash: "unknown",
          strategic_constraints_hash: constraints_hash,
          strategic_constraints_version: constraints.config_version,
          external_context_snapshot: {
            sources_inspected: load.sources_inspected,
            sources_empty: load.sources_empty,
            sources_stale: load.sources_stale,
            sources_skipped: load.sources_skipped
          },
          competitor_context_snapshot: {},
          strategic_constraints_snapshot: constraints as unknown as Record<string, unknown>,
          all_candidate_ids: load.candidates.map((c) => c.candidate_id).sort(),
          deduplication_decisions: clustered.map((c) => c.dedupe_decision),
          conflicts_identified: [],
          ranking: [],
          selected: {
            candidate_id: "none",
            headline: policy.status,
            recommended_action: "No comparative decision produced.",
            why_binding_priority:
              policy.status === "insufficient_candidates"
                ? "Not enough independently sourced eligible intelligence candidates exist yet."
                : policy.status === "no_fresh_candidates"
                  ? "Candidates were stale under freshness policy."
                  : policy.status === "blocked_by_data_quality"
                    ? "Available candidates were blocked by evidence quality or policy constraints."
                    : "Holding is currently safest.",
            supporting_fact_ids: [],
            contradicting_fact_ids: [],
            missing_evidence: ["Need at least two independently sourced eligible candidates."],
            confidence: {
              system: "explanation_confidence" as const,
              level: "insufficient_evidence" as const,
              score: null,
              reasons: [policy.status],
              blockers: [] as string[]
            },
            success_metrics: [],
            evaluation_window: null,
            stop_condition: null,
            review_by: policy.next_review_at,
            what_changes_my_mind: ["A second independently sourced fresh candidate"],
            do_not_do: []
          },
          next_best: null,
          alternatives_considered: [],
          monitor: [],
          ignored: [],
          generated_narrative: {
            situation_summary: "Fusion ran but did not produce a comparative decision.",
            why_winner: "",
            why_alternatives: [],
            do_not_do: []
          }
        };
      }

      // Persist run status fields in fusion_runs_v1.
      const runRowExtra = {
        run_status: policy.status,
        reason_codes: policy.reason_codes,
        candidate_total_count: load.candidates.length,
        candidate_fresh_count: load.candidates.length,
        candidate_stale_count: load.sources_stale.length,
        candidate_gated_count: 0,
        candidate_eligible_count: freshCandidates.length,
        independent_cluster_count,
        next_review_at: policy.next_review_at,
        execution_mode: policy.execution_mode
      };

      await persistFusionRunV1({
        client: supabase as unknown as FusionDbClient,
        run: decisionPackage,
        input_set_fingerprint,
        candidateFingerprints,
        normalizedCandidatesById: Object.fromEntries(load.candidates.map((c) => [c.candidate_id, c])),
        gateByClusterId: Object.fromEntries(clustered.map((c) => [c.merged.candidate_id, { gated_out: false, reasons: [], cluster_id: c.cluster_id }])),
        ranking: decisionPackage.ranking,
        conflictsByCandidateId
      });

      // Patch in the extra run-status fields after upsert.
      const { error } = await supabase.from("fusion_runs_v1").update(runRowExtra).eq("run_id", decisionPackage.run_id);
      if (error) throw error;

      return {
        status: policy.status,
        executionMode: policy.execution_mode,
        candidateTotalCount: load.candidates.length,
        independentClusterCount: independent_cluster_count,
        selectedCandidateId: decisionPackage.selected.candidate_id
      };
    },
    summarize: (result) => ({
      summary: `Fusion v1: ${result.status} (${result.executionMode})`,
      detailsJson: result as unknown as Record<string, unknown>
    })
  });
}
