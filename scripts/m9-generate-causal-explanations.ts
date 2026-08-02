import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { explainRevenueChange } from "@/lib/intelligence/explanation-engine";
import type { DashboardOverviewResponse, RangePreset } from "@/lib/types/dashboard";

const OUT_DIR = path.join(process.cwd(), ".artifacts", "milestone-9-causal-explanations");
fs.mkdirSync(OUT_DIR, { recursive: true });

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

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

async function loadDailyWooRevenue({ startDate, endDate }: { startDate: string; endDate: string }) {
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("woo_order_telemetry_v1")
    .select("paid_pacific_date,net_revenue_cents")
    .eq("is_deleted", false)
    .gte("paid_pacific_date", startDate)
    .lte("paid_pacific_date", endDate);
  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of (data ?? []) as unknown as Array<{ paid_pacific_date: string; net_revenue_cents: number | null }>) {
    const day = String(row.paid_pacific_date);
    const cents = Number(row.net_revenue_cents ?? 0);
    map.set(day, (map.get(day) ?? 0) + cents);
  }

  return Array.from(map.entries())
    .map(([date, cents]) => ({ date, cents }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeWindowSum(days: Array<{ date: string; cents: number }>, startIdx: number, len: number) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += days[startIdx + i]?.cents ?? 0;
  return sum;
}

type CommerceTelemetryPayload = { woo: unknown; ga4: unknown; funnel: unknown };

async function fetchCommerceTelemetry(range: { startDate: string; endDate: string }): Promise<CommerceTelemetryPayload> {
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

function mkShell(range: { startDate: string; endDate: string }, telemetry: CommerceTelemetryPayload): DashboardOverviewResponse {
  // Minimal-but-valid response shape for the engine.
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

async function buildExplanation(label: string, current: { startDate: string; endDate: string }, prev: { startDate: string; endDate: string }) {
  const [curTelemetry, prevTelemetry] = await Promise.all([fetchCommerceTelemetry(current), fetchCommerceTelemetry(prev)]);
  const currentShell = mkShell(current, curTelemetry);
  const prevShell = mkShell(prev, prevTelemetry);

  const explanation = explainRevenueChange({
    metric: "revenue",
    currentRange: current,
    comparisonRange: prev,
    current: currentShell,
    previous: prevShell
  });
  writeJson(`${label}.json`, explanation);
  return explanation;
}

async function main() {
  const today = toIsoDate(new Date());
  const endDate = addDays(today, -1);
  const startDate = addDays(endDate, -120);

  const daily = await loadDailyWooRevenue({ startDate, endDate });

  // Fill gaps.
  const byDate = new Map(daily.map((d) => [d.date, d.cents] as const));
  const dates: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d);
  const series = dates.map((date) => ({ date, cents: byDate.get(date) ?? 0 }));
  assert(series.length >= 60, "Not enough calendar coverage for scenario scan");

  const windows: Array<{
    curStart: string;
    curEnd: string;
    prevStart: string;
    prevEnd: string;
    curSum: number;
    prevSum: number;
    delta: number;
    pct: number | null;
  }> = [];
  for (let i = 0; i + 13 < series.length; i++) {
    const curStart = series[i + 7].date;
    const curEnd = series[i + 13].date;
    const prevStart = series[i].date;
    const prevEnd = series[i + 6].date;
    const curSum = computeWindowSum(series, i + 7, 7);
    const prevSum = computeWindowSum(series, i, 7);
    const delta = curSum - prevSum;
    const pct = prevSum === 0 ? null : (delta / Math.abs(prevSum)) * 100;
    windows.push({ curStart, curEnd, prevStart, prevEnd, curSum, prevSum, delta, pct });
  }

  const byPct = windows.filter((w) => w.pct != null);
  const up = byPct.slice().sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const down = byPct.slice().sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];

  const outlierDay = series.slice().sort((a, b) => b.cents - a.cents)[0];
  const outlierRangeStart = addDays(outlierDay.date, -3);
  const outlierRangeEnd = addDays(outlierDay.date, 3);

  writeJson("scenario-manifest.json", {
    generated_at: new Date().toISOString(),
    coverage_scan: { startDate, endDate },
    chosen: { revenue_increase: up, revenue_decrease: down, outlier_day: outlierDay }
  });

  await buildExplanation("scenario_revenue_increase", { startDate: up.curStart, endDate: up.curEnd }, { startDate: up.prevStart, endDate: up.prevEnd });
  await buildExplanation("scenario_revenue_decrease", { startDate: down.curStart, endDate: down.curEnd }, { startDate: down.prevStart, endDate: down.prevEnd });
  await buildExplanation(
    "scenario_outlier_window",
    { startDate: outlierRangeStart, endDate: outlierRangeEnd },
    { startDate: addDays(outlierRangeStart, -7), endDate: addDays(outlierRangeEnd, -7) }
  );
  await buildExplanation(
    "scenario_insufficient_evidence_future",
    { startDate: "2099-01-01", endDate: "2099-01-07" },
    { startDate: "2098-12-25", endDate: "2098-12-31" }
  );
  await buildExplanation(
    "scenario_dst_span",
    { startDate: "2026-03-05", endDate: "2026-03-15" },
    { startDate: "2026-02-26", endDate: "2026-03-04" }
  );

  console.log("OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
