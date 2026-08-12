import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("NL adapter regression: uses openclaw agent (not agent exec) and has bounded default timeout", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("\"agent\""), "expected openclaw agent usage");
  assert.ok(text.includes("\"--agent\""), "expected --agent flag");
  assert.equal(text.includes("agent\",\n      \"exec\""), false, "must not use deprecated agent exec path");
  assert.ok(text.includes("Number(arg(\"--timeout\") ?? \"90\")"), "expected default timeout=90");
  assert.ok(text.includes("runOpenclaw(\"coding\")"), "expected fallback to coding agent on main timeout");
});

test("NL adapter parses response text from nested OpenClaw agentMeta envelopes", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("function extractAgentFinalText(envelope)"));
  assert.ok(text.includes("envelope?.meta?.agentMeta"));
  assert.ok(text.includes("agentMeta?.final"));
  assert.ok(text.includes("agentMeta?.payloads"));
  assert.ok(text.includes("const finalText = extractAgentFinalText(envelope)"));
});

test("NL adapter preserves safe envelope-shape diagnostics when response text is empty", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("function envelopeShape(envelope)"));
  assert.ok(text.includes("envelopeShape(envelope)"));
  assert.ok(text.includes("attemptedAgents="));
});

test("Watcher regression: NL detached launcher uses bounded timeout (<= 180s)", () => {
  const text = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
  assert.ok(text.includes("launch-orchestration-nl-detached"));
  assert.ok(text.includes("--timeout 180"));
});
