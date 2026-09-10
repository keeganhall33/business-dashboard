import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SportsArtPartnerIntelligence } from "@/components/discovery/SportsArtPartnerIntelligence";
import type { SportsArtPartnerDashboardV1 } from "@/lib/discovery/sports-art-partners/contracts";

const routePath = "src/app/(app)/specialists/sports-art-partners/page.tsx";
const componentPath = "src/components/discovery/SportsArtPartnerIntelligence.tsx";

test("production sports-art partner route does not import fixture data", () => {
  const routeSource = readFileSync(resolve(process.cwd(), routePath), "utf8");
  const componentSource = readFileSync(resolve(process.cwd(), componentPath), "utf8");

  assert.doesNotMatch(routeSource, /SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1|sports-art-partners\/fixtures/);
  assert.doesNotMatch(componentSource, /SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1|sports-art-partners\/fixtures/);
  assert.match(routeSource, /dashboard=\{null\}/);
});

test("production default renders an honest unavailable state instead of partner claims", () => {
  const html = renderToStaticMarkup(<SportsArtPartnerIntelligence dashboard={null} />);

  assert.match(html, /Partner intelligence unavailable/);
  assert.match(html, /No verified production partner universe/);
  assert.match(html, /remain unknown rather than being inferred from test fixtures/);
  assert.doesNotMatch(html, /Fanatics|Topps|Arena Club|Upper Deck/);
});

test("explicit deterministic dashboard input remains renderable without fixture promotion", () => {
  const dashboard: SportsArtPartnerDashboardV1 = {
    view_version: "sports_art_partner_dashboard_v1.0",
    universe_id: "test-verified-input",
    filters: ["PARTNER TARGET"],
    rows: [
      {
        company_id: "verified-partner",
        company_name: "Verified Partner",
        primary_classification: "PARTNER_TARGET",
        filter_tags: ["PARTNER TARGET"],
        relationship_strength: "STRONG",
        existing_access_path: "Verified introduction path",
        strategic_upside: "HIGH",
        licensing_power: "MEDIUM",
        distribution_reach: "HIGH",
        athlete_league_access: "MEDIUM",
        economic_attractiveness: "UNKNOWN",
        competitive_overlap: "LOW",
        current_opportunity: "Verified pilot",
        next_action: "Review supported pilot evidence",
        keegan_action_required: "NO",
      },
    ],
  };

  const html = renderToStaticMarkup(<SportsArtPartnerIntelligence dashboard={dashboard} />);

  assert.match(html, /Verified Partner/);
  assert.match(html, /Verified introduction path/);
  assert.match(html, /Review supported pilot evidence/);
  assert.doesNotMatch(html, /Partner intelligence unavailable/);
});
