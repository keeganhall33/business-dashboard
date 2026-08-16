import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("V3 observed git wrapper blocks catastrophic deletion commits and pushes", () => {
  const source = fs.readFileSync("scripts/orchestration-v3/execution-evidence.mjs", "utf8");
  assert.match(source, /\[ \"\$1\" = \"commit\" \]/);
  assert.match(source, /diff --cached --name-only --diff-filter=D/);
  assert.match(source, /staged_deletions/);
  assert.match(source, /exit 97/);
  assert.match(source, /\[ \"\$1\" = \"push\" \]/);
  assert.match(source, /origin\/main\.\.\.HEAD/);
  assert.match(source, /deletions_vs_origin_main/);
  assert.match(source, /exit 98/);
  assert.match(source, /massDeletionGuardTriggered/);
  assert.match(source, /GUARD_MASS_TRACKED_DELETION/);
});
