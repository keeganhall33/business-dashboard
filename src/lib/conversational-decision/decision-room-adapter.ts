import type { DecisionRoomFixtureV1 } from "@/lib/intelligence-ux/responsive-shell-fixtures";
import type { ConversationalDecisionAnswerV1, ConversationalDecisionFixtureV1 } from "./contracts";

function assumptionStatus(state: ConversationalDecisionAnswerV1["assumptions"][number]["state"]): DecisionRoomFixtureV1["assumptions"][number]["status"] {
  if (state === "CONFIRMED") return "KNOWN";
  if (state === "CONFLICTED") return "NEEDS_REVIEW";
  return "UNKNOWN";
}

export function buildDecisionRoomFromConversationV1(input: {
  fixture: ConversationalDecisionFixtureV1;
  answer: ConversationalDecisionAnswerV1;
}): DecisionRoomFixtureV1 {
  const active = input.answer.active_recommendation_version;

  return {
    decision_id: input.fixture.decision_id,
    title: `Decision Room: ${active.title}`,
    breadcrumb: ["Home", "Strategy", active.title, "Decision Room"],
    recommendation_summary: active.recommendation_summary,
    strategic_question: input.fixture.strategic_question,
    decision_state: "RECOMMENDED",
    primary_action: active.recommended_action,
    contextual_ask: {
      id: `contextual-ask-${input.fixture.decision_id}`,
      scope: "DECISION_CONTEXT",
      placeholder: "Ask about this decision...",
      voice_state: "TRANSCRIPT_READY",
      supported_classifications: ["QUESTION_ONLY", "HYPOTHETICAL", "HUMAN_REPORTED_FACT", "HUMAN_JUDGMENT", "CORRECTION", "DECISION"],
      transcript: input.answer.turn_id,
      spoken_answer: input.answer.spoken_answer,
      written_answer: input.answer.written_answer,
      memory_write_policy: "NO_WRITE_WITHOUT_CLASSIFICATION"
    },
    written_answer_sections: [
      { heading: "Answer", body: input.answer.written_answer },
      {
        heading: input.answer.revision ? "WHY_CHANGED" : "Revision state",
        body: input.answer.revision ? input.answer.revision.why_changed.join(" ") : "No recommendation revision was created for this turn."
      },
      {
        heading: "Version audit",
        body: `Active RecommendationVersion ${active.version}; prior versions preserved: ${input.answer.prior_versions.map((item) => item.version).join(", ") || "none"}.`
      }
    ],
    evidence: input.answer.evidence_refs.map((item) => ({
      id: item.id,
      label: item.label,
      detail: `${item.truth_state} | ${item.provenance} | ${item.detail}`
    })),
    assumptions: [
      ...input.answer.assumptions.map((item) => ({ id: item.id, label: item.label, status: assumptionStatus(item.state) })),
      ...input.answer.unknowns.map((item) => ({ id: `unknown-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label: item, status: "UNKNOWN" as const })),
      ...input.answer.conflicts.map((item) => ({ id: `conflict-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label: item, status: "NEEDS_REVIEW" as const }))
    ]
  };
}
