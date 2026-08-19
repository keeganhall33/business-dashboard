import assert from "node:assert/strict";
import test from "node:test";

import {
  orderChampionCandidatesV1,
  type ChampionCandidateV1
} from "@/lib/relationship-intelligence/contracts";
import { RELATIONSHIP_INTELLIGENCE_FIXTURES_V1 } from "@/lib/relationship-intelligence/fixtures";
import { toRelationshipOpportunityViewModelV1 } from "@/lib/relationship-intelligence/view-model";

test("relationship fixtures expose required opportunity brief fields", () => {
  assert.deepEqual(
    RELATIONSHIP_INTELLIGENCE_FIXTURES_V1.map((brief) => brief.brief_id),
    ["relationship-boardroom-kleiman-v1", "relationship-fanatics-rubin-v1"]
  );

  for (const brief of RELATIONSHIP_INTELLIGENCE_FIXTURES_V1) {
    assert.ok(brief.TARGET.label);
    assert.ok(brief.DECISION_MAKER.name);
    assert.ok(brief.CHAMPION_CANDIDATES.length >= 2);
    assert.ok(brief.RELATIONSHIP_EVIDENCE.length >= 3);
    assert.ok(brief.ACCESS_PATH.summary);
    assert.equal(brief.STRATEGIC_UPSIDE.qualitative_only, true);
    assert.ok(brief.MUTUAL_VALUE.summary);
    assert.ok(brief.RELATIONSHIP_RISK.over_asking_guardrail);
    assert.ok(brief.RELATIONSHIP_RISK.weak_reciprocity_guardrail);
    assert.ok(brief.TIMING.rationale);
    assert.ok(brief.UNKNOWN_GAPS.length > 0);
    assert.equal(brief.NEXT_SAFE_ACTION.external_write_allowed, false);
    assert.equal(brief.APPROVAL_CLASS, "L1_RECOMMENDATION");
    assert.ok(brief.WHAT_WOULD_CHANGE_THE_RANKING.length > 0);
  }
});

test("title alone cannot imply champion likelihood", () => {
  const titleOnly: ChampionCandidateV1 = {
    candidate_id: "title-only-ceo",
    name: "Title Only CEO",
    role_or_public_context: "CEO",
    candidate_kind: "DECISION_MAKER",
    title_authority_signal: "HIGH",
    relationship_edge_state: "UNKNOWN",
    evidence_quality: "UNKNOWN",
    strategic_fit_signal: "LOW",
    mutual_value_signal: "UNKNOWN",
    access_path_signal: "UNKNOWN",
    confidence: "insufficient_evidence",
    why_candidate: "Title alone is not a champion signal.",
    evidence_refs: [],
    unknowns: ["No evidence beyond title."]
  };
  const evidenceBackedBridge: ChampionCandidateV1 = {
    ...titleOnly,
    candidate_id: "evidence-backed-bridge",
    name: "Evidence Backed Bridge",
    candidate_kind: "BRIDGE",
    title_authority_signal: "LOW",
    relationship_edge_state: "INFERRED",
    evidence_quality: "MEDIUM",
    strategic_fit_signal: "HIGH",
    mutual_value_signal: "MEDIUM",
    access_path_signal: "MEDIUM",
    confidence: "possible"
  };

  assert.equal(orderChampionCandidatesV1([titleOnly, evidenceBackedBridge])[0]?.candidate_id, "evidence-backed-bridge");
});

test("unsupported relationship edges remain UNKNOWN and visible", () => {
  const serialized = JSON.stringify(RELATIONSHIP_INTELLIGENCE_FIXTURES_V1).toLowerCase();
  assert.doesNotMatch(serialized, /friend|texted|emailed|met privately|warm intro confirmed|endorsed/);

  for (const brief of RELATIONSHIP_INTELLIGENCE_FIXTURES_V1) {
    assert.equal(brief.ACCESS_PATH.truth_state, "UNKNOWN");
    assert.ok(brief.UNKNOWN_GAPS.some((gap) => /warm|unknown|specific/i.test(gap)));
    assert.ok(brief.CHAMPION_CANDIDATES.some((candidate) => candidate.relationship_edge_state === "UNKNOWN"));
  }
});

test("champion ladder preserves dimensions instead of one opaque score", () => {
  const brief = RELATIONSHIP_INTELLIGENCE_FIXTURES_V1[0];
  assert.ok(brief);
  const view = toRelationshipOpportunityViewModelV1(brief);

  assert.equal(view.view_version, "relationship_intelligence_view_v1.0");
  assert.equal(view.keegan_action_required, "NO");
  assert.ok(view.champion_ladder.every((row) => row.rank > 0));
  assert.ok(view.champion_ladder.every((row) => "evidence_quality" in row));
  assert.ok(view.champion_ladder.every((row) => "relationship_edge_state" in row));
  assert.ok(view.champion_ladder.every((row) => "mutual_value_signal" in row));
  assert.ok(view.next_safe_action);
});

test("safe action guardrail prevents outreach or external writes", () => {
  for (const brief of RELATIONSHIP_INTELLIGENCE_FIXTURES_V1) {
    assert.equal(brief.NEXT_SAFE_ACTION.external_write_allowed, false);
    assert.match(brief.NEXT_SAFE_ACTION.action, /private|internal-only/i);
    assert.doesNotMatch(brief.NEXT_SAFE_ACTION.action, /send|contact|book|ship|gift/i);
  }
});
