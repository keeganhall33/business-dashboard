import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { ExecutiveEventPortfolioV1 } from "@/components/event-intelligence/ExecutiveEventPortfolioV1";
import type { SportsMilestone } from "@/lib/external-intelligence/milestones/contracts";
import {
  buildExecutiveEventPortfolioFromSourcesV1,
  buildExecutiveEventPortfolioV1,
  sportsMilestoneToExecutiveEventSourceV1,
  type ExecutiveEventEvidenceStateV1,
  type ExecutiveEventSourceV1
} from "@/lib/event-intelligence/executive-event-portfolio-v1";

const AS_OF = "2026-09-09";

function source(overrides: Partial<ExecutiveEventSourceV1> = {}): ExecutiveEventSourceV1 {
  return {
    id: "event-1",
    title: "Supported cultural window",
    eventDate: "2026-10-01",
    market: "Seattle",
    category: "Major Event",
    evidenceState: "KNOWN",
    confidence: "HIGH",
    historicalSignificance: "HIGH",
    collectorRelevance: "HIGH",
    partnershipPotential: "MEDIUM",
    accessReadiness: "UNKNOWN",
    rightsConsiderations: [],
    evidenceLabels: ["Official milestone source"],
    sourceIds: ["source-official"],
    nextMove: "Validate whether the window merits a bounded activation.",
    ...overrides
  };
}

function milestone(overrides: Partial<SportsMilestone> = {}): SportsMilestone {
  return {
    schema_version: "sports_milestone_v1",
    milestone_id: "milestone-1",
    milestone_type: "major_team_or_league_event",
    subject_entities: [{ entity_type: "team", entity_id: "team-1", label: "Seattle Team" }],
    team: "Seattle Team",
    league: "League",
    geographic_market: "Seattle",
    original_event_date: "2020-10-01",
    milestone_date: "2026-10-01",
    anniversary_number: 6,
    season_or_year: "2026",
    championship_or_achievement_type: "Supported championship window",
    historical_significance: "high",
    fan_collector_relevance: "high",
    partnership_potential: "high",
    licensing_rights_considerations: [],
    evidence_refs: [{ label: "Official record", url: "https://example.com/milestone" }],
    source_ids: ["official-source"],
    confidence: "high",
    correction_status: "none",
    review_status: "reviewed",
    content_hash: "a".repeat(64),
    ...overrides
  };
}

test("production Events page uses canonical milestone repository instead of generic workspace fixtures", () => {
  const page = readFileSync(
    path.join(process.cwd(), "src/app/(app)/events-market-windows/page.tsx"),
    "utf8"
  );

  assert.match(page, /SportsMilestoneRepository/);
  assert.match(page, /listCurrentMilestonesForHorizonScan/);
  assert.match(page, /buildExecutiveEventPortfolioV1/);
  assert.doesNotMatch(page, /ExecutiveWorkspacePage/);
  assert.doesNotMatch(page, /getExecutiveWorkspaceByHrefV1/);
  assert.doesNotMatch(page, /Super Bowl cultural window|Collector week/);
});

test("event portfolio sorts known dates chronologically and leaves unknown dates at the stable end", () => {
  const portfolio = buildExecutiveEventPortfolioFromSourcesV1([
    source({ id: "unknown", title: "Unknown date", eventDate: null }),
    source({ id: "later", title: "Later", eventDate: "2027-02-01" }),
    source({ id: "soon", title: "Soon", eventDate: "2026-09-20" }),
    source({ id: "unknown-2", title: "Second unknown", eventDate: null })
  ], AS_OF);

  assert.deepEqual(portfolio.items.map((item) => item.id), ["soon", "later", "unknown", "unknown-2"]);
  assert.equal(portfolio.items[0]?.daysUntil, 11);
  assert.equal(portfolio.items[0]?.planningWindow, "NOW");
  assert.equal(portfolio.items[2]?.daysUntil, null);
  assert.equal(portfolio.items[2]?.planningWindow, "DATE_UNKNOWN");
});

test("missing date and access remain Unknown rather than zero or implied availability", () => {
  const portfolio = buildExecutiveEventPortfolioFromSourcesV1([
    source({
      id: "unknown-evidence",
      eventDate: null,
      accessReadiness: "UNKNOWN",
      evidenceState: "UNKNOWN",
      confidence: "UNKNOWN",
      historicalSignificance: "UNKNOWN",
      collectorRelevance: "UNKNOWN",
      partnershipPotential: "UNKNOWN",
      evidenceLabels: [],
      sourceIds: []
    })
  ], AS_OF);
  const html = renderToString(<ExecutiveEventPortfolioV1 portfolio={portfolio} sourceStatus="AVAILABLE" />);

  assert.match(html, /Date unknown/);
  assert.match(html, /Access/);
  assert.match(html, /Unknown/);
  assert.match(html, /UNKNOWN/);
  assert.doesNotMatch(html, /0 days away/);
  assert.doesNotMatch(html, /Access[^<]*Available|Access[^<]*Yes/);
});

test("all uncertainty states remain visible and verification-honest", () => {
  const states: ExecutiveEventEvidenceStateV1[] = ["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"];
  const portfolio = buildExecutiveEventPortfolioFromSourcesV1(
    states.map((evidenceState, index) => source({
      id: `state-${evidenceState}`,
      title: `${evidenceState} window`,
      eventDate: `2026-1${index}-01`.replace("-13-", "-12-"),
      evidenceState
    })),
    AS_OF
  );
  const html = renderToString(<ExecutiveEventPortfolioV1 portfolio={portfolio} sourceStatus="AVAILABLE" />);

  for (const state of states) assert.match(html, new RegExp(state));
  assert.equal(portfolio.summary.verificationWatch, 4);
});

test("canonical milestone mapping is conservative about evidence and access", () => {
  const known = sportsMilestoneToExecutiveEventSourceV1(milestone());
  assert.equal(known.evidenceState, "KNOWN");
  assert.equal(known.accessReadiness, "UNKNOWN");
  assert.match(known.nextMove, /partner access and fit/i);

  const inferred = sportsMilestoneToExecutiveEventSourceV1(milestone({
    milestone_id: "milestone-2",
    review_status: "unreviewed",
    confidence: "medium"
  }));
  assert.equal(inferred.evidenceState, "INFERRED");
  assert.match(inferred.nextMove, /Verify the milestone evidence/i);

  const conflicted = sportsMilestoneToExecutiveEventSourceV1(milestone({
    milestone_id: "milestone-3",
    correction_status: "retracted"
  }));
  assert.equal(conflicted.evidenceState, "CONFLICTED");
  assert.match(conflicted.nextMove, /Resolve the evidence conflict/i);
});

test("rights considerations create review-required access rather than inferred permission", () => {
  const mapped = sportsMilestoneToExecutiveEventSourceV1(milestone({
    licensing_rights_considerations: ["League marks require separate rights review"]
  }));

  assert.equal(mapped.accessReadiness, "REVIEW_REQUIRED");
  assert.match(mapped.nextMove, /Review rights and access constraints/i);
});

test("empty and unavailable canonical input stay compact and do not invent events", () => {
  const empty = buildExecutiveEventPortfolioV1([], AS_OF);
  const emptyHtml = renderToString(<ExecutiveEventPortfolioV1 portfolio={empty} sourceStatus="AVAILABLE" />);
  const unavailableHtml = renderToString(<ExecutiveEventPortfolioV1 portfolio={empty} sourceStatus="UNAVAILABLE" />);

  assert.match(emptyHtml, /No verified event windows are currently available/);
  assert.match(emptyHtml, /Nothing is substituted from planning fixtures/);
  assert.match(unavailableHtml, /Unable to verify current event windows/);
  assert.match(unavailableHtml, /intentionally empty/);
  assert.doesNotMatch(emptyHtml, /Super Bowl cultural window|Collector week/);
  assert.doesNotMatch(unavailableHtml, /Super Bowl cultural window|Collector week/);
});

test("visual timeline has no fake detail route, booking, send, or calendar mutation affordance", () => {
  const portfolio = buildExecutiveEventPortfolioFromSourcesV1([source()], AS_OF);
  const html = renderToString(<ExecutiveEventPortfolioV1 portfolio={portfolio} sourceStatus="AVAILABLE" />);

  assert.match(html, /grid gap-3 lg:grid-cols-2 xl:grid-cols-3/);
  assert.match(html, /Evidence &amp; constraints/);
  assert.match(html, /Runway/);
  assert.match(html, /Next move/);
  assert.doesNotMatch(html, /href="\/events-market-windows\/event\//);
  assert.doesNotMatch(html, />Book</);
  assert.doesNotMatch(html, />Send</);
  assert.doesNotMatch(html, /Add to calendar|Schedule event|Calendar mutation/);
});

test("duplicate event identities fail closed", () => {
  assert.throws(
    () => buildExecutiveEventPortfolioFromSourcesV1([source(), source()], AS_OF),
    /duplicate event source id/
  );
});
