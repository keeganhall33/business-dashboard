import assert from "node:assert/strict";
import test from "node:test";

import { enforceExecutiveApprovalTruthV1 } from "@/lib/executive-home/approval-truth-guard-v1";
import { EXECUTIVE_HOME_FIXTURE_V1 } from "@/lib/executive-home/fixtures";
import {
  buildExecutiveHomeFromCanonicalSystemsV3,
  type ExecutiveHomeCanonicalInputsV3
} from "@/lib/executive-home/live-adapter";
import {
  compileV1ExecutiveHomeTruthEvidenceV1,
  type V1ExecutiveHomeTruthEvidenceInputV1
} from "@/lib/release/v1-executive-home-truth-evidence-v1";
import {
  V1_RELEASE_REQUIRED_GATES_V1,
  compileV1ReleaseCertificateV1,
  type V1ReleaseGateEvidenceV1
} from "@/lib/release/v1-release-certificate-v1";
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
    tasks: [], proofOfWork: [], schedulerJobs: [],
    schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 1, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: GENERATED_AT },
    agentSla: [], approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "Approvals", count: 0, items: [] },
      pendingPlans: { label: "Plans", count: 0, items: [] },
      decisionsDue: { label: "Decisions", count: 0, items: [] },
      invoicesToSend: { label: "Invoices", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: 1, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [], commerceTelemetry: undefined, websiteConversion: null, metaAds: null,
    executiveSummary: null, socialIntelligence: null, industryPulseSnapshot: null, cloudflare: null,
    collectorTelemetry: null, agentStatusPanel: [], automationStatusPanel: [], dataSourceAccess: [],
    topActions: [], blockedItems: [], luxuryCollectibles: undefined, agentKpis: [],
    ideaBoard: { columns: [], recentComments: [], linkedTasks: {} },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] },
    industryPulse: undefined, telemetryMetadata: {}, telemetryHealth: {}, executiveInsights: null,
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

function projection(overview = dashboard()) {
  return enforceExecutiveApprovalTruthV1(
    buildExecutiveHomeFromCanonicalSystemsV3(overview, canonical()),
    overview
  );
}

function input(
  overrides: Partial<V1ExecutiveHomeTruthEvidenceInputV1> = {}
): V1ExecutiveHomeTruthEvidenceInputV1 {
  const overview = overrides.overview ?? dashboard();
  return {
    releaseSha: RELEASE_SHA,
    observedAt: OBSERVED_AT,
    evaluatedAt: EVALUATED_AT,
    maxObservationAgeMs: 60_000,
    environment: "PRODUCTION",
    evidenceRefs: ["github://release-evidence/executive-home-production-observation"],
    overview,
    projection: overrides.projection ?? projection(overview),
    ...overrides
  };
}

function codes(result: ReturnType<typeof compileV1ExecutiveHomeTruthEvidenceV1>) {
  return result.blockers.map((entry) => entry.code);
}

test("current production Executive Home compiles into the canonical release gate while preserving UNKNOWN", () => {
  const result = compileV1ExecutiveHomeTruthEvidenceV1(input());

  assert.equal(result.status, "PASS");
  assert.equal(result.gateEvidence.gateId, "EXECUTIVE_HOME_TRUTH");
  assert.equal(result.gateEvidence.state, "PASS");
  assert.equal(result.gateEvidence.freshness, "CURRENT");
  assert.equal(result.gateEvidence.releaseSha, RELEASE_SHA);
  assert.equal(result.gateEvidence.actionRequirement, "NONE");
  assert.equal(result.blockers.length, 0);
  assert.deepEqual(result.authority, {
    canDeploy: false,
    canMutateProduction: false,
    canApprove: false,
    canSendEmail: false
  });

  const revenue = input().projection.home.command_center.business_pulse.find((entry) => entry.id === "revenue");
  assert.equal(revenue?.value, "Unavailable");
  assert.equal(revenue?.truth_state, "UNKNOWN");
});

test("compiled Executive Home evidence is accepted by the existing single V1 release certificate", () => {
  const executive = compileV1ExecutiveHomeTruthEvidenceV1(input());
  const gates: V1ReleaseGateEvidenceV1[] = V1_RELEASE_REQUIRED_GATES_V1.map((gateId) =>
    gateId === "EXECUTIVE_HOME_TRUTH"
      ? executive.gateEvidence
      : {
          gateId,
          state: "PASS",
          freshness: "CURRENT",
          observedAt: OBSERVED_AT,
          evidenceRefs: [`github://release-evidence/${gateId.toLowerCase()}`],
          releaseSha: RELEASE_SHA,
          actionRequirement: "NONE"
        }
  );

  const certificate = compileV1ReleaseCertificateV1({
    releaseSha: RELEASE_SHA,
    generatedAt: EVALUATED_AT,
    gates,
    finalAcceptance: { state: "PENDING" }
  });

  assert.equal(certificate.certifiedClaims.executiveHomeTruth, true);
  assert.equal(certificate.mechanicalState, "READY");
  assert.equal(certificate.releaseState, "READY_FOR_KEEGAN_ACCEPTANCE");
});

test("fixture-backed Executive Home can never certify production truth", () => {
  const live = projection();
  const result = compileV1ExecutiveHomeTruthEvidenceV1(
    input({
      projection: {
        home: structuredClone(EXECUTIVE_HOME_FIXTURE_V1),
        decisionRoom: live.decisionRoom
      }
    })
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(codes(result).includes("FIXTURE_PROVENANCE"));
  assert.equal(result.gateEvidence.state, "BLOCKED");
});

test("raw approval-zero fallback is rejected when canonical approval evidence is absent", () => {
  const overview = dashboard() as DashboardOverviewResponse & {
    actionQueue?: DashboardOverviewResponse["actionQueue"];
    approvalBottlenecks?: DashboardOverviewResponse["approvalBottlenecks"];
  };
  delete overview.actionQueue;
  delete overview.approvalBottlenecks;

  const raw = buildExecutiveHomeFromCanonicalSystemsV3(overview, canonical());
  const blocked = compileV1ExecutiveHomeTruthEvidenceV1(input({ overview, projection: raw }));
  assert.ok(codes(blocked).includes("APPROVAL_TRUTH_MISMATCH"));

  const guarded = enforceExecutiveApprovalTruthV1(raw, overview);
  const passing = compileV1ExecutiveHomeTruthEvidenceV1(input({ overview, projection: guarded }));
  assert.equal(passing.status, "PASS");
  assert.equal(
    guarded.home.command_center.kpis.find((entry) => entry.id === "keegan-review")?.truth_state,
    "UNKNOWN"
  );
});

test("unavailable values cannot be relabeled as known production truth", () => {
  const altered = structuredClone(projection());
  const revenue = altered.home.command_center.business_pulse.find((entry) => entry.id === "revenue");
  assert.ok(revenue);
  revenue.truth_state = "KNOWN";

  const result = compileV1ExecutiveHomeTruthEvidenceV1(input({ projection: altered }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(codes(result).includes("UNAVAILABLE_VALUE_OVERSTATED"));
});

test("stale or future observations fail closed instead of inheriting CURRENT freshness", () => {
  const stale = compileV1ExecutiveHomeTruthEvidenceV1(
    input({
      observedAt: "2026-09-18T18:00:00.000Z",
      maxObservationAgeMs: 60_000
    })
  );
  assert.ok(codes(stale).includes("STALE_OBSERVATION"));
  assert.equal(stale.gateEvidence.freshness, "STALE");

  const future = compileV1ExecutiveHomeTruthEvidenceV1(
    input({ observedAt: "2026-09-18T19:11:00.000Z" })
  );
  assert.ok(codes(future).includes("FUTURE_OBSERVATION"));
  assert.equal(future.gateEvidence.state, "BLOCKED");
});

test("non-production and mismatched projection lineage cannot satisfy the gate", () => {
  const altered = structuredClone(projection());
  altered.decisionRoom.source_mode = "FIXTURE";
  const result = compileV1ExecutiveHomeTruthEvidenceV1(
    input({ environment: "NON_PRODUCTION", projection: altered })
  );

  assert.ok(codes(result).includes("NON_PRODUCTION_OBSERVATION"));
  assert.ok(codes(result).includes("NON_LIVE_DECISION_ROOM"));
});

test("secret-like provenance is stripped from release evidence and blocks certification", () => {
  const result = compileV1ExecutiveHomeTruthEvidenceV1(
    input({ evidenceRefs: ["token=do-not-echo"] })
  );

  assert.equal(result.status, "BLOCKED");
  assert.ok(codes(result).includes("UNSAFE_PROVENANCE"));
  assert.deepEqual(result.gateEvidence.evidenceRefs, []);
  assert.doesNotMatch(JSON.stringify(result), /do-not-echo/);
});
