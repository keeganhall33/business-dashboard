import test from "node:test";
import assert from "node:assert/strict";

import { buildFusionV1FixtureCandidates } from "@/lib/fusion-v1/fixtures";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { persistFusionRunV1 } from "@/lib/fusion-v1/persistence";
import { parseStrategicConstraintsV1FromJsonString } from "@/lib/fusion-v1/strategic-constraints";
import { computeFusionInputSetFingerprint } from "@/lib/fusion-v1/fingerprinting";

test("persistence: persists constraints hash and uses idempotency onConflict key", async () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const sc = parseStrategicConstraintsV1FromJsonString(
    JSON.stringify({
      schema_version: "strategic_constraints_v1",
      config_version: "v1.0",
      premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
      scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
      licensing_ip: { requires_review: true, notes: [] },
      blocked_domains: ["meta_attribution"],
      capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
      prohibited_action_categories: ["unauthorized_scraping"],
      mutually_exclusive_action_groups: {}
    })
  );

  const out = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "const_hash",
    roadmap_hash: "roadmap_hash",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });

  const calls: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      return {
        async upsert(row: Record<string, unknown>, opts?: { onConflict?: string }) {
          calls.push({ table, op: "upsert", row, opts });
          return { error: null };
        },
        async insert(rows: Array<Record<string, unknown>>) {
          calls.push({ table, op: "insert", rows });
          return { error: null };
        },
        select() {
          throw new Error("not used");
        }
      };
    }
  };

  await persistFusionRunV1({
    client: client as unknown as import("@/lib/fusion-v1/persistence").FusionDbClient,
    run: out.decision,
    input_set_fingerprint: out.input_set_fingerprint,
    candidateFingerprints: out.candidateFingerprints,
    normalizedCandidatesById: Object.fromEntries(candidates.map((c) => [c.candidate_id, c])),
    gateByClusterId: Object.fromEntries(out.decision.ranking.map((r) => [r.candidate_id, { ...r.gated, cluster_id: r.cluster_id }])),
    ranking: out.decision.ranking,
    conflictsByCandidateId: Object.fromEntries(out.decision.ranking.map((r) => [r.candidate_id, { demo: true }]))
  });

  const runUpsert = calls.find((c) => c.table === "fusion_runs_v1" && c.op === "upsert");
  assert.ok(runUpsert);
  const row = runUpsert.row as Record<string, unknown>;
  const opts = runUpsert.opts as { onConflict?: string };
  assert.equal(row.strategic_constraints_hash, sc.constraints_hash);
  assert.equal(opts.onConflict, "input_set_fingerprint,fusion_policy_version,fusion_score_version,strategic_constraints_hash");
});

test("input-set fingerprint changes when candidates, constraints, policy, or score versions change", () => {
  const base = {
    policy_version: "fusion_policy_v1.0",
    score_version: "fusion_score_v1.0",
    strategic_constraints_hash: "h1",
    candidates: [
      { candidate_id: "a", candidate_fingerprint: "fa" },
      { candidate_id: "b", candidate_fingerprint: "fb" }
    ]
  };

  const a = computeFusionInputSetFingerprint(base);
  const b = computeFusionInputSetFingerprint({ ...base, candidates: [{ candidate_id: "a", candidate_fingerprint: "fa2" }, base.candidates[1]!] });
  const c = computeFusionInputSetFingerprint({ ...base, strategic_constraints_hash: "h2" });
  const d = computeFusionInputSetFingerprint({ ...base, policy_version: "fusion_policy_v2.0" });
  const e = computeFusionInputSetFingerprint({ ...base, score_version: "fusion_score_v2.0" });

  if (a === b || a === c || a === d || a === e) {
    throw new Error("Expected input-set fingerprint to change for changed inputs");
  }
});
