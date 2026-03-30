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
};

export type OpportunityRadar = {
  activeCount: number;
  readyForOutreachCount: number;
  topOpportunities: Opportunity[];
  nextFiveMoves: string[];
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
  revenueEngine: RevenueEngine;
  brandPower: BrandPower;
  opportunityRadar: OpportunityRadar;
  tasks: TaskSummary[];
  systemHealth: SystemHealth;
  commerceTelemetry?: CommerceTelemetry;
};
