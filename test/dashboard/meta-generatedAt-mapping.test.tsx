import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMetaSnapshotGeneratedAt } from "@/lib/dashboard/meta-snapshot-generatedAt";
import type { MetaAdsSnapshot } from "@/lib/types/dashboard";

test("meta generatedAt mapping: preserve payload.generatedAt when present", () => {
  const snap: MetaAdsSnapshot = {
    generatedAt: "2026-08-03T16:00:00Z",
    accountId: "act_123",
    range: 7,
    campaigns: [],
    summary: { spend: null, impressions: null, clicks: null, purchases: null, purchaseValue: null, roas: null },
    status: "LIVE"
  };

  const out = normalizeMetaSnapshotGeneratedAt(snap, "2026-08-03T16:10:00Z");
  assert.equal(out?.generatedAt, "2026-08-03T16:00:00Z");
});

test("meta generatedAt mapping: use dashboard_snapshots.generated_at when payload generatedAt is missing/null", () => {
  const snap = {
    generatedAt: null,
    accountId: "act_123",
    range: 7,
    campaigns: [],
    summary: { spend: null, impressions: null, clicks: null, purchases: null, purchaseValue: null, roas: null },
    status: "LIVE"
  } as unknown as MetaAdsSnapshot;

  const out = normalizeMetaSnapshotGeneratedAt(snap, "2026-08-03T16:10:00Z");
  assert.equal(out?.generatedAt, "2026-08-03T16:10:00Z");
});

test("meta generatedAt mapping: do not fabricate when both are missing", () => {
  const snap = {
    generatedAt: null,
    accountId: "act_123",
    range: 7,
    campaigns: [],
    summary: { spend: null, impressions: null, clicks: null, purchases: null, purchaseValue: null, roas: null },
    status: "LIVE"
  } as unknown as MetaAdsSnapshot;

  const out = normalizeMetaSnapshotGeneratedAt(snap, null);
  assert.equal(out?.generatedAt, null);
});
