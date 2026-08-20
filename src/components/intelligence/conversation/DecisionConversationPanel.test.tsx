import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DecisionConversationPanel } from "./DecisionConversationPanel";
import { buildDecisionConversationPanelViewModelV1 } from "./DecisionConversationViewModel";

test("DecisionConversationPanel renders light read-only fixture state and canonical voice transcript mode", () => {
  const viewModel = buildDecisionConversationPanelViewModelV1({
    mode: "VOICE_TRANSCRIPT",
    turnId: "turn-grounded-why"
  });
  const html = renderToStaticMarkup(<DecisionConversationPanel viewModel={viewModel} />);

  assert.match(html, /ASK ABOUT THIS DECISION/);
  assert.match(html, /READ_ONLY_FIXTURE/);
  assert.match(html, /MUTATION_DISABLED/);
  assert.match(html, /TRANSCRIPT_READY/);
  assert.match(html, /QUESTION_ONLY \/ VOICE_TRANSCRIPT/);
  assert.match(html, /Suggested next questions/);
  assert.match(html, /UNKNOWN: Verified host\/sponsor route/);
});
