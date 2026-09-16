import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { LiveIntelligenceFeedV1 } from "../../src/components/intelligence-terminal/LiveIntelligenceFeedV1";
import {
  buildLiveIntelligenceFeedV1,
  LiveIntelligenceFeedError,
  type LiveIntelligenceCategoryV1,
  type LiveIntelligenceSignalV1,
  type LiveIntelligenceTruthStateV1
} from "../../src/lib/intelligence-terminal/live-intelligence-feed-v1";

const now = "2026-09-16T04:00:00Z";

function signal(id: string, overrides: Partial<LiveIntelligenceSignalV1> = {}): LiveIntelligenceSignalV1 {
  return {
    signalId: id, dedupeKey: id, occurredAt: "2026-09-16T03:00:00Z", category: "BUSINESS_PERFORMANCE", changeType: "MATERIAL_CHANGE",
    whatChanged: `${id} changed`, whyItMatters: `${id} affects the current business decision`, materiality: "HIGH", urgency: "SOON",
    truthState: "KNOWN", freshness: "CURRENT", confidence: 0.9, causalClaim: false, causalitySupport: "SUPPORTED",
    affectedRefs: { entityRefs: [`entity:${id}`], recommendationRefs: [`recommendation:${id}`], decisionRefs: [`decision:${id}`] },
    evidenceRefs: [`evidence:${id}`], investigationState: "NOT_REQUIRED", actionState: "PREPARE", safeNextStep: `Review ${id}`,
    supersedesSignalIds: [], ...overrides
  };
}

test("surfaces material changes and suppresses routine, no-change, low-value, and low-materiality noise", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [
    signal("material"),
    signal("routine", { changeType: "ROUTINE_SUCCESS" }),
    signal("same", { changeType: "NO_CHANGE" }),
    signal("activity", { changeType: "LOW_VALUE_ACTIVITY" }),
    signal("low", { materiality: "LOW" })
  ], generatedAt: now });
  assert.deepEqual(feed.items.map((item) => item.signalId), ["material"]);
  assert.equal(feed.summary.suppressedNoise, 4);
});

test("suppresses duplicates deterministically and keeps the most material supported signal", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [
    signal("older", { dedupeKey: "revenue:window", materiality: "MEDIUM", occurredAt: "2026-09-16T01:00:00Z" }),
    signal("newer", { dedupeKey: "revenue:window", materiality: "HIGH", occurredAt: "2026-09-16T02:00:00Z" })
  ], generatedAt: now });
  assert.deepEqual(feed.items.map((item) => item.signalId), ["newer"]);
  assert.equal(feed.summary.suppressedDuplicates, 1);
});

test("removes stale superseded items while preserving the replacement", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [
    signal("old", { freshness: "STALE" }),
    signal("replacement", { supersedesSignalIds: ["old"] }),
    signal("already-superseded", { freshness: "SUPERSEDED" })
  ], generatedAt: now });
  assert.deepEqual(feed.items.map((item) => item.signalId), ["replacement"]);
  assert.equal(feed.summary.suppressedSuperseded, 2);
});

test("preserves unknown, stale, conflicted, and partial truth without coercing confidence", () => {
  const states: LiveIntelligenceTruthStateV1[] = ["UNKNOWN", "STALE", "CONFLICTED", "PARTIAL"];
  const feed = buildLiveIntelligenceFeedV1({ signals: states.map((truthState, index) => signal(`state-${index}`, { truthState, confidence: null })), generatedAt: now });
  assert.deepEqual(new Set(feed.items.map((item) => item.truthState)), new Set(states));
  assert.ok(feed.items.every((item) => item.confidence === null));
  assert.equal(feed.summary.verificationRequired, 4);
});

test("orders by urgency, materiality, recency, and stable identity", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [
    signal("monitor-critical", { urgency: "MONITOR", materiality: "CRITICAL" }),
    signal("soon-high-old", { urgency: "SOON", occurredAt: "2026-09-16T01:00:00Z" }),
    signal("immediate-medium", { urgency: "IMMEDIATE", materiality: "MEDIUM" }),
    signal("soon-high-new", { urgency: "SOON", occurredAt: "2026-09-16T02:00:00Z" })
  ], generatedAt: now });
  assert.deepEqual(feed.items.map((item) => item.signalId), ["immediate-medium", "soon-high-new", "soon-high-old", "monitor-critical"]);
});

test("supports every governed category and keeps canonical references", () => {
  const categories: LiveIntelligenceCategoryV1[] = [
    "BUSINESS_PERFORMANCE", "CUSTOMER_COLLECTOR", "RELATIONSHIP_PARTNERSHIP", "MARKET_CULTURE_SPORTS", "MEDIA_BRAND",
    "CREATIVE_PRODUCT", "WEBSITE_MARKETING", "OPERATIONS_SYSTEM", "RISK_DATA_QUALITY", "LEARNING_OUTCOME"
  ];
  const feed = buildLiveIntelligenceFeedV1({ signals: categories.map((category, index) => signal(`category-${index}`, { category })), generatedAt: now });
  assert.deepEqual(new Set(feed.items.map((item) => item.category)), new Set(categories));
  assert.deepEqual(feed.items[0].evidenceRefs, [`evidence:${feed.items[0].signalId}`]);
  assert.equal(feed.items[0].affectedRefs.entityRefs.length, 1);
  assert.equal(feed.items[0].affectedRefs.recommendationRefs.length, 1);
  assert.equal(feed.items[0].affectedRefs.decisionRefs.length, 1);
});

test("refuses to present unsupported causality as established business impact", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [signal("unsupported", {
    causalClaim: true, causalitySupport: "INFERRED", whyItMatters: "This campaign caused revenue to increase"
  })], generatedAt: now });
  assert.equal(feed.items[0].causalityDisplay, "NOT_ESTABLISHED");
  assert.equal(feed.items[0].whyItMattersSupported, false);
  assert.doesNotMatch(feed.items[0].whyItMatters!, /caused revenue/);
  assert.match(feed.items[0].whyItMatters!, /not yet established/);
});

test("is deterministic, immutable, bounded, and leaves source input untouched", () => {
  const inputs = Array.from({ length: 35 }, (_, index) => signal(`bounded-${index}`, { occurredAt: `2026-09-15T${String(index % 24).padStart(2, "0")}:00:00Z` }));
  const before = structuredClone(inputs);
  const first = buildLiveIntelligenceFeedV1({ signals: inputs, generatedAt: now, maxItems: 10 });
  const second = buildLiveIntelligenceFeedV1({ signals: structuredClone(inputs), generatedAt: now, maxItems: 10 });
  assert.deepEqual(first, second);
  assert.deepEqual(inputs, before);
  assert.equal(first.items.length, 10);
  assert.equal(first.summary.truncated, 25);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.items[0]));
});

test("renders compact scan-first cards, evidence, references, and honest empty states", () => {
  const feed = buildLiveIntelligenceFeedV1({ signals: [signal("render")], generatedAt: now });
  const html = renderToString(<LiveIntelligenceFeedV1 feed={feed} />);
  assert.match(html, /Live Intelligence Feed/);
  assert.match(html, /render changed/);
  assert.match(html, /Evidence and drill-down references/);
  assert.match(html, /Entity · entity:render/);
  assert.match(html, /Safe next step/);
  assert.doesNotMatch(html, />Send</);
  assert.doesNotMatch(html, />Publish</);

  const empty = buildLiveIntelligenceFeedV1({ signals: [], generatedAt: now });
  assert.match(renderToString(<LiveIntelligenceFeedV1 feed={empty} />), /No material change/);
  assert.match(renderToString(<LiveIntelligenceFeedV1 feed={empty} sourceStatus="UNAVAILABLE" />), /No synthetic or stale feed/);
});

test("fails closed on invalid categories, duplicate identities, and unsafe bounds", () => {
  assert.throws(() => buildLiveIntelligenceFeedV1({ signals: [signal("bad", { category: "NOT_REAL" as LiveIntelligenceCategoryV1 })], generatedAt: now }), (error: unknown) => error instanceof LiveIntelligenceFeedError && error.code === "INVALID_CATEGORY");
  assert.throws(() => buildLiveIntelligenceFeedV1({ signals: [signal("same"), signal("same", { dedupeKey: "other" })], generatedAt: now }), /signalId must be unique/);
  assert.throws(() => buildLiveIntelligenceFeedV1({ signals: [signal("bad-confidence", { confidence: 2 })], generatedAt: now }), /between zero and one/);
  assert.throws(() => buildLiveIntelligenceFeedV1({ signals: [], generatedAt: now, maxItems: 31 }), (error: unknown) => error instanceof LiveIntelligenceFeedError && error.code === "OUTPUT_BOUND");
});
