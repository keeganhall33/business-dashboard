import test from "node:test";
import assert from "node:assert/strict";

import { snapshotToFusionCandidates } from "@/lib/fusion-v1/production/adapters/dashboard-snapshots";
import type { DashboardSnapshotRecord } from "@/lib/supabase/queries";

test("snapshot adapter: rejects unknown keys", () => {
  const out = snapshotToFusionCandidates({
    nowIso: "2026-08-04T00:00:00.000Z",
    snapshot: { key: "unknown", payload: {}, mode: null, generated_at: "2026-08-03T00:00:00.000Z", updated_at: null } as DashboardSnapshotRecord,
    blockedDomains: []
  });
  assert.equal(out.candidates.length, 0);
  assert.equal(out.skipped_reason, "unsupported_snapshot_key");
});

test("snapshot adapter: marketing_command meta action is skipped when meta attribution blocked", () => {
  const payload = {
    generatedAt: "2026-08-03T00:00:00.000Z",
    status: "PARTIAL",
    actions: [{ title: "Scale", metric: "meta_roas", detail: "Scale Meta" }]
  };
  const out = snapshotToFusionCandidates({
    nowIso: "2026-08-04T00:00:00.000Z",
    snapshot: { key: "marketing_command", payload, mode: "LIVE", generated_at: "2026-08-03T00:00:00.000Z", updated_at: null } as DashboardSnapshotRecord,
    blockedDomains: ["meta_attribution"]
  });
  assert.equal(out.candidates.length, 0);
  assert.equal(out.skipped_reason, "blocked_by_meta_attribution");
});

test("snapshot adapter: website does not infer action", () => {
  const payload = { generatedAt: "2026-08-03T00:00:00.000Z", status: "LIVE", ga4: { sessions: 100 } };
  const out = snapshotToFusionCandidates({
    nowIso: "2026-08-04T00:00:00.000Z",
    snapshot: { key: "website", payload, mode: "LIVE", generated_at: "2026-08-03T00:00:00.000Z", updated_at: null } as DashboardSnapshotRecord,
    blockedDomains: []
  });
  assert.equal(out.candidates.length, 0);
  assert.equal(out.skipped_reason, "no_deterministic_action");
});
