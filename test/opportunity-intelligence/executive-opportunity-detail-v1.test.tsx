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
    <ExecutiveOpportunityDetailV1 opportunity={knownOpportunity} generatedAt={null} />
  );

  assert.match(html, /Opportunity decision workspace/);
  assert.match(html, /Boeing Corporate Art \/ Workplace/);
  assert.match(html, /Confirm the right workplace-art buyer and timing window/);
  assert.match(html, /Timing \/ window/);
  assert.match(html, /Effort \/ capacity/);
  assert.match(html, /Supported fit/);
  assert.match(html, /Supported upside/);
  assert.match(html, /Evidence and secondary context/);
  assert.match(html, /Relationships \/ CRM/);
  assert.match(html, /Planning readiness/);
  assert.match(html, /Decision Room/);
  assert.match(html, /Data &amp; Evidence/);
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
    assert.ok(view.unknowns.some((item) => item.includes(evidence)));
    assert.match(html, /VERIFICATION REQUIRED/);
    assert.match(html, new RegExp(evidence));
    assert.match(html, /Upside remains UNKNOWN/);
    assert.doesNotMatch(html, /EVIDENCE READY/);
  }
});

test("INFERRED opportunity remains recommendation context rather than confirmed fact", () => {
  const opportunity: ExecutiveCommandCenterOpportunityV1 = {
    ...knownOpportunity,
    evidence: "INFERRED"
  };
  const view = buildExecutiveOpportunityDetailViewV1(opportunity);
  assert.equal(view.verificationRequired, true);
  assert.match(view.unknowns.join(" "), /verified before irreversible action/);
});

test("route resolves from the same dashboard-overview Executive Home projection and fails missing IDs honestly", () => {
  const source = fs.readFileSync(ROUTE_PATH, "utf8");

  assert.match(source, /getDashboardOverview/);
  assert.match(source, /buildExecutiveHomeFromDashboardOverviewV1/);
  assert.match(source, /executiveHome\.home\.command_center\.opportunities\.find/);
  assert.match(source, /candidate\.id === opportunityId/);
  assert.match(source, /if \(!opportunity \|\| opportunity\.id === "unknown-opportunity"\) notFound\(\)/);
  assert.match(source, /hdrs\.get\("cookie"\)/);
  assert.match(source, /force-no-store/);
  assert.doesNotMatch(source, /EXECUTIVE_HOME_FIXTURE_V1|valueEstimate\s*=|Math\.random/);
});
