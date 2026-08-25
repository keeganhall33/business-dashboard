import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { SportsArtPartnerIntelligence } from "@/components/discovery/SportsArtPartnerIntelligence";
import { toSportsArtPartnerDashboardV1 } from "@/lib/discovery/sports-art-partners/dashboard";
import { SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1 } from "@/lib/discovery/sports-art-partners/fixtures";

test("sports art partner universe contains all eight companies in one model", () => {
  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.contract_version, "sports_art_partner_universe_v1.0");
  assert.deepEqual(
    SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies.map((company) => company.company_name).sort(),
    ["Art of Words", "Fanatics", "Fanatics Collectibles / Topps", "Farano Fine Art", "Fine Art America / Pixels", "Panini", "S. Preston", "Upper Deck"].sort()
  );
  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.safety.no_external_outreach, true);
  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.safety.no_duplicate_company_contact_or_opportunity_records_created, true);
  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.safety.keegan_action_required, "NO");
});

test("each company carries required fields with explicit evidence and next safe action", () => {
  for (const company of SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies) {
    assert.ok(company.entity_identity.canonical_name);
    assert.ok(company.role_classifications.length > 0);
    assert.ok(company.strategic_fit_for_keegan.summary);
    assert.ok(company.relationship_state.summary);
    assert.ok(company.known_contacts_or_access_paths.length > 0);
    assert.ok(company.prior_outreach_or_deal_history.length > 0);
    assert.ok(company.prior_economics_or_compensation.summary);
    assert.ok(company.licensing_reproduction_rights_relevance.summary);
    assert.ok(company.athlete_league_team_access_potential.summary);
    assert.ok(company.distribution_potential.summary);
    assert.ok(company.collector_audience_overlap.summary);
    assert.ok(company.collaboration_concepts.length > 0);
    assert.ok(company.competitive_benchmark_relevance.summary);
    assert.ok(company.risks_or_leverage_concerns.length > 0);
    assert.ok(company.timing_or_trigger);
    assert.ok(company.next_safe_action);
    assert.equal(company.approval_state, "NO_ACTION_REQUIRED");
    assert.ok(company.what_would_materially_change_ranking.length > 0);
    assert.ok(company.evidence_refs.length > 0);
  }
});

test("Fanatics and Topps preserve existing relationship, economics, contacts, and concepts", () => {
  const fanatics = SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies.find((company) => company.company_id === "fanatics");
  const topps = SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies.find((company) => company.company_id === "fanatics-collectibles-topps");

  assert.ok(fanatics);
  assert.ok(topps);
  const fanaticsText = JSON.stringify(fanatics);
  assert.match(fanaticsText, /final compensation was \$10,000/i);
  assert.match(fanaticsText, /~6 months/i);
  assert.match(fanaticsText, /Michael Rubin/i);
  assert.match(fanaticsText, /Rich Kleiman/i);
  assert.match(fanaticsText, /Clay Luraschi/i);
  assert.match(fanaticsText, /Mike Mahan/i);
  assert.match(fanaticsText, /Kelvin Smith/i);
  assert.match(fanaticsText, /My Cards My City/i);
  assert.match(fanaticsText, /World Cup \/ Space Needle/i);
  assert.match(JSON.stringify(topps), /\$50,000.*prestige 9\.2.*probability 0\.35/i);
});

test("Upper Deck preserves existing opportunity and constraint notes", () => {
  const upperDeck = SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies.find((company) => company.company_id === "upper-deck");

  assert.ok(upperDeck);
  const text = JSON.stringify(upperDeck);
  assert.match(text, /Upper Deck Hall of Fame capsule/i);
  assert.match(text, /\$55,000/i);
  assert.match(text, /prestige 9\.1/i);
  assert.match(text, /probability 0\.32/i);
  assert.match(text, /Michael Jordan \/ Upper Deck relationship history/i);
  assert.match(text, /reproduction-rights constraints/i);
  assert.match(text, /map creative director\/licensing contact/i);
});

test("benchmark companies are not mislabeled as equal-priority partnership targets", () => {
  const benchmarkIds = ["fine-art-america-pixels", "art-of-words", "s-preston", "farano-fine-art"];
  for (const id of benchmarkIds) {
    const company = SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.companies.find((item) => item.company_id === id);
    assert.ok(company);
    assert.ok(company.role_classifications.includes("BENCHMARK") || company.role_classifications.includes("MARKET_COMPETITIVE_BENCHMARK"));
    assert.ok(!company.role_classifications.includes("TRUE_STRATEGIC_PARTNER"));
  }
});

test("dashboard surface exposes filters and comparison dimensions", () => {
  const dashboard = toSportsArtPartnerDashboardV1(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1);
  const html = renderToString(<SportsArtPartnerIntelligence />);

  assert.equal(dashboard.view_version, "sports_art_partner_dashboard_v1.0");
  assert.deepEqual(dashboard.filters, ["PARTNER TARGET", "LICENSING TARGET", "DISTRIBUTION TARGET", "COLLECTIBLES TARGET", "ATHLETE ACCESS", "BENCHMARK", "COMPETITOR", "COLLABORATOR"]);
  assert.equal(dashboard.rows.length, 8);
  assert.match(html, /Sports Art Partner Intelligence/);
  assert.match(html, /Licensing power/);
  assert.match(html, /Distribution reach/);
  assert.match(html, /Athlete \/ league access/);
  assert.match(html, /Competitive overlap/);
  assert.match(html, /Keegan action required: <!-- -->NO/);
});

test("ranking is not pure company size and Fanatics is not single point of failure", () => {
  const dashboard = toSportsArtPartnerDashboardV1(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1);
  const fanaticsIndex = dashboard.rows.findIndex((row) => row.company_id === "fanatics");
  const toppsIndex = dashboard.rows.findIndex((row) => row.company_id === "fanatics-collectibles-topps");

  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.ranking_principle.not_ranked_by_company_size_only, true);
  assert.equal(SPORTS_ART_PARTNER_UNIVERSE_FIXTURE_V1.ranking_principle.fanatics_single_point_of_failure_guardrail, true);
  assert.ok(fanaticsIndex >= 0);
  assert.ok(toppsIndex >= 0);
  assert.ok(toppsIndex < fanaticsIndex, "Topps can rank ahead of Fanatics because specificity/access/economics matter");
});
