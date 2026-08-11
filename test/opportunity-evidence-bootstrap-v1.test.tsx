import test from "node:test";
import assert from "node:assert/strict";

import { buildCoverageProfile } from "../src/lib/opportunity-evidence-bootstrap-v1/coverage";
import { buildResearchQuestionsV1 } from "../src/lib/opportunity-evidence-bootstrap-v1/questions";
import { applyResearchMemoryGate } from "../src/lib/opportunity-evidence-bootstrap-v1/memory";

test("coverage audit is deterministic and produces explicit UNKNOWN/PARTIAL states", () => {
  const profile = buildCoverageProfile({
    pipeline: {
      id: "opp-1",
      name: "Formula 1 Legends Capsule",
      organization: "Formula 1",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: null,
      prestige_score: null,
      probability_score: null,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  });

  const identity = profile.variables.find((v) => v.key === "IDENTITY_COVERAGE");
  assert.equal(identity?.state, "PARTIAL");
  const program = profile.variables.find((v) => v.key === "PROGRAM_SURFACES");
  assert.equal(program?.state, "UNKNOWN");
});

test("coverage semantics: merchandising program surface does NOT imply buyer intent", () => {
  const pipeline: any = {
    id: "opp-ud",
    name: "Upper Deck Hall of Fame capsule",
    organization: "Upper Deck",
    opportunity_type: "licensing",
    status: "researching",
    value_estimate: null,
    prestige_score: null,
    probability_score: null,
    owner_agent: "avery",
    next_step: null,
    next_step_due_at: null,
    notes_md: null,
    source: null
  };

  const rollup = {
    opportunity_id: "opp-ud",
    links: [
      {
        target_type: "claim_version",
        target_id: "cl_x",
        target_content_hash: "h",
        role: "SUPPORTS",
        match_method: "exact_org_name",
        confidence: 0.75,
        explanation: ""
      }
    ],
    link_count: 1,
    supported_claim_count: 1,
    supported_event_count: 0,
    trigger_signal_count: 0
  };

  const profile = buildCoverageProfile({ pipeline, rollup });
  const buyer = profile.variables.find((v) => v.key === "BUYER_INTENT");
  assert.equal(buyer?.state, "UNKNOWN");
});

test("coverage semantics: explicit trigger signals CAN improve buyer intent to PARTIAL", () => {
  const pipeline: any = {
    id: "opp-1",
    name: "Test",
    organization: "Org",
    opportunity_type: "brand_partnership",
    status: "identified",
    value_estimate: null,
    prestige_score: null,
    probability_score: null,
    owner_agent: "avery",
    next_step: null,
    next_step_due_at: null,
    notes_md: null,
    source: null
  };

  const rollup = {
    opportunity_id: "opp-1",
    links: [],
    link_count: 0,
    supported_claim_count: 0,
    supported_event_count: 0,
    trigger_signal_count: 1
  };

  const profile = buildCoverageProfile({ pipeline, rollup });
  const buyer = profile.variables.find((v) => v.key === "BUYER_INTENT");
  assert.equal(buyer?.state, "PARTIAL");
});

test("question generation selects a high-impact first question deterministically", () => {
  const profile = buildCoverageProfile({
    pipeline: {
      id: "opp-1",
      name: "Formula 1 Legends Capsule",
      organization: "Formula 1",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: null,
      prestige_score: null,
      probability_score: null,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  });

  const qs = buildResearchQuestionsV1(profile);
  assert.ok(qs.length > 0);
  assert.equal(qs[0]!.opportunity_id, "opp-1");
  assert.ok(typeof qs[0]!.priority_score === "number");
  assert.ok(qs[0]!.research_subject_type);
  assert.ok(typeof qs[0]!.research_subject_confidence === "number");
});

test("concept label is never treated automatically as buyer; buyer-dependent questions are gated", () => {
  const profile = buildCoverageProfile({
    pipeline: {
      id: "opp-1",
      name: "Formula 1 Legends Capsule",
      organization: "Formula 1 Legends Capsule",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: null,
      prestige_score: null,
      probability_score: null,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  });

  const qs = buildResearchQuestionsV1(profile);
  assert.ok(qs.length === 1);
  assert.equal(qs[0]!.variable, "IDENTITY_COVERAGE");
  assert.equal(qs[0]!.research_subject_type, "OPPORTUNITY");
  assert.ok(/target behind|commission\/pay|buyer/i.test(qs[0]!.question));
});

test("identity dependency overrides higher raw priority: unresolved identity yields identity question only", () => {
  const profile = buildCoverageProfile({
    pipeline: {
      id: "opp-1",
      name: "Some Concept Drop",
      organization: "Some Concept Drop",
      opportunity_type: "licensing",
      status: "identified",
      value_estimate: 100000,
      prestige_score: 90,
      probability_score: 80,
      owner_agent: "avery",
      next_step: "Intro",
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  });

  const qs = buildResearchQuestionsV1(profile);
  assert.equal(qs.length, 1);
  assert.equal(qs[0]!.variable, "IDENTITY_COVERAGE");
});

test("research memory gate prevents answered questions from regenerating", () => {
  const profile = buildCoverageProfile({
    pipeline: {
      id: "opp-1",
      name: "Test",
      organization: "Org",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: null,
      prestige_score: null,
      probability_score: null,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  });
  const qs = buildResearchQuestionsV1(profile);
  const first = qs[0]!;

  const gated = applyResearchMemoryGate({
    questions: qs,
    memoryRecords: [{ opportunity_id: "opp-1", question_id: first.question_id, status: "answered" }]
  });

  assert.ok(!gated.some((q) => q.question_id === first.question_id));
});

test("coverage semantics: merchandising program surface does NOT imply buyer intent", () => {
  const pipeline: any = {
    id: "opp-ud",
    name: "Upper Deck Hall of Fame capsule",
    organization: "Upper Deck",
    opportunity_type: "licensing",
    status: "researching",
    value_estimate: null,
    prestige_score: null,
    probability_score: null,
    owner_agent: "avery",
    next_step: null,
    next_step_due_at: null,
    notes_md: null,
    source: null
  };

  const rollup = {
    opportunity_id: "opp-ud",
    links: [
      {
        target_type: "claim_version",
        target_id: "cl_x",
        target_content_hash: "h",
        role: "SUPPORTS",
        match_method: "exact_org_name",
        confidence: 0.75,
        explanation: ""
      }
    ],
    link_count: 1,
    supported_claim_count: 1,
    supported_event_count: 0,
    trigger_signal_count: 0
  };

  const profile = buildCoverageProfile({ pipeline, rollup });
  const buyer = profile.variables.find((v) => v.key === "BUYER_INTENT");
  assert.equal(buyer?.state, "UNKNOWN");
});

test("coverage semantics: explicit trigger signals CAN improve buyer intent to PARTIAL", () => {
  const pipeline: any = {
    id: "opp-1",
    name: "Test",
    organization: "Org",
    opportunity_type: "brand_partnership",
    status: "identified",
    value_estimate: null,
    prestige_score: null,
    probability_score: null,
    owner_agent: "avery",
    next_step: null,
    next_step_due_at: null,
    notes_md: null,
    source: null
  };

  const rollup = {
    opportunity_id: "opp-1",
    links: [],
    link_count: 0,
    supported_claim_count: 0,
    supported_event_count: 0,
    trigger_signal_count: 1
  };

  const profile = buildCoverageProfile({ pipeline, rollup });
  const buyer = profile.variables.find((v) => v.key === "BUYER_INTENT");
  assert.equal(buyer?.state, "PARTIAL");
});

test("Upper Deck regression: program surfaces partial, buyer intent unknown, and totals reconcile", () => {
  const pipeline: any = {
    id: "opp-ud",
    name: "Upper Deck Hall of Fame capsule",
    organization: "Upper Deck",
    opportunity_type: "licensing",
    status: "researching",
    value_estimate: 55000,
    prestige_score: 9.1,
    probability_score: 0.32,
    owner_agent: "noah",
    next_step: "Map the right creative director + licensing contact and prep a prestige pitch",
    next_step_due_at: "2026-06-25T13:03:58.652Z",
    notes_md: "Collectible pedigree pairs well. Need to emphasize scarcity + prestige.",
    source: "research"
  };

  const rollup = {
    opportunity_id: "opp-ud",
    links: [
      {
        target_type: "claim_version",
        target_id: "cl_a",
        target_content_hash: "h1",
        role: "SUPPORTS",
        match_method: "exact_org_name",
        confidence: 0.75,
        explanation: ""
      },
      {
        target_type: "claim_version",
        target_id: "cl_b",
        target_content_hash: "h2",
        role: "SUPPORTS",
        match_method: "exact_org_name",
        confidence: 0.75,
        explanation: ""
      }
    ],
    link_count: 2,
    supported_claim_count: 2,
    supported_event_count: 0,
    trigger_signal_count: 0
  };

  const profile = buildCoverageProfile({ pipeline, rollup });
  const byKey = new Map(profile.variables.map((v) => [v.key, v.state]));

  assert.equal(byKey.get("PROGRAM_SURFACES"), "PARTIAL");
  assert.equal(byKey.get("BUYER_INTENT"), "UNKNOWN");

  const total = Object.values(profile.summaryCounts).reduce((a, b) => a + b, 0);
  assert.equal(total, 11);
});
