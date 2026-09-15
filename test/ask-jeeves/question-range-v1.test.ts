import assert from "node:assert/strict";
import test from "node:test";

import { resolveAskQuestionRangeV1 } from "@/lib/ask-jeeves/question-range-v1";

test("Ask Jeeves resolves relative month ranges from the question", () => {
  assert.deepEqual(
    resolveAskQuestionRangeV1("What is my top-selling item over the past 4 months?", new Date("2026-09-14T12:00:00Z")),
    { startDate: "2026-05-14", endDate: "2026-09-14" }
  );
});

test("Ask Jeeves uses the standard dashboard period when no range is requested", () => {
  assert.deepEqual(resolveAskQuestionRangeV1("How is revenue doing?"), { preset: "30d" });
});

test("Ask Jeeves resolves written number ranges from speech transcription", () => {
  assert.deepEqual(resolveAskQuestionRangeV1("Show me the last four months", new Date("2026-09-14T12:00:00Z")), { startDate: "2026-05-14", endDate: "2026-09-14" });
});
