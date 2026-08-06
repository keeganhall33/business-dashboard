import test from "node:test";
import assert from "node:assert/strict";

async function loadContracts() {
  const mod = (await import("@/lib/external-intelligence/milestones/contracts")) as unknown as {
    computeMilestoneCalendarHash?: Function;
    parseSportsMilestoneCalendar?: Function;
    default?: {
      computeMilestoneCalendarHash?: Function;
      parseSportsMilestoneCalendar?: Function;
    };
  };
  const compute = mod.computeMilestoneCalendarHash ?? mod.default?.computeMilestoneCalendarHash;
  const parse = mod.parseSportsMilestoneCalendar ?? mod.default?.parseSportsMilestoneCalendar;
  if (typeof compute !== "function" || typeof parse !== "function") {
    throw new Error("missing_contract_exports");
  }
  return { compute, parse };
}

test("SportsMilestoneCalendar: empty milestones array is accepted (dormant production)", async () => {
  const { compute, parse } = await loadContracts();
  const base = {
    schema_version: "sports_milestone_calendar_v1" as const,
    calendar_version: "production",
    fixture_status: "production" as const,
    milestones: []
  };

  const parsed = parse({
    ...base,
    calendar_content_hash: compute(base)
  });

  assert.equal(parsed.milestones.length, 0);
});

test("SportsMilestoneCalendar: milestones field is required and must be an array", async () => {
  const { compute, parse } = await loadContracts();
  const base = {
    schema_version: "sports_milestone_calendar_v1" as const,
    calendar_version: "production",
    fixture_status: "production" as const,
    milestones: []
  };

  const hash = compute(base);

  assert.throws(() => {
    parse({
      schema_version: base.schema_version,
      calendar_version: base.calendar_version,
      fixture_status: base.fixture_status,
      calendar_content_hash: hash
    });
  });

  assert.throws(() => {
    parse({
      ...base,
      milestones: null,
      calendar_content_hash: hash
    });
  });
});

test("SportsMilestoneCalendar: hash mismatch is rejected (recomputed, not shape-only)", async () => {
  const { parse } = await loadContracts();
  assert.throws(() => {
    parse({
      schema_version: "sports_milestone_calendar_v1",
      calendar_version: "production",
      fixture_status: "production",
      milestones: [],
      // valid length/shape but wrong semantic hash
      calendar_content_hash: "0".repeat(64)
    });
  }, /milestone_calendar_hash_mismatch/);
});
