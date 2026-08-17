import assert from "node:assert/strict";
import test from "node:test";

import { buildTrustSnapshotViewModel, toTrustSnapshotCardItem } from "@/lib/data-evidence-trust-snapshot/view-model";
import { trustSnapshotFixtures } from "@/lib/data-evidence-trust-snapshot/fixtures";

test("trust snapshot builds dashboard-consumable healthy, stale, gap, and conflicted cases", () => {
  const snapshot = buildTrustSnapshotViewModel();

  assert.equal(snapshot.dataMode, "FIXTURE_BASELINE");
  assert.equal(snapshot.summary.totalSources, 4);
  assert.equal(snapshot.summary.healthyCount, 1);
  assert.equal(snapshot.summary.staleCount, 1);
  assert.equal(snapshot.summary.unavailableCount, 1);
  assert.equal(snapshot.summary.conflictedCount, 1);
  assert.equal(snapshot.summary.unknownCount, 1);

  assert.deepEqual(
    snapshot.items.map((item) => item.TRUTH_STATE),
    ["KNOWN", "STALE", "UNKNOWN", "CONFLICTED"]
  );
});

test("UNKNOWN never collapses to NONE, false, null, or zero", () => {
  const unknown = buildTrustSnapshotViewModel().items.find((item) => item.SOURCE_ID === "art_market.collector_research");

  assert.ok(unknown);
  assert.equal(unknown.TRUTH_STATE, "UNKNOWN");
  assert.equal(unknown.EVIDENCE_QUALITY, "UNKNOWN");
  assert.equal(unknown.FRESHNESS_STATE, "UNKNOWN");
  assert.equal(unknown.LAST_UPDATED, null);
  assert.equal(unknown.displayFlags.isUnknown, true);
  assert.equal(unknown.displayFlags.needsResearch, true);
  assert.equal(unknown.dashboardSeverity, "WATCH");
  assert.notEqual(unknown.TRUTH_STATE, "NONE");
  assert.notEqual(unknown.TRUTH_STATE, false);
  assert.notEqual(unknown.TRUTH_STATE, null);
  assert.notEqual(unknown.summary, 0);
});

test("stale and conflicted states remain visible in card flags and severity", () => {
  const snapshot = buildTrustSnapshotViewModel();
  const stale = snapshot.items.find((item) => item.SOURCE_ID === "ga4.web_analytics");
  const conflicted = snapshot.items.find((item) => item.SOURCE_ID === "meta.ads_attribution");

  assert.ok(stale);
  assert.equal(stale.TRUTH_STATE, "STALE");
  assert.equal(stale.FRESHNESS_STATE, "STALE");
  assert.equal(stale.displayFlags.isStale, true);
  assert.equal(stale.dashboardSeverity, "WATCH");
  assert.match(stale.COVERAGE_GAP ?? "", /current window/i);

  assert.ok(conflicted);
  assert.equal(conflicted.TRUTH_STATE, "CONFLICTED");
  assert.equal(conflicted.EVIDENCE_QUALITY, "CONFLICTED");
  assert.equal(conflicted.COVERAGE_STATE, "CONFLICTED");
  assert.equal(conflicted.displayFlags.isConflicted, true);
  assert.equal(conflicted.dashboardSeverity, "BLOCKED");
  assert.match(conflicted.NEXT_BEST_SOURCE_OR_RESEARCH_ACTION, /before scaling or cutting spend/i);
});

test("adapter preserves source identity, provenance class, coverage gap, and next action", () => {
  const fixture = trustSnapshotFixtures[0];
  const item = toTrustSnapshotCardItem(fixture);

  assert.equal(item.SOURCE_ID, fixture.sourceId);
  assert.equal(item.SOURCE_CLASS, fixture.sourceClass);
  assert.equal(item.CONNECTION_STATUS, fixture.connectionStatus);
  assert.equal(item.COVERAGE_GAP, null);
  assert.deepEqual(item.provenance.evidenceReferenceIds, fixture.evidenceReferenceIds);
  assert.equal(item.provenance.provenanceClass, "first_party");
  assert.match(item.NEXT_BEST_SOURCE_OR_RESEARCH_ACTION, /monitor freshness drift/i);
});
