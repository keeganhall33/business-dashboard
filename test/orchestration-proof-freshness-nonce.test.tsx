import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("#337 proof guard injects freshness nonce and forbids cloud", () => {
  const text = fs.readFileSync("scripts/orchestration-run-issue-openclaw.mjs", "utf8");
  assert.match(text, /isProof337Run/);
  assert.match(text, /CLOUD_FORBIDDEN=true/);
  assert.match(text, /FRESHNESS_NONCE=\$\{proofNonceRun\}/);
  assert.match(text, /cloudForbidden: isProof337Run/);
});

