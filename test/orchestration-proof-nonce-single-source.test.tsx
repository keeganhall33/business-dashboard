import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#337 proof nonce is generated only once per run (no nonce source in buildCompactAgentPrompt)", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  const buildPromptSection = text.split("function buildCompactAgentPrompt")[1]?.split("function safeTrunc")[0] ?? "";
  assert.doesNotMatch(buildPromptSection, /proofNonce/);
  assert.doesNotMatch(buildPromptSection, /FRESHNESS_NONCE=/);
  assert.doesNotMatch(buildPromptSection, /CLOUD_FORBIDDEN=true/);

  // Ensure the run-level nonce exists.
  assert.match(text, /const proofNonceRun = isProof337Run \? `proof-337-\$\{Date\.now\(\)\}` : null;/);
});

