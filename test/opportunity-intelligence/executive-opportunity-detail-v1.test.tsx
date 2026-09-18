import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import {
  ExecutiveOpportunityDetailV1,
  buildExecutiveOpportunityDetailViewV1
} from "@/components/opportunity-intelligence/ExecutiveOpportunityDetailV1";
import {
  ExecutiveCommandCenter,
  executiveOpportunityDetailHrefV1
} from "@/components/executive-home/ExecutiveCommandCenter";
import {
  EXECUTIVE_HOME_FIXTURE_V1,
  type ExecutiveCommandCenterOpportunityV1
} from "@/lib/executive-home/fixtures";

const ROUTE_PATH = "src/app/(app)/opportunities-actions/opportunity/[id]/page.tsx";

const knownOpportunity: ExecutiveCommandCenterOpportunityV1 = {
  id: "boeing-corporate-art",
  title: "Boeing Corporate Art / Workplace",
  upside: "High qualitative strategic upside",
  fit: "Strong institutional fit",
  timing: "Prepare this quarter",
  effort: "Capacity check required",
  evidence: "KNOWN",
  next_move: "Confirm the right workplace-art buyer and timing window.",
  detail_href: "#legacy-shallow-drawer"
};

test("canonical Home opportunity cards navigate to the real dedicated route", () => {
  assert.equal(
    executiveOpportunityDetailHrefV1("boeing-corporate-art"),
    "/opportunities-actions/opportunity/boeing-corporate-art"
  );
  assert.equal(
    executiveOpportunityDetailHrefV1("buyer / west"),
    "/opportunities-actions/opportunity/buyer%20%2F%20west"
  );

  const html = renderToString(
    <ExecutiveCommandCenter data={EXECUTIVE_HOME_FIXTURE_V1.command_center} />
  );
  assert.match(html, /href="\/opportunities-actions\/opportunity\/elite-network"/);
  assert.doesNotMatch(html, /href="#decision-private-collector-room"[^>]*>\s*<div[^>]*>\s*<h3[^>]*>Elite network optionality/);
});

test("known opportunity renders meaningful scan-first decision detail without invented economics", () => {
  const html = renderToString(
    <ExecutiveOpportunityDetailV1
      opportunity={knownOpportunity}
      generatedAt={null}
      editableOpportunity={{
        id: knownOpportunity.id,
        name: knownOpportunity.title,
        organization: "Boeing",
        status: "in_conversation",
        contactName: "Alex Example",
        contactRole: "Art buyer",
        nextStep: knownOpportunity.next_move,
        nextStepDueAt: "2026-10-01",
        valueEstimate: null,
        notes: "Useful background that should be readable outside the editor."
      }}
    />
  );

  assert.match(html, />Opportunity</);
  assert.match(html, /Boeing Corporate Art \/ Workplace/);
  assert.match(html, /Confirm the right workplace-art buyer and timing window/);
  assert.match(html, /Status/);
  assert.match(html, /In Conversation/);
  assert.match(html, /Next follow-up/);
  assert.match(html, /Primary contact/);
  assert.match(html, /Revenue potential/);
  assert.match(html, /Background and notes/);
  assert.match(html, /Useful background/);
  assert.match(html, /Edit opportunity/);
  assert.match(html, /When this was last updated/);
  assert.match(html, /Relationships \/ CRM/);
  assert.match(html, /All opportunities/);
  assert.doesNotMatch(html, /Next step status|Business fit|Decision Room|Data &amp; Evidence/);
  assert.match(html, /grid-cols-2|lg:grid-cols/);
  assert.doesNotMatch(html, /\$0(?:\.00)?|revenue estimate|guaranteed value/i);
});

test("UNKNOWN STALE and CONFLICTED opportunity states remain explicitly verification-gated", () => {
  for (const evidence of ["UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const opportunity: ExecutiveCommandCenterOpportunityV1 = {
      ...knownOpportunity,
      id: `risk-${evidence.toLowerCase()}`,
      evidence,
      upside: "UNKNOWN"
    };
    const view = buildExecutiveOpportunityDetailViewV1(opportunity);
    const html = renderToString(<ExecutiveOpportunityDetailV1 opportunity={opportunity} />);

    assert.equal(view.verificationRequired, true);
    assert.ok(view.unknowns.length > 0);
    assert.match(html, /Needs your input/);
    assert.match(html, /Needs review|out of date|sources disagree/);
    assert.match(html, /Revenue potential has not been confirmed yet/);
    assert.doesNotMatch(html, />Current</);
  }
});

test("INFERRED opportunity remains recommendation context rather than confirmed fact", () => {
  const opportunity: ExecutiveCommandCenterOpportunityV1 = {
    ...knownOpportunity,
    evidence: "INFERRED"
  };
  const view = buildExecutiveOpportunityDetailViewV1(opportunity);
  assert.equal(view.verificationRequired, true);
  assert.match(view.unknowns.join(" "), /Confirm the contact and next step/);
});

test("route loads the exact editable opportunity without waiting on the full dashboard overview", () => {
  const source = fs.readFileSync(ROUTE_PATH, "utf8");

  assert.match(source, /getOpportunityById\(id\.trim\(\)\)/);
  assert.match(source, /editableOpportunity=\{editable\}/);
  assert.match(source, /catch \{\s*notFound\(\)/);
  assert.match(source, /force-dynamic/);
  assert.match(source, /evidence: "KNOWN"/);
  assert.doesNotMatch(source, /KEEGAN_CONFIRMED|DASHBOARD_MANUAL|INFERRED/);
  assert.doesNotMatch(source, /getDashboardOverview|buildExecutiveOpportunityPortfolioV1|EXECUTIVE_HOME_FIXTURE_V1|Math\.random/);
});
