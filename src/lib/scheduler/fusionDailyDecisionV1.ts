import { withJobRun } from "@/lib/scheduler/jobLogger";
import { loadStrategicConstraintsV1 } from "@/lib/fusion-v1/strategic-constraints";
import { loadProductionFusionCandidates } from "@/lib/fusion-v1/production/candidate-loaders";
import { dedupeAndCluster } from "@/lib/fusion-v1/dedupe";
import { computeFusionCandidateFingerprint, computeFusionInputSetFingerprint } from "@/lib/fusion-v1/fingerprinting";
import { decideRunPolicy } from "@/lib/fusion-v1/production/run-policy";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { rankCandidatesForAuditV1 } from "@/lib/fusion-v1/audit-ranking";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { persistFusionRunV1, type FusionDbClient } from "@/lib/fusion-v1/persistence";
import { enforceFusionRunCompletenessInvariantV1, type FusionCountClient } from "@/lib/fusion-v1/persistence-invariant";
import { FUSION_POLICY_VERSION_V1, FUSION_SCORE_VERSION_V1 } from "@/lib/fusion-v1/contracts";
import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const JOB_KEY = "fusion-daily-decision-v1";

// (Completeness invariant helper is in fusion-v1/persistence-invariant.ts to keep it server-only free for tests.)

export async function runFusionDailyDecisionV1() {
  return withJobRun({
    jobKey: JOB_KEY,
    fn: async () => {
      const nowIso = new Date().toISOString();
      const { constraints, constraints_hash } = loadStrategicConstraintsV1();

      const constitution_hash = sha256File(path.join(process.cwd(), "docs/intelligence/AI_DECISION_CONSTITUTION.md"));
      const roadmap_hash = sha256File(path.join(process.cwd(), "docs/intelligence/ROADMAP.md"));

      const load = await loadProductionFusionCandidates({ nowIso, strategic_constraints_blocked_domains: constraints.blocked_domains });

      const candidateFingerprints: Record<string, string> = {};
      for (const c of load.candidates) candidateFingerprints[c.candidate_id] = computeFusionCandidateFingerprint(c);

      const { clustered } = dedupeAndCluster({ candidates: load.candidates, candidateFingerprintById: candidateFingerprints });
      const independent_cluster_count = clustered.length;

      // Map original candidate_id -> deterministic cluster_id for audit persistence.
      const clusterIdByCandidateId: Record<string, string> = {};
      for (const cluster of clustered) {
        for (const member of cluster.members) {
          clusterIdByCandidateId[member.candidate_id] = cluster.cluster_id;
        }
      }

      // Eligible for comparison only if source freshness is "fresh".
      const freshCandidates = clustered
        .map((c) => c.merged)
        .filter((c) => load.candidate_meta_by_id[c.candidate_id]?.freshness === "fresh");

      const policy = decideRunPolicy({
        nowIso,
        eligibleClusters: freshCandidates,
        gatedCount: 0,
        freshCount: freshCandidates.length,
        staleCount: load.sources_stale.length,
        sourcesInspected: load.sources_inspected
      });

      // Build an audit-complete ranking set for every loaded candidate.
      // Even when policy says "no decision", every candidate must receive a ranking row with explicit gating/exclusion.
      const auditRanking = rankCandidatesForAuditV1({
        nowIso,
        candidates: load.candidates,
        constraints,
        activeActionKeys: [],
        candidateMetaById: load.candidate_meta_by_id,
        clusterIdByCandidateId,
        enforceFreshnessPolicy: true
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
          constitution_hash,
          roadmap_hash,
          strategic_constraints: { constraints, constraints_hash },
          external_context_snapshot: { sources_inspected: load.sources_inspected },
          competitor_context_snapshot: {},
          activeActionKeys: []
        });
        decisionPackage = out.decision;
      } else {
        // Honest non-decision package.
        decisionPackage = {
          run_id: canonicalJsonSha256Hex({ input_set_fingerprint }).slice(0, 24),
          generated_at: nowIso,
          fusion_policy_version: FUSION_POLICY_VERSION_V1,
          fusion_score_version: FUSION_SCORE_VERSION_V1,
          constitution_hash,
          roadmap_hash,
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
          ranking: auditRanking,
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
          alternatives_considered: auditRanking.slice(0, 5).map((r) => ({
            candidate_id: r.candidate_id,
            headline: r.candidate_id,
            why_ranked_lower: r.why_ranked_lower ?? ""
          })),
          monitor: auditRanking
            .filter((r) => r.gated.gated_out)
            .slice(0, 10)
            .map((r) => ({
              candidate_id: r.candidate_id,
              reason: r.gated.reasons.map((x) => x.code).join(", "),
              review_by: null
            })),
          ignored: [],
          generated_narrative: {
            situation_summary: "Fusion ran but did not produce a comparative decision.",
            why_winner: "No candidate met freshness/eligibility requirements for an operating decision.",
            why_alternatives: auditRanking.slice(0, 5).map((r) => ({
              candidate_id: r.candidate_id,
              why: r.why_ranked_lower ?? (r.gated.gated_out ? "Excluded by gates." : "Ranked lower.")
            })),
            do_not_do: []
          }
        };
      }

      // Persist run status fields in fusion_runs_v1.
      const runRowExtra = {
        run_status: policy.status,
        reason_codes: policy.reason_codes,
        candidate_total_count: load.candidates.length,
        candidate_fresh_count: freshCandidates.length,
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
        gateByClusterId: Object.fromEntries(
          auditRanking.map((r) => [
            r.candidate_id,
            { gated_out: r.gated.gated_out, reasons: r.gated.reasons, cluster_id: r.cluster_id }
          ])
        ),
        ranking: auditRanking,
        conflictsByCandidateId
      });

      // Patch in the extra run-status fields after upsert.
      const { error } = await supabase.from("fusion_runs_v1").update(runRowExtra).eq("run_id", decisionPackage.run_id);
      if (error) throw error;

      // Completeness invariant: candidates and rankings must match for a persisted run.
      await enforceFusionRunCompletenessInvariantV1({
        client: supabase as unknown as FusionCountClient,
        run_id: decisionPackage.run_id,
        policy
      });

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

function sha256File(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
