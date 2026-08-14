import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#337 proof strict retry prompt explicitly preserves CLOUD_FORBIDDEN + nonce", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  // buildStrictJsonRetryPrompt should include proof guard lines when opts.isProof337.
  assert.match(text, /function buildStrictJsonRetryPrompt\(basePrompt, opts\)/);
  assert.match(text, /opts && opts\.isProof337 && opts\.proofNonce/);
  assert.match(text, /CLOUD_FORBIDDEN=true/);
  assert.match(text, /FRESHNESS_NONCE=\$\{String\(opts\.proofNonce\)\}/);

  // applyProofGuardForLocalStrictJson should prepend guard if missing.
  assert.match(text, /function applyProofGuardForLocalStrictJson\(message, opts\)/);
});

