import { ok, serverError } from "@/lib/api/responses";
import { normalizeDeliverableLinks } from "@/lib/domain/deliverables";
import {
  getActiveOpportunities,
  getAgentHealth,
  getLatestAgentDirective,
  getScoreboardMetricsForRange,
  getOpenTasks,
  getCommerceTelemetry,
  getAgentUpdates,
  getOrCreateAgentThread,
  getAgentMessages,
  getSystemState,
  getScheduledJobsWithLatestRuns,
  getTasksAwaitingApproval,
  getPendingAgentPlans,
  getDecisionsRequiringReview,
  getLatestFinanceSnapshot,
  getCollectorRelationships,
  getRecentTasks,
  listAgentKpis,
  listLatestAgentKpiReadingsByKpiKeys,
  getIdeas,
  getRecentIdeaComments,
  getCeoQuestions,
  getRecentCeoQuestionComments
} from "@/lib/supabase/queries";
import { RangePreset } from "@/lib/types/dashboard";
import { agentKeys, agentDisplayNames } from "@/lib/types/requests";

type ScoreboardMetricRow = {
  metric_key: string;
  metric_name: string;
  category: string | null;
  current_value: number | string | null;
  target_value: number | string | null;
  unit: string | null;
  owner_agent: string | null;
  measured_at: string | null;
  history?: ScoreboardMetricHistoryEntry[];
  stats?: ScoreboardMetricStats | null;
};

type ScoreboardMetricHistoryEntry = {
  measured_at: string;
  value: number | null;
};

type ScoreboardMetricStats = {
  average: number | null;
  min: number | null;
  max: number | null;
  changePercent: number | null;
};

type TaskRow = {
  id: string;
  title: string;
  description?: string | null;
  agent_key: string;
  priority: string;
  status: string;
  expected_impact: string | null;
  impact_score: number | null;
  why_this_matters?: string | null;
  related_metric_keys?: string[] | null;
  requires_approval: boolean;
  approved_by_user?: boolean | null;
  expected_duration_days: number | null;
  created_at: string;
  execution_type?: string | null;
  result_summary?: string | null;
  deliverable_links?: unknown;
  completed_at?: string | null;
};

type OpportunityRow = {
  id: string;
  name: string;
  organization: string | null;
  opportunity_type: string;
  status: string;
  value_estimate: number | null;
  prestige_score: number | null;
  probability_score: number | null;
  owner_agent: string;
  next_step: string | null;
  next_step_due_at: string | null;
};

type ScheduledJobRow = {
  job_key: string;
  job_name: string;
  cron_expression: string;
  route_path: string;
  next_run_at: string | null;
  latestRun?: {
    status: string;
    started_at: string;
    finished_at: string | null;
  } | null;
};

type AgentPlanRow = {
  id: string;
  agent_key: string;
  title: string;
  summary: string | null;
  detail_md: string | null;
  submitted_by: string | null;
  submitted_at: string;
};

type DecisionRow = {
  id: string;
  decision_type: string;
  title: string;
  summary: string;
  outcome_review_date: string | null;
  decided_by: string | null;
  created_at: string;
};

type FinanceSnapshotRow = {
  cash_on_hand: number | string | null;
  monthly_burn: number | string | null;
  projected_30d_revenue: number | string | null;
  survival_floor: number | string | null;
};

type CollectorRow = {
  id: string;
  collector_name: string;
  tier: string;
  relationship_status: string | null;
  last_outreach_at: string | null;
  next_move: string | null;
  next_move_due_at: string | null;
  estimated_value: number | null;
};

type AgentKpiRow = {
  kpi_key: string;
  agent_key: string;
  kpi_name: string;
  description: string | null;
  target_value: number | string | null;
  unit: string | null;
  frequency: string | null;
  priority: string | null;
};

type AgentKpiReadingRow = {
  id: string;
  kpi_key: string;
  value: number | string | null;
  measured_at: string;
  source: string | null;
  notes: string | null;
};

type IdeaRow = {
  id: string;
  agent_key: string;
  idea_type: string;
  title: string;
  summary: string | null;
  expected_impact: number | null;
  status: string;
  requires_ceo_approval: boolean;
  approver: string | null;
  approved_at: string | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type IdeaCommentRow = {
  id: string;
  idea_id: string;
  commenter: string;
  comment: string;
  created_at: string;
};

type CeoQuestionRow = {
  id: string;
  asked_by: string;
  escalation_level: string;
  question: string;
  context: string | null;
  status: string;
  priority: string | null;
  owner_agent: string | null;
  due_at: string | null;
  answered_by: string | null;
  answered_at: string | null;
  escalated_by: string | null;
  created_at: string;
  updated_at: string;
};

type CeoQuestionCommentRow = {
  id: string;
  question_id: string;
  commenter: string;
  body: string;
  created_at: string;
};

function isScoreboardMetricRow(value: ScoreboardMetricRow | undefined | null): value is ScoreboardMetricRow {
  return Boolean(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusFromGap(current: number | null, target: number | null) {
  if (current == null || target == null || target === 0) return "warning" as const;
  const ratio = current / target;
  if (ratio < 0.6) return "critical" as const;
  if (ratio < 0.9) return "warning" as const;
  return "healthy" as const;
}

function mapTaskRowToSummary(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    agentKey: task.agent_key,
    priority: task.priority,
    status: task.status,
    expectedImpact: task.expected_impact,
    impactScore: task.impact_score,
    requiresApproval: task.requires_approval,
    approvedByUser: Boolean(task.approved_by_user),
    description: task.description ?? null,
    deliverableSummary: task.result_summary ?? null,
    deliverableLinks: normalizeDeliverableLinks(task.deliverable_links),
    whyThisMatters: task.why_this_matters ?? null,
    relatedMetricKeys: task.related_metric_keys ?? null,
    expectedDurationDays: task.expected_duration_days,
    createdAt: task.created_at ?? null,
    completedAt: task.completed_at ?? null
  };
}

function buildSurvivalStrip(snapshot: FinanceSnapshotRow | null) {
  const floor = toNumber(snapshot?.survival_floor) ?? 7000;
  const cash = toNumber(snapshot?.cash_on_hand);
  const burn = toNumber(snapshot?.monthly_burn);
  const projection = toNumber(snapshot?.projected_30d_revenue);
  const runwayDays = cash != null && burn != null && burn > 0 ? Math.round((cash / burn) * 30) : null;
  const configured = cash != null || burn != null || projection != null;
  return {
    configured,
    cashOnHand: cash,
    survivalFloor: floor,
    monthlyBurn: burn,
    projected30dRevenue: projection,
    runwayDays
  };
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveRange(rangeParam: string | null, startParam: string | null, endParam: string | null) {
  const presets: Record<string, { preset: RangePreset; days: number }> = {
    "7d": { preset: "7d", days: 7 },
    "30d": { preset: "30d", days: 30 },
    "90d": { preset: "90d", days: 90 }
  };

  if (rangeParam === "custom" && isIsoDate(startParam) && isIsoDate(endParam)) {
    const startDate = startParam;
    const endDate = endParam;
    if (startDate <= endDate) {
      return { preset: "custom" as RangePreset, startDate, endDate };
    }
  }

  const fallback = presets[rangeParam ?? ""] ?? presets["30d"];
  const today = new Date();
  const endDate = formatIsoDate(today);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (fallback.days - 1));
  const startDate = formatIsoDate(start);
  return { preset: fallback.preset, startDate, endDate };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rangeParam = url.searchParams.get("range");
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const range = resolveRange(rangeParam, startParam, endParam);

    const [
      metrics,
      tasks,
      opportunities,
      directive,
      agentHealth,
      commerceTelemetry,
      operatingMode,
      schedulerJobsRaw,
      tasksAwaitingApproval,
      pendingPlans,
      decisionsDue,
      financeSnapshot,
      collectorRows,
      recentTasks,
      kpiDefinitions,
      ideaResult,
      recentIdeaComments,
      ceoQuestionResult,
      recentCeoComments
    ] = await Promise.all([
      getScoreboardMetricsForRange(range) as Promise<ScoreboardMetricRow[]>,
      getOpenTasks(50) as Promise<TaskRow[]>,
      getActiveOpportunities(25) as Promise<OpportunityRow[]>,
      getLatestAgentDirective(),
      getAgentHealth(),
      getCommerceTelemetry({ startDate: range.startDate, endDate: range.endDate }),
      getSystemState("operating_mode"),
      getScheduledJobsWithLatestRuns(),
      getTasksAwaitingApproval(25),
      getPendingAgentPlans(15),
      getDecisionsRequiringReview({ withinDays: 21, limit: 20 }),
      getLatestFinanceSnapshot(),
      getCollectorRelationships(12),
      getRecentTasks(40),
      listAgentKpis({ limit: 250 }) as Promise<AgentKpiRow[]>,
      getIdeas({ limit: 250 }) as Promise<{ items: IdeaRow[]; count: number }>,
      getRecentIdeaComments(30) as Promise<IdeaCommentRow[]>,
      getCeoQuestions({ limit: 250 }) as Promise<{ items: CeoQuestionRow[]; count: number }>,
      getRecentCeoQuestionComments(30) as Promise<CeoQuestionCommentRow[]>
    ]);

    const kpiKeys = (kpiDefinitions as AgentKpiRow[]).map((kpi) => kpi.kpi_key);
    const kpiReadings = (await listLatestAgentKpiReadingsByKpiKeys(kpiKeys)) as AgentKpiReadingRow[];
    const latestReadingByKey = new Map(kpiReadings.map((r) => [r.kpi_key, r]));

    const agentKpis = agentKeys.map((agentKey) => {
      const defs = (kpiDefinitions as AgentKpiRow[]).filter((kpi) => kpi.agent_key === agentKey);
      return {
        agentKey,
        agentName: agentDisplayNames[agentKey as keyof typeof agentDisplayNames] ?? agentKey,
        kpis: defs.map((kpi) => {
          const latest = latestReadingByKey.get(kpi.kpi_key);
          return {
            kpiKey: kpi.kpi_key,
            kpiName: kpi.kpi_name,
            description: kpi.description,
            targetValue: toNumber(kpi.target_value),
            unit: kpi.unit,
            frequency: kpi.frequency,
            priority: kpi.priority,
            latestReading: latest
              ? {
                  id: latest.id,
                  value: toNumber(latest.value),
                  measuredAt: latest.measured_at,
                  source: latest.source,
                  notes: latest.notes
                }
              : null
          };
        })
      };
    });

    const ideas = (ideaResult as { items: IdeaRow[] }).items;
    const ideaBoardStatuses = [
      "proposed",
      "in_review",
      "approved",
      "rejected",
      "in_progress",
      "shipped",
      "archived"
    ];
    const ideaBoard = ideaBoardStatuses.reduce<Record<string, unknown>>((acc, status) => {
      acc[status] = ideas
        .filter((idea) => idea.status === status)
        .slice(0, 50)
        .map((idea) => ({
          id: idea.id,
          agentKey: idea.agent_key,
          agentName: agentDisplayNames[idea.agent_key as keyof typeof agentDisplayNames] ?? idea.agent_key,
          ideaType: idea.idea_type,
          title: idea.title,
          summary: idea.summary,
          expectedImpact: idea.expected_impact,
          requiresCeoApproval: idea.requires_ceo_approval,
          linkedTaskId: idea.linked_task_id,
          approvedAt: idea.approved_at,
          approver: idea.approver,
          updatedAt: idea.updated_at,
          createdAt: idea.created_at
        }));
      return acc;
    }, {});

    const ceoQuestions = (ceoQuestionResult as { items: CeoQuestionRow[] }).items;
    const openQuestions = ceoQuestions
      .filter((q) => ["open", "needs_followup"].includes(q.status))
      .slice(0, 25)
      .map((q) => ({
        id: q.id,
        askedBy: q.asked_by,
        escalationLevel: q.escalation_level,
        question: q.question,
        context: q.context,
        status: q.status,
        priority: q.priority,
        ownerAgent: q.owner_agent,
        dueAt: q.due_at,
        createdAt: q.created_at,
        updatedAt: q.updated_at
      }));
    const escalations = ceoQuestions
      .filter((q) => q.escalation_level === "keegan" && ["open", "needs_followup"].includes(q.status))
      .slice(0, 25)
      .map((q) => ({
        id: q.id,
        askedBy: q.asked_by,
        question: q.question,
        status: q.status,
        priority: q.priority,
        dueAt: q.due_at,
        escalatedBy: q.escalated_by,
        updatedAt: q.updated_at
      }));

    const ceoQuestionDesk = {
      openQuestions,
      escalations,
      recentComments: (recentCeoComments as CeoQuestionCommentRow[]).map((c) => ({
        id: c.id,
        questionId: c.question_id,
        commenter: c.commenter,
        body: c.body,
        createdAt: c.created_at
      }))
    };

    const [warRoomThread, agentUpdateBuckets] = await Promise.all([
      getOrCreateAgentThread({ agentKey: "avery", threadType: "war_room", title: "Executive War Room" }),
      Promise.all(agentKeys.map((key) => getAgentUpdates(key, 5)))
    ]);
    const warRoomMessages = await getAgentMessages(warRoomThread.id, 5);

    const metricByKey = new Map(metrics.map((m) => [m.metric_key, { ...m }]));

    if (commerceTelemetry) {
      const wooSummary = (commerceTelemetry as Record<string, unknown>).woo as Record<string, unknown> | undefined;
      const gaSummary = (commerceTelemetry as Record<string, unknown>).ga4 as Record<string, unknown> | undefined;
      const wooSummaryData = (wooSummary?.summary ?? {}) as Record<string, unknown>;
      const gaSummaryData = (gaSummary?.summary ?? {}) as Record<string, unknown>;
      const wooRevenue = toNumber(wooSummaryData.revenue);
      const wooOrders = toNumber(wooSummaryData.orders);
      const wooAov = toNumber(wooSummaryData.avgOrderValue);
      const gaSessions = toNumber(gaSummaryData.sessions);

      const conversionRate =
        wooOrders != null && gaSessions != null && gaSessions > 0 ? (wooOrders / gaSessions) * 100 : null;
      const revenuePerVisitor =
        wooRevenue != null && gaSessions != null && gaSessions > 0 ? wooRevenue / gaSessions : null;

      const overrides: Array<{ key: string; value: number | null; unit: string }> = [
        { key: "monthly_revenue", value: wooRevenue, unit: "usd" },
        { key: "aov", value: wooAov, unit: "usd" },
        { key: "conversion_rate", value: conversionRate, unit: "percent" },
        { key: "revenue_per_visitor", value: revenuePerVisitor, unit: "usd" }
      ];

      overrides.forEach(({ key, value, unit }) => {
        if (value == null || Number.isNaN(value)) return;
        const metric = metricByKey.get(key);
        if (metric) {
          metric.current_value = value;
          metric.unit = unit;
          metric.measured_at = ((commerceTelemetry as Record<string, unknown>).endDate as string | undefined) ?? metric.measured_at;
        }
      });
    }

    const headerMetricKeys = [
      "monthly_revenue",
      "aov",
      "conversion_rate",
      "active_brand_conversations"
    ];

    const headerMetrics = headerMetricKeys
      .map((key) => {
        const m = metricByKey.get(key);
        if (!m) return null;
        const currentValue = toNumber(m.current_value) ?? 0;
        const targetValue = toNumber(m.target_value) ?? 0;
        return {
          metricKey: m.metric_key,
          metricName: m.metric_name,
          category: m.category ?? "general",
          currentValue,
          targetValue,
          deltaPercent: 0,
          status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
          unit: m.unit ?? null,
          ownerAgent: m.owner_agent ?? null,
          measuredAt: m.measured_at ?? null
        };
      })
      .filter(Boolean);

    const executiveCommand = {
      weeklyDirective:
        directive?.summary ??
        "Shift focus to pricing power, conversion lift, and partnership pipeline expansion immediately.",
      topPriorities: [
        "Increase AOV via premium tiered pricing",
        "Fix homepage and product page conversion bottlenecks",
        "Expand active partnership conversations"
      ],
      biggestBottlenecks: ["AOV is far below target", "Conversion rate is underperforming", "Pipeline is too thin"],
      ceoRecommendation: "Do not chase volume. Increase pricing power, strengthen luxury messaging, and build the partnership machine."
    };

    const revenueEngineMetrics = [
      "monthly_revenue",
      "aov",
      "revenue_per_visitor",
      "conversion_rate"
    ]
      .map((key) => metricByKey.get(key))
      .filter(isScoreboardMetricRow)
      .map((m) => ({
        metricKey: m.metric_key,
        currentValue: toNumber(m.current_value) ?? 0,
        targetValue: toNumber(m.target_value) ?? 0,
        status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
        unit: m.unit ?? null
      }));

    const revenueEngine = {
      metrics: revenueEngineMetrics,
      moneyLeaks: [
        "Low AOV is the single largest revenue constraint.",
        "High cart abandonment is reducing recovered sales.",
        "Weak conversion rate is suppressing total revenue."
      ],
      fastestPathToIncreaseRevenue: [
        { move: "Raise AOV via premium offer architecture", estimatedImpact: "+$15K to +$20K / month" },
        { move: "Recover 10% of abandoned carts", estimatedImpact: "+$4K to +$7K / month" }
      ]
    };

    const brandPower = {
      metrics: ["social_growth_monthly", "engagement_rate", "cultural_relevance_score"]
        .map((key) => metricByKey.get(key))
        .filter(isScoreboardMetricRow)
        .map((m) => ({
          metricKey: m.metric_key,
          currentValue: toNumber(m.current_value) ?? 0,
          targetValue: toNumber(m.target_value) ?? 0,
          status: statusFromGap(toNumber(m.current_value), toNumber(m.target_value)),
          unit: m.unit ?? null
        })),
      whatIsWorking: [
        "Authority-based storytelling performs better than generic art promotion.",
        "Collaboration-driven content has stronger prestige impact."
      ],
      whatToDoNext: [
        "Reposition homepage and campaign copy around Impossible in Pencil.",
        "Create a collector-status narrative series."
      ]
    };

    const activeCount = opportunities.filter((o) => !["won", "lost", "parked"].includes(o.status)).length;
    const readyForOutreachCount = opportunities.filter((o) => o.status === "ready_for_outreach").length;

    const sortedOpportunities = opportunities.slice().sort((a, b) => (b.prestige_score ?? 0) - (a.prestige_score ?? 0));
    const seenOpportunities = new Set<string>();
    const topOpportunities: {
      id: string;
      name: string;
      organization: string | null;
      opportunityType: string;
      status: string;
      valueEstimate: number | null;
      prestigeScore: number | null;
      probabilityScore: number | null;
      ownerAgent: string;
      nextStep: string | null;
      nextStepDueAt: string | null;
    }[] = [];

    for (const opportunity of sortedOpportunities) {
      const dedupeKey = `${opportunity.name}|${opportunity.organization ?? ""}`.toLowerCase();
      if (seenOpportunities.has(dedupeKey)) continue;
      seenOpportunities.add(dedupeKey);

      topOpportunities.push({
        id: opportunity.id,
        name: opportunity.name,
        organization: opportunity.organization,
        opportunityType: opportunity.opportunity_type,
        status: opportunity.status,
        valueEstimate: opportunity.value_estimate,
        prestigeScore: opportunity.prestige_score,
        probabilityScore: opportunity.probability_score,
        ownerAgent: opportunity.owner_agent,
        nextStep: opportunity.next_step,
        nextStepDueAt: opportunity.next_step_due_at
      });

      if (topOpportunities.length >= 5) break;
    }

    const opportunityRadar = {
      activeCount,
      readyForOutreachCount,
      topOpportunities,
      nextFiveMoves: [
        "Build 25-brand target list",
        "Prioritize 10 high-prestige targets",
        "Prepare pitch angles by category",
        "Draft outreach assets for approval",
        "Track response readiness by opportunity"
      ]
    };

    const systemHealth = {
      dataFreshnessHours: 6,
      agentTaskCompletionRate: 62,
      agents: agentHealth
    };

    const warRoomStateJson = (operatingMode?.value_json as Record<string, unknown> | undefined) ?? {};
    const dedupedEntries: Array<{
      id: string;
      title: string;
      summary: string;
      detailMd: string | null;
      createdAt: string;
    }> = [];
    const seenWarRoom = new Set<string>();
    for (const message of [...warRoomMessages].reverse()) {
      const title = ((message.metadata as Record<string, unknown> | null)?.title as string | undefined) ?? "War room note";
      const summary = message.body;
      const dedupeKey = `${title}|${summary}`;
      if (seenWarRoom.has(dedupeKey)) continue;
      seenWarRoom.add(dedupeKey);
      dedupedEntries.push({
        id: message.id,
        title,
        summary,
        detailMd: ((message.metadata as Record<string, unknown> | null)?.detailMd as string | undefined) ?? null,
        createdAt: message.created_at
      });
    }
    dedupedEntries.reverse();

    const warRoom = {
      mode: (warRoomStateJson.mode as "normal" | "war_room" | undefined) ?? "normal",
      reason: (warRoomStateJson.reason as string | null) ?? null,
      lastUpdated: (warRoomStateJson.activatedAt as string | null) ?? null,
      entries: dedupedEntries
    };

    const agentUpdateFeed = agentUpdateBuckets
      .flat()
      .map((row) => ({
        id: row.id,
        agentKey: row.agent_key,
        agentName: agentDisplayNames[row.agent_key as keyof typeof agentDisplayNames] ?? row.agent_key,
        updateType: row.update_type,
        title: row.title,
        summary: row.summary,
        priority: row.priority,
        createdAt: row.created_at
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);

    const schedulerJobs = (schedulerJobsRaw as ScheduledJobRow[]).map((job) => {
      const lastRun = job.latestRun ?? null;
      const durationSeconds = lastRun?.finished_at
        ? Math.max(0, (new Date(lastRun.finished_at).getTime() - new Date(lastRun.started_at).getTime()) / 1000)
        : null;
      return {
        jobKey: job.job_key,
        jobName: job.job_name,
        cronExpression: job.cron_expression,
        routePath: job.route_path,
        lastRunAt: lastRun?.started_at ?? null,
        lastStatus: lastRun?.status ?? null,
        lastDurationSeconds: durationSeconds,
        nextRunAt: job.next_run_at ?? null
      };
    });

    const openTaskRows = tasks as TaskRow[];
    const recentTaskRows = recentTasks as TaskRow[];
    const completedTaskRows = recentTaskRows
      .filter((task) => task.status === "completed")
      .slice(0, 12);

    const taskRowMap = new Map<string, TaskRow>();
    [...openTaskRows, ...completedTaskRows].forEach((task) => {
      taskRowMap.set(task.id, task);
    });
    const allTaskRows = Array.from(taskRowMap.values());

    const nowMs = Date.now();
    const tasksByAgent = allTaskRows.reduce<Record<string, TaskRow[]>>((acc, task) => {
      acc[task.agent_key] = acc[task.agent_key] ?? [];
      acc[task.agent_key].push(task);
      return acc;
    }, {});

    const agentSla = agentHealth
      .map((agent) => {
        const agentTasks = tasksByAgent[agent.agentKey] ?? [];
        const openCount = agentTasks.filter((task) => task.status !== "completed").length;
        const inProgressCount = agentTasks.filter((task) => task.status === "in_progress").length;
        const minutesSinceRun = agent.lastRunAt ? Math.round((nowMs - new Date(agent.lastRunAt).getTime()) / 60000) : null;
        const nextRunDueAt = agent.lastRunAt
          ? new Date(new Date(agent.lastRunAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : null;
        return {
          agentKey: agent.agentKey,
          lastRunAt: agent.lastRunAt,
          minutesSinceRun,
          nextRunDueAt,
          inProgressShare: openCount > 0 ? Math.round((inProgressCount / openCount) * 100) : null
        };
      })
      .sort((a, b) => (b.minutesSinceRun ?? 0) - (a.minutesSinceRun ?? 0));

    const approvalsSorted = [...(tasksAwaitingApproval as TaskRow[])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const oldestPendingHours = approvalsSorted.length
      ? Number(((nowMs - new Date(approvalsSorted[0].created_at).getTime()) / 36e5).toFixed(1))
      : null;
    const approvalBottlenecks = {
      pendingCount: approvalsSorted.length,
      oldestPendingHours,
      tasks: approvalsSorted.slice(0, 5).map(mapTaskRowToSummary)
    };

    const approvalQueueItems = approvalsSorted.slice(0, 5).map((task) => ({
      id: task.id,
      itemType: "task" as const,
      title: task.title,
      summary: task.expected_impact,
      createdAt: task.created_at,
      dueAt: null,
      actor: task.agent_key,
      priority: task.priority
    }));

    const planQueueItems = (pendingPlans as AgentPlanRow[]).slice(0, 5).map((plan) => ({
      id: plan.id,
      itemType: "plan" as const,
      title: plan.title,
      summary: plan.summary,
      createdAt: plan.submitted_at,
      dueAt: null,
      actor: plan.submitted_by ?? plan.agent_key,
      priority: null
    }));

    const decisionQueueItems = (decisionsDue as DecisionRow[]).slice(0, 5).map((decision) => ({
      id: decision.id,
      itemType: "decision" as const,
      title: decision.title,
      summary: decision.summary,
      createdAt: decision.created_at,
      dueAt: decision.outcome_review_date,
      actor: decision.decided_by ?? decision.decision_type,
      priority: null
    }));

    const invoiceQueueItems = allTaskRows
      .filter((task) => {
        const haystack = `${task.title} ${task.expected_impact ?? ""}`.toLowerCase();
        return haystack.includes("invoice") || (task.execution_type ?? "").toLowerCase().includes("invoice");
      })
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        itemType: "invoice" as const,
        title: task.title,
        summary: task.expected_impact,
        createdAt: task.created_at,
        dueAt: null,
        actor: task.agent_key,
        priority: task.priority
      }));

    const actionQueue = {
      needsApprovalTasks: {
        label: "Task approvals",
        count: approvalQueueItems.length,
        items: approvalQueueItems
      },
      pendingPlans: {
        label: "Plans awaiting review",
        count: planQueueItems.length,
        items: planQueueItems
      },
      decisionsDue: {
        label: "Decisions to revisit",
        count: decisionQueueItems.length,
        items: decisionQueueItems
      },
      invoicesToSend: {
        label: "Invoices to send",
        count: invoiceQueueItems.length,
        items: invoiceQueueItems
      }
    };

    const survivalStrip = buildSurvivalStrip((financeSnapshot ?? null) as FinanceSnapshotRow | null);

    const collectorSummaries = (collectorRows as CollectorRow[]).map((collector) => ({
      id: collector.id,
      name: collector.collector_name,
      tier: collector.tier,
      status: collector.relationship_status,
      lastOutreachAt: collector.last_outreach_at,
      nextMove: collector.next_move,
      nextMoveDueAt: collector.next_move_due_at,
      estimatedValue: collector.estimated_value
    }));

    const pipelineDeals: {
      id: string;
      name: string;
      organization: string | null;
      opportunityType: string;
      status: string;
      valueEstimate: number | null;
      prestigeScore: number | null;
      probabilityScore: number | null;
      ownerAgent: string;
      nextStep: string | null;
      nextStepDueAt: string | null;
    }[] = [];
    const seenPipelineDeals = new Set<string>();
    for (const opportunity of opportunities) {
      if (["won", "lost", "parked"].includes(opportunity.status)) continue;
      const dedupeKey = `${opportunity.name}|${opportunity.organization ?? ""}`.toLowerCase();
      if (seenPipelineDeals.has(dedupeKey)) continue;
      seenPipelineDeals.add(dedupeKey);
      pipelineDeals.push({
        id: opportunity.id,
        name: opportunity.name,
        organization: opportunity.organization,
        opportunityType: opportunity.opportunity_type,
        status: opportunity.status,
        valueEstimate: opportunity.value_estimate,
        prestigeScore: opportunity.prestige_score,
        probabilityScore: opportunity.probability_score,
        ownerAgent: opportunity.owner_agent,
        nextStep: opportunity.next_step,
        nextStepDueAt: opportunity.next_step_due_at
      });
      if (pipelineDeals.length >= 6) break;
    }

    const pipelinePanel = {
      collectors: collectorSummaries,
      deals: pipelineDeals
    };

    const responseRange = {
      preset: range.preset,
      startDate: range.startDate,
      endDate: range.endDate
    };

    const commercePayload = commerceTelemetry
      ? {
          range: responseRange,
          woo: commerceTelemetry.woo ?? undefined,
          ga4: commerceTelemetry.ga4 ?? undefined,
          funnel: commerceTelemetry.funnel ?? undefined
        }
      : {
          range: responseRange
        };

    return ok({
      ok: true,
      timestamp: new Date().toISOString(),
      range: responseRange,
      headerMetrics,
      executiveCommand,
      warRoom,
      revenueEngine,
      brandPower,
      opportunityRadar,
      pipelinePanel,
      survivalStrip,
      tasks: allTaskRows.map(mapTaskRowToSummary),
      schedulerJobs,
      agentSla,
      approvalBottlenecks,
      actionQueue,
      systemHealth,
      agentUpdateFeed,
      commerceTelemetry: commercePayload,
      agentKpis,
      ideaBoard: {
        columns: ideaBoard,
        recentComments: (recentIdeaComments as IdeaCommentRow[]).map((c) => ({
          id: c.id,
          ideaId: c.idea_id,
          commenter: c.commenter,
          comment: c.comment,
          createdAt: c.created_at
        }))
      },
      ceoQuestionDesk
    });
  } catch (error) {
    return serverError("Failed to load overview", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
