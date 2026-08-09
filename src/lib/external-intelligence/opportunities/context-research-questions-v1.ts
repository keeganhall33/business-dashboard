import crypto from "node:crypto";

import type {
  OpportunityCandidateV1,
  OpportunityMissingIntelligenceCategoryV1,
  OpportunityTypeV1,
  EntityRefSnapshotV1
} from "@/lib/external-intelligence/opportunities/opportunity-candidate-v1";

export const CONTEXT_RESEARCH_PLANNER_POLICY_VERSION_V1 = "opportunity_context_questions_v1.policy";

export const RESEARCH_QUESTION_TYPES_V1 = [
  "ORGANIZATION_CONTEXT",
  "AGENCY_SCOPE",
  "PROJECT_MODEL_FIT",
  "PLANNING_WINDOW",
  "EXISTING_FIRST_PARTY_RELATIONSHIP"
] as const;
export type ResearchQuestionTypeV1 = (typeof RESEARCH_QUESTION_TYPES_V1)[number];

export const RESEARCH_PRIORITIES_V1 = ["GATE", "HIGH", "MEDIUM", "LOW"] as const;
export type ResearchPriorityV1 = (typeof RESEARCH_PRIORITIES_V1)[number];

export const DECISION_TARGETS_V1 = [
  "candidate_qualification",
  "candidate_rejection",
  "candidate_hold_still_needs_context"
] as const;
export type DecisionTargetV1 = (typeof DECISION_TARGETS_V1)[number];

export const RESEARCH_ANSWER_TYPES_V1 = [
  "BOOLEAN",
  "ENUM",
  "SHORT_TEXT",
  "DATE_WINDOW",
  "ENTITY_LIST",
  "STRUCTURED_FACT_SET"
] as const;
export type ResearchAnswerTypeV1 = (typeof RESEARCH_ANSWER_TYPES_V1)[number];

export const RESEARCH_SOURCE_DOMAINS_V1 = ["EXTERNAL", "INTERNAL", "FIRST_PARTY_MANUAL", "INFERENCE"] as const;
export type ResearchSourceDomainV1 = (typeof RESEARCH_SOURCE_DOMAINS_V1)[number];

export const EXTERNAL_SOURCE_CLASSES_V1 = [
  "official_website",
  "official_newsroom",
  "official_event_page",
  "official_partner_page",
  "authoritative_trade",
  "high_quality_news",
  "other_public"
] as const;

export const INTERNAL_SOURCE_CLASSES_V1 = ["internal_system_record"] as const;

export const FIRST_PARTY_MANUAL_SOURCE_CLASSES_V1 = ["manual_keegan_confirmed"] as const;

export type ResearchSourceClassV1 =
  | (typeof EXTERNAL_SOURCE_CLASSES_V1)[number]
  | (typeof INTERNAL_SOURCE_CLASSES_V1)[number]
  | (typeof FIRST_PARTY_MANUAL_SOURCE_CLASSES_V1)[number];

export const RESEARCH_FRESHNESS_CLASSES_V1 = ["STABLE", "CURRENT", "TIME_SENSITIVE"] as const;
export type ResearchFreshnessRequirementV1 = (typeof RESEARCH_FRESHNESS_CLASSES_V1)[number];

export const RESEARCH_STOP_REASONS_V1 = [
  "candidate_rejected_by_gate",
  "candidate_qualified_for_next_layer",
  "remaining_unknowns_not_decision_changing",
  "insufficient_source_quality",
  "research_budget_exhausted",
  "contact_layer_boundary",
  "account_mapping_layer_boundary",
  "material_conflict_requires_review"
] as const;
export type ResearchStopReasonV1 = (typeof RESEARCH_STOP_REASONS_V1)[number];

export const RESEARCH_DEPENDENCY_ACTIVATION_CONDITIONS_V1 = [
  "ANSWERED_RELEVANT",
  "ANSWERED_TRUE",
  "NOT_REJECTED",
  "ANSWER_STATUS_IN"
] as const;
export type ResearchDependencyActivationConditionV1 = (typeof RESEARCH_DEPENDENCY_ACTIVATION_CONDITIONS_V1)[number];

export type ResearchDependencyV1 = {
  question_id: string;
  depends_on_question_id: string;
  activation_condition: ResearchDependencyActivationConditionV1;
};

export type ResearchStopConditionV1 = {
  stop_reason: ResearchStopReasonV1;
  // The planner does not evaluate answers. This is a declarative intent.
  applies_when: "answer_evaluated" | "budget" | "layer_boundary";
};

export type ResearchQuestionV1 = {
  research_question_id: string;
  planner_policy_version: string;
  candidate_id: string;

  question_type: ResearchQuestionTypeV1;
  // Human-readable deterministic template. Not used for identity.
  question_text: string;

  subject_entity_refs: EntityRefSnapshotV1[];

  source_missing_intelligence_category: OpportunityMissingIntelligenceCategoryV1;
  decision_target: DecisionTargetV1;
  priority: ResearchPriorityV1;

  answer_type: ResearchAnswerTypeV1;
  source_domain: ResearchSourceDomainV1;
  acceptable_source_classes: ResearchSourceClassV1[];
  freshness: ResearchFreshnessRequirementV1;

  dependencies: ResearchDependencyV1[];
  stop_conditions: ResearchStopConditionV1[];
};

export type ResearchPlannerPolicyV1 = {
  policy_version: string;
  supported_opportunity_types: OpportunityTypeV1[];
  active_question_types: ResearchQuestionTypeV1[];
  max_questions: number;
  max_dependency_depth: number;
};

export const RESEARCH_PLANNER_POLICY_V1: ResearchPlannerPolicyV1 = {
  policy_version: CONTEXT_RESEARCH_PLANNER_POLICY_VERSION_V1,
  supported_opportunity_types: ["agency_relationship_signal"],
  active_question_types: [...RESEARCH_QUESTION_TYPES_V1],
  max_questions: 5,
  max_dependency_depth: 5
};

export type ResearchPlanV1 = {
  candidate_id: string;
  planner_policy_version: string;
  generated_at: string;
  root_question_ids: string[];
  questions: ResearchQuestionV1[];
  max_questions: number;
  max_dependency_depth: number;
};

export type ResearchPlannerResultV1 =
  | { status: "planned"; plan: ResearchPlanV1 }
  | {
      status: "unsupported";
      candidate_id: string;
      reason: "unsupported_opportunity_type";
      supported_opportunity_types: OpportunityTypeV1[];
    };

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stableSortById(refs: EntityRefSnapshotV1[]): EntityRefSnapshotV1[] {
  return [...refs].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function computeResearchQuestionIdV1(input: {
  planner_policy_version: string;
  candidate_id: string;
  question_type: ResearchQuestionTypeV1;
  subject_entity_ids: string[];
  source_missing_intelligence_category: OpportunityMissingIntelligenceCategoryV1;
  source_domain: ResearchSourceDomainV1;
}): string {
  const projection = {
    v: "rq_v1",
    planner_policy_version: input.planner_policy_version,
    candidate_id: input.candidate_id,
    question_type: input.question_type,
    subject_entity_ids: [...input.subject_entity_ids].sort((a, b) => a.localeCompare(b)),
    source_missing_intelligence_category: input.source_missing_intelligence_category,
    source_domain: input.source_domain
  };
  const h = sha256Hex(JSON.stringify(projection));
  return `rq:${h.slice(0, 24)}`;
}

function questionTextTemplate(input: {
  type: ResearchQuestionTypeV1;
  focalName: string;
  contextName: string;
}): string {
  switch (input.type) {
    case "ORGANIZATION_CONTEXT":
      return `What does ${input.contextName} do, which markets/audiences does it serve, and what activities are relevant to evaluating this candidate?`;
    case "AGENCY_SCOPE":
      return `What scope was ${input.focalName} appointed to perform for ${input.contextName} under the described role, and which functions does that scope cover?`;
    case "PROJECT_MODEL_FIT":
      return `Is there evidence that ${input.contextName} and/or ${input.focalName} operate campaigns, activations, partnerships, events, hospitality, philanthropy, or cultural programs where one or more Keegan project models could plausibly fit?`;
    case "PLANNING_WINDOW":
      return `Is there evidence of a current or upcoming planning window (season, event calendar, launch cycle, partnership window) that would make this candidate time-relevant?`;
    case "EXISTING_FIRST_PARTY_RELATIONSHIP":
      return `Do we have any existing first-party relationship, prior outreach, or project history involving ${input.contextName} and/or ${input.focalName}?`;
    default:
      return "";
  }
}

function acceptableSourceClassesForDomain(domain: ResearchSourceDomainV1): ResearchSourceClassV1[] {
  if (domain === "EXTERNAL") return [...EXTERNAL_SOURCE_CLASSES_V1];
  if (domain === "INTERNAL") return [...INTERNAL_SOURCE_CLASSES_V1];
  if (domain === "FIRST_PARTY_MANUAL") return [...FIRST_PARTY_MANUAL_SOURCE_CLASSES_V1];
  // INFERENCE is not an acceptable factual source class; keep empty.
  return [];
}

function freshnessForType(type: ResearchQuestionTypeV1): ResearchFreshnessRequirementV1 {
  switch (type) {
    case "ORGANIZATION_CONTEXT":
      return "STABLE";
    case "AGENCY_SCOPE":
      return "CURRENT";
    case "PROJECT_MODEL_FIT":
      return "CURRENT";
    case "PLANNING_WINDOW":
      return "TIME_SENSITIVE";
    case "EXISTING_FIRST_PARTY_RELATIONSHIP":
      return "CURRENT";
    default:
      return "CURRENT";
  }
}

function sourceDomainForType(type: ResearchQuestionTypeV1): ResearchSourceDomainV1 {
  switch (type) {
    case "ORGANIZATION_CONTEXT":
    case "AGENCY_SCOPE":
    case "PROJECT_MODEL_FIT":
    case "PLANNING_WINDOW":
      return "EXTERNAL";
    case "EXISTING_FIRST_PARTY_RELATIONSHIP":
      // Internal systems or explicit manual confirmation. Planner will choose INTERNAL by default.
      return "INTERNAL";
    default:
      return "EXTERNAL";
  }
}

function shouldIncludeOptionalQuestion(input: {
  question_type: ResearchQuestionTypeV1;
  missing_intelligence: OpportunityMissingIntelligenceCategoryV1[];
}): boolean {
  // Required gates are always included.
  if (input.question_type === "ORGANIZATION_CONTEXT") return true;
  if (input.question_type === "AGENCY_SCOPE") return true;

  const mi = new Set(input.missing_intelligence);

  if (input.question_type === "PROJECT_MODEL_FIT") {
    return mi.has("commercial_model_fit") || mi.has("art_or_cultural_fit") || mi.has("experiential_scope") || mi.has("partnership_scope") || mi.has("philanthropy_scope");
  }

  if (input.question_type === "PLANNING_WINDOW") {
    return mi.has("planning_window");
  }

  if (input.question_type === "EXISTING_FIRST_PARTY_RELATIONSHIP") {
    return mi.has("existing_relationship") || mi.has("existing_project_history");
  }

  return false;
}

function pickMissingIntelligenceCategoryForQuestion(type: ResearchQuestionTypeV1): OpportunityMissingIntelligenceCategoryV1 {
  switch (type) {
    case "ORGANIZATION_CONTEXT":
      return "organization_business_context";
    case "AGENCY_SCOPE":
      return "agency_scope";
    case "PROJECT_MODEL_FIT":
      return "commercial_model_fit";
    case "PLANNING_WINDOW":
      return "planning_window";
    case "EXISTING_FIRST_PARTY_RELATIONSHIP":
      return "existing_relationship";
    default:
      return "organization_business_context";
  }
}

function decisionTargetForType(type: ResearchQuestionTypeV1): DecisionTargetV1 {
  if (type === "ORGANIZATION_CONTEXT" || type === "AGENCY_SCOPE") return "candidate_rejection";
  return "candidate_qualification";
}

function priorityForType(type: ResearchQuestionTypeV1): ResearchPriorityV1 {
  if (type === "ORGANIZATION_CONTEXT" || type === "AGENCY_SCOPE") return "GATE";
  return "HIGH";
}

function answerTypeForType(type: ResearchQuestionTypeV1): ResearchAnswerTypeV1 {
  switch (type) {
    case "PLANNING_WINDOW":
      return "DATE_WINDOW";
    case "EXISTING_FIRST_PARTY_RELATIONSHIP":
      return "BOOLEAN";
    default:
      return "STRUCTURED_FACT_SET";
  }
}

function makeQuestion(input: {
  candidate: OpportunityCandidateV1;
  question_type: ResearchQuestionTypeV1;
  subject_entity_refs: EntityRefSnapshotV1[];
}): ResearchQuestionV1 {
  const c = input.candidate;
  const focalName = c.focal_entity_refs[0]?.canonical_name ?? "(unknown focal)";
  const contextName = c.context_entity_refs[0]?.canonical_name ?? "(unknown context)";

  const source_domain = sourceDomainForType(input.question_type);
  const source_missing_intelligence_category = pickMissingIntelligenceCategoryForQuestion(input.question_type);

  const subject_entity_refs = stableSortById(input.subject_entity_refs);
  const subject_entity_ids = subject_entity_refs.map((e) => e.entity_id);

  const research_question_id = computeResearchQuestionIdV1({
    planner_policy_version: RESEARCH_PLANNER_POLICY_V1.policy_version,
    candidate_id: c.opportunity_candidate_id,
    question_type: input.question_type,
    subject_entity_ids,
    source_missing_intelligence_category,
    source_domain
  });

  return {
    research_question_id,
    planner_policy_version: RESEARCH_PLANNER_POLICY_V1.policy_version,
    candidate_id: c.opportunity_candidate_id,
    question_type: input.question_type,
    question_text: questionTextTemplate({ type: input.question_type, focalName, contextName }),
    subject_entity_refs,
    source_missing_intelligence_category,
    decision_target: decisionTargetForType(input.question_type),
    priority: priorityForType(input.question_type),
    answer_type: answerTypeForType(input.question_type),
    source_domain,
    acceptable_source_classes: acceptableSourceClassesForDomain(source_domain),
    freshness: freshnessForType(input.question_type),
    dependencies: [],
    stop_conditions: []
  };
}

function attachDependency(q: ResearchQuestionV1, dep: ResearchDependencyV1): ResearchQuestionV1 {
  return { ...q, dependencies: [...q.dependencies, dep] };
}

function attachStop(q: ResearchQuestionV1, stop: ResearchStopConditionV1): ResearchQuestionV1 {
  return { ...q, stop_conditions: [...q.stop_conditions, stop] };
}

export function planOpportunityContextQuestionsV1(candidate: OpportunityCandidateV1): ResearchPlannerResultV1 {
  if (candidate.opportunity_type !== "agency_relationship_signal") {
    return {
      status: "unsupported",
      candidate_id: candidate.opportunity_candidate_id,
      reason: "unsupported_opportunity_type",
      supported_opportunity_types: [...RESEARCH_PLANNER_POLICY_V1.supported_opportunity_types]
    };
  }

  const missing = (candidate.missing_intelligence ?? []) as OpportunityMissingIntelligenceCategoryV1[];

  // Q1: ORGANIZATION_CONTEXT (context only)
  const q1 = makeQuestion({
    candidate,
    question_type: "ORGANIZATION_CONTEXT",
    subject_entity_refs: candidate.context_entity_refs
  });

  // Q2: AGENCY_SCOPE (focal + context)
  const q2Base = makeQuestion({
    candidate,
    question_type: "AGENCY_SCOPE",
    subject_entity_refs: [...candidate.focal_entity_refs, ...candidate.context_entity_refs]
  });
  const q2 = attachDependency(q2Base, {
    question_id: q2Base.research_question_id,
    depends_on_question_id: q1.research_question_id,
    activation_condition: "NOT_REJECTED"
  });

  // Q3: PROJECT_MODEL_FIT (focal + context)
  const includeQ3 = shouldIncludeOptionalQuestion({ question_type: "PROJECT_MODEL_FIT", missing_intelligence: missing });
  const q3Base = makeQuestion({
    candidate,
    question_type: "PROJECT_MODEL_FIT",
    subject_entity_refs: [...candidate.context_entity_refs, ...candidate.focal_entity_refs]
  });
  const q3 = attachDependency(q3Base, {
    question_id: q3Base.research_question_id,
    depends_on_question_id: q2.research_question_id,
    activation_condition: "ANSWERED_RELEVANT"
  });

  // Q4: PLANNING_WINDOW (context)
  const includeQ4 = shouldIncludeOptionalQuestion({ question_type: "PLANNING_WINDOW", missing_intelligence: missing });
  const q4Base = makeQuestion({ candidate, question_type: "PLANNING_WINDOW", subject_entity_refs: candidate.context_entity_refs });
  const q4 = attachDependency(q4Base, {
    question_id: q4Base.research_question_id,
    depends_on_question_id: q3.research_question_id,
    activation_condition: "ANSWERED_RELEVANT"
  });

  // Q5: EXISTING_FIRST_PARTY_RELATIONSHIP (internal/manual)
  const includeQ5 = shouldIncludeOptionalQuestion({
    question_type: "EXISTING_FIRST_PARTY_RELATIONSHIP",
    missing_intelligence: missing
  });

  // Default domain INTERNAL; future can add FIRST_PARTY_MANUAL separately.
  const q5Base = makeQuestion({
    candidate,
    question_type: "EXISTING_FIRST_PARTY_RELATIONSHIP",
    subject_entity_refs: [...candidate.context_entity_refs, ...candidate.focal_entity_refs]
  });
  const q5 = attachDependency(q5Base, {
    question_id: q5Base.research_question_id,
    depends_on_question_id: includeQ4 && includeQ3 ? q4.research_question_id : q2.research_question_id,
    activation_condition: "NOT_REJECTED"
  });

  // Attach declarative stop conditions.
  const q1s = attachStop(q1, { stop_reason: "candidate_rejected_by_gate", applies_when: "answer_evaluated" });
  const q2s = attachStop(q2, { stop_reason: "candidate_rejected_by_gate", applies_when: "answer_evaluated" });

  const questions: ResearchQuestionV1[] = [q1s, q2s];
  if (includeQ3) questions.push(q3);
  if (includeQ4) questions.push(q4);
  if (includeQ5) questions.push(q5);

  // Hard bounds.
  const bounded = questions.slice(0, RESEARCH_PLANNER_POLICY_V1.max_questions);

  const plan: ResearchPlanV1 = {
    candidate_id: candidate.opportunity_candidate_id,
    planner_policy_version: RESEARCH_PLANNER_POLICY_V1.policy_version,
    generated_at: new Date().toISOString(),
    root_question_ids: [q1.research_question_id],
    questions: bounded,
    max_questions: RESEARCH_PLANNER_POLICY_V1.max_questions,
    max_dependency_depth: RESEARCH_PLANNER_POLICY_V1.max_dependency_depth
  };

  return { status: "planned", plan };
}
