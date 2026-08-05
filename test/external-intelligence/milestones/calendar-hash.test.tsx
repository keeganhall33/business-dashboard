import test from "node:test";
import assert from "node:assert/strict";

import { computeMilestoneCalendarHash } from "@/lib/external-intelligence/milestones/contracts";

test("computeMilestoneCalendarHash: empty calendar is deterministic 64-char lowercase hex", () => {
  const base = {
    schema_version: "sports_milestone_calendar_v1" as const,
    calendar_version: "production",
    fixture_status: "production" as const,
    milestones: []
  };

  const h1 = computeMilestoneCalendarHash(base);
  const h2 = computeMilestoneCalendarHash(base);

  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(h1, h2);

  const changed = computeMilestoneCalendarHash({ ...base, calendar_version: "production-2" });
  assert.notEqual(changed, h1);
});
