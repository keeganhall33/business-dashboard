import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveDataEvidenceWorkspaceV1 } from "@/components/data-evidence/ExecutiveDataEvidenceWorkspaceV1";
import {
  buildExecutiveDataEvidenceViewV1,
  buildUnavailableDataEvidenceViewV1
} from "@/lib/data-evidence/executive-data-evidence-v1";
import type {
  DashboardOverviewResponse,
  TelemetryHealth,
  TelemetryMetadata,
  TelemetrySource
} from "@/lib/types/dashboard";

const sources: readonly TelemetrySource[] = ["woo", "ga4", "funnelkit", "meta"];

function metadata(source: TelemetrySource, overrides: Partial<TelemetryMetadata> = {}): TelemetryMetadata {
  return {
    source,
    requestedStartDate: "2026-09-01",
    requestedEndDate: "2026-09-12",
    timezone: "America/Los_Angeles",
    generatedAt: "2026-09-12T16:00:00.000Z",
    freshnessStatus: "fresh",
    coverageStatus: "complete",
    includesPartialDay: false,
    includesFutureDates: false,
    latestCompletedBusinessDate: "2026-09-11",
    warningCodes: [],
    ...overrides
  };
}

function health(source: TelemetrySource, overrides: Partial<TelemetryHealth> = {}): TelemetryHealth {
  return {
    source,
    status: "healthy",
    reasons: [],
    warningCodes: [],
    ...overrides
  };
}

function overview(overrides: Partial<DashboardOverviewResponse> = {}): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: "2026-09-12T16:00:00.000Z",
    dataMode: "LIVE_DATA",
    telemetryMetadata: Object.fromEntries(sources.map((source) => [source, metadata(source)])),
    telemetryHealth: Object.fromEntries(sources.map((source) => [source, health(source)])),
    dataSourceAccess: [
      { name: "WooCommerce", status: "connected", lastVerified: "2026-09-12T15:00:00.000Z", owner: "SYSTEM", credentialLocation: "op://private/woo", accessMethod: "api", notes: "secret=do-not-print" },
      { name: "Google Analytics 4", status: "connected", lastVerified: "2026-09-12T15:00:00.000Z", owner: "SYSTEM", credentialLocation: "op://private/ga4", accessMethod: "api", notes: null },
      { name: "FunnelKit", status: "connected", lastVerified: "2026-09-12T15:00:00.000Z", owner: "SYSTEM", credentialLocation: "op://private/funnel", accessMethod: "database", notes: null },
      { name: "Meta Ads", status: "connected", lastVerified: "2026-09-12T15:00:00.000Z", owner: "SYSTEM", credentialLocation: "op://private/meta", accessMethod: "api", notes: null }
    ],
    schedulerSummary: {
      status: "LIVE",
      cronEnabled: true,
      jobCount: 8,
      failingCount: 0,
      missingTelemetryCount: 0,
      lastUpdatedAt: "2026-09-12T15:59:00.000Z",
      source: "scheduler"
    },
    ...overrides
  } as DashboardOverviewResponse;
}

test("live canonical telemetry yields a live trust posture without inspecting credential locations", () => {
  const view = buildExecutiveDataEvidenceViewV1(overview());
  assert.equal(view.overallState, "LIVE");
  assert.equal(view.counts.liveCount, 4);
  assert.equal(view.verificationGaps.length, 0);
  assert.ok(view.sourceRows.every((row) => row.accessStatus === "CONNECTED"));

  const html = renderToString(<ExecutiveDataEvidenceWorkspaceV1 view={view} />);
  assert.match(html, /Trust posture: LIVE/);
  assert.match(html, /WooCommerce/);
  assert.match(html, /Google Analytics 4/);
  assert.doesNotMatch(html, /op:\/\/|private\/woo|do-not-print|credentialLocation/i);
});

test("partial stale warning and critical evidence remain distinct instead of collapsing to healthy", () => {
  const view = buildExecutiveDataEvidenceViewV1(overview({
    dataMode: "PARTIAL_LIVE_DATA",
    telemetryMetadata: {
      woo: metadata("woo", { coverageStatus: "partial" }),
      ga4: metadata("ga4", { freshnessStatus: "stale" }),
      funnelkit: metadata("funnelkit"),
      meta: metadata("meta")
    },
    telemetryHealth: {
      woo: health("woo"),
      ga4: health("ga4"),
      funnelkit: health("funnelkit", { status: "warning", warningCodes: ["FUNNEL_DELAY"] }),
      meta: health("meta", { status: "critical" })
    }
  }));

  assert.equal(view.overallState, "CRITICAL");
  assert.equal(view.sourceRows.find((row) => row.source === "woo")?.truthState, "PARTIAL");
  assert.equal(view.sourceRows.find((row) => row.source === "ga4")?.truthState, "STALE");
  assert.equal(view.sourceRows.find((row) => row.source === "funnelkit")?.truthState, "WARNING");
  assert.equal(view.sourceRows.find((row) => row.source === "meta")?.truthState, "CRITICAL");
  assert.ok(view.verificationGaps.some((gap) => gap.includes("partial live data")));
  assert.ok(view.verificationGaps.some((gap) => gap.includes("telemetry is stale")));
});

test("missing source metadata stays UNKNOWN and creates a verification gap", () => {
  const view = buildExecutiveDataEvidenceViewV1(overview({
    telemetryMetadata: { woo: metadata("woo") },
    telemetryHealth: { woo: health("woo") },
    dataSourceAccess: []
  }));

  assert.equal(view.overallState, "UNKNOWN");
  assert.equal(view.counts.unknownCount, 3);
  assert.equal(view.sourceRows.find((row) => row.source === "ga4")?.truthState, "UNKNOWN");
  assert.ok(view.verificationGaps.some((gap) => gap === "Google Analytics 4: live coverage or health is not proven."));
});

test("no-data and disabled scheduler are unavailable rather than zero or healthy", () => {
  const view = buildExecutiveDataEvidenceViewV1(overview({
    telemetryMetadata: {
      woo: metadata("woo", { freshnessStatus: "no_data" }),
      ga4: metadata("ga4"),
      funnelkit: metadata("funnelkit"),
      meta: metadata("meta")
    },
    schedulerSummary: {
      status: "LIVE",
      cronEnabled: false,
      jobCount: 0,
      failingCount: 0,
      missingTelemetryCount: 0,
      lastUpdatedAt: null
    }
  }));

  assert.equal(view.sourceRows[0].truthState, "UNAVAILABLE");
  assert.equal(view.scheduler.state, "UNAVAILABLE");
  assert.ok(view.verificationGaps.some((gap) => gap.includes("no telemetry data")));
  assert.ok(view.verificationGaps.some((gap) => gap.includes("not enabled or available")));
});

test("warning output exposes bounded codes but not free-form provider reasons", () => {
  const view = buildExecutiveDataEvidenceViewV1(overview({
    telemetryHealth: {
      woo: health("woo", {
        status: "warning",
        reasons: ["credential op://vault/private and owner@example.test"],
        warningCodes: ["WOO_DELAY", "unsafe warning text with spaces"]
      }),
      ga4: health("ga4"),
      funnelkit: health("funnelkit"),
      meta: health("meta")
    }
  }));
  assert.deepEqual(view.sourceRows[0].warnings, ["WOO_DELAY"]);
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /op:\/\/|owner@example|credential op/i);
});

test("overview load failure has an explicit unavailable view instead of invented source health", () => {
  const view = buildUnavailableDataEvidenceViewV1();
  assert.equal(view.overallState, "UNAVAILABLE");
  assert.equal(view.dataMode, "UNAVAILABLE");
  assert.equal(view.counts.unknownCount, 4);
  assert.ok(view.sourceRows.every((row) => row.truthState === "UNKNOWN"));
  assert.deepEqual(view.verificationGaps, ["Dashboard overview could not be loaded; source state requires verification."]);
});
