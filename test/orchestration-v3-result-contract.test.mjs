import assert from "node:assert/strict";
import test from "node:test";
import { extractOrchestrationResult, parseOrchestrationResultText } from "../scripts/orchestration-v3/result-contract.mjs";

const pass = { TASK_ID: "issue-1", STATUS: "PASS", SUMMARY: "ok" };

test("parses pure JSON", () => {
  assert.equal(parseOrchestrationResultText(JSON.stringify(pass)).STATUS, "PASS");
});

test("parses fenced JSON", () => {
  assert.equal(parseOrchestrationResultText(`\`\`\`json\n${JSON.stringify(pass)}\n\`\`\``).STATUS, "PASS");
});

test("parses prose around one valid contract", () => {
  assert.equal(parseOrchestrationResultText(`done\n${JSON.stringify(pass)}\nthanks`).STATUS, "PASS");
});

test("prefers authoritative final assistant field over generic text", () => {
  const envelope = { text: "tool list chatter", nested: { finalAssistantVisibleText: JSON.stringify(pass) } };
  assert.equal(extractOrchestrationResult(envelope).STATUS, "PASS");
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseOrchestrationResultText('{"STATUS":"PASS"'), /NO_VALID_ORCHESTRATION_RESULT/);
});

test("rejects missing contract", () => {
  assert.throws(() => parseOrchestrationResultText("hello"), /NO_VALID_ORCHESTRATION_RESULT/);
});

test("rejects conflicting valid contracts", () => {
  const failed = { ...pass, STATUS: "FAILED" };
  assert.throws(() => parseOrchestrationResultText(`${JSON.stringify(pass)}\n${JSON.stringify(failed)}`), /AMBIGUOUS_ORCHESTRATION_RESULTS/);
});

test("rejects invalid STATUS", () => {
  assert.throws(() => parseOrchestrationResultText(JSON.stringify({ ...pass, STATUS: "MAYBE" })), /NO_VALID_ORCHESTRATION_RESULT/);
});

test("authoritative conflict fails closed", () => {
  const failed = { ...pass, STATUS: "FAILED" };
  assert.throws(() => extractOrchestrationResult({ finalAssistantVisibleText: JSON.stringify(pass), finalAssistantRawText: JSON.stringify(failed) }), /AMBIGUOUS_AUTHORITATIVE_ORCHESTRATION_RESULTS/);
});
