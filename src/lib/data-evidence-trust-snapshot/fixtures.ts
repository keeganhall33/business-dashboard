import type { TrustSnapshotInput } from "./contracts";

export const trustSnapshotFixtures: TrustSnapshotInput[] = [
  {
    sourceId: "woo.completed_orders",
    sourceClass: "FIRST_PARTY_COMMERCE",
    connectionStatus: "CONNECTED",
    freshnessState: "FRESH",
    lastUpdated: "2026-08-17T16:45:00.000Z",
    evidenceQuality: "HIGH",
    coverageState: "COMPLETE",
    truthState: "KNOWN",
    coverageGap: null,
    nextBestSourceOrResearchAction: "Keep Woo order telemetry in the executive trust card and monitor freshness drift.",
    provenanceClass: "first_party",
    evidenceReferenceIds: ["ev_fixture_woo_completed_orders_snapshot"],
    notes: ["Revenue and order facts are known for dashboard fixture purposes."]
  },
  {
    sourceId: "ga4.web_analytics",
    sourceClass: "FIRST_PARTY_ANALYTICS",
    connectionStatus: "DEGRADED",
    freshnessState: "STALE",
    lastUpdated: "2026-08-14T09:10:00.000Z",
    evidenceQuality: "MEDIUM",
    coverageState: "PARTIAL",
    truthState: "STALE",
    coverageGap: "Traffic and conversion mix may not represent the current window.",
    nextBestSourceOrResearchAction: "Refresh GA4 selected-window analytics before making acquisition or conversion recommendations.",
    provenanceClass: "first_party",
    evidenceReferenceIds: ["ev_fixture_ga4_web_analytics_snapshot"],
    notes: ["Stale analytics remain visible instead of being treated as unavailable or false."]
  },
  {
    sourceId: "art_market.collector_research",
    sourceClass: "EXTERNAL_MARKET_RESEARCH",
    connectionStatus: "NOT_CONFIGURED",
    freshnessState: "UNKNOWN",
    lastUpdated: null,
    evidenceQuality: "UNKNOWN",
    coverageState: "GAP",
    truthState: "UNKNOWN",
    coverageGap: "No live collector research connector exists in this slice.",
    nextBestSourceOrResearchAction: "Add a reviewed market-research fixture or manual research packet before drawing collector-demand conclusions.",
    provenanceClass: "manual_fixture",
    evidenceReferenceIds: [],
    notes: ["UNKNOWN is explicit and must not collapse to NONE, false, or zero."]
  },
  {
    sourceId: "meta.ads_attribution",
    sourceClass: "PAID_MEDIA_PLATFORM",
    connectionStatus: "CONNECTED",
    freshnessState: "FRESH",
    lastUpdated: "2026-08-17T16:30:00.000Z",
    evidenceQuality: "CONFLICTED",
    coverageState: "CONFLICTED",
    truthState: "CONFLICTED",
    coverageGap: "Platform attribution conflicts with commerce-source revenue attribution.",
    nextBestSourceOrResearchAction: "Compare Meta delivery, Woo order source, and GA4 session evidence before scaling or cutting spend.",
    provenanceClass: "first_party",
    evidenceReferenceIds: ["ev_fixture_meta_delivery_snapshot", "ev_fixture_woo_attribution_counterpoint"],
    notes: ["Conflicting evidence is surfaced as a decision risk, not averaged away."]
  }
];
