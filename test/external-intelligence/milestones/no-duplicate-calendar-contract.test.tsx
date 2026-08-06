import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("milestone calendar contract: only one canonical SportsMilestoneCalendarSchema exists", () => {
  const canonical = fs.readFileSync("src/lib/external-intelligence/milestones/contracts.ts", "utf8");
  const legacy = fs.readFileSync("src/lib/external-intelligence/milestones/milestone-horizon.ts", "utf8");

  assert.ok(canonical.includes("export const SportsMilestoneCalendarSchema"));
  // Allow legacy schemas, but forbid a second export with the canonical name.
  assert.equal(/\bexport const\s+SportsMilestoneCalendarSchema\b/.test(legacy), false);
});
