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
