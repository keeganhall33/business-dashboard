import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("primary navigation exposes Strategy with the new chief of staff briefing", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

  const primaryIds = source.match(/const PRIMARY_NAV_IDS = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";

  assert.match(primaryIds, /"EXECUTIVE_HOME"/);
  assert.match(primaryIds, /"ASK_JEEVES"/);
  assert.match(primaryIds, /"STRATEGY"/);
  assert.match(primaryIds, /"OPPORTUNITIES_ACTIONS"/);
  assert.match(primaryIds, /"RELATIONSHIPS_CRM"/);
});
