import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 bootstrap does not fail merely because no worker claims inside the short observation window", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/bootstrap-host.mjs", "utf8");
  assert.doesNotMatch(source, /V3_ZERO_WORKERS_CLAIMED_AFTER_RELEASE/);
  assert.match(source, /initialClaimObservation/);
  assert.match(source, /Diagnostic only\. Watcher poll cadence may exceed bootstrap observation window/);
  assert.match(source, /doctor\/process health is authoritative for cutover success/);
});
