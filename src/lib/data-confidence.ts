import type { DashboardOverviewResponse } from "@/lib/types/dashboard";
import { hasDefensibleMetaAttribution } from "@/lib/meta/meta-attribution";

type WebsiteGaSnapshot = {
  ga4?: {
    revenue?: number | null;
    orders?: number | null;
    purchases?: number | null;
  };
};

type GaCommerceSummary = {
  summary?: {
    sessions?: number | null;
    ecommercePurchases?: number | null;
    revenue?: number | null;
  };
};

export type ConfidenceDomain =
  | "woo"
  | "ga4"
  | "meta"
  | "funnelkit"
  | "industry"
  | "operations"
  | "pipeline"
  | "customer";

export type ConfidenceState =
  | "trusted"
  | "usable_with_caveats"
  | "insufficient_evidence"
  | "stale"
  | "unavailable"
  | "conflicting";

export type ConfidenceEntry = {
  id: ConfidenceDomain;
  label: string;
  state: ConfidenceState;
  freshnessHours: number | null;
  coverage: string;
  completeness: string;
  provenance: string;
  lastSuccess: string | null;
  lastVerified: string | null;
  warningCodes: string[];
  confidenceScore: number;
  executiveImpact: string;
  recommendedAction?: string;
  decisionImpact: string;
};

export type ConfidenceSummary = {
  entries: ConfidenceEntry[];
  partialDay: boolean;
  overall: { label: string; tone: "emerald" | "amber" | "rose"; rationale: string; state: ConfidenceState | "mixed"; lastRefresh: string | null };
  trustedSources: string[];
  caveatSources: string[];
  insufficientSources: string[];
  conflictingSources: string[];
  topRisk: ConfidenceEntry | null;
  decisionsAffected: string[];
  recommendedActions: Array<{ id: string; title: string; detail: string }>;
};

const DOMAIN_CONFIG: Record<ConfidenceDomain, { label: string; expectedFreshnessHours: number; provenance: string; impact: string }> = {
  woo: {
    label: "Woo",
    expectedFreshnessHours: 6,
    provenance: "WooCommerce completed orders",
    impact: "Revenue, orders, and product diagnostics"
  },
  ga4: {
    label: "GA4",
    expectedFreshnessHours: 6,
    provenance: "GA4 web analytics",
    impact: "Sessions, conversion, and acquisition mix"
  },
  meta: {
    label: "Meta",
    expectedFreshnessHours: 6,
    provenance: "Meta Ads snapshots",
    impact: "Paid media spend and ROAS decisions"
  },
  funnelkit: {
    label: "FunnelKit",
    expectedFreshnessHours: 12,
    provenance: "FunnelKit checkout telemetry",
    impact: "Checkout and upsell diagnostics"
  },
  industry: {
    label: "Industry Pulse",
    expectedFreshnessHours: 24,
    provenance: "Industry Pulse ingestion",
    impact: "Market opportunities and external signals"
  },
  operations: {
    label: "Operations",
    expectedFreshnessHours: 2,
    provenance: "Scheduler telemetry",
    impact: "Automation cadence and incident response"
  },
  pipeline: {
    label: "Pipeline",
    expectedFreshnessHours: 24,
    provenance: "Pipeline verification",
    impact: "Deal forecasting and next actions"
  },
  customer: {
    label: "Customer Intelligence",
    expectedFreshnessHours: 24,
    provenance: "Collector telemetry",
    impact: "Customer segmentation and outreach"
  }
};

const STATE_SCORE: Record<ConfidenceState, number> = {
  trusted: 1,
  usable_with_caveats: 0.7,
  stale: 0.5,
  conflicting: 0.35,
  insufficient_evidence: 0.2,
  unavailable: 0
};

const TONE_BY_STATE: Record<ConfidenceState | "mixed", "emerald" | "amber" | "rose"> = {
  trusted: "emerald",
  usable_with_caveats: "amber",
  stale: "amber",
  conflicting: "amber",
  insufficient_evidence: "rose",
  unavailable: "rose",
  mixed: "amber"
};

export function buildDataConfidenceModel(data: DashboardOverviewResponse): ConfidenceSummary {
  const timestamp = Date.parse(data.timestamp ?? new Date().toISOString());
  const partialDay = Boolean(data.executiveInsights?.brief?.pacificWindow?.includesPartialDay);
  const conflicts = detectConflicts(data);

  const entries: ConfidenceEntry[] = [
    evaluateWoo(data, timestamp, conflicts, partialDay),
    evaluateGa4(data, timestamp, conflicts, partialDay),
    evaluateMeta(data, timestamp, conflicts, partialDay),
    evaluateFunnel(data, timestamp, conflicts, partialDay),
    evaluateIndustry(data, timestamp),
    evaluateOperations(data, timestamp),
    evaluatePipeline(data, timestamp),
    evaluateCustomer(data, timestamp)
  ];

  const lastRefresh = deriveLastRefresh(entries);
  const scores = entries.map((entry) => entry.confidenceScore);
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
  const worst = entries
    .slice()
    .sort((a, b) => a.confidenceScore - b.confidenceScore)[0];
  const trustedSources = entries.filter((entry) => entry.state === "trusted").map((entry) => entry.label);
  const caveatSources = entries
    .filter((entry) => entry.state === "usable_with_caveats" || entry.state === "stale")
    .map((entry) => entry.label);
  const conflictingSources = entries.filter((entry) => entry.state === "conflicting").map((entry) => entry.label);
  const insufficientSources = entries
    .filter((entry) => entry.state === "insufficient_evidence" || entry.state === "unavailable")
    .map((entry) => entry.label);

  const overallState: ConfidenceState | "mixed" = worst?.state ?? "trusted";
  const tonalState: ConfidenceState | "mixed" = avgScore >= 0.75 ? "trusted" : avgScore >= 0.5 ? "mixed" : "unavailable";
  const hasCriticalGap = entries.some((entry) => entry.state === "insufficient_evidence" || entry.state === "unavailable");
  let tone = TONE_BY_STATE[tonalState];
  let overallLabel = avgScore >= 0.75 ? "High confidence" : avgScore >= 0.45 ? "Moderate confidence" : "Low confidence";
  if (hasCriticalGap && overallLabel === "High confidence") {
    overallLabel = "Moderate confidence";
    tone = "amber";
  }
  const rationale = worst && worst.state !== "trusted" ? `${worst.label} is ${stateLabel(worst.state)} (${worst.recommendedAction ?? worst.decisionImpact}).` : "All critical sources reporting.";

  const decisionsAffected = entries
    .filter((entry) => entry.state !== "trusted")
    .map((entry) => entry.decisionImpact);

  const recommendedActions = entries
    .filter((entry) => entry.state !== "trusted")
    .slice(0, 3)
    .map((entry) => ({
      id: `confidence-${entry.id}`,
      title: entry.recommendedAction ?? `Verify ${entry.label}`,
      detail: entry.executiveImpact
    }));

  return {
    entries,
    partialDay,
    overall: { label: overallLabel, tone, rationale, state: overallState, lastRefresh },
    trustedSources,
    caveatSources,
    insufficientSources,
    conflictingSources,
    topRisk: worst ?? null,
    decisionsAffected,
    recommendedActions
  };
}

export function getDomainConfidence(summary: ConfidenceSummary | undefined, domain: ConfidenceDomain) {
  return summary?.entries.find((entry) => entry.id === domain);
}

export function mapStateToConfidenceLabel(state: ConfidenceState | undefined): "High" | "Medium" | "Low" | "Blocked" {
  if (!state) return "Medium";
  if (state === "trusted") return "High";
  if (state === "usable_with_caveats") return "Medium";
  if (state === "stale" || state === "conflicting") return "Low";
  return "Blocked";
}

function evaluateWoo(data: DashboardOverviewResponse, timestamp: number, conflicts: ConflictMap, partialDay: boolean): ConfidenceEntry {
  const metadata = data.telemetryMetadata?.woo;
  const health = data.telemetryHealth?.woo;
  const wooSummary = data.commerceTelemetry?.woo?.summary as
    | { revenue?: number | null; orders?: number | null; source?: string; completeness?: string; note?: string | null }
    | undefined;

  const wooRevenue = data.websiteConversion?.wooCommerce?.netRevenue ?? wooSummary?.revenue ?? null;
  const wooOrders = wooSummary?.orders ?? null;
  const hasSnapshotDerived = wooSummary?.source === "snapshot_recent_orders";
  const snapshotCompleteness = wooSummary?.completeness === "partial" ? "partial" : wooSummary?.completeness === "complete" ? "complete" : "unknown";

  const rangeMismatch = Boolean(
    metadata?.requestedStartDate &&
      (metadata.requestedStartDate !== data.range.startDate || metadata.requestedEndDate !== data.range.endDate)
  );

  const reference = metadata?.generatedAt ?? metadata?.latestCompletedBusinessDate ?? data.websiteConversion?.generatedAt ?? null;
  const freshnessHours = reference ? hoursSince(reference, timestamp) : null;

  const warnings = [...(metadata?.warningCodes ?? []), ...(health?.warningCodes ?? []), ...(conflicts.woo ?? [])];

  const hasAnyWooData = wooRevenue != null || wooOrders != null;

  // Special handling: if selected-range Woo telemetry is stale but we have a recent-order snapshot,
  // do not claim Woo is fully unavailable. Instead, qualify commerce decisions only.
  if (hasSnapshotDerived && hasAnyWooData) {
    warnings.push("Selected-range Woo telemetry is stale.");
    warnings.push(
      snapshotCompleteness === "partial"
        ? "Recent-order snapshot data is available, but revenue and order totals are partial and may be understated."
        : "Recent-order snapshot data is available, but snapshot completeness is unknown."
    );

    if (rangeMismatch) warnings.push("Range mismatch");

    return buildEntry({
      domain: "woo",
      state: conflicts.woo?.length ? "conflicting" : "usable_with_caveats",
      freshnessHours,
      coverage: "Partial",
      completeness: snapshotCompleteness === "partial" ? "Partial totals" : snapshotCompleteness === "complete" ? "Complete totals" : "Unknown totals",
      provenance: "Woo selected-range telemetry + recent-order snapshot fallback",
      lastSuccess: reference,
      lastVerified: metadata?.latestCompletedBusinessDate ?? data.websiteConversion?.generatedAt ?? null,
      warningCodes: warnings,
      executiveImpact: DOMAIN_CONFIG.woo.impact,
      recommendedAction: "Refresh selected-range Woo telemetry.",
      decisionImpact:
        "Selected-range Woo telemetry is stale. Recent-order snapshot data is available, but revenue and order totals are partial and may be understated. Exact revenue, exact order count, AOV, target pacing, and period-over-period commerce comparison are unavailable."
    });
  }

  // Selected-range Woo telemetry without a verifiable coverage signal must be treated as unknown.
  if (wooSummary?.source === "selected_range_telemetry" && hasAnyWooData) {
    const note = typeof wooSummary.note === "string" && wooSummary.note.trim().length ? wooSummary.note : null;
    warnings.push(
      note ??
        "Selected-range Woo telemetry returned data, but its coverage and freshness could not be verified. Revenue and order totals may be incomplete."
    );

    if (rangeMismatch) warnings.push("Range mismatch");

    return buildEntry({
      domain: "woo",
      state: conflicts.woo?.length ? "conflicting" : "usable_with_caveats",
      freshnessHours,
      coverage: "Unknown",
      completeness: "Unknown coverage",
      provenance: "Selected-range Woo telemetry",
      lastSuccess: reference,
      lastVerified: metadata?.latestCompletedBusinessDate ?? data.websiteConversion?.generatedAt ?? null,
      warningCodes: warnings,
      executiveImpact: DOMAIN_CONFIG.woo.impact,
      recommendedAction: "Verify Woo ingestion coverage for this range.",
      decisionImpact:
        "Selected-range Woo telemetry returned data, but its coverage and freshness could not be verified. Revenue and order totals may be incomplete, so exact comparisons, AOV, and target pacing are unavailable."
    });
  }

  return evaluateTelemetryDomain({
    domain: "woo",
    hasData: hasAnyWooData,
    metadataTimestamp: metadata?.generatedAt,
    lastVerified: metadata?.latestCompletedBusinessDate ?? data.websiteConversion?.generatedAt ?? null,
    coverageStatus: metadata?.coverageStatus,
    healthStatus: health?.status,
    warnings: rangeMismatch ? [...warnings, "Range mismatch"] : warnings,
    conflicts: conflicts.woo,
    timestamp,
    partialDay,
    rangeMismatch
  });
}

function evaluateGa4(data: DashboardOverviewResponse, timestamp: number, conflicts: ConflictMap, partialDay: boolean): ConfidenceEntry {
  const metadata = data.telemetryMetadata?.ga4;
  const health = data.telemetryHealth?.ga4;
  const websiteGa = data.websiteConversion as WebsiteGaSnapshot | null;
  const gaCommerce = data.commerceTelemetry?.ga4 as GaCommerceSummary | undefined;
  const gaSessions = gaCommerce?.summary?.sessions ?? null;
  const gaRevenue = gaCommerce?.summary?.revenue ?? websiteGa?.ga4?.revenue ?? null;
  const telemetryLastVerified = data.commerceTelemetry?.range?.endDate ? `${data.commerceTelemetry.range.endDate}T00:00:00Z` : null;
  const rangeMismatch = Boolean(
    metadata?.requestedStartDate &&
      (metadata.requestedStartDate !== data.range.startDate || metadata.requestedEndDate !== data.range.endDate)
  );
  return evaluateTelemetryDomain({
    domain: "ga4",
    hasData: gaSessions != null || gaRevenue != null,
    metadataTimestamp: metadata?.generatedAt,
    lastVerified: metadata?.latestCompletedBusinessDate ?? telemetryLastVerified,
    coverageStatus: metadata?.coverageStatus,
    healthStatus: health?.status,
    warnings: [...(metadata?.warningCodes ?? []), ...(health?.warningCodes ?? []), ...(conflicts.ga4 ?? [])],
    conflicts: conflicts.ga4,
    timestamp,
    partialDay,
    rangeMismatch
  });
}

function evaluateMeta(data: DashboardOverviewResponse, timestamp: number, conflicts: ConflictMap, partialDay: boolean): ConfidenceEntry {
  const meta = data.metaAds;

  const deliveryAvailable = Boolean(
    meta?.summary?.spend != null ||
      meta?.summary?.impressions != null ||
      meta?.summary?.clicks != null ||
      (meta?.campaigns?.length ?? 0) > 0
  );
  const attributionAvailable = hasDefensibleMetaAttribution(meta ?? null);

  const warnings = [...(conflicts.meta ?? [])];
  if (deliveryAvailable && !attributionAvailable) {
    warnings.push("Meta delivery metrics are available, but purchase attribution is unavailable.");
  }

  return evaluateTelemetryDomain({
    domain: "meta",
    hasData: deliveryAvailable || attributionAvailable,
    metadataTimestamp: meta?.generatedAt,
    lastVerified: meta?.generatedAt ?? null,
    coverageStatus:
      meta?.status === "BROKEN"
        ? "no_data"
        : meta?.status === "PARTIAL" || (deliveryAvailable && !attributionAvailable)
          ? "partial"
          : "complete",
    healthStatus:
      meta?.status === "BROKEN"
        ? "critical"
        : meta?.status === "PARTIAL" || (deliveryAvailable && !attributionAvailable)
          ? "warning"
          : "healthy",
    warnings,
    conflicts: conflicts.meta,
    timestamp,
    partialDay
  });
}

function evaluateFunnel(data: DashboardOverviewResponse, timestamp: number, conflicts: ConflictMap, partialDay: boolean): ConfidenceEntry {
  const metadata = data.telemetryMetadata?.funnelkit;
  const funnel = data.commerceTelemetry?.funnel;
  const rangeMismatch = Boolean(
    metadata?.requestedStartDate &&
      (metadata.requestedStartDate !== data.range.startDate || metadata.requestedEndDate !== data.range.endDate)
  );
  return evaluateTelemetryDomain({
    domain: "funnelkit",
    hasData: Boolean(funnel?.summary?.entries),
    metadataTimestamp: metadata?.generatedAt ?? funnel?.summary ? `${data.commerceTelemetry?.range?.endDate}T00:00:00Z` : null,
    lastVerified: metadata?.latestCompletedBusinessDate ?? data.commerceTelemetry?.range?.endDate ?? null,
    coverageStatus: metadata?.coverageStatus,
    healthStatus: metadata?.freshnessStatus === "stale" ? "warning" : "healthy",
    warnings: conflicts.funnelkit ?? [],
    conflicts: conflicts.funnelkit,
    timestamp,
    partialDay,
    rangeMismatch
  });
}

function evaluateIndustry(data: DashboardOverviewResponse, timestamp: number): ConfidenceEntry {
  const snapshot = data.industryPulseSnapshot;
  const lastUpdated = snapshot?.generatedAt ?? snapshot?.alerts?.[0]?.date ?? null;
  const hasSources = Boolean(snapshot?.sources?.length);
  const hasUrls = (snapshot?.alerts ?? []).every((alert) => Boolean(alert.sourceUrl));
  const hours = lastUpdated ? hoursSince(lastUpdated, timestamp) : null;
  let state: ConfidenceState = "trusted";
  const warnings: string[] = [];
  if (!snapshot || snapshot.alerts.length === 0) {
    state = "insufficient_evidence";
    warnings.push("No industry alerts");
  } else if (!hasSources || !hasUrls) {
    state = "usable_with_caveats";
    warnings.push("Missing sourcing for some alerts");
  }
  if (hours != null && hours > DOMAIN_CONFIG.industry.expectedFreshnessHours * 2) {
    state = "stale";
    warnings.push("Out of date");
  }

  return buildEntry({
    domain: "industry",
    state,
    freshnessHours: hours,
    coverage: hasSources ? "Complete" : "Partial",
    completeness: hasUrls ? "Verified" : "Missing source URLs",
    provenance: DOMAIN_CONFIG.industry.provenance,
    lastSuccess: lastUpdated,
    lastVerified: lastUpdated,
    warningCodes: warnings,
    executiveImpact: DOMAIN_CONFIG.industry.impact,
    recommendedAction: state === "trusted" ? undefined : "Verify latest Industry Pulse alerts",
    decisionImpact: "Delay industry-dependent decisions until sourcing is verified."
  });
}

function evaluateOperations(data: DashboardOverviewResponse, timestamp: number): ConfidenceEntry {
  const summary = data.schedulerSummary;
  const lastRun = summary?.lastUpdatedAt ?? null;
  const hours = lastRun ? hoursSince(lastRun, timestamp) : null;
  let state: ConfidenceState;
  const warnings: string[] = [];
  if (!summary && (data.schedulerJobs?.length ?? 0) === 0) {
    state = "insufficient_evidence";
    warnings.push("Scheduler diagnostics unavailable");
  } else if (summary?.status === "BROKEN" || summary?.failingCount) {
    state = summary.status === "BROKEN" ? "unavailable" : "stale";
    warnings.push(summary.status === "BROKEN" ? "Scheduler offline" : "Jobs failing");
  } else if (hours != null && hours > DOMAIN_CONFIG.operations.expectedFreshnessHours * 2) {
    state = "stale";
    warnings.push("No recent scheduler heartbeat");
  } else {
    state = "trusted";
  }

  return buildEntry({
    domain: "operations",
    state,
    freshnessHours: hours,
    coverage: summary ? "Complete" : "Unknown",
    completeness: summary?.cronEnabled === false ? "Cron disabled" : "Verified",
    provenance: DOMAIN_CONFIG.operations.provenance,
    lastSuccess: lastRun,
    lastVerified: lastRun,
    warningCodes: warnings,
    executiveImpact: DOMAIN_CONFIG.operations.impact,
    recommendedAction: state === "trusted" ? undefined : "Verify automation telemetry",
    decisionImpact: "Automation cadence decisions require reliable scheduler telemetry."
  });
}

function evaluatePipeline(data: DashboardOverviewResponse, timestamp: number): ConfidenceEntry {
  const summary = data.pipelinePanel?.verificationSummary;
  const totals = summary?.total ?? 0;
  const verified = summary?.verifiedActive ?? 0;
  const ratio = totals === 0 ? 0 : verified / totals;
  let state: ConfidenceState;
  const warnings: string[] = [];
  if (!summary || totals === 0) {
    state = "insufficient_evidence";
    warnings.push("No verified pipeline records");
  } else if (ratio < 0.3) {
    state = "unavailable";
    warnings.push("Most pipeline entries unverified");
  } else if (ratio < 0.7) {
    state = "usable_with_caveats";
    warnings.push("Verification incomplete");
  } else {
    state = "trusted";
  }

  const lastVerified = (data.pipelinePanel?.deals ?? [])
    .map((deal) => deal.lastVerifiedAt || deal.nextStepDueAt)
    .filter(Boolean)
    .sort()
    .pop();
  const freshness = lastVerified ? hoursSince(lastVerified, timestamp) : null;
  if (freshness != null && freshness > DOMAIN_CONFIG.pipeline.expectedFreshnessHours * 2 && state === "trusted") {
    state = "stale";
    warnings.push("Pipeline data old");
  }

  return buildEntry({
    domain: "pipeline",
    state,
    freshnessHours: freshness,
    coverage: totals ? "Complete" : "Unknown",
    completeness: `${verified} of ${totals} verified`,
    provenance: DOMAIN_CONFIG.pipeline.provenance,
    lastSuccess: lastVerified ?? null,
    lastVerified: lastVerified ?? null,
    warningCodes: warnings,
    executiveImpact: DOMAIN_CONFIG.pipeline.impact,
    recommendedAction: state === "trusted" ? undefined : "Verify deal stages before forecasting",
    decisionImpact: "Delay deal-value decisions until pipeline verification improves."
  });
}

function evaluateCustomer(data: DashboardOverviewResponse, timestamp: number): ConfidenceEntry {
  const telemetry = data.collectorTelemetry;
  const status = telemetry?.status ?? "PARTIAL";
  let state: ConfidenceState;
  const warnings: string[] = [];
  if (!telemetry) {
    state = "insufficient_evidence";
    warnings.push("Collector import missing");
  } else if (status === "BROKEN") {
    state = "unavailable";
    warnings.push("Collector telemetry broken");
  } else if (status === "PARTIAL") {
    state = "usable_with_caveats";
    warnings.push("Customer history incomplete");
  } else {
    state = "trusted";
  }

  const lastSuccess = telemetry?.lastImportedAt ?? telemetry?.lastTouch?.newest ?? null;
  const freshness = lastSuccess ? hoursSince(lastSuccess, timestamp) : null;
  if (freshness != null && freshness > DOMAIN_CONFIG.customer.expectedFreshnessHours * 2 && state === "trusted") {
    state = "stale";
    warnings.push("Customer data old");
  }

  return buildEntry({
    domain: "customer",
    state,
    freshnessHours: freshness,
    coverage: telemetry ? "Complete" : "Unknown",
    completeness: telemetry ? telemetry.sourceNote ?? "" : "No import",
    provenance: DOMAIN_CONFIG.customer.provenance,
    lastSuccess,
    lastVerified: telemetry?.lastImportedAt ?? null,
    warningCodes: warnings,
    executiveImpact: DOMAIN_CONFIG.customer.impact,
    recommendedAction: state === "trusted" ? undefined : "Complete customer-history import",
    decisionImpact: "Customer segmentation should pause until telemetry is complete."
  });
}

function evaluateTelemetryDomain(args: {
  domain: ConfidenceDomain;
  hasData: boolean;
  metadataTimestamp: string | null | undefined;
  lastVerified: string | null;
  coverageStatus?: string;
  healthStatus?: string | null;
  warnings: string[];
  conflicts?: string[];
  timestamp: number;
  partialDay: boolean;
  rangeMismatch?: boolean;
}): ConfidenceEntry {
  const config = DOMAIN_CONFIG[args.domain];
  const reference = args.metadataTimestamp ?? args.lastVerified ?? null;
  const freshnessHours = reference ? hoursSince(reference, args.timestamp) : null;
  const warnings = [...args.warnings];
  let state: ConfidenceState;
  if (!args.hasData) {
    state = args.metadataTimestamp ? "stale" : "unavailable";
  } else if (args.conflicts && args.conflicts.length) {
    state = "conflicting";
  } else if (freshnessHours != null && freshnessHours > config.expectedFreshnessHours * 2) {
    state = "stale";
  } else if (args.healthStatus === "warning" || args.coverageStatus === "partial") {
    state = "usable_with_caveats";
  } else {
    state = "trusted";
  }

  if (args.healthStatus === "critical") {
    state = "stale";
  }

  if (!reference && args.hasData) {
    state = "insufficient_evidence";
  }

  if (args.rangeMismatch) {
    state = state === "unavailable" ? state : "usable_with_caveats";
    warnings.push("Range mismatch");
  }

  return buildEntry({
    domain: args.domain,
    state,
    freshnessHours,
    coverage: describeCoverage(args.coverageStatus),
    completeness: args.healthStatus ? args.healthStatus.toUpperCase() : "Verified",
    provenance: config.provenance,
    lastSuccess: reference,
    lastVerified: args.lastVerified,
    warningCodes: warnings,
    executiveImpact: config.impact,
    recommendedAction: deriveRecommendation(args.domain, state),
    decisionImpact: deriveDecisionImpact(args.domain, state)
  });
}

function buildEntry(input: {
  domain: ConfidenceDomain;
  state: ConfidenceState;
  freshnessHours: number | null;
  coverage: string;
  completeness: string;
  provenance: string;
  lastSuccess: string | null;
  lastVerified: string | null;
  warningCodes: string[];
  executiveImpact: string;
  recommendedAction?: string;
  decisionImpact: string;
}): ConfidenceEntry {
  return {
    id: input.domain,
    label: DOMAIN_CONFIG[input.domain].label,
    state: input.state,
    freshnessHours: input.freshnessHours,
    coverage: input.coverage,
    completeness: input.completeness,
    provenance: input.provenance,
    lastSuccess: input.lastSuccess,
    lastVerified: input.lastVerified,
    warningCodes: input.warningCodes,
    confidenceScore: STATE_SCORE[input.state],
    executiveImpact: input.executiveImpact,
    recommendedAction: input.recommendedAction,
    decisionImpact: input.decisionImpact
  };
}

function describeCoverage(status?: string) {
  if (!status || status === "complete") return "Complete";
  if (status === "partial") return "Partial";
  if (status === "no_data") return "No data";
  return "Unknown";
}

function deriveRecommendation(domain: ConfidenceDomain, state: ConfidenceState) {
  if (state === "trusted") return undefined;
  if (state === "conflicting") return `Reconcile ${DOMAIN_CONFIG[domain].label} with related sources.`;
  if (state === "stale") return `Refresh ${DOMAIN_CONFIG[domain].label} data.`;
  if (state === "usable_with_caveats") return `Review ${DOMAIN_CONFIG[domain].label} caveats before deciding.`;
  if (state === "insufficient_evidence" || state === "unavailable") return `Restore ${DOMAIN_CONFIG[domain].label} telemetry.`;
  return undefined;
}

function deriveDecisionImpact(domain: ConfidenceDomain, state: ConfidenceState) {
  if (state === "trusted") return `${DOMAIN_CONFIG[domain].label} supports current decisions.`;
  if (state === "conflicting") return `${DOMAIN_CONFIG[domain].label} conflicts with related data; delay dependent decisions.`;
  if (state === "stale") return `${DOMAIN_CONFIG[domain].label} is stale; refresh before acting.`;
  if (state === "usable_with_caveats") return `${DOMAIN_CONFIG[domain].label} has caveats; double-check metrics before acting.`;
  if (state === "insufficient_evidence" || state === "unavailable") return `${DOMAIN_CONFIG[domain].label} unavailable; decisions relying on it are blocked.`;
  return `${DOMAIN_CONFIG[domain].label} requires review.`;
}

function detectConflicts(data: DashboardOverviewResponse): ConflictMap {
  const conflicts: ConflictMap = {};
  const websiteSnapshot = data.websiteConversion as WebsiteGaSnapshot | null;
  const gaCommerce = data.commerceTelemetry?.ga4 as GaCommerceSummary | undefined;
  const wooRevenue = data.websiteConversion?.wooCommerce?.netRevenue ?? data.commerceTelemetry?.woo?.summary?.revenue;
  const gaRevenue = gaCommerce?.summary?.revenue ?? websiteSnapshot?.ga4?.revenue ?? null;
  if (isConflicting(wooRevenue, gaRevenue, 0.2)) {
    addConflict(conflicts, "woo", "Revenue delta vs GA4");
    addConflict(conflicts, "ga4", "Revenue delta vs Woo");
  }
  const wooOrders = data.websiteConversion?.wooCommerce?.paidOrdersInWindow ?? data.commerceTelemetry?.woo?.summary?.orders;
  const gaPurchases = gaCommerce?.summary?.ecommercePurchases ?? websiteSnapshot?.ga4?.purchases ?? websiteSnapshot?.ga4?.orders ?? null;
  if (isConflicting(wooOrders, gaPurchases, 0.25)) {
    addConflict(conflicts, "woo", "Order delta vs GA4");
    addConflict(conflicts, "ga4", "Purchase delta vs Woo");
  }
  const metaPurchases = data.metaAds?.summary?.purchases;
  if (isConflicting(metaPurchases, wooOrders, 0.3)) {
    addConflict(conflicts, "meta", "Meta conversions mismatch Woo orders");
    addConflict(conflicts, "woo", "Woo orders mismatch Meta conversions");
  }
  return conflicts;
}

type ConflictMap = Partial<Record<ConfidenceDomain, string[]>>;

function addConflict(map: ConflictMap, domain: ConfidenceDomain, reason: string) {
  if (!map[domain]) {
    map[domain] = [];
  }
  map[domain]!.push(reason);
}

function isConflicting(a?: number | null, b?: number | null, threshold = 0.2) {
  if (a == null || b == null || a === 0) return false;
  const diff = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
  return diff > threshold;
}

function hoursSince(iso: string | null | undefined, referenceMs: number) {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.abs(referenceMs - parsed) / (1000 * 60 * 60);
}

function deriveLastRefresh(entries: ConfidenceEntry[]) {
  const timestamps = entries.map((entry) => entry.lastSuccess).filter(Boolean) as string[];
  if (!timestamps.length) return null;
  return timestamps.sort().pop() ?? null;
}

function stateLabel(state: ConfidenceState) {
  return state.replace(/_/g, " ");
}
