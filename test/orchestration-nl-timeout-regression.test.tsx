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

test("NL adapter parses response text from nested and result-wrapped OpenClaw envelopes", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("function extractTextFromProjection(projection)"));
  assert.ok(text.includes("function extractAgentFinalText(envelope)"));
  assert.ok(text.includes("envelope?.result"));
  assert.ok(text.includes("envelope?.result?.meta?.agentMeta"));
  assert.ok(text.includes("projection?.meta?.agentMeta"));
  assert.ok(text.includes("agentMeta?.final"));
  assert.ok(text.includes("agentMeta?.payloads"));
  assert.ok(text.includes("const finalText = extractAgentFinalText(envelope)"));
});

test("NL adapter preserves safe envelope-shape diagnostics when response text is empty", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("function envelopeShape(envelope)"));
  assert.ok(text.includes("resultType="));
  assert.ok(text.includes("resultKeys="));
  assert.ok(text.includes("envelopeShape(envelope)"));
  assert.ok(text.includes("attemptedAgents="));
});

test("NL adapter review classifier ignores prohibition-only safety language", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("function reviewIntentText(body)"));
  assert.ok(text.includes("const text = reviewIntentText(body)"));
  assert.ok(text.includes("(?:no\\b|do not\\b|don't\\b|must not\\b|never\\b)"));
  assert.equal(text.includes("const text = String(body ?? \"\").toLowerCase();"), false, "must not scan the full task body for review keywords");
  assert.ok(text.includes("/\\bauth(?:entication|orization)?\\b/"), "auth must use word boundaries rather than substring matching");
});

test("NL adapter consumes only a matching subsequent ArchitectDecisionV1 approval", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("number,title,body,url,comments"), "issue comments must be fetched");
  assert.ok(text.includes("function commentCheckpointId(body)"));
  assert.ok(text.includes("function latestApprovedArchitectDecision(comments)"));
  assert.ok(text.includes("commentCheckpointId(body) === latestCheckpointId"), "approval must match the latest checkpoint id");
  assert.ok(text.includes("latest architect checkpoint has a matching subsequent approval"));
  assert.ok(text.includes("RECORDED ARCHITECT DECISION (authoritative for this rerun)"));
  assert.ok(text.includes("do not ask the same approval question again"));
});

test("NL adapter still preserves review-sensitive stream gating without a later approval", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("[\"CORE_INTELLIGENCE\", \"DISCOVERY_INTELLIGENCE\", \"INTELLIGENCE_UX\"].includes(stream)"));
  assert.ok(text.includes("ARCHITECT_REVIEW_REQUIRED"));
});

test("Watcher regression: NL detached launcher uses bounded timeout (<= 180s)", () => {
  const text = fs.readFileSync("scripts/orchestration-watch.mjs", "utf8");
  assert.ok(text.includes("launch-orchestration-nl-detached"));
  assert.ok(text.includes("--timeout 180"));
});

test("#294A routing: adapter supports optional local-agent attempt with bounded fallback", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("ORCH_LOCAL_ROUTING_ENABLED"));
  assert.ok(text.includes("ORCH_LOCAL_AGENT_ID"));
  assert.ok(text.includes("ORCH_CLOUD_AGENT_ID"));
  assert.ok(text.includes("classified.executionClass === \"AUTO_CONTINUE\""));
  // Routing path is mediated through the local-first helper (bounded retry + bounded cloud fallback).
  assert.ok(text.includes("executeAutoContinueWithLocalFirstV1"));
  assert.ok(text.includes("runOpenclawWithPrompt"));
  assert.ok(text.includes("cloudAgentId: ORCH_CLOUD_AGENT_ID"));
  assert.ok(text.includes("localAgentId: ORCH_LOCAL_AGENT_ID"));
  assert.ok(text.includes("routingMeta()"));
});


test("NL adapter keeps approval authoritative across duplicate identical checkpoints", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("const approvalsByCheckpoint = new Map()"));
  assert.ok(text.includes("approvalsByCheckpoint.set(checkpointId, body)"));
  assert.ok(text.includes("approvalsByCheckpoint.get(latestCheckpointId) ?? null"));
});

test("AUTO_CONTINUE prompt explicitly executes implementation instead of re-reviewing", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.ok(text.includes("EXECUTE IMPLEMENTATION NOW"));
  assert.ok(text.includes("Do not merely review, approve, summarize, or restate the task"));
  assert.equal(text.includes("Do not run tools unless explicitly required; prefer a concise result."), false);
});
