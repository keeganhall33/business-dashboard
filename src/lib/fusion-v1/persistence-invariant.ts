export type FusionCountClient = {
  from(table: string): {
    select: (cols: string, opts: { count: "exact"; head: true }) => {
      eq: (col: string, value: string) => Promise<{ error: { message: string } | null; count: number | null }>;
    };
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export async function enforceFusionRunCompletenessInvariantV1(input: {
  client: FusionCountClient;
  run_id: string;
  policy: { reason_codes: string[] };
}) {
  const candCountRes = await input.client
    .from("fusion_candidates_v1")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.run_id);
  if (candCountRes.error) throw new Error(candCountRes.error.message);

  const rankCountRes = await input.client
    .from("fusion_rankings_v1")
    .select("id", { count: "exact", head: true })
    .eq("run_id", input.run_id);
  if (rankCountRes.error) throw new Error(rankCountRes.error.message);

  const persistedCandidates = candCountRes.count ?? 0;
  const persistedRankings = rankCountRes.count ?? 0;

  // If there were zero candidates, rankings must also be zero; this is not a persistence failure.
  if (persistedCandidates === 0) return;

  if (persistedRankings !== persistedCandidates) {
    const upd = await input.client
      .from("fusion_runs_v1")
      .update({ run_status: "failed", reason_codes: [...input.policy.reason_codes, "persistence_incomplete"] })
      .eq("run_id", input.run_id);
    if (upd.error) throw new Error(upd.error.message);

    throw new Error(
      `Fusion persistence incomplete: fusion_candidates_v1=${persistedCandidates} fusion_rankings_v1=${persistedRankings}`
    );
  }
}

