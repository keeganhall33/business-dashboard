import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("operator script is read-only and does not execute fusion or mutate DB", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/fusion-latest-report.mjs"), "utf8");
  const forbidden = ["insert ", "update ", "delete ", "runFusion", "persistFusion", "/api/"];
  for (const f of forbidden) {
    assert.equal(src.toLowerCase().includes(f), false);
  }
  // Must query fusion_runs_v1.
  assert.ok(src.includes("from fusion_runs_v1"));
});

