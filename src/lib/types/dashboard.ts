export type MetricStatus = "healthy" | "on_track" | "warning" | "critical";

export type RangePreset = "7d" | "30d" | "90d" | "custom";

export type HeaderMetric = {
  metricKey: string;
  metricName: string;
  category: string;
  currentValue: number;
  targetValue: number;
  deltaPercent: number | null;
  status: MetricStatus;
  unit: string | null;
  ownerAgent?: string | null;
  measuredAt?: string | null;
};

export type ExecutiveCommand = {
  weeklyDirective: string;
  topPriorities: string[];
  biggestBottlenecks: string[];
  ceoRecommendation: string;
};

export type RevenueMetric = {
  metricKey: string;
  currentValue: number;
  targetValue: number;
  status: MetricStatus;
  unit: string | null;
  ownerAgent?: string | null;
  tactics?: string[] | null;
  evidence?: DeliverableLink[] | null;

  // Optional history for premium visuals (sparkline, range context)
  history?: Array<{ measuredAt: string; value: number | null }> | null;
  stats?: {
    average: number | null;
    min: number | null;
    max: number | null;
    changePercent: number | null;
  } | null;
};

export type RevenueEngine = {
  metrics: RevenueMetric[];
  moneyLeaks: string[];
  fastestPathToIncreaseRevenue: Array<{ move: string; estimatedImpact: string }>;
};

export type BrandPower = {
  metrics: RevenueMetric[];
  whatIsWorking: string[];
  whatToDoNext: string[];
};

export type Opportunity = {
  id: string;
  name: string;
  organization: string | null;
  opportunityType: string;
  status: string;
  valueEstimate: number | null;
  prestigeScore: number | null;
  probabilityScore: number | null;
  ownerAgent: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  supportingDocs?: DeliverableLink[] | null;
};

export type OpportunityRadar = {
  activeCount: number;
  readyForOutreachCount: number;
  topOpportunities: Opportunity[];
  nextFiveMoves: string[];
};

export type CollectorRelationship = {
  id: string;
  name: string;
  tier: "A" | "B" | string;
  status: string | null;
  lastOutreachAt: string | null;
  nextMove: string | null;
  nextMoveDueAt: string | null;
  estimatedValue: number | null;
  supportingDocs?: DeliverableLink[] | null;
};

export type SurvivalStrip = {
  configured: boolean;
  cashOnHand: number | null;
  survivalFloor: number;
  monthlyBurn: number | null;
  projected30dRevenue: number | null;
  runwayDays: number | null;
};

export type PipelinePanel = {
  collectors: CollectorRelationship[];
  deals: Opportunity[];
};

export type WarRoomEntry = {
  id: string;
  title: string;
  summary: string;
  detailMd?: string | null;
  createdAt: string;
};

export type WarRoomState = {
  mode: "normal" | "war_room";
  reason: string | null;
  lastUpdated: string | null;
  entries: WarRoomEntry[];
};

export type AgentUpdateFeedItem = {
  id: string;
  agentKey: string;
  agentName: string;
  updateType: string;
  title: string;
  summary: string;
  priority?: string | null;
  createdAt: string;
};

export type DeliverableLink = {
  label: string;
  url: string;
};

// -----------------------------
// KPI / Ideas / CEO Questions (dashboard additions)
// -----------------------------

export type AgentKpiReading = {
  id: string;
  value: number | null;
  measuredAt: string;
  source: string | null;
  notes: string | null;
};

export type AgentKpiDefinition = {
  kpiKey: string;
  kpiName: string;
  description: string | null;
  targetValue: number | null;
  unit: string | null;
  frequency: string | null;
  priority: string | null;
  latestReading: AgentKpiReading | null;
  priorReading?: AgentKpiReading | null;
};

export type AgentKpiBucket = {
  agentKey: string;
  agentName: string;
  kpis: AgentKpiDefinition[];
};

export type IdeaCard = {
  id: string;
  agentKey: string;
  agentName: string;
  ideaType: "minor" | "major" | string;
  title: string;
  summary: string | null;
  expectedImpact: number | null;
  requiresCeoApproval: boolean;
  linkedTaskId: string | null;
  approvedAt: string | null;
  approver: string | null;
  updatedAt: string;
  createdAt: string;
};

export type IdeaLinkedTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  requiresApproval: boolean;
  approvedByUser?: boolean | null;
  dueAt?: string | null;
  expectedDurationDays?: number | null;
  description?: string | null;
  deliverableLinks?: DeliverableLink[] | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export type IdeaComment = {
  id: string;
  ideaId: string;
  commenter: string;
  comment: string;
  createdAt: string;
};

export type IdeaBoard = {
  columns: Record<string, IdeaCard[]> | Array<{ status?: string; key?: string; title?: string; ideas?: IdeaCard[] }>;
  recentComments: IdeaComment[];
  linkedTasks?: Record<string, IdeaLinkedTask>;
};

export type CeoQuestion = {
  id: string;
  askedBy: string;
  escalationLevel: "avery" | "keegan" | string;
  question: string;
  context: string | null;
  status: "open" | "answered" | "needs_followup" | "closed" | string;
  priority: string | null;
  ownerAgent: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CeoQuestionEscalation = {
  id: string;
  askedBy: string;
  question: string;
  status: string;
  priority: string | null;
  dueAt: string | null;
  escalatedBy: string | null;
  updatedAt: string;
};

export type CeoQuestionComment = {
  id: string;
  questionId: string;
  commenter: string;
  body: string;
  createdAt: string;
};

export type CeoQuestionDesk = {
  openQuestions: CeoQuestion[];
  escalations: CeoQuestionEscalation[];
  recentComments: CeoQuestionComment[];
};

export type TaskSummary = {
  id: string;
  title: string;
  agentKey: string;
  priority: "critical" | "high" | "medium" | "low" | string;
  status: "pending" | "approved" | "rejected" | "in_progress" | "completed" | string;
  expectedImpact: string | null;
  impactScore: number | null;
  requiresApproval: boolean;
  approvedByUser?: boolean | null;
  description?: string | null;
  deliverableSummary?: string | null;
  deliverableLinks?: DeliverableLink[] | null;
  whyThisMatters?: string | null;
  relatedMetricKeys?: string[] | null;
  expectedDurationDays?: number | null;
  createdAt?: string | null;
  completedAt?: string | null;
};

export type SchedulerJobHealth = {
  jobKey: string;
  jobName: string;
  cronExpression: string;
  routePath: string;
  lastRunAt: string | null;
  lastStatus: "running" | "completed" | "failed" | string | null;
  lastDurationSeconds: number | null;
  nextRunAt: string | null;
};

export type AgentSlaSnapshot = {
  agentKey: string;
  lastRunAt: string | null;
  minutesSinceRun: number | null;
  nextRunDueAt: string | null;
  inProgressShare: number | null;
};

export type ApprovalBottleneck = {
  pendingCount: number;
  oldestPendingHours: number | null;
  tasks: TaskSummary[];
};

export type ActionQueueItem = {
  id: string;
  itemType: "task" | "plan" | "decision" | "invoice";
  title: string;
  summary: string | null;
  createdAt: string | null;
  dueAt: string | null;
  actor?: string | null;
  priority?: string | null;
};

export type ActionQueueSection = {
  label: string;
  count: number;
  items: ActionQueueItem[];
};

export type ActionQueue = {
  needsApprovalTasks: ActionQueueSection;
  pendingPlans: ActionQueueSection;
  decisionsDue: ActionQueueSection;
  invoicesToSend: ActionQueueSection;
};

export type AgentHealth = {
  agentKey: string;
  lastRunAt: string | null;
  openTaskCount: number;
  completedTaskCount: number;
  health: "healthy" | "warning" | "stale" | string;
};

export type SystemHealth = {
  dataFreshnessHours: number | null;
  agentTaskCompletionRate: number | null;
  agents: AgentHealth[];
};

export type WooSummary = {
  revenue: number | null;
  orders: number | null;
  avgOrderValue: number | null;
  discountTotal: number | null;
  shippingTotal: number | null;
  taxTotal: number | null;
  items: number | null;
};

export type WooTimeseriesPoint = {
  date: string;
  revenue: number;
  orders: number;
};

export type GaSummary = {
  revenue: number | null;
  sessions: number | null;
  engagedSessions: number | null;
  eventCount: number | null;
  avgEngagementSeconds: number | null;
};

export type GaTimeseriesPoint = {
  date: string;
  revenue: number;
  sessions: number;
  engagedSessions: number;
};

export type FunnelSummary = {
  entries: number | null;
  completions: number | null;
  conversionRate: number | null;
  upsellOffers: number | null;
  upsellAccepts: number | null;
  upsellTakeRate: number | null;
};

export type FunnelTimeseriesPoint = {
  date: string;
  entries: number;
  completions: number;
  conversionRate: number | null;
};

export type CommerceTelemetry = {
  range: {
    preset: RangePreset;
    startDate: string;
    endDate: string;
  };
  woo?: {
    summary: WooSummary;
    timeseries: WooTimeseriesPoint[];
  };
  ga4?: {
    summary: GaSummary;
    timeseries: GaTimeseriesPoint[];
  };
  funnel?: {
    summary: FunnelSummary;
    timeseries: FunnelTimeseriesPoint[];
  };
};

export type DashboardOverviewResponse = {
  ok: boolean;
  timestamp: string;
  range: {
    preset: RangePreset;
    startDate: string;
    endDate: string;
  };
  headerMetrics: HeaderMetric[];
  executiveCommand: ExecutiveCommand;
  warRoom: WarRoomState;
  revenueEngine: RevenueEngine;
  brandPower: BrandPower;
  opportunityRadar: OpportunityRadar;
  pipelinePanel: PipelinePanel;
  survivalStrip: SurvivalStrip;
  tasks: TaskSummary[];
  schedulerJobs: SchedulerJobHealth[];
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
  actionQueue: ActionQueue;
  systemHealth: SystemHealth;
  agentUpdateFeed: AgentUpdateFeedItem[];
  commerceTelemetry?: CommerceTelemetry;

  // New dashboard visuals
  agentKpis: AgentKpiBucket[];
  ideaBoard: IdeaBoard;
  ceoQuestionDesk: CeoQuestionDesk;
};
