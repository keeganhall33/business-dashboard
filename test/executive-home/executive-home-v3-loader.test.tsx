import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import type { DurableAction } from "@/lib/actions/action-contract";
import type { AgentFusionContext } from "@/lib/agents/fusion-context";
import { loadExecutiveHomeV3 } from "@/lib/executive-home/executive-home-v3-loader";
import { buildExecutiveHomeFromCanonicalSystemsV3 } from "@/lib/executive-home/live-adapter";
import type { CanonicalRelationshipFollowUpQueueResultV1 } from "@/lib/relationships-crm/canonical-follow-up-queue-v1";
import type { DashboardOverviewResponse } from "@/lib/types/dashboard";

const NOW = "2026-09-14T20:00:00.000Z";

function dashboard(): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: NOW,
    range: { preset: "7d", startDate: "2026-09-08", endDate: "2026-09-14" },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [], verificationSummary: { total: 0, verifiedActive: 0, onHold: 0, complete: 0, declined: 0, invalid: 0, stale: 0, unverified: 0 } },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null },
    tasks: [], proofOfWork: [], schedulerJobs: [],
    schedulerSummary: { status: "LIVE", cronEnabled: true, jobCount: 1, failingCount: 0, missingTelemetryCount: 0, lastUpdatedAt: NOW },
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

function action(overrides: Partial<DurableAction> = {}): DurableAction {
  return {
    id: "action-1", recommendation_id: "recommendation-1", opportunity_id: null,
    title: "Measure qualified checkout improvement", description: "Run the bounded measurement window.",
    category: "measurement", channel: "website", approval_level: "L1_RECOMMENDATION",
    affected_products: [], affected_audiences: [], current_level: "L1_RECOMMENDATION",
    status: "measuring", priority_score: { overallScore: 80 }, confidence: "likely",
    expected_outcome: "Qualified checkout starts improve.", estimated_impact: {}, estimated_cost: {},
    estimated_effort: {}, risk: "low", evidence_snapshot_id: "snapshot-1",
    evidence_snapshot_hash: "hash-1", evidence_snapshot: null, assumptions: [], limitations: [],
    prepared_assets: [], execution_plan: {}, approval_requirements: {}, last_idempotency_key: null,
    approved_by: null, approved_at: null, rejected_by: null, rejected_at: null, rejection_reason: null,
    snoozed_until: null, expires_at: null, executed_at: "2026-09-13T00:00:00.000Z",
    measurement_window: {}, baseline_snapshot: null,
    result_snapshot: { summary: "Checkout starts improved during the measured window." },
    outcome: null, lessons: "The bounded change is a lesson candidate, not policy.",
    recommendation_fingerprint: "fingerprint-1", created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-14T19:00:00.000Z", ...overrides
  };
}

function fusion(overrides: Partial<AgentFusionContext> = {}): AgentFusionContext {
  return {
    runId: "fusion-1", generatedAt: "2026-09-14T18:00:00.000Z",
    selectedCandidateId: "candidate-1", headline: "Protect qualified checkout momentum",
    recommendedAction: "Complete the bounded checkout measurement",
    why: "This is the highest-confidence reversible next move.", confidenceLevel: "HIGH",
    missingEvidence: ["Final attribution review"], reviewBy: null, isDecision: true, ...overrides
  };
}

function followUps(overrides: Partial<CanonicalRelationshipFollowUpQueueResultV1["items"][number]> = {}): CanonicalRelationshipFollowUpQueueResultV1 {
  return {
    generatedAt: NOW,
    counts: { NEEDS_REPLY: 1, WAITING_ON_CONTACT: 0, FOLLOW_UP_THIS_WEEK: 0, OVERDUE: 0, STALE_OPPORTUNITY: 0, HIGH_VALUE: 0, RECENTLY_REENGAGED: 0, REQUIRES_VERIFICATION: 0 },
    items: [{
      itemId: "follow-up-1", projectionId: "projection-1", contactId: "contact-1", threadId: "thread-1",
      opportunityIds: ["opportunity-1"], queueClasses: ["NEEDS_REPLY"], primaryQueueClass: "NEEDS_REPLY",
      priority: 80, dueAt: "2026-09-15T00:00:00.000Z", lastMeaningfulInteractionAt: "2026-09-13T00:00:00.000Z",
      truthState: "KNOWN", freshnessState: "CURRENT", requiresReview: false,
      suggestedMove: "PREPARE_REPLY", followUpIds: ["crm-follow-up-1"], evidenceRefs: ["email:1"], ...overrides
    }]
  };
}

test("composes persisted Fusion, durable action/outcome, CRM follow-up, and source health without writes", async () => {
  const calls: string[] = [];
  const result = await loadExecutiveHomeV3({
    overview: dashboard(), now: NOW,
    dependencies: {
      loadFusion: async () => { calls.push("fusion"); return fusion(); },
      loadActions: async () => { calls.push("actions"); return [action()]; },
      loadFollowUps: async () => { calls.push("followUps"); return followUps(); }
    }
  });

  assert.deepEqual(calls.sort(), ["actions", "followUps", "fusion"]);
  assert.equal(result.home.command_center.strategy_path.title, "Complete the bounded checkout measurement");
  assert.match(result.home.command_center.do_now.map((item) => item.detail).join(" "), /DURABLE_ACTION:action-1/);
  assert.match(result.home.command_center.do_now.map((item) => item.detail).join(" "), /CRM_FOLLOW_UP:follow-up-1/);
  assert.match(result.home.cards.find((card) => card.section === "LEARNING_SINCE_LAST_REVIEW")?.summary ?? "", /improved/);
  assert.equal(result.decisionRoom.evidence_refs[0]?.provenance, "FUSION_GOVERNED_COMMAND");
  assert.match(result.home.command_center.system_glance.map((item) => item.source).join(" "), /FUSION_RUN:fusion-1/);
});

test("isolates a failed subsystem while preserving healthy canonical evidence", async () => {
  const result = await loadExecutiveHomeV3({
    overview: dashboard(), now: NOW,
    dependencies: {
      loadFusion: async () => { throw new Error("unavailable"); },
      loadActions: async () => [action()],
      loadFollowUps: async () => followUps()
    }
  });

  const glance = Object.fromEntries(result.home.command_center.system_glance.map((item) => [item.id, item]));
  assert.equal(glance["canonical-fusion"]?.value, "Unavailable");
  assert.equal(glance["canonical-fusion"]?.truth_state, "UNKNOWN");
  assert.equal(glance["canonical-actions"]?.value, "Action in flight");
  assert.equal(glance["canonical-crm-follow-ups"]?.value, "1 due");
});

test("keeps stale and conflicted canonical evidence explicit", async () => {
  const result = await loadExecutiveHomeV3({
    overview: dashboard(), now: NOW,
    dependencies: {
      loadFusion: async () => fusion({ generatedAt: "2026-09-01T00:00:00.000Z" }),
      loadActions: async () => [action({ updated_at: "2026-08-01T00:00:00.000Z" })],
      loadFollowUps: async () => followUps({ truthState: "CONFLICTED", freshnessState: "STALE", requiresReview: true })
    }
  });

  const glance = Object.fromEntries(result.home.command_center.system_glance.map((item) => [item.id, item]));
  assert.equal(glance["canonical-fusion"]?.truth_state, "STALE");
  assert.equal(glance["canonical-crm-follow-ups"]?.truth_state, "CONFLICTED");
  assert.equal(result.home.command_center.keegan_actions[0]?.approval_state, "KEEGAN_ACTION_REQUIRED");
  assert.match(result.home.command_center.intelligence_engine.find((lane) => lane.id === "execution")?.status ?? "", /Stale action/);
});

test("orders canonical work deterministically and applies display caps", () => {
  const input = dashboard();
  const result = buildExecutiveHomeFromCanonicalSystemsV3(input, {
    now: NOW, fusion: null,
    actions: [action({ id: "low", title: "Low priority", priority_score: { overallScore: 1 } }), action({ id: "high", title: "High priority", priority_score: { overallScore: 99 } })],
    followUps: followUps(), availability: { fusion: "AVAILABLE", actions: "AVAILABLE", followUps: "AVAILABLE" }
  });
  assert.equal(result.home.command_center.do_now.find((item) => item.id.startsWith("durable-action"))?.label, "High priority");
  assert.ok(result.home.command_center.do_now.length <= 4);
  assert.ok(result.home.command_center.keegan_actions.length <= 3);
  assert.ok(result.home.command_center.system_glance.length <= 8);
});

test("does not mutate canonical inputs and does not coerce unavailable business values to zero", () => {
  const source = dashboard();
  const sourceBefore = structuredClone(source);
  const canonical = {
    now: NOW, fusion: null, actions: [] as DurableAction[], followUps: null,
    availability: { fusion: "AVAILABLE" as const, actions: "AVAILABLE" as const, followUps: "UNAVAILABLE" as const }
  };
  const canonicalBefore = structuredClone(canonical);
  const result = buildExecutiveHomeFromCanonicalSystemsV3(source, canonical);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(canonical, canonicalBefore);
  assert.equal(result.home.command_center.business_pulse.find((metric) => metric.id === "revenue")?.value, "Unavailable");
  assert.doesNotMatch(JSON.stringify(result.home.command_center.business_pulse), /\"value\":\"0\"/);
});

test("dashboard remains dynamic, no-store, and wired through the V3 server loader", () => {
  const page = fs.readFileSync("src/app/(app)/dashboard/page.tsx", "utf8");
  const loader = fs.readFileSync("src/lib/executive-home/executive-home-v3-loader.ts", "utf8");
  assert.match(page, /loadExecutiveHomeV3/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /fetchCache = "force-no-store"/);
  assert.match(loader, /@\/lib\/server-only/);
  assert.doesNotMatch(loader, /insert\(|update\(|delete\(|upsert\(/);
});
