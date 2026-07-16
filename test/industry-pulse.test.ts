import test from "node:test";
import assert from "node:assert/strict";

import { buildIndustryOpportunities } from "../src/lib/industry-pulse.ts";
import type { IndustryPulseSnapshot } from "../src/lib/types/dashboard";

const BASE_ALERT = {
  title: "NBA Finals opportunity",
  category: "Sports",
  source: "espn",
  sourceUrl: "https://www.espn.com",
  date: new Date().toISOString(),
  whyItMatters: "NBA Finals drives mainstream attention aligned with Keegan's sports focus.",
  opportunity: "Limited Steph Curry championship artwork",
  recommendedAction: "Prep concept art and outreach to Warriors PR",
  urgency: "high",
  confidence: "high",
  status: "rights_to_verify",
  owner: null,
  related: []
} satisfies IndustryPulseSnapshot["alerts"][number];

test("buildIndustryOpportunities filters stale items", () => {
  const snapshot: IndustryPulseSnapshot = {
    generatedAt: new Date().toISOString(),
    sources: [],
    alerts: [
      BASE_ALERT,
      {
        ...BASE_ALERT,
        title: "Stale story",
        date: new Date(Date.now() - 20 * 86400000).toISOString()
      }
    ]
  };
  const opportunities = buildIndustryOpportunities(snapshot);
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].headline, BASE_ALERT.title);
});

test("buildIndustryOpportunities caps at five items", () => {
  const alerts = Array.from({ length: 10 }, (_, i) => ({
    ...BASE_ALERT,
    title: `Story ${i}`,
    date: new Date(Date.now() - i * 86400000).toISOString()
  }));
  const snapshot: IndustryPulseSnapshot = { generatedAt: new Date().toISOString(), sources: [], alerts };
  const opportunities = buildIndustryOpportunities(snapshot);
  assert.equal(opportunities.length, 5);
});

test("buildIndustryOpportunities suppresses low-confidence items", () => {
  const snapshot: IndustryPulseSnapshot = {
    generatedAt: new Date().toISOString(),
    sources: [],
    alerts: [
      BASE_ALERT,
      {
        ...BASE_ALERT,
        title: "Low confidence",
        confidence: "low"
      }
    ]
  };
  const opportunities = buildIndustryOpportunities(snapshot);
  assert.equal(opportunities.length, 1);
});

test("buildIndustryOpportunities includes provenance and contact status", () => {
  const snapshot: IndustryPulseSnapshot = { generatedAt: new Date().toISOString(), sources: [], alerts: [BASE_ALERT] };
  const opportunities = buildIndustryOpportunities(snapshot);
  const opportunity = opportunities[0];
  assert.equal(opportunity.provenance, BASE_ALERT.source);
  assert.match(opportunity.contactStatus, /Contact/);
});
