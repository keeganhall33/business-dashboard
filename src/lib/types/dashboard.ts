export type MetricStatus = "healthy" | "on_track" | "warning" | "critical";

export type RangePreset = "7d" | "30d" | "90d" | "180d" | "365d" | "ytd" | "custom";

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
  isDiagnosticEmpty?: boolean;
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
  source?: string | null;
  priority?: number | null;
  supportingDocs?: DeliverableLink[] | null;
};

export type CollectorTelemetrySnapshot = {
  status: "BROKEN" | "PARTIAL" | "LIVE";
  statusLabel: string;
  statusDetail: string;
  freshnessCopy: string;
  totals: {
    totalRecords: number;
    wooRecords: number;
    manualRecords: number;
    estimatedValueUsd: number;
  };
  wooSliceValueUsd: number;
  tiers: Record<string, number>;
  priorities: Record<string, number>;
  relationships: Record<string, number>;
  lastTouch: {
    newest: string | null;
    oldest: string | null;
    freshnessDays: number | null;
    freshnessDaysRounded: number | null;
  };
  lastImportedAt: string | null;
  sourceNote: string;
};

export type SurvivalStrip = {
  configured: boolean;
  cashOnHand: number | null;
  survivalFloor: number;
  monthlyBurn: number | null;
  projected30dRevenue: number | null;
  runwayDays: number | null;
  lastUpdatedAt?: string | null;
  isStale?: boolean;
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

export type ProofOfWorkEntry = {
  taskId: string;
  taskTitle: string;
  agentKey: string | null;
  completedAt: string | null;
  summary: string | null;
  deliverableLinks: DeliverableLink[];
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
  timezone?: string | null;
  isActive?: boolean;
  lastRunAt: string | null;
  lastStatus: "running" | "completed" | "failed" | string | null;
  lastDurationSeconds: number | null;
  lastSummary?: string | null;
  lastError?: string | null;
  nextRunAt: string | null;
  source?: string | null;
};

export type SchedulerSummary = {
  status: "LIVE" | "PARTIAL" | "BROKEN";
  cronEnabled: boolean;
  jobCount: number;
  failingCount: number;
  missingTelemetryCount: number;
  lastUpdatedAt: string | null;
  source?: string | null;
};

export type SchedulerPilotJob = {
  jobKey: string;
  mode: string;
  lastRunAt?: string | null;
  alertCap?: number;
  cooldownHours?: number;
  createdCount?: number;
  skippedByReason?: Record<string, number>;
};

export type SchedulerObserveJob = {
  jobKey: string;
  mode: string;
  lastRunAt?: string | null;
};

export type SchedulerControlState = {
  cronStatus: string;
  activeSnapshotJobs: string[];
  pilotJobs: SchedulerPilotJob[];
  observeJobs: SchedulerObserveJob[];
  blockedJobs: string[];
  policySummary?: {
    maxAlertsPerRun: number;
    cooldownHours: number;
    eligibleCategories: string[];
    groupedCategories: string[];
    manualReviewCategories: string[];
  };
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

export type PreparedActionEvidence = {
  label: string;
  value?: string | null;
  url?: string | null;
};

export type PreparedAssetType =
  | "content_post_draft"
  | "meta_creative_brief"
  | "email_draft"
  | "checkout_audit_brief";

export type PreparedActionAsset = {
  label: string;
  value?: string | null;
  assetType?: PreparedAssetType;
  generatedAt?: string | null;
};

export type PreparedActionCategory =
  | "website"
  | "product"
  | "email"
  | "meta"
  | "tracking"
  | "collector"
  | "operations"
  | "partnership";

export type PreparedActionStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "rejected"
  | "manually_executed"
  | "archived";

export type PreparedAction = {
  id: string;
  title: string;
  category: PreparedActionCategory;
  sourcePanel: string;
  sourceInsightId?: string | null;
  sourceSnapshotAt?: string | null;
  sourceUrl?: string | null;
  dedupeKey?: string | null;
  whyItMatters: string;
  evidence: PreparedActionEvidence[];
  preparedAsset: PreparedActionAsset[];
  estimatedImpact?: string | null;
  riskLevel: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  dataLight: boolean;
  requiredApprovalAction: string;
  status: PreparedActionStatus;
  createdByAgent: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  approvalNote?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  manuallyExecutedAt?: string | null;
  manualExecutionNote?: string | null;
  archivedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

export type PerformanceMetricSnapshot = {
  current: number | null;
  previous: number | null;
};

export type PerformanceBaseline = {
  revenue: PerformanceMetricSnapshot;
  orders: PerformanceMetricSnapshot;
  aov: PerformanceMetricSnapshot;
  conversion: PerformanceMetricSnapshot;
  sessions: PerformanceMetricSnapshot;
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
  hasData?: boolean;
};

export type WooTimeseriesPoint = {
  date: string;
  revenue: number;
  orders: number;
};

export type WooProductPerformance = {
  productId: number | null;
  name: string;
  units: number;
  revenue: number;
};

export type WooRecentOrder = {
  orderId: number;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
};

export type WooRangeMeta = {
  rangeStart: string;
  rangeEnd: string;
  rangeDays: number;
  effectiveStart: string | null;
  dataStartDate: string | null;
  dataEndDate: string | null;
  source: string;
  isSelectedRange: boolean;
  isFallback: boolean;
  fallbackReason?: string | null;
  lastRefreshedAt?: string | null;
  bucketSize?: "day" | "week" | "month";
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
    summary?: WooSummary | null;
    timeseries?: WooTimeseriesPoint[];
    products?: WooProductPerformance[];
    recentOrders?: WooRecentOrder[];
    range?: WooRangeMeta | null;
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

export type WebsiteConversionSnapshot = {
  generatedAt: string;
  ga4?: {
    totalUsers?: number;
    sessions?: number;
    eventCount?: number;
    addToCartEvents?: number | null;
    beginCheckoutEvents?: number | null;
    ecommercePurchases?: number | null;
    purchaseRevenue?: number | null;
    viewItemEvents?: number | null;
    deviceBreakdown?: Array<{ label: string; sessions: number }>;
    channelBreakdown?: Array<{ label: string; sessions: number }>;
    warnings?: string[];
  };
  wooCommerce?: {
    totalRevenue?: number;
    orderCount?: number;
    averageOrderValue?: number;
    topProducts?: Array<{
      name: string;
      units: number;
      revenue: number;
      productId?: number | null;
      variationId?: number | null;
      sku?: string | null;
      orderCount?: number | null;
      averageUnitRevenue?: number | null;
      rank?: number | null;
    }>;
    recentOrders?: Array<{ id: number | string; status: string; total: number; currency: string; date: string; customer: string }>;
    rangeDays?: number | null;
    windowStart?: string | null;
    windowEnd?: string | null;
  };
};

export type MetaAdsCampaign = {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  roas: number | null;
};

export type MetaAdsSnapshot = {
  generatedAt: string;
  accountId: string;
  range: number; // days
  campaigns: MetaAdsCampaign[];
  summary: {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    purchaseValue: number;
    roas: number | null;
  };
  status?: "LIVE" | "PARTIAL" | "FALLBACK" | "BROKEN";
};

export type MarketingCommandSnapshot = {
  status: "LIVE" | "PARTIAL";
  generatedAt: string;
  range?: {
    preset: RangePreset;
    startDate: string;
    endDate: string;
  };
  priorRange?: {
    preset: RangePreset | "custom";
    startDate: string;
    endDate: string;
  };
  summary: string[];
  whatChanged: string[];
  whatMatters: string[];
  actions: Array<{ title: string; detail: string; metric: string }>;
  risks: string[];
  monitorTomorrow: string[];
  topConnectedInsights?: MarketingCommandInsight[];
  suppressedInsights?: MarketingCommandInsight[];
  comparisonSummary?: string[];
  metricDeltas?: MarketingCommandMetricDelta[];
  productMomentum?: MarketingCommandProductMomentum;
  promotionPlanner?: PromotionPlanner | null;
  collectorRadar?: CollectorRadar | null;
  confidenceSummary?: {
    high: number;
    medium: number;
    low: number;
  };
  sourceFreshnessSummary?: Array<{ source: string; hoursSince: number | null; stale: boolean; thresholdHours: number }>;
  insightBasis?: {
    current: RangeSummary;
    previous: RangeSummary;
  };
  salesGeography?: SalesGeographySnapshot | null;
};

export type MarketingCommandInsight = {
  id: string;
  title: string;
  insight: string;
  recommendedAction: string;
  sourcesUsed: string[];
  triggerMetrics: Record<string, unknown>;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  severity: "LOW" | "MEDIUM" | "HIGH";
  range?: {
    preset: RangePreset;
    startDate: string;
    endDate: string;
  };
  suppressReason?: string;
};

export type RangeSummary = {
  preset: RangePreset | "custom";
  startDate: string;
  endDate: string;
};

export type MarketingCommandMetricDelta = {
  metric: string;
  label: string;
  unit?: string | null;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction?: "up" | "down";
};

export type MarketingCommandProductMomentum = {
  winners: ProductMomentumEntry[];
  laggards: ProductMomentumEntry[];
  newBreakouts: ProductMomentumEntry[];
  concentration?: ProductConcentration | null;
  suppressedReasons?: string[];
} | null;

export type PromotionRecommendationCategory =
  | "PROMOTE_NOW"
  | "RISING_MOMENTUM"
  | "RELIABLE_SELLER"
  | "COOLING_OFF"
  | "HIDDEN_OPPORTUNITY"
  | "TRAFFIC_GAP"
  | "HISTORICAL_ANCHOR"
  | "HIGH_AOV_ANCHOR"
  | "COLLECTOR_FAVORITE";

export type PromotionRecommendation = {
  category: PromotionRecommendationCategory;
  productName: string;
  sku?: string | null;
  reason: string;
  supportingMetric?: string | null;
  suggestedAction: string;
  suggestedChannel?: string | null;
  confidence: "high" | "medium" | "low";
  directional?: boolean;
  revenue7d?: number | null;
  revenue30d?: number | null;
  units7d?: number | null;
  momentumPercent?: number | null;
  lastSoldDate?: string | null;
};

export type PromotionPlanner = {
  generatedAt: string;
  trafficInsightsAvailable: boolean;
  recommendations: PromotionRecommendation[];
};

export type ProductConversionClassification =
  | "HIGH_TRAFFIC_LOW_SALES"
  | "HIGH_CARTS_LOW_SALES"
  | "HIGH_SALES_LOW_TRAFFIC"
  | "HISTORICAL_ANCHOR"
  | "HIGH_AOV_OPPORTUNITY"
  | "CURRENT_MOMENTUM"
  | "INSTRUMENTATION_GAP"
  | "DATA_LIGHT";

export type ProductConversionChecklistItem = {
  label: string;
  status: "ready" | "todo" | "blocked";
  detail?: string;
};

export type ProductConversionRangeSnapshot = {
  range: RangePreset;
  label: string;
  source: string;
  confidence: "high" | "medium" | "low";
  gaPageViews?: number | null;
  gaViewItem?: number | null;
  gaAddToCart?: number | null;
  gaViewToCartRate?: number | null;
  wooRevenue?: number | null;
  wooUnits?: number | null;
  wooAov?: number | null;
  wooSalesToTrafficRatio?: number | null;
  notes?: string[];
};

export type ProductConversionRow = {
  productId: number | null;
  productName: string;
  slug: string;
  sku?: string | null;
  priceLabel?: string | null;
  classification: ProductConversionClassification;
  summary: string;
  recommendedAction: string;
  confidence: "high" | "medium" | "low";
  instrumentationGap?: boolean;
  tags?: string[];
  ranges: ProductConversionRangeSnapshot[];
  signals?: string[];
};

export type ProductConversionIntelligence = {
  generatedAt: string;
  supportedRanges: RangePreset[];
  rows: ProductConversionRow[];
  instrumentationChecklist: ProductConversionChecklistItem[];
  notes?: string[];
};

export type ChangeInsight = {
  id: string;
  title: string;
  detail: string;
  deltaLabel: string;
  tone: "positive" | "negative" | "neutral";
  source: string;
  comparisonLabel: string;
  badges?: string[];
};

export type CollectorRadarSegment =
  | "TOP_COLLECTOR"
  | "REPEAT_BUYER"
  | "LAPSED_COLLECTOR"
  | "RECENT_HIGH_VALUE"
  | "NURTURE_OPPORTUNITY";

export type CollectorRecommendation = {
  segment: CollectorRadarSegment;
  displayName: string;
  maskedEmail?: string | null;
  totalSpend: number;
  orderCount: number;
  lastOrderDate?: string | null;
  daysSinceLastOrder?: number | null;
  products?: string[];
  lookbackLabel?: string | null;
  reason: string;
  suggestedAction: string;
  confidence: "high" | "medium" | "low";
};

export type CollectorRadar = {
  generatedAt: string;
  segments: CollectorRecommendation[];
};

export type ProductMomentumEntry = {
  name: string;
  currentRevenue?: number | null;
  previousRevenue?: number | null;
  revenueDelta?: number | null;
  revenueDeltaPercent?: number | null;
  currentUnits?: number | null;
  previousUnits?: number | null;
  unitsDelta?: number | null;
  unitsDeltaPercent?: number | null;
  rankChange?: number | null;
  status?: "winner" | "laggard" | "breakout" | "steady";
  productId?: number | null;
  variationId?: number | null;
  sku?: string | null;
  orderCount?: number | null;
  averageUnitRevenue?: number | null;
  currentRank?: number | null;
  previousRank?: number | null;
};

export type ProductConcentration = {
  topProduct?: string | null;
  sharePercent?: number | null;
  revenue?: number | null;
};

export type SalesGeographyProduct = {
  name: string;
  units: number;
  revenue: number;
};

export type SalesGeographyLocation = {
  id: string;
  label: string;
  city: string | null;
  state: string | null;
  country: string | null;
  privacyLevel: "city" | "state" | "country" | "unknown";
  orderCount: number;
  revenue: number;
  units: number;
  topProducts: SalesGeographyProduct[];
};

export type SalesGeographySummary = {
  totalLocations: number;
  topCountry: { label: string; revenue: number } | null;
  topRegion: { label: string; revenue: number } | null;
  topCity: { label: string; revenue: number } | null;
  domesticRevenue: number;
  internationalRevenue: number;
};

export type SalesGeographyDelta = {
  id: string;
  label: string;
  privacyLevel: SalesGeographyLocation["privacyLevel"];
  currentRevenue: number;
  previousRevenue: number;
  revenueDelta: number;
  revenueDeltaPercent: number | null;
  currentOrders: number;
  previousOrders: number;
  direction: "new" | "rising" | "cooling";
};

export type SalesGeographyComparison = {
  currentRange: RangeSummary;
  previousRange?: RangeSummary | null;
  newLocations: SalesGeographyDelta[];
  risingLocations: SalesGeographyDelta[];
  coolingLocations: SalesGeographyDelta[];
  domesticDelta?: number | null;
  internationalDelta?: number | null;
  summary?: string[];
};

export type SalesGeographySnapshot = {
  range: RangeSummary;
  locations: SalesGeographyLocation[];
  summary: SalesGeographySummary;
  suppressedReasons?: string[];
  privacyNotes?: string[];
  source?: string | null;
  generatedAt?: string | null;
  comparison?: SalesGeographyComparison | null;
};

export type ExecutiveWebsiteSummary = {
  available: boolean;
  message?: string;
  revenue?: number | null;
  orders?: number | null;
  topProduct?: string | null;
  sessions?: number | null;
  purchases?: number | null;
  warnings?: string[];
};

export type ExecutiveMetaSummary = {
  available: boolean;
  message?: string;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  roas?: number | null;
  purchases?: number | null;
};

export type ExecutiveAction = {
  action: string;
  why: string;
  source?: string | null;
  confidence: 'high' | 'medium' | 'low';
  owner?: string | null;
  timing?: string | null;
};

export type ExecutiveSummary = {
  generatedAt: string;
  websiteSummary: ExecutiveWebsiteSummary;
  metaSummary: ExecutiveMetaSummary;
  comparison: {
    caveat: string;
    metaSpend: number | null;
    metaClicks: number | null;
    metaImpressions: number | null;
    ga4Sessions: number | null;
    wooRevenue: number | null;
    wooOrders: number | null;
    blendedRoas: number | null;
  };
  dataSourceHealth: Array<{ name: string; status: string; lastVerified: string | null; notes: string | null }>;
  agentHealth: Array<{ agent: string; cadence: string | null; lastRun: string | null; runStatus: string | null; nextRun: string | null; issues: string | null }>;
  automationHealth: Array<{ job: string; frequency: string | null; lastRun: string | null; result: string | null; nextRun: string | null; alertStatus: string | null; notes: string | null }>;
  actions: ExecutiveAction[];
  blockedItems: Array<{ name: string; detail: string | null }>;
  risks: string[];
  wins: string[];
  socialHighlights?: Array<{ platform: string; title: string; nextIdea: string; confidence: string }>;
  leadHighlights?: Array<{ name: string | null; organization: string | null; nextAction?: string | null; priority?: string | null; status?: string | null }>;
  leadWarmIntros?: Array<{ name: string | null; organization: string | null; nextAction?: string | null; priority?: string | null }>;
  leadResearchNeeded?: Array<{ name: string | null; organization: string | null; nextAction?: string | null; priority?: string | null }>;
  leadHygiene?: {
    missingData: number;
    stale: number;
    duplicates: number;
    highPriorityNoOwner: number;
  };
  leadActions?: Array<{ name: string | null; organization: string | null; nextAction?: string | null; priority?: string | null }>;
  cloudflare?: CloudflareTelemetrySnapshot | null;
  siteHealthWarnings?: string[];
  siteSecurityRisks?: string[];
  siteCacheIssues?: string[];
  decisionsNeeded: string[];
};

export type IndustryAlert = {
  title: string;
  category: string;
  source: string;
  sourceUrl?: string | null;
  date: string;
  summary?: string | null;
  whyItMatters: string;
  opportunity: string;
  recommendedAction: string;
  urgency: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  related: string[];
  owner?: string | null;
  status: string;
};

export type IndustryPulseSnapshot = {
  generatedAt: string;
  sources: Array<{ name: string; url: string; category: string }>;
  alerts: IndustryAlert[];
};

export type SocialContentSnapshot = {
  generatedAt: string;
  source: string;
  range: {
    from: string;
    to: string;
  };
  accounts: Array<{
    platform: string;
    accountName: string;
    accountId: string;
    followers: number | null;
  }>;
  posts: Array<{
    platform: string;
    postId: string;
    format: string;
    publishedAt: string;
    caption: string;
    hook: string | null;
    subject: string | null;
    artwork: string | null;
    permalink: string | null;
    thumbnailUrl: string | null;
    metrics: {
      views: number | null;
      impressions: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
      engagementRate: number | null;
    };
    takeaway: string;
  }>;
  summary?: {
    topPost?: string | null;
    topFormat?: string | null;
    topHookPattern?: string | null;
    underperformingFormat?: string | null;
    recommendedNextContent?: string | null;
  };
};

export type PartnershipOpportunity = {
  id: string;
  headline: string;
  category:
    | "sports"
    | "entertainment"
    | "sponsorship"
    | "charity"
    | "museum"
    | "brand_campaign"
    | "product_launch"
    | "collector_market"
    | "cultural_moment";
  subject: string;
  organization?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  observedAt: string;
  whyNow: string;
  whyItMatters: string;
  keeganAngle: string;
  recommendedArtworkOrConcept?: string | null;
  suggestedContactType?: string | null;
  suggestedPitchAngle?: string | null;
  urgency?: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  nextManualAction: string;
  shouldBecomePreparedAction?: boolean;
  notes?: string | null;
  status?: "sample" | "draft" | "live";
};

export type PartnershipOpportunitySnapshot = {
  generatedAt: string;
  source?: string | null;
  items: PartnershipOpportunity[];
};

export type CloudflareTelemetrySnapshot = {
  generatedAt: string;
  zone?: {
    name?: string | null;
    status?: string | null;
    plan?: string | null;
  } | null;
  traffic?: {
    requestsTotal?: number | null;
    bandwidthBytes?: number | null;
    cachedPercent?: number | null;
    uncachedRequests?: number | null;
    cacheHitRate?: number | null;
    bandwidthCachedBytes?: number | null;
    bandwidthUncachedBytes?: number | null;
  } | null;
  security?: {
    threats?: number | null;
    threatChangePct?: number | null;
    blockedRequests?: number | null;
    firewallEvents?: number | null;
    botRequests?: number | null;
    botScore?: number | null;
  } | null;
  performance?: {
    avgResponseTimeMs?: number | null;
    p95ResponseTimeMs?: number | null;
    cacheHitWarning?: boolean;
    latencyWarning?: boolean;
    notes?: string | null;
  } | null;
  top?: {
    countries?: Array<{ name: string; requests: number }>;
    paths?: Array<{ path: string; requests: number }>;
  } | null;
  warnings?: string[];
  status?: {
    mode: string;
    reason?: string;
    source?: string;
    zoneId?: string | null;
    accountId?: string | null;
  } | null;
  summary?: {
    cacheHitRate?: number | null;
    cacheHealth: 'healthy' | 'needs attention' | 'unknown';
    trafficHealth: 'active' | 'quiet' | 'unknown';
    securityPressure?: number | null;
    warnings?: string[];
  };
};

export type LeadIntelligenceSnapshot = {
  generatedAt: string;
  categories: string[];
  leads: Array<{
    name: string | null;
    organization: string | null;
    title: string | null;
    category: string;
    opportunityType: string;
    sourceUrl: string | null;
    evidence: string;
    whyItMatters: string;
    angle: string;
    introPath: string;
    pathType: string;
    priority: string;
    confidence: string;
    status: string;
    hubspotId?: string | null;
    nextAction: string;
    owner: string;
    lastReviewed: string;
    dueDate?: string | null;
    notes?: string;
    sourceType?: string;
    issues?: string[];
    daysSinceReview?: number | null;
  }>;
  summary: {
    categories: Array<{ category: string; count: number }>;
    warmIntros: Array<LeadIntelligenceSnapshot['leads'][number]>;
    topOpportunities: Array<LeadIntelligenceSnapshot['leads'][number]>;
    researchNeeded: Array<LeadIntelligenceSnapshot['leads'][number]>;
    missingData: Array<LeadIntelligenceSnapshot['leads'][number]>;
    stale: Array<LeadIntelligenceSnapshot['leads'][number]>;
    duplicates: Array<{ key: string; leads: Array<LeadIntelligenceSnapshot['leads'][number]> }>;
    recommendedActions: Array<{
      name: string | null;
      organization: string | null;
      priority: string | null;
      status: string | null;
      hubspotId?: string | null;
      pathType?: string | null;
      nextAction?: string | null;
      owner?: string | null;
    }>;
  };
  quality: {
    missingCategory: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    missingStatus: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    missingEvidence: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    missingNextAction: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    missingOwner: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    warmIntros: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    staleLeads: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    highPriorityNoOwner: Array<{ name: string | null; organization: string | null; priority: string | null; status: string | null; hubspotId?: string | null; pathType?: string | null; nextAction?: string | null; owner?: string | null }>;
    duplicates: Array<{ key: string; leads: Array<LeadIntelligenceSnapshot['leads'][number]> }>;
  };
  meta: {
    mode: 'hubspot-live' | 'snapshot';
    recordCounts: {
      manual: number;
      snapshot: number;
      hubspot: {
        companies: number;
        contacts: number;
        deals: number;
        tasks: number;
      };
    };
  };
};

export type AgentStatusPanelEntry = {
  agentName: string;
  cadence: string | null;
  lastRunAt: string | null;
  runStatus: string | null;
  nextRunAt: string | null;
  issues: string | null;
  dataSources: string[];
  actions: string[];
};

export type AutomationStatusEntry = {
  jobName: string;
  frequency: string | null;
  expectedRunTime: string | null;
  lastRunAt: string | null;
  lastResult: string | null;
  logLink: string | null;
  nextRunAt: string | null;
  alertStatus: string | null;
  notes: string | null;
};

export type DataSourceAccessEntry = {
  name: string;
  status: string;
  lastVerified: string | null;
  owner: string | null;
  credentialLocation: string | null;
  accessMethod: string | null;
  notes: string | null;
};

export type DashboardActionItem = {
  title: string;
  detail?: string | null;
  owner?: string | null;
  status?: string | null;
  dueAt?: string | null;
  tone?: "info" | "success" | "warning" | "danger";
};

export type LuxuryCollectibleKpis = {
  premiumEdition: {
    targetSellThroughPercent: number; // 0..100
    actualSellThroughPercent: number; // 0..100
    timeToSell: {
      avgDaysCurrent: number | null;
      avgDaysPrior: number | null;
    };
  };
  vipCollectors: {
    total: number;
    growth30d: number;
    retentionPercent: number | null; // 0..100
  };
  proofOfWork: {
    deliverablesCompletedPerWeek: number;
    evidenceHealthPercent: number | null; // 0..100
  };
  institutionalPipeline: {
    activeOpportunities: number;
    totalValueUsd: number;
  };
  pricingLadder: {
    floorPriceUsd: number;
    avgSellingPriceUsd: number;
  };
  pricingArchitecture: {
    tiers: Array<{
      tier: string;
      rangeUsd: {
        min: number;
        max: number | null;
      };
    }>;
  };
  narrativeStats: {
    storyContentEngagementPercent: number | null; // 0..100
    antiAiStorytellingOutputsPerWeek: number;
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
  proofOfWork: ProofOfWorkEntry[];
  schedulerJobs: SchedulerJobHealth[];
  schedulerSummary?: SchedulerSummary;
  schedulerPilotStatus?: SchedulerControlState | null;
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
  actionQueue: ActionQueue;
  systemHealth: SystemHealth;
  agentUpdateFeed: AgentUpdateFeedItem[];
  commerceTelemetry?: CommerceTelemetry;
  performanceBaseline?: PerformanceBaseline | null;
  marketingCommand?: MarketingCommandSnapshot | null;
  salesGeography?: SalesGeographySnapshot | null;
  websiteConversion?: WebsiteConversionSnapshot | null;
  metaAds?: MetaAdsSnapshot | null;
  executiveSummary?: ExecutiveSummary | null;
  socialContent?: SocialContentSnapshot | null;
  partnershipFeed?: PartnershipOpportunitySnapshot | null;
  cloudflare?: CloudflareTelemetrySnapshot | null;
  collectorTelemetry?: CollectorTelemetrySnapshot | null;
  agentStatusPanel?: AgentStatusPanelEntry[];
  automationStatusPanel?: AutomationStatusEntry[];
  dataSourceAccess?: DataSourceAccessEntry[];
  topActions?: DashboardActionItem[];
  blockedItems?: DashboardActionItem[];

  /** Luxury Cultural Collectible KPI bundle (optional for backwards compatibility). */
  luxuryCollectibles?: LuxuryCollectibleKpis;

  // New dashboard visuals
  agentKpis: AgentKpiBucket[];
  ideaBoard: IdeaBoard;
  ceoQuestionDesk: CeoQuestionDesk;
  productConversionIntelligence?: ProductConversionIntelligence | null;
  changeInsights?: ChangeInsight[];

  // Optional: enriched, curated opportunity digest (twice-daily ingestion)
  industryPulse?: {
    day: string; // YYYY-MM-DD (UTC)
    refreshedAtIso: string;
    items: Array<{
      id: string;
      day: string; // YYYY-MM-DD (UTC)
      source: string;
      headline: string;
      summary: string;
      collabIdea: string;
      whyNow: string;
      contactEmail: string | null;
      contactConfidence: number | null; // 0..1
      contactStatus: "verified" | "suspected" | "unknown";
      sourceUrl: string | null;
    }>;
  };

  preparedActions: PreparedAction[];
};
