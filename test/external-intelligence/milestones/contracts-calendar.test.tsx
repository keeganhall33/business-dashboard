import test from "node:test";
import assert from "node:assert/strict";

import * as contractsMod from "@/lib/external-intelligence/milestones/contracts";

type ContractsApi = {
  computeMilestoneCalendarHash: (input: unknown) => string;
  parseSportsMilestoneCalendar: (input: unknown) => unknown;
};

function getContracts(): ContractsApi {
  const maybeDefault = (contractsMod as unknown as { default?: unknown }).default;
  const api = (maybeDefault ?? contractsMod) as unknown as Partial<ContractsApi>;
  if (typeof api.computeMilestoneCalendarHash !== "function" || typeof api.parseSportsMilestoneCalendar !== "function") {
    throw new Error("missing_contract_exports");
  }
  return api as ContractsApi;
}

test("SportsMilestoneCalendar: empty milestones array is accepted (dormant production)", () => {
  const { computeMilestoneCalendarHash: compute, parseSportsMilestoneCalendar: parse } = getContracts();
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

test("SportsMilestoneCalendar: milestones field is required and must be an array", () => {
  const { computeMilestoneCalendarHash: compute, parseSportsMilestoneCalendar: parse } = getContracts();
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

test("SportsMilestoneCalendar: hash mismatch is rejected (recomputed, not shape-only)", () => {
  const { parseSportsMilestoneCalendar: parse } = getContracts();
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
