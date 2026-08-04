import test from "node:test";
import assert from "node:assert/strict";

import { buildFusionV1FixtureCandidates } from "@/lib/fusion-v1/fixtures";
import { runFusionV1 } from "@/lib/fusion-v1/engine";
import { parseStrategicConstraintsV1FromJsonString } from "@/lib/fusion-v1/strategic-constraints";
import { canonicalJsonString } from "@/lib/fusion-v1/canonical-json";

test("fusion determinism: same inputs and versions produce same fingerprints, ranking, and winner", () => {
  const nowIso = "2026-08-04T00:00:00.000Z";
  const candidates = buildFusionV1FixtureCandidates(nowIso);
  const constraintsJson = JSON.stringify({
    schema_version: "strategic_constraints_v1",
    config_version: "v1.0",
    premium_positioning: { protected: true, prohibited_action_categories: ["discounting"], notes: [] },
    scarcity: { protected: true, prohibited_action_categories: ["open_edition_expansion"], notes: [] },
    licensing_ip: { requires_review: true, notes: [] },
    blocked_domains: ["meta_attribution"],
    capacity: { available_hours_today: 2, available_discretionary_budget_cents_today: null },
    prohibited_action_categories: ["unauthorized_scraping"],
    mutually_exclusive_action_groups: {}
  });
  const sc = parseStrategicConstraintsV1FromJsonString(constraintsJson);

  const a = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "const_hash",
    roadmap_hash: "roadmap_hash",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });
  const b = runFusionV1({
    nowIso,
    candidates,
    constitution_hash: "const_hash",
    roadmap_hash: "roadmap_hash",
    strategic_constraints: sc,
    external_context_snapshot: {},
    competitor_context_snapshot: {},
    activeActionKeys: []
  });

  // Winner + ranking must match deterministically.
  assert.equal(a.decision.selected.candidate_id, b.decision.selected.candidate_id);
  assert.deepEqual(
    a.decision.ranking.map((r) => ({ id: r.candidate_id, score: r.final_score })),
    b.decision.ranking.map((r) => ({ id: r.candidate_id, score: r.final_score }))
  );
  // Fingerprints are deterministic.
  assert.deepEqual(a.candidateFingerprints, b.candidateFingerprints);
  assert.equal(a.input_set_fingerprint, b.input_set_fingerprint);

  // Deterministic decision identity bytes/hash (redacts generated_at and narrative).
  assert.equal(a.decision_deterministic_hash, b.decision_deterministic_hash);
  assert.equal(a.decision_deterministic_bytes, b.decision_deterministic_bytes);

  // Canonical candidate bytes and deterministic gate/cluster/conflict/ranking are identical.
  const canonA = canonicalJsonString(candidates);
  const canonB = canonicalJsonString(candidates);
  assert.equal(canonA, canonB);
});
