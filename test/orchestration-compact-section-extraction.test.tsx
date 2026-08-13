import test from "node:test";
import assert from "node:assert/strict";
import { extractReferenceDelta } from "../src/lib/agent-orchestration-v1/issue-sections";
import { buildCompactAgentPrompt } from "../src/lib/agent-orchestration-v1/prompt-builder";

test("extractReferenceDelta supports suffix variants and case variations", () => {
  const body = [
    "### REFERENCE (truncated)",
    "- parent A",
    "",
    "### DELTA (AUTHORITATIVE AND COMPACT)",
    "Do the thing.",
    "",
    "### Acceptance Criteria (v1)",
    "- ok"
  ].join("\n");

  const s = extractReferenceDelta(body);
  assert.equal(s.reference, "- parent A");
  assert.equal(s.delta, "Do the thing.");
  assert.equal(s.acceptance, "- ok");
});

test("buildCompactAgentPrompt falls back to bounded body instead of '(missing)' when no sections exist", () => {
  const body = "Implement X.\nDo not do Y.\n" + "Z".repeat(5000);
  const prompt = buildCompactAgentPrompt({
    repo: "keeganhall33/business-dashboard",
    issueNumber: 999,
    title: "Test",
    body,
    executionClass: "AUTO_CONTINUE"
  });
  assert.match(prompt, /BODY_FALLBACK \(bounded\):/);
  assert.doesNotMatch(prompt, /DELTA: \(missing\)/);
  assert.doesNotMatch(prompt, /REFERENCE: \(missing\)/);
  // Ensure bounded.
  assert.ok(prompt.length < 6000);
});

test("AUTO_CONTINUE compact prompt includes OrchestrationResultContractV1 skeleton fields", () => {
  const prompt = buildCompactAgentPrompt({
    repo: "keeganhall33/business-dashboard",
    issueNumber: 1000,
    title: "Test",
    body: "### Delta\nDo X",
    executionClass: "AUTO_CONTINUE"
  });
  assert.match(prompt, /Required fields \(OrchestrationResultContractV1\):/);
  assert.match(prompt, /"TASK_ID"/);
  assert.match(prompt, /"STATUS"/);
  assert.match(prompt, /"SESSION_CONTEXT"/);
});
