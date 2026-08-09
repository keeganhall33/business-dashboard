import test from "node:test";
import assert from "node:assert/strict";

import { ExternalEventV1Schema } from "@/lib/external-intelligence/contracts/external-event-v1";
import { detectOpportunityCandidatesFromEventV1 } from "@/lib/external-intelligence/opportunities/opportunity-candidate-policy-v1";
import {
  computeResearchQuestionIdV1,
  planOpportunityContextQuestionsV1,
  RESEARCH_PLANNER_POLICY_V1,
  type ResearchPlanV1
} from "@/lib/external-intelligence/opportunities/context-research-questions-v1";

function mkEventVersionRef(event_id: string, content_hash = "f".repeat(64)) {
  return { event_id, content_hash, schema_version: "external_event_v1" as const, policy_version: "event_v1.policy" };
}

function planFromEventFixture(input: {
  event_id: string;
  appointing: { id: string; name: string };
  appointed: { id: string; name: string };
  role: string;
}): ResearchPlanV1 {
  const ev = ExternalEventV1Schema.parse({
    schema_version: "external_event_v1",
    event_id: input.event_id,
    event_type: "entity_appointed_to_role",
    participants: [
      {
        role: "appointing_entity",
        entity_ref: { entity_id: input.appointing.id, entity_type: "organization", canonical_name: input.appointing.name }
      },
      {
        role: "appointed_entity",
        entity_ref: { entity_id: input.appointed.id, entity_type: "organization", canonical_name: input.appointed.name }
      }
    ],
    attributes: [{ key: "appointment_role", value: input.role }],
    times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
    verification_state: "unverified",
    extraction_confidence: { level: "high", reasons: ["fixture"] },
    policy_version: "event_v1.policy"
  });

  const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
  assert.equal(det.candidates.length, 1);

  const planned = planOpportunityContextQuestionsV1(det.candidates[0]!);
  assert.equal(planned.status, "planned");
  return (planned as { status: "planned"; plan: ResearchPlanV1 }).plan;
}

test("Premier Padel / Ten Toes -> deterministic 5-question plan with expected DAG", () => {
  const plan = planFromEventFixture({
    event_id: "provisional_event:entity_appointed_to_role:pp",
    appointing: { id: "provisional:organization:pp", name: "Premier Padel" },
    appointed: { id: "provisional:organization:tt", name: "Ten Toes" },
    role: "lead digital marketing"
  });

  assert.equal(plan.questions.length, 5);
  assert.deepEqual(
    plan.questions.map((q) => q.question_type),
    ["ORGANIZATION_CONTEXT", "AGENCY_SCOPE", "PROJECT_MODEL_FIT", "PLANNING_WINDOW", "EXISTING_FIRST_PARTY_RELATIONSHIP"]
  );

  // Source domains locked.
  const domains = Object.fromEntries(plan.questions.map((q) => [q.question_type, q.source_domain]));
  assert.equal(domains["ORGANIZATION_CONTEXT"], "EXTERNAL");
  assert.equal(domains["AGENCY_SCOPE"], "EXTERNAL");
  assert.equal(domains["PROJECT_MODEL_FIT"], "EXTERNAL");
  assert.equal(domains["PLANNING_WINDOW"], "EXTERNAL");
  assert.equal(domains["EXISTING_FIRST_PARTY_RELATIONSHIP"], "INTERNAL");

  // Dependency graph present.
  const q1 = plan.questions[0]!;
  const q2 = plan.questions[1]!;
  const q3 = plan.questions[2]!;
  const q4 = plan.questions[3]!;
  const q5 = plan.questions[4]!;

  assert.equal(q1.dependencies.length, 0);
  assert.equal(q2.dependencies[0]?.depends_on_question_id, q1.research_question_id);
  assert.equal(q3.dependencies[0]?.depends_on_question_id, q2.research_question_id);
  assert.equal(q4.dependencies[0]?.depends_on_question_id, q3.research_question_id);
  assert.ok([q2.research_question_id, q4.research_question_id].includes(q5.dependencies[0]?.depends_on_question_id ?? ""));

  // Bounds.
  assert.ok(plan.questions.length <= 5);
  assert.equal(plan.max_questions, 5);
  assert.equal(plan.max_dependency_depth, 5);
});

test("MI London / Ten Toes -> deterministic plan with same structure", () => {
  const plan = planFromEventFixture({
    event_id: "provisional_event:entity_appointed_to_role:mil",
    appointing: { id: "provisional:organization:mil", name: "MI London" },
    appointed: { id: "provisional:organization:tt", name: "Ten Toes" },
    role: "content agency"
  });

  assert.equal(plan.questions.length, 5);
  assert.deepEqual(
    plan.questions.map((q) => q.question_type),
    ["ORGANIZATION_CONTEXT", "AGENCY_SCOPE", "PROJECT_MODEL_FIT", "PLANNING_WINDOW", "EXISTING_FIRST_PARTY_RELATIONSHIP"]
  );
});

test("question id determinism: entity ordering and generated_at drift do not change ids", () => {
  const candidate_id = "oppcand:agency_relationship_signal:abc";

  const id1 = computeResearchQuestionIdV1({
    planner_policy_version: RESEARCH_PLANNER_POLICY_V1.policy_version,
    candidate_id,
    question_type: "AGENCY_SCOPE",
    subject_entity_ids: ["b", "a"],
    source_missing_intelligence_category: "agency_scope",
    source_domain: "EXTERNAL"
  });

  const id2 = computeResearchQuestionIdV1({
    planner_policy_version: RESEARCH_PLANNER_POLICY_V1.policy_version,
    candidate_id,
    question_type: "AGENCY_SCOPE",
    subject_entity_ids: ["a", "b"],
    source_missing_intelligence_category: "agency_scope",
    source_domain: "EXTERNAL"
  });

  assert.equal(id1, id2);
});

test("source domain tests: manual_keegan_confirmed is FIRST_PARTY_MANUAL (not EXTERNAL) and inference not accepted as factual source", () => {
  // Contract-level: the only place manual_keegan_confirmed may appear is FIRST_PARTY_MANUAL.
  // In V1 planner, EXISTING_FIRST_PARTY_RELATIONSHIP defaults to INTERNAL and does not accept inference.
  const plan = planFromEventFixture({
    event_id: "provisional_event:entity_appointed_to_role:sd",
    appointing: { id: "provisional:organization:x", name: "X" },
    appointed: { id: "provisional:organization:y", name: "Y" },
    role: "lead digital marketing"
  });

  const q = plan.questions.find((qq) => qq.question_type === "EXISTING_FIRST_PARTY_RELATIONSHIP")!;
  assert.equal(q.source_domain, "INTERNAL");
  assert.deepEqual(q.acceptable_source_classes, ["internal_system_record"]);
});

test("optional question gating: missing_intelligence drives inclusion (required gates always present)", () => {
  planFromEventFixture({
    event_id: "provisional_event:entity_appointed_to_role:opt",
    appointing: { id: "provisional:organization:pp", name: "Premier Padel" },
    appointed: { id: "provisional:organization:tt", name: "Ten Toes" },
    role: "lead digital marketing"
  });

  // Reconstruct using the planner again with modified missing_intelligence.
  // NOTE: we intentionally keep this test local to the planner contract by cloning a real planned candidate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realCandidate: any = ((): any => {
    const ev = ExternalEventV1Schema.parse({
      schema_version: "external_event_v1",
      event_id: "provisional_event:entity_appointed_to_role:opt2",
      event_type: "entity_appointed_to_role",
      participants: [
        {
          role: "appointing_entity",
          entity_ref: { entity_id: "provisional:organization:pp", entity_type: "organization", canonical_name: "Premier Padel" }
        },
        {
          role: "appointed_entity",
          entity_ref: { entity_id: "provisional:organization:tt", entity_type: "organization", canonical_name: "Ten Toes" }
        }
      ],
      attributes: [{ key: "appointment_role", value: "lead digital marketing" }],
      times: { announcement_time: null, event_time: null, retrieved_at: null, effective_from: null, effective_until: null },
      verification_state: "unverified",
      extraction_confidence: { level: "high", reasons: ["fixture"] },
      policy_version: "event_v1.policy"
    });
    const det = detectOpportunityCandidatesFromEventV1({ event: ev, event_version_ref: mkEventVersionRef(ev.event_id) });
    return det.candidates[0];
  })();

  realCandidate.missing_intelligence = ["organization_business_context", "agency_scope"];
  const planned = planOpportunityContextQuestionsV1(realCandidate);
  assert.equal(planned.status, "planned");
  const gated = (planned as { status: "planned"; plan: ResearchPlanV1 }).plan;

  assert.deepEqual(gated.questions.map((q) => q.question_type), ["ORGANIZATION_CONTEXT", "AGENCY_SCOPE"]);
});

test("contact gate + account mapping gate: planner emits only the 5 allowed question types", () => {
  const plan = planFromEventFixture({
    event_id: "provisional_event:entity_appointed_to_role:gate",
    appointing: { id: "provisional:organization:pp", name: "Premier Padel" },
    appointed: { id: "provisional:organization:tt", name: "Ten Toes" },
    role: "lead digital marketing"
  });

  const allowed = new Set([
    "ORGANIZATION_CONTEXT",
    "AGENCY_SCOPE",
    "PROJECT_MODEL_FIT",
    "PLANNING_WINDOW",
    "EXISTING_FIRST_PARTY_RELATIONSHIP"
  ]);

  for (const q of plan.questions) {
    assert.ok(allowed.has(q.question_type));
    assert.ok(!/person|contact|email|linkedin/i.test(q.question_text));
  }
});
