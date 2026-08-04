import test from "node:test";
import assert from "node:assert/strict";

import { createInternalFindingVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/finding.adapter";

test("Adapter outputs are frozen", () => {
  const finding = {
    finding_id: "f1",
    detector_id: "d1",
    engine_version: "e1",
    type: "anomaly",
    title: "t",
    summary: "s",
    window: { timezone: "UTC", current: { startDate: "2026-08-01", endDate: "2026-08-02" }, comparison: { startDate: "2026-07-30", endDate: "2026-07-31" } },
    materiality_score: 0.5,
    false_positive_guards: [],
    facts_primary: [],
    evidence_for: [],
    evidence_against: [],
    missing_evidence: [],
    confidence: { level: "possible", score: null, reasons: [], blockers: [] },
    created_at: "2026-08-04T00:00:00Z"
  };

  const out = createInternalFindingVersionRef({ finding: finding as any });
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.finding_version_ref), true);
});
