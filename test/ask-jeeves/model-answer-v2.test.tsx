import assert from "node:assert/strict";
import test from "node:test";

import { classifyAskJeevesQuestionV2, selectAskJeevesRouteV2 } from "@/lib/ask-jeeves/model-answer-v1";

test("routes verified dashboard questions to business lookup", () => {
  assert.equal(classifyAskJeevesQuestionV2("What was my revenue over the last 30 days?"), "BUSINESS_LOOKUP");
});

test("routes undiscovered opportunity questions to external research before dashboard keywords", () => {
  assert.equal(
    classifyAskJeevesQuestionV2("What is the next best opportunity related to my artwork that I have not yet found?"),
    "EXTERNAL_RESEARCH"
  );
});

test("routes decision questions to strategic synthesis", () => {
  assert.equal(classifyAskJeevesQuestionV2("What should I focus on next?"), "STRATEGIC_SYNTHESIS");
});

test("keeps unrelated questions available to the general model", () => {
  assert.equal(classifyAskJeevesQuestionV2("Explain how a museum acquisition works"), "GENERAL");
});

test("answers exact business lookups without spending model tokens", () => {
  assert.deepEqual(selectAskJeevesRouteV2("What was my revenue over the last 30 days?"), {
    mode: "BUSINESS_LOOKUP",
    model: "none",
    useWebSearch: false,
    maxOutputTokens: 0
  });
});

test("routes business analysis to Terra", () => {
  const route = selectAskJeevesRouteV2("Why did revenue decline compared with the previous period?");
  assert.equal(route.mode, "BUSINESS_ANALYSIS");
  assert.equal(route.model, "openai/gpt-5.6-terra");
  assert.equal(route.useWebSearch, false);
});

test("routes strategic synthesis to Sol", () => {
  assert.equal(selectAskJeevesRouteV2("What should I focus on next?").model, "openai/gpt-5.6-sol");
});

test("reserves Astra and web search for external discovery", () => {
  const route = selectAskJeevesRouteV2("Which new opportunity have I not yet found?");
  assert.equal(route.model, "openai/gpt-6-astra");
  assert.equal(route.useWebSearch, true);
});
