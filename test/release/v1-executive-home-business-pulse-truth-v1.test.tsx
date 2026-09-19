import assert from "node:assert/strict";
import test from "node:test";

import { enforceExecutiveApprovalTruthV1 } from "@/lib/executive-home/approval-truth-guard-v1";
import {
  buildExecutiveHomeFromCanonicalSystemsV3,
  type ExecutiveHomeCanonicalInputsV3
} from "@/lib/executive-home/live-adapter";
import { compileV1ExecutiveHomeTruthEvidenceV1 } from "@/lib/release/v1-executive-home-truth-evidence-v1";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

const RELEASE_SHA = "346b7ef39329c13d12b1ea4b95438f136d26a717";
const GENERATED_AT = "2026-09-18T19:10:00.000Z";
const OBSERVED_AT = "2026-09-18T19:10:20.000Z";
const EVALUATED_AT = "2026-09-18T19:10:30.000Z";

function dashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: GENERATED_AT,
    range: { preset: "7d", startDate: "2026-09-12", endDate: "2026-09-18" },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [], verificationSummary: { total: 0, verifiedActive: 0, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 0 } },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 1, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: GENERATED_AT },
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: 1, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    commerceTelemetry: undefined,
    websiteConversion: null,
    metaAds: null,
    executiveSummary: null,
    socialIntelligence: null,
    industryPulseSnapshot: null,
    cloudflare: null,
    collectorTelemetry: null,
    agentStatusPanel: [],
    automationStatusPanel: [],
    dataSourceAccess: [],
    topActions: [],
    blockedItems: [],
    luxuryCollectibles: undefined,
    agentKpis: [],
    ideaBoard: { columns: [], recentComments: [], linkedTasks: {} },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
    industryPulse: undefined,
    telemetryMetadata: {},
    telemetryHealth: {},
    executiveInsights: null,
    telemetryHealthHistory: []
  } as unknown as DashboardOverviewResponse;
}

function canonical(): ExecutiveHomeCanonicalInputsV3 {
  return {
    now: GENERATED_AT,
    fusion: null,
    actions: [],
    followUps: null,
    availability: {
      fusion: "AVAILABLE",
      actions: "AVAILABLE",
      followUps: "UNAVAILABLE"
    }
  };
}

function observedProjection(overview: DashboardOverviewResponse) {
  return enforceExecutiveApprovalTruthV1(
    buildExecutiveHomeFromCanonicalSystemsV3(overview, canonical()),
    overview
  );
}

function compile(overview: DashboardOverviewResponse, projection = observedProjection(overview)) {
  return compileV1ExecutiveHomeTruthEvidenceV1({
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    evaluatedAt: EVALUATED_AT,
    maxObservationAgeMs: 60_000,
    environment: "PRODUCTION",
    evidenceRefs: ["github://release-evidence/executive-home-production-observation"],
    overview,
    projection
  });
}

test("canonical Executive Home pulse remains eligible for release truth", () => {
  const overview = dashboard();
  const result = compile(overview);

  assert.equal(result.status, "PASS");
  assert.equal(result.blockers.some((entry) => entry.code === "BUSINESS_PULSE_TRUTH_MISMATCH"), false);
});

test("fabricated business-pulse value cannot certify Executive Home production truth", () => {
  const overview = dashboard();
  const projection = structuredClone(observedProjection(overview));
  const revenue = projection.home.command_center.business_pulse.find((entry) => entry.id === "revenue");
  assert.ok(revenue);

  revenue.value = "$999,999";
  revenue.comparison = "+999% vs previous ($1)";
  revenue.trend = [999999];
  revenue.truth_state = "KNOWN";
  revenue.source = "WooCommerce";

  const result = compile(overview, projection);

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "BUSINESS_PULSE_TRUTH_MISMATCH"));
  assert.equal(result.gateEvidence.state, "BLOCKED");
  assert.equal(result.gateEvidence.freshness, "UNKNOWN");
});

test("comparison, trend, source, or truth-state drift also fails closed even when the display value is unchanged", () => {
  const overview = dashboard();
  const projection = structuredClone(observedProjection(overview));
  const sessions = projection.home.command_center.business_pulse.find((entry) => entry.id === "sessions");
  assert.ok(sessions);

  sessions.comparison = "No verified comparison";
  sessions.trend = [1, 2, 3];
  sessions.source = "Google Analytics";
  sessions.truth_state = "KNOWN";

  const result = compile(overview, projection);

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.some((entry) => entry.code === "BUSINESS_PULSE_TRUTH_MISMATCH"));
});
