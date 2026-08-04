import test from "node:test";
import assert from "node:assert/strict";

import { opportunityToFusionCandidate } from "@/lib/fusion-v1/production/adapters/opportunities";

test("opportunity adapter: stale opportunities are excluded", () => {
  const out = opportunityToFusionCandidate({
    nowIso: "2026-08-04T00:00:00.000Z",
    row: {
      id: "1",
      name: "Old",
      opportunity_type: "licensing",
      status: "ready_for_outreach",
      owner_agent: "noah",
      next_step: "email",
      updated_at: "2026-01-01T00:00:00.000Z"
    }
  });
  assert.equal(out.candidate, null);
  assert.equal(out.skipped_reason, "stale_opportunity");
});

test("opportunity adapter: missing next_step is monitor-only", () => {
  const out = opportunityToFusionCandidate({
    nowIso: "2026-08-04T00:00:00.000Z",
    row: {
      id: "1",
      name: "X",
      opportunity_type: "licensing",
      status: "ready_for_outreach",
      owner_agent: "noah",
      next_step: null,
      updated_at: "2026-08-01T00:00:00.000Z"
    }
  });
  assert.ok(out.candidate);
  assert.equal(out.skipped_reason, "monitor_only_missing_next_step");
});

