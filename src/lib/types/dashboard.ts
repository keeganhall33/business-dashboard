export type MetricStatus = "healthy" | "on_track" | "warning" | "critical";

export type RangePreset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "90d"
  | "month_to_date"
  | "previous_month"
  | "year_to_date"
  | "custom";

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
  comparisonValue?: number | null;
  comparisonLabel?: string | null;
  targetLabel?: string | null;
  severityLabel?: string | null;
  trendLabel?: string | null;
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
  severityLabel?: string | null;
  trendLabel?: string | null;

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

export type OpportunityVerificationStatus =
  | "unverified"
  | "verified_active"
  | "verified_on_hold"
  | "verified_complete"
  | "verified_declined"
  | "invalid"
  | "stale";

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
  verificationStatus: OpportunityVerificationStatus;
  verificationSource?: string | null;
  verificationNotes?: string | null;
  lastVerifiedAt?: string | null;
  lastVerifiedBy?: string | null;
  valueBasis?: string | null;
  confidence?: number | null;
  supportingDocs?: DeliverableLink[] | null;
};

export type OpportunityRadar = {
  activeCount: number;
  readyForOutreachCount: number;
  topOpportunities: Opportunity[];
  nextFiveMoves: string[];
};

export type PipelineVerificationSummary = {
  total: number;
  verifiedActive: number;
  onHold: number;
  complete: number;
  declined: number;
  invalid: number;
  stale: number;
  unverified: number;
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
  verificationSummary: PipelineVerificationSummary;
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

export type TelemetrySource = "woo" | "ga4" | "funnelkit" | "meta";

export type TelemetryMetadata = {
  source: TelemetrySource;
  requestedStartDate: string;
  requestedEndDate: string;
  timezone: string;
  generatedAt?: string | null;
  freshnessStatus: "fresh" | "stale" | "no_data" | "unknown";
  coverageStatus: "complete" | "partial" | "unknown";
  includesPartialDay: boolean;
  includesFutureDates: boolean;
  latestCompletedBusinessDate?: string | null;
  warningCodes: string[];
};

export type TelemetryHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type TelemetryHealth = {
  source: TelemetrySource;
  status: TelemetryHealthStatus;
  reasons: string[];
  warningCodes: string[];
};

export type TrendDirection = "up" | "down" | "flat";
export type TrendMagnitude = "minor" | "moderate" | "major";

export type TrendComparison = {
  id: string;
  source: TelemetrySource;
  metric: string;
  label: string;
  currentValue: number | null;
  previousValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  direction: TrendDirection;
  magnitude: TrendMagnitude;
  anomaly: boolean;
  caveat?: string | null;
};

export type ExecutiveBrief = {
  pacificWindow: {
    startDate: string;
    endDate: string;
    includesPartialDay: boolean;
  };
  warnings: string[];
  topChanges: TrendComparison[];
  sourceFreshness: Array<{
    source: TelemetrySource;
    status: TelemetryHealthStatus;
    summary: string;
  }>;
  attention: string | null;
};

export type ExecutiveInsightsPayload = {
  brief: ExecutiveBrief | null;
  trends: TrendComparison[];
};

export type TelemetryHealthEvent = {
  id: string;
  source: TelemetrySource;
  observedAt: string;
  requestedStartDate: string;
  requestedEndDate: string;
  healthStatus: TelemetryHealthStatus;
  freshnessStatus: TelemetryMetadata["freshnessStatus"];
  coverageStatus: TelemetryMetadata["coverageStatus"];
  warningCodes: string[];
  fallback: boolean;
  latencyMs?: number | null;
  deploymentVersion?: string | null;
};

export type WebsiteConversionSnapshot = {
  generatedAt: string;
  ga4?: {
    totalUsers?: number;
    sessions?: number;
    eventCount?: number;
    viewItemEvents?: number | null;
    addToCartEvents?: number | null;
    beginCheckoutEvents?: number | null;
    purchaseEvents?: number | null;
    ecommercePurchases?: number | null;
    purchaseRevenue?: number | null;
    deviceBreakdown?: Array<{ label: string; sessions: number }>;
    channelBreakdown?: Array<{ label: string; sessions: number }>;
    warnings?: string[];
    funnelRates?: {
      viewToCart?: number | null;
      cartToCheckout?: number | null;
      checkoutToPurchase?: number | null;
      sessionToPurchase?: number | null;
    } | null;
  };
  wooCommerce?: {
    paidOrdersInWindow?: number | null;
    grossOrderRevenue?: number | null;
    merchandiseRevenue?: number | null;
    shippingRevenue?: number | null;
    taxCollected?: number | null;
    discountTotal?: number | null;
    netRevenue?: number | null;
    grossAov?: number | null;
    netAov?: number | null;
    refundTotal?: number | null;
    refundCount?: number | null;
    refundDefinition?: string | null;
    refundDataComplete?: boolean | null;
    refundWindow?: {
      windowStart?: string | null;
      windowEndExclusive?: string | null;
      timezone?: string | null;
    } | null;
    observedRefundRange?: {
      firstRefund?: string | null;
      lastRefund?: string | null;
    } | null;
    observedPaidRange?: {
      earliestPaid?: string | null;
      latestPaid?: string | null;
    } | null;
    refundRate?: number | null;
    discountRate?: number | null;
    topProducts?: Array<{ name: string; units: number; revenue: number }>;
    recentOrders?: Array<{ id: number | string | null; status: string | null; total: number | null; currency: string | null; date_paid?: string | null; date_paid_gmt?: string | null }>;
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

export type SocialInsight = {
  platform: string;
  title: string;
  format: string;
  date: string;
  metrics: string;
  engagement: string;
  collectorSignal?: string | null;
  why: string;
  nextIdea: string;
  confidence: "high" | "medium" | "low";
  source?: string | null;
  status: string;
};

export type SocialIntelligenceSnapshot = {
  generatedAt: string;
  insights: SocialInsight[];
  mode?: "LIVE" | "PARTIAL" | "FALLBACK" | "BROKEN";
  source?: string | null;
  sourceDetails?: Record<string, unknown>;
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
  agentSla: AgentSlaSnapshot[];
  approvalBottlenecks: ApprovalBottleneck;
  actionQueue: ActionQueue;
  systemHealth: SystemHealth;
  agentUpdateFeed: AgentUpdateFeedItem[];
  commerceTelemetry?: CommerceTelemetry;
  websiteConversion?: WebsiteConversionSnapshot | null;
  metaAds?: MetaAdsSnapshot | null;
  executiveSummary?: ExecutiveSummary | null;
  socialIntelligence?: SocialIntelligenceSnapshot | null;
  industryPulseSnapshot?: IndustryPulseSnapshot | null;
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

  telemetryMetadata?: Partial<Record<TelemetrySource, TelemetryMetadata>>;
  telemetryHealth?: Partial<Record<TelemetrySource, TelemetryHealth>>;
  executiveInsights?: ExecutiveInsightsPayload | null;
  telemetryHealthHistory?: TelemetryHealthEvent[];
};
