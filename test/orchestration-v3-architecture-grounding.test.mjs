import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("scripts/orchestration-v3/worker.mjs", "utf8");

test("V3 worker generates canonical architecture grounding for product-facing tasks", () => {
  assert.match(source, /function requiresArchitectureGrounding\(snapshot\)/);
  assert.match(source, /stream !== "AGENT_ORCHESTRATION"/);
  assert.match(source, /docs\/ARCHITECTURE\.md/);
  assert.match(source, /Follow its canonical source hierarchy/);
  assert.match(source, /older docs, local workspace files, memories, or generated AGENTS\.md content conflict/);
});

test("generated worker AGENTS.md includes architecture grounding and preserves safety rules", () => {
  assert.match(source, /fs\.writeFileSync\(path\.join\(controlWorkspace, "AGENTS\.md"\)/);
  assert.match(source, /Protected repository: \$\{repoRoot\}/);
  assert.match(source, /Use only the explicitly supplied observed command wrappers/);
  assert.match(source, /Cloud fallback forbidden/);
  assert.match(source, /\.\.\.architectureGroundingInstructions/);
});

test("authoritative worker prompt includes the same architecture grounding rule", () => {
  assert.match(source, /const prompt = \[/);
  assert.match(source, /This is a real implementation run/);
  assert.match(source, /\.\.\.architectureGroundingInstructions/);
  assert.match(source, /const cloudPrompt = prompt\.replace/);
});

test("narrow orchestration exemption is deterministic and does not weaken product grounding", () => {
  assert.match(source, /CANONICAL PRODUCT ARCHITECTURE GROUNDING NOT REQUIRED FOR THIS TASK/);
  assert.match(source, /narrow orchestration\/control-plane work/);
  assert.match(source, /product\|dashboard\|decision room\|fusion\|intelligence\|architecture/);
});
