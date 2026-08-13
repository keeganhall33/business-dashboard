import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adapter = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");

function loadParserHelpers() {
  const start = adapter.indexOf("function parseOrchestrationResult");
  const end = adapter.indexOf("function envelopeShape");
  assert.ok(start >= 0 && end > start, "parser helper source should be discoverable");
  const source = adapter.slice(start, end);
  return new Function(`${source}; return { parseOrchestrationResult, extractAgentFinalText };`)();
}

test("#200 silent nested result.payloads is classified without JSON.parse failure", () => {
  const { parseOrchestrationResult, extractAgentFinalText } = loadParserHelpers();
  const envelope = {
    result: {
      meta: { agentMeta: { sessionId: "proof-session", usage: { input: 1, output: 1 } } },
      payloads: []
    },
    runId: "proof-run",
    status: "ok",
    summary: "tool-using turn completed without renderable final text"
  };

  const finalText = extractAgentFinalText(envelope);
  assert.equal(finalText, "");
  assert.doesNotThrow(() => parseOrchestrationResult(finalText));
  assert.deepEqual(parseOrchestrationResult(finalText), {
    kind: "invalid",
    error: "OpenClaw envelope contained no renderable final text; result.payloads was empty or contained no text payloads"
  });
});

test("nested result payload text still parses a normal OrchestrationResultContractV1", () => {
  const { parseOrchestrationResult, extractAgentFinalText } = loadParserHelpers();
  const payload = {
    TASK_ID: "normal-result",
    STATUS: "COMPLETE",
    SUMMARY: "ok"
  };
  const envelope = { result: { payloads: [{ text: JSON.stringify(payload) }] } };
  const parsed = parseOrchestrationResult(extractAgentFinalText(envelope));
  assert.equal(parsed.kind, "result");
  assert.deepEqual(parsed.value, payload);
});

test("ArchitectCheckpointV1 parsing remains green", () => {
  const { parseOrchestrationResult } = loadParserHelpers();
  const checkpoint = {
    TASK_ID: "checkpoint-result",
    CHECKPOINT_ID: "checkpoint-1",
    QUESTION_OR_DECISION: "Approve?"
  };
  const parsed = parseOrchestrationResult(JSON.stringify(checkpoint));
  assert.equal(parsed.kind, "checkpoint");
  assert.deepEqual(parsed.value, checkpoint);
});
