import { DecisionConversationPanel } from "@/components/intelligence/conversation/DecisionConversationPanel";
import type { ReactNode } from "react";
import {
  buildDecisionConversationPanelViewModelV1,
  type DecisionConversationViewModelV1
} from "@/components/intelligence/conversation/DecisionConversationViewModel";
import type { ConversationRevisionPreviewV1 } from "@/lib/decision-intelligence/conversation-revision/contracts";
import {
  CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1,
  CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1,
  CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1
} from "@/lib/decision-intelligence/conversation-revision/fixtures";
import {
  RECOMMENDATION_REVISION_CORRECTION_RESULT_V1,
  RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1
} from "@/lib/decision-intelligence/revision/fixtures";

type DecisionRoomConversationRevisionViewModelV1 = {
  question_panel: DecisionConversationViewModelV1;
  new_information_panel: DecisionConversationViewModelV1;
  text_preview: ConversationRevisionPreviewV1;
  transcript_preview: ConversationRevisionPreviewV1;
  text_and_voice_same_canonical_payload: boolean;
  old_version_inspectable: boolean;
  hypothetical_guardrail: {
    classification: string;
    truth_state: string;
    facts_mutated: boolean;
    memory_mutated: boolean;
  };
  conflicted_state_preview: {
    active_version: number;
    conflict: string;
    evidence_label: string;
    truth_state: "CONFLICTED";
  };
};

function buildDecisionRoomConversationRevisionViewModelV1(): DecisionRoomConversationRevisionViewModelV1 {
  const questionPanel = buildDecisionConversationPanelViewModelV1({ turnId: "turn-grounded-why", mode: "TEXT" });
  const newInformationPanel = buildDecisionConversationPanelViewModelV1({ turnId: "turn-human-reported-fact", mode: "VOICE_TRANSCRIPT" });
  const correctionEvidence = RECOMMENDATION_REVISION_CORRECTION_RESULT_V1.active_recommendation.evidence_refs.find((item) => item.truth_state === "CONFLICTED");
  const hypotheticalEvidence = RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.active_recommendation.evidence_refs.find((item) => item.truth_state === "HYPOTHETICAL_ONLY");
  const hypotheticalPayload = CONVERSATION_REVISION_CLASSIFICATION_PAYLOADS_V1.find((payload) => payload.classification === "HYPOTHETICAL");

  return {
    question_panel: questionPanel,
    new_information_panel: newInformationPanel,
    text_preview: CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1,
    transcript_preview: CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1,
    text_and_voice_same_canonical_payload:
      CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.normalized_utterance === CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1.normalized_utterance &&
      CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.classification === CONVERSATION_REVISION_TRANSCRIPT_FACT_PREVIEW_V1.classification,
    old_version_inspectable: CONVERSATION_REVISION_TEXT_FACT_PREVIEW_V1.revision_result.preserved_versions.some((version) => version.version === 1),
    hypothetical_guardrail: {
      classification: hypotheticalPayload?.classification ?? "HYPOTHETICAL",
      truth_state: hypotheticalEvidence?.truth_state ?? "HYPOTHETICAL_ONLY",
      facts_mutated: RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.facts_mutated,
      memory_mutated: RECOMMENDATION_REVISION_HYPOTHETICAL_RESULT_V1.memory_mutated
    },
    conflicted_state_preview: {
      active_version: RECOMMENDATION_REVISION_CORRECTION_RESULT_V1.active_recommendation.version,
      conflict: RECOMMENDATION_REVISION_CORRECTION_RESULT_V1.active_recommendation.conflicts[0] ?? "Decision-maker access is conflicted.",
      evidence_label: correctionEvidence?.label ?? "Correction evidence",
      truth_state: "CONFLICTED"
    }
  };
}

function RevisionPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-800">{children}</span>;
}

export function DecisionRoomConversationRevision({
  viewModel = buildDecisionRoomConversationRevisionViewModelV1()
}: {
  viewModel?: DecisionRoomConversationRevisionViewModelV1;
}) {
  const preview = viewModel.text_preview;
  const diff = preview.recommendation_version_diff;
  const oldVersion = preview.revision_result.old_recommendation;
  const activeVersion = preview.revision_result.active_recommendation;
  const versionChangeLabel = `Recommendation version ${oldVersion.version} to ${activeVersion.version}`;
  const canonicalLabel = `voice/text canonical=${String(viewModel.text_and_voice_same_canonical_payload)}`;
  const confidenceDeltaLabel = `${preview.confidence_delta?.before} to ${preview.confidence_delta?.after} | ${preview.confidence_delta?.direction}`;
  const hypotheticalMutationLabel = `facts_mutated=${String(viewModel.hypothetical_guardrail.facts_mutated)} memory_mutated=${String(viewModel.hypothetical_guardrail.memory_mutated)}`;
  const preservedVersionsLabel = `Preserved versions: ${preview.revision_result.preserved_versions.map((version) => `Version ${version.version}`).join(", ")}. Inspectable=${String(viewModel.old_version_inspectable)}`;
  const newInfoCanonicalPayloadLabel = `New info canonical payload: ${viewModel.new_information_panel.input.classification} / ${viewModel.new_information_panel.input.mode} / read_only_fixture=${String(viewModel.new_information_panel.input.read_only_fixture)}`;

  return (
    <section aria-label="Decision Room conversation and revision history" className="mt-5 space-y-4">
      <DecisionConversationPanel viewModel={viewModel.question_panel} />

      <article className="rounded-2xl border border-stone-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">New information preview</p>
            <h3 className="mt-2 text-lg font-semibold text-stone-950">{versionChangeLabel}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">Read-only fixture preview; no durable memory write is performed from this Decision Room surface.</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{newInfoCanonicalPayloadLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RevisionPill>{preview.classification}</RevisionPill>
            <RevisionPill>{preview.payload_kind}</RevisionPill>
            <RevisionPill>{canonicalLabel}</RevisionPill>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Before</p>
            <h4 className="mt-2 text-sm font-semibold text-stone-950">{`Version ${oldVersion.version}`}</h4>
            <p className="mt-2 text-sm leading-6 text-stone-700">{oldVersion.recommendation_summary}</p>
            <p className="mt-2 text-sm font-semibold text-stone-950">{oldVersion.recommended_action}</p>
            <p className="mt-2 text-xs font-semibold text-stone-600">{`Confidence: ${oldVersion.confidence}`}</p>
          </section>

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">After</p>
            <h4 className="mt-2 text-sm font-semibold text-emerald-950">{`Version ${activeVersion.version}`}</h4>
            <p className="mt-2 text-sm leading-6 text-emerald-900">{activeVersion.recommendation_summary}</p>
            <p className="mt-2 text-sm font-semibold text-emerald-950">{activeVersion.recommended_action}</p>
            <p className="mt-2 text-xs font-semibold text-emerald-800">{`Confidence: ${activeVersion.confidence}`}</p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Confidence delta</p>
            <p className="mt-2 text-sm font-semibold text-stone-950">{confidenceDeltaLabel}</p>
            <p className="mt-2 text-sm leading-6 text-stone-700">{preview.confidence_delta?.reason}</p>
          </section>
          <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Changed evidence</p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-700">
              {(diff?.added_evidence_ids ?? []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Changed assumptions</p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-700">
              {(diff?.changed_assumption_ids ?? []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">WHY_CHANGED</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-700">
            {preview.why_changed.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">UNKNOWN remains explicit</p>
            <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-amber-900">
              {activeVersion.unknowns.map((item) => <li key={item}>{`UNKNOWN: ${item}`}</li>)}
            </ul>
          </section>
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">CONFLICTED preview</p>
            <p className="mt-2 text-sm font-semibold text-rose-950">{`Version ${viewModel.conflicted_state_preview.active_version}: ${viewModel.conflicted_state_preview.truth_state}`}</p>
            <p className="mt-2 text-sm leading-6 text-rose-900">{`${viewModel.conflicted_state_preview.evidence_label}: ${viewModel.conflicted_state_preview.conflict}`}</p>
          </section>
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Hypothetical guardrail</p>
            <p className="mt-2 text-sm font-semibold text-sky-950">{`${viewModel.hypothetical_guardrail.classification} / ${viewModel.hypothetical_guardrail.truth_state}`}</p>
            <p className="mt-2 text-sm leading-6 text-sky-900">{hypotheticalMutationLabel}</p>
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Old recommendation remains inspectable</p>
          <p className="mt-2 text-sm leading-6 text-stone-700">{preservedVersionsLabel}</p>
        </section>
      </article>
    </section>
  );
}
