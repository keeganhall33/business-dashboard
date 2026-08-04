import test from "node:test";
import assert from "node:assert/strict";

import { createInternalFindingVersionRef } from "@/lib/external-intelligence/adapters/intelligence-v1/finding.adapter";

test("Internal Finding envelope yields deterministic version hash ignoring created_at", () => {
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

  const a = createInternalFindingVersionRef({ finding: finding as any });
  const b = createInternalFindingVersionRef({ finding: { ...finding, created_at: "2099-01-01T00:00:00Z" } as any });

  assert.equal(a.finding_version_ref.content_hash, b.finding_version_ref.content_hash);
  assert.equal(a.finding_version_ref.object_type, "finding");
});
