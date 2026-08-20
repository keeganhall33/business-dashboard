import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DecisionConversationPanel } from "@/components/intelligence/conversation/DecisionConversationPanel";
import {
  buildDecisionConversationPanelViewModelV1,
  normalizeDecisionConversationInputV1
} from "@/components/intelligence/conversation/DecisionConversationViewModel";
import { CONVERSATIONAL_DECISION_FIXTURE_V1 } from "@/lib/conversational-decision/fixtures";

const fixture = CONVERSATIONAL_DECISION_FIXTURE_V1;

test("text and voice transcript normalize to the same canonical interaction shape", () => {
  const turn = fixture.turns[0];
  const textInput = normalizeDecisionConversationInputV1({ fixture, mode: "TEXT", turn });
  const voiceInput = normalizeDecisionConversationInputV1({ fixture, mode: "VOICE_TRANSCRIPT", turn });

  assert.equal(textInput.utterance, voiceInput.utterance);
  assert.equal(textInput.transcript, voiceInput.transcript);
  assert.equal(textInput.classification, voiceInput.classification);
  assert.equal(textInput.decision_id, voiceInput.decision_id);
  assert.equal(textInput.recommendation_id, voiceInput.recommendation_id);
  assert.equal(textInput.read_only_fixture, true);
  assert.equal(voiceInput.mode, "VOICE_TRANSCRIPT");
});

test("view model exposes fixture state, suggested questions, grounding, assumptions, and unknowns", () => {
  const viewModel = buildDecisionConversationPanelViewModelV1({ fixture, mode: "VOICE_TRANSCRIPT", turnId: "turn-hypothetical-sponsor" });

  assert.equal(viewModel.read_only_state, "READ_ONLY_FIXTURE");
  assert.equal(viewModel.mutation_state, "MUTATION_DISABLED");
  assert.equal(viewModel.voice.state_label, "TRANSCRIPT_READY");
  assert.ok(viewModel.suggested_questions.length >= 3);
  assert.ok(viewModel.suggested_questions.length <= 5);
  assert.ok(viewModel.answer.evidence_refs.some((item) => item.truth_state === "HYPOTHETICAL_ONLY"));
  assert.ok(viewModel.answer.assumptions.some((item) => item.state === "OPEN"));
  assert.ok(viewModel.answer.unknowns.includes("Direct event economics"));
});

test("panel renders the grounded read-only conversation UX", () => {
  const viewModel = buildDecisionConversationPanelViewModelV1({ fixture, mode: "VOICE_TRANSCRIPT", turnId: "turn-grounded-why" });
  const html = renderToStaticMarkup(<DecisionConversationPanel viewModel={viewModel} />);

  assert.match(html, /ASK ABOUT THIS DECISION/);
  assert.match(html, /READ_ONLY_FIXTURE/);
  assert.match(html, /MUTATION_DISABLED/);
  assert.match(html, /TRANSCRIPT_READY/);
  assert.match(html, /Suggested next questions/);
  assert.match(html, /Evidence/);
  assert.match(html, /Assumptions \/ unknowns/);
  assert.match(html, /UNKNOWN: Verified host\/sponsor route/);
  assert.match(html, /Prestige fit/);
});
