import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("verified host fallback promotes repo preflight evidence", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/execution-evidence.mjs", "utf8");
  const verifiedBlock = source.match(/if \(hostVerification\.attempted && hostVerification\.verified\) \{([\s\S]*?)\n    \} else if/);
  assert.ok(verifiedBlock, "verified host promotion block must exist");
  assert.match(verifiedBlock[1], /evidence\.repoPreflightObserved\s*=\s*true;/);
});
