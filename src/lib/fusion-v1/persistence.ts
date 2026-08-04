import type { DailyDecisionPackage, RankedCandidate } from "@/lib/fusion-v1/contracts";
import { canonicalJsonSha256Hex } from "@/lib/fusion-v1/canonical-json";

export type FusionDbClient = {
  from(table: string): {
    upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error: { message: string } | null }>;
    insert: (rows: Array<Record<string, unknown>>) => Promise<{ error: { message: string } | null }>;
    select: (cols: string) => unknown;
  };
};

export async function persistFusionRunV1(input: {
  client: FusionDbClient;
  run: DailyDecisionPackage;
  input_set_fingerprint: string;
  candidateFingerprints: Record<string, string>;
  normalizedCandidatesById: Record<string, unknown>; // v1: normalized candidate snapshots
  gateByClusterId: Record<string, unknown>;
  ranking: RankedCandidate[];
  conflictsByCandidateId?: Record<string, unknown>;
}): Promise<{ run_id: string; decision_package_hash: string }> {
  const decision_package_hash = canonicalJsonSha256Hex(input.run);

  const runRow = {
    run_id: input.run.run_id,
    generated_at: input.run.generated_at,
    input_set_fingerprint: input.input_set_fingerprint,
    fusion_policy_version: input.run.fusion_policy_version,
    fusion_score_version: input.run.fusion_score_version,
    constitution_hash: input.run.constitution_hash,
    roadmap_hash: input.run.roadmap_hash,
    strategic_constraints_hash: input.run.strategic_constraints_hash,
    strategic_constraints_version: input.run.strategic_constraints_version,
    external_context_snapshot: input.run.external_context_snapshot,
    competitor_context_snapshot: input.run.competitor_context_snapshot,
    strategic_constraints_snapshot: input.run.strategic_constraints_snapshot,
    selected_candidate_id: input.run.selected.candidate_id,
    review_by: input.run.selected.review_by,
    daily_decision_package: input.run,
    decision_package_hash
  };

  const upRun = await input.client.from("fusion_runs_v1").upsert(runRow, {
    onConflict: "input_set_fingerprint,fusion_policy_version,fusion_score_version,strategic_constraints_hash"
  });
  if (upRun.error) throw new Error(`Failed to upsert fusion run: ${upRun.error.message}`);

  const candidateRows: Array<Record<string, unknown>> = Object.entries(input.normalizedCandidatesById).map(
    ([candidate_id, normalized_candidate]) => ({
    run_id: input.run.run_id,
    candidate_id,
    candidate_fingerprint: input.candidateFingerprints[candidate_id] ?? null,
    normalized_candidate,
    gated_out: Boolean((input.gateByClusterId[candidate_id] as { gated_out?: boolean } | undefined)?.gated_out ?? false),
    gate_reasons: (input.gateByClusterId[candidate_id] as { reasons?: unknown[] } | undefined)?.reasons ?? [],
    cluster_id: (input.gateByClusterId[candidate_id] as { cluster_id?: string | null } | undefined)?.cluster_id ?? null
  })
  );
  // Idempotent per (run_id, candidate_id)
  for (const row of candidateRows) {
    const up = await input.client.from("fusion_candidates_v1").upsert(row, { onConflict: "run_id,candidate_id" });
    if (up.error) throw new Error(`Failed to upsert fusion candidate: ${up.error.message}`);
  }

  const rankingRows: Array<Record<string, unknown>> = input.ranking.map((r, idx) => ({
    run_id: input.run.run_id,
    candidate_id: r.candidate_id,
    rank: idx + 1,
    score_before_penalties: r.score_before_penalties,
    final_score: r.final_score,
    feature_values: r.features,
    penalties: r.penalties,
    gates: r.gated,
    conflicts: input.conflictsByCandidateId?.[r.candidate_id] ?? {},
    dedupe_cluster_id: r.cluster_id
  }));
  for (const row of rankingRows) {
    const up = await input.client.from("fusion_rankings_v1").upsert(row, { onConflict: "run_id,candidate_id" });
    if (up.error) throw new Error(`Failed to upsert fusion ranking: ${up.error.message}`);
  }

  return { run_id: input.run.run_id, decision_package_hash };
}
