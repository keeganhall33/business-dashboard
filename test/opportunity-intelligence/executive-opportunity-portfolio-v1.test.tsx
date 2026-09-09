import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveOpportunityPortfolioV1 } from "@/components/opportunity-intelligence/ExecutiveOpportunityPortfolioV1";
import {
  buildExecutiveOpportunityPortfolioV1,
  filterExecutiveOpportunityPortfolioV1,
  sortExecutiveOpportunityPortfolioV1
} from "@/lib/opportunity-intelligence/executive-opportunity-portfolio-v1";
import type { Opportunity } from "@/lib/types/dashboard";

const opportunities: Opportunity[] = [
  {
    id: "boeing-workplace",
    name: "Boeing Corporate Art / Workplace",
    organization: "Boeing",
    opportunityType: "corporate_art",
    status: "active",
    valueEstimate: 75000,
    prestigeScore: 0.91,
    probabilityScore: 0.62,
    ownerAgent: null,
    nextStep: "Validate the right workplace-art buyer and warm path.",
    nextStepDueAt: "2026-09-20T12:00:00.000Z",
    lastVerifiedAt: "2026-09-08T17:00:00.000Z"
  },
  {
    id: "stale-museum",
    name: "Museum planning window",
    organization: "Museum",
    opportunityType: "institutional",
    status: "STALE_REVIEW",
    valueEstimate: null,
    prestigeScore: 0.88,
    probabilityScore: null,
    ownerAgent: null,
    nextStep: null,
    nextStepDueAt: null,
    lastVerifiedAt: "2026-08-01T17:00:00.000Z"
  },
  {
    id: "conflicted-brand",
    name: "Brand collaboration",
    organization: null,
    opportunityType: "brand",
    status: "CONFLICTED",
    valueEstimate: null,
    prestigeScore: null,
    probabilityScore: null,
    ownerAgent: null,
    nextStep: "Resolve the conflicting buyer evidence.",
    nextStepDueAt: "2026-09-15T12:00:00.000Z",
    lastVerifiedAt: null
  },
  {
    id: "unknown-access",
    name: "Unknown access path",
    organization: null,
    opportunityType: "relationship",
    status: "UNVERIFIED",
    valueEstimate: null,
    prestigeScore: null,
    probabilityScore: null,
    ownerAgent: null,
    nextStep: null,
    nextStepDueAt: null,
    lastVerifiedAt: null
  }
];

test("portfolio preserves canonical source order and derives counts only from supplied evidence", () => {
  const model = buildExecutiveOpportunityPortfolioV1(opportunities);

  assert.equal(model.contractVersion, "executive_opportunity_portfolio_v1");
  assert.deepEqual(model.items.map((item) => item.id), [
    "boeing-workplace",
    "stale-museum",
    "conflicted-brand",
    "unknown-access"
  ]);
  assert.deepEqual(model.summary, {
    total: 4,
    verificationWatch: 3,
    withTiming: 2,
    withSupportedValue: 1
  });
  assert.equal(model.items[0]?.supportedValue, "$75,000");
  assert.equal(model.items[0]?.prestigeScore, "91%");
  assert.equal(model.items[0]?.probabilityScore, "62%");
  assert.equal(model.items[0]?.timing, "2026-09-20");
  assert.equal(model.items[0]?.lastVerified, "2026-09-08");
  assert.equal(model.items[0]?.detailHref, "/opportunities-actions/opportunity/boeing-workplace");
});

test("explicit source status preserves inferred unknown stale and conflicted evidence semantics", () => {
  const model = buildExecutiveOpportunityPortfolioV1(opportunities);
  assert.deepEqual(model.items.map((item) => item.evidenceState), [
    "INFERRED",
    "STALE",
    "CONFLICTED",
    "UNKNOWN"
  ]);
});

test("missing economics and next-step evidence remain unknown instead of becoming zero or fake certainty", () => {
  const model = buildExecutiveOpportunityPortfolioV1(opportunities);
  const unknown = model.items.find((item) => item.id === "unknown-access");
  assert.ok(unknown);
  assert.equal(unknown.supportedValue, null);
  assert.equal(unknown.prestigeScore, null);
  assert.equal(unknown.probabilityScore, null);
  assert.equal(unknown.timing, null);
  assert.equal(unknown.effortSignal, "UNKNOWN");
  assert.equal(unknown.nextMove, "Verify the next step before acting.");

  const html = renderToString(<ExecutiveOpportunityPortfolioV1 portfolio={model} />);
  assert.doesNotMatch(html, /\$0\b/);
  assert.doesNotMatch(html, /0% prestige|0% probability/i);
  assert.match(html, /Unknown/);
});

test("sort and filter seams are deterministic and never mutate source order", () => {
  const model = buildExecutiveOpportunityPortfolioV1(opportunities);
  const sourceIds = model.items.map((item) => item.id);

  assert.deepEqual(
    sortExecutiveOpportunityPortfolioV1(model.items, "DUE_SOONEST").map((item) => item.id),
    ["conflicted-brand", "boeing-workplace", "stale-museum", "unknown-access"]
  );
  assert.deepEqual(
    sortExecutiveOpportunityPortfolioV1(model.items, "NAME").map((item) => item.id),
    ["boeing-workplace", "conflicted-brand", "stale-museum", "unknown-access"]
  );
  assert.deepEqual(
    filterExecutiveOpportunityPortfolioV1(model.items, { evidenceState: "CONFLICTED" }).map((item) => item.id),
    ["conflicted-brand"]
  );
  assert.deepEqual(
    filterExecutiveOpportunityPortfolioV1(model.items, { query: "boeing" }).map((item) => item.id),
    ["boeing-workplace"]
  );
  assert.deepEqual(model.items.map((item) => item.id), sourceIds);
});

test("portfolio renders a scan-first responsive workspace with real detail routes", () => {
  const model = buildExecutiveOpportunityPortfolioV1(opportunities);
  const html = renderToString(<ExecutiveOpportunityPortfolioV1 portfolio={model} />);

  assert.match(html, /Opportunities &amp; Actions/);
  assert.match(html, /First in canonical radar order/);
  assert.match(html, /Boeing Corporate Art \/ Workplace/);
  assert.match(html, /Evidence watch/);
  assert.match(html, /Supported value/);
  assert.match(html, /Source probability/);
  assert.match(html, /INFERRED/);
  assert.match(html, /STALE/);
  assert.match(html, /CONFLICTED/);
  assert.match(html, /UNKNOWN/);
  assert.match(html, /href="\/opportunities-actions\/opportunity\/boeing-workplace"/);
  assert.match(html, /md:hidden/);
  assert.match(html, /md:block/);
  assert.match(html, /<table/);
  assert.doesNotMatch(html, /Send|Compose|form action=/i);
  assert.doesNotMatch(html, /Early museum exhibition|Athlete and brand campaign|Generic sketch-card request/);
});

test("empty canonical radar renders an honest compact state instead of planning fixtures", () => {
  const model = buildExecutiveOpportunityPortfolioV1([]);
  const html = renderToString(<ExecutiveOpportunityPortfolioV1 portfolio={model} />);

  assert.equal(model.summary.total, 0);
  assert.match(html, /No canonical opportunities are available for this range/);
  assert.match(html, /stays empty rather than substituting planning fixtures/);
  assert.doesNotMatch(html, /Early museum exhibition|Recurring collectibles platform/);
});

test("malformed or duplicate canonical opportunity records fail closed", () => {
  assert.throws(
    () => buildExecutiveOpportunityPortfolioV1([{ ...opportunities[0]!, id: "" }]),
    /id must be a non-empty string/
  );
  assert.throws(
    () => buildExecutiveOpportunityPortfolioV1([opportunities[0]!, { ...opportunities[0]! }]),
    /duplicate opportunity id/
  );
});

test("production page reads the live opportunity radar and no longer renders synthetic readiness fixtures", () => {
  const source = readFileSync("src/app/(app)/opportunities-actions/page.tsx", "utf8");

  assert.match(source, /getDashboardOverview/);
  assert.match(source, /overview\.opportunityRadar\?\.topOpportunities/);
  assert.match(source, /buildExecutiveOpportunityPortfolioV1/);
  assert.match(source, /force-dynamic/);
  assert.doesNotMatch(source, /PlanningReadinessOpportunityPanelV1/);
  assert.doesNotMatch(source, /PLANNING_READINESS_OPPORTUNITY_FIXTURES_V1/);
  assert.doesNotMatch(source, /ExecutiveWorkspacePage/);
});
