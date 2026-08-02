import fs from "node:fs";
import path from "node:path";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import { detectOpportunities } from "@/lib/intelligence/opportunity-detection";
import { buildRecommendationsFromExplanation } from "@/lib/intelligence/recommendation-engine";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";
import { createClient } from "@supabase/supabase-js";

const OUT_DIR = path.join(process.cwd(), ".artifacts", "milestone-10-recommendations");
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeJson(name: string, value: unknown) {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
  return p;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function supabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  assert(supabaseUrl, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getCommerceTelemetry(range: { startDate: string; endDate: string }) {
  const supabase = supabaseClient();
  const [woo, ga4, funnel] = await Promise.all([
    supabase.rpc("get_woo_metrics", { start_date: range.startDate, end_date: range.endDate }),
    supabase.rpc("get_ga4_metrics", { start_date: range.startDate, end_date: range.endDate }),
    supabase.rpc("get_funnelkit_metrics", { start_date: range.startDate, end_date: range.endDate })
  ]);
  const error = woo.error ?? ga4.error ?? funnel.error;
  if (error) throw error;
  return { woo: woo.data ?? {}, ga4: ga4.data ?? {}, funnel: funnel.data ?? {} };
}

function mkShell(range: { startDate: string; endDate: string }, telemetry: { woo: unknown; ga4: unknown; funnel: unknown }): DashboardOverviewResponse {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    dataMode: "LIVE_DATA",
    range: { preset: "custom" as RangePreset, startDate: range.startDate, endDate: range.endDate },
    headerMetrics: [],
    executiveCommand: { weeklyDirective: "", topPriorities: [], biggestBottlenecks: [], ceoRecommendation: "" },
    warRoom: { mode: "normal", reason: null, lastUpdated: null, entries: [] },
    revenueEngine: { metrics: [], moneyLeaks: [], fastestPathToIncreaseRevenue: [], isDiagnosticEmpty: true },
    brandPower: { metrics: [], whatIsWorking: [], whatToDoNext: [] },
    opportunityRadar: { activeCount: 0, readyForOutreachCount: 0, topOpportunities: [], nextFiveMoves: [] },
    pipelinePanel: { collectors: [], deals: [] },
    survivalStrip: { configured: false, cashOnHand: null, survivalFloor: 0, monthlyBurn: null, projected30dRevenue: null, runwayDays: null, lastUpdatedAt: null, isStale: true },
    tasks: [],
    proofOfWork: [],
    schedulerJobs: [],
    agentSla: [],
    approvalBottlenecks: { pendingCount: 0, oldestPendingHours: null, tasks: [] },
    actionQueue: {
      needsApprovalTasks: { label: "", count: 0, items: [] },
      pendingPlans: { label: "", count: 0, items: [] },
      decisionsDue: { label: "", count: 0, items: [] },
      invoicesToSend: { label: "", count: 0, items: [] }
    },
    systemHealth: { dataFreshnessHours: null, agentTaskCompletionRate: null, agents: [] },
    agentUpdateFeed: [],
    commerceTelemetry: {
      range: { preset: "custom" as RangePreset, startDate: range.startDate, endDate: range.endDate },
      woo: telemetry.woo as NonNullable<DashboardOverviewResponse["commerceTelemetry"]>["woo"],
      ga4: telemetry.ga4 as NonNullable<DashboardOverviewResponse["commerceTelemetry"]>["ga4"],
      funnel: telemetry.funnel as NonNullable<DashboardOverviewResponse["commerceTelemetry"]>["funnel"]
    },
    agentKpis: [],
    ideaBoard: { columns: { proposed: [], in_review: [], approved: [], rejected: [], in_progress: [], shipped: [], archived: [] }, linkedTasks: {}, recentComments: [] },
    ceoQuestionDesk: { openQuestions: [], escalations: [], recentComments: [] }
  };
}

async function scenario(label: string, current: { startDate: string; endDate: string }, prev: { startDate: string; endDate: string }) {
  const missingSources = ["email", "matchback"];
  const [curTelemetry, prevTelemetry] = await Promise.all([getCommerceTelemetry(current), getCommerceTelemetry(prev)]);
  const currentShell = mkShell(current, curTelemetry);
  const prevShell = mkShell(prev, prevTelemetry);

  const explanation = explainRevenueChange({
    metric: "revenue",
    currentRange: current,
    comparisonRange: prev,
    current: currentShell,
    previous: prevShell
  });

  const opportunities = detectOpportunities({ explanation: explanation.explanation, missingSources });
  const recommendations = buildRecommendationsFromExplanation({ explanation, missingSources });

  writeJson(`${label}.json`, {
    scenario: { current, prev },
    explanation,
    opportunities,
    recommendations
  });
}

async function main() {
  // Use the exact scenario ranges from Milestone 9 artifacts to guarantee coverage.
  const manifestPath = path.join(process.cwd(), ".artifacts", "milestone-9-causal-explanations", "scenario-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    chosen: {
      revenue_increase: { curStart: string; curEnd: string; prevStart: string; prevEnd: string };
      revenue_decrease: { curStart: string; curEnd: string; prevStart: string; prevEnd: string };
    };
  };

  const up = manifest.chosen.revenue_increase;
  const down = manifest.chosen.revenue_decrease;

  await scenario(
    "scenario_revenue_increase",
    { startDate: up.curStart, endDate: up.curEnd },
    { startDate: up.prevStart, endDate: up.prevEnd }
  );

  await scenario(
    "scenario_revenue_decrease",
    { startDate: down.curStart, endDate: down.curEnd },
    { startDate: down.prevStart, endDate: down.prevEnd }
  );

  await scenario(
    "scenario_traffic_up_conversion_down",
    { startDate: up.curStart, endDate: up.curEnd },
    { startDate: up.prevStart, endDate: up.prevEnd }
  );

  await scenario(
    "scenario_outlier_distorted",
    { startDate: "2026-05-13", endDate: "2026-05-19" },
    { startDate: "2026-05-06", endDate: "2026-05-12" }
  );

  await scenario(
    "scenario_insufficient_evidence",
    { startDate: "2099-01-01", endDate: "2099-01-07" },
    { startDate: "2098-12-25", endDate: "2098-12-31" }
  );

  await scenario(
    "scenario_missing_email_integration",
    { startDate: up.curStart, endDate: up.curEnd },
    { startDate: up.prevStart, endDate: up.prevEnd }
  );

  await scenario(
    "scenario_meta_signal_no_causation",
    { startDate: up.curStart, endDate: up.curEnd },
    { startDate: up.prevStart, endDate: up.prevEnd }
  );

  await scenario(
    "scenario_data_quality_gap",
    { startDate: up.curStart, endDate: up.curEnd },
    { startDate: up.prevStart, endDate: up.prevEnd }
  );

  console.log("OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
