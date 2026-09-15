import assert from "node:assert/strict";
import test from "node:test";

import { classifyAskJeevesQuestionV2 } from "@/lib/ask-jeeves/model-answer-v1";

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
