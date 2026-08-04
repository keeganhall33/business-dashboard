import test from "node:test";
import assert from "node:assert/strict";

import { buildFusionV1FixtureCandidates } from "@/lib/fusion-v1/fixtures";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { parseStrategicConstraintsV1FromJsonString } from "@/lib/fusion-v1/strategic-constraints";

function baseConstraintsJson() {
  return JSON.stringify({
    schema_version: "strategic_constraints_v1",
    config_version: "v1.0",
    premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
    scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
    licensing_ip: { requires_review: true, notes: [] },
    blocked_domains: ["meta_attribution"],
    capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
    prohibited_action_categories: ["unauthorized_scraping"],
    mutually_exclusive_action_groups: { traffic: ["scale_spend", "pause_spend"] }
  });
}

test("blocked attribution: Meta-causal candidate is gated out", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const sc = parseStrategicConstraintsV1FromJsonString(baseConstraintsJson());

  const out = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });

  const meta = out.decision.ranking.find((r) => r.candidate_id.includes("cluster") && r.gated.reasons.some((x) => x.code === "blocked_domain"));
  assert.ok(meta);
});

test("strategic-fit protection: competitor discount copy cannot win", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const sc = parseStrategicConstraintsV1FromJsonString(baseConstraintsJson());

  const out = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });

  assert.notEqual(out.decision.selected.candidate_id, "cand_competitor_move");
  const dedupe = out.decision.deduplication_decisions as unknown as Array<{ cluster_id: string; member_candidate_ids: string[] }>;
  const selectedMembers = dedupe.find((d) => d.cluster_id === out.decision.selected.candidate_id)?.member_candidate_ids ?? [];
  assert.deepEqual(selectedMembers, ["cand_traffic_quality_mismatch"]);
});

test("weak external fit: external opportunity does not win direct operating action", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const sc = parseStrategicConstraintsV1FromJsonString(baseConstraintsJson());
  const out = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  // Traffic-quality info-gain should outrank external fixture.
  assert.ok(out.decision.ranking[0]!.candidate_id.startsWith("cluster_"));
});

test("expiration: expired candidate is gated out with recorded reason", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const expiredCandidate = {
    ...candidates[1]!,
    candidate_id: "cand_external_opportunity_expired",
    relevance_expires_at: "2026-08-01T00:00:00.000Z"
  };
  const sc = parseStrategicConstraintsV1FromJsonString(baseConstraintsJson());
  const out = runFusionV1({
    nowIso,
    candidates: [candidates[0]!, expiredCandidate, candidates[2]!, candidates[3]!, candidates[4]!],
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.ok(out.decision.ranking.some((r) => r.gated.reasons.some((x) => x.code === "expired_relevance")));
});

test("hold decision: hold wins when all operating candidates are gated out", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso).map((c) => ({
    ...c,
    strategic_guardrail_violations: ["premium_positioning_violation" as const]
  }));
  const sc = parseStrategicConstraintsV1FromJsonString(baseConstraintsJson());
  const out = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "c",
    roadmap_hash: "r",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  assert.equal(out.decision.selected.candidate_id, "hold");
});
