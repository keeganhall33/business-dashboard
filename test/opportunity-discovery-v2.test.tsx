import test from "node:test";
import assert from "node:assert/strict";

import { buildOpportunityCandidatesV2 } from "../src/lib/opportunity-discovery-v2/discovery.ts";
import type { CollectorRelationshipRow, OpportunityPipelineRow } from "../src/lib/opportunity-discovery-v2/types";

test("opportunity discovery v2: deterministic ranking + unknown handling", () => {
  const pipelineRows: OpportunityPipelineRow[] = [
    {
      id: "p1",
      name: "Formula 1 Legends Capsule",
      organization: "F1",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: 150000,
      prestige_score: 90,
      probability_score: 55,
      owner_agent: "avery",
      next_step: "Intro to partnerships",
      next_step_due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      notes_md: "Potential capsule drop. https://example.com",
      source: "first-party"
    },
    {
      id: "p2",
      name: "Small local sponsorship",
      organization: "Local",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: 5000,
      prestige_score: 10,
      probability_score: 20,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  ];

  const externalCandidates = [
    {
      id: "e1",
      headline: "Sotheby’s Sport Week",
      source: "IndustryPulse",
      summary: "Auction week.",
      whyNow: "Upcoming.",
      collabIdea: "Heritage graphite series",
      sourceUrl: "https://example.com/sothebys",
      day: "2026-08-10",
      organizationHint: "Sotheby’s"
    }
  ];

  const relationships: CollectorRelationshipRow[] = [
    { id: "r1", collector_name: "Sotheby", tier: "A", estimated_value: null }
  ];

  const candidates = buildOpportunityCandidatesV2({ pipelineRows, externalCandidates, relationships });
  assert.ok(candidates.length >= 2);

  // Deterministic ordering.
  const first = candidates[0];
  assert.equal(first.seed.name, "Formula 1 Legends Capsule");

  // Unknown handling: external candidate has unknown commercial scale but should not crash.
  const external = candidates.find((c) => c.seed.seedId === "external:e1");
  assert.ok(external);
  assert.ok(external!.factors.some((f) => f.id === "COMMERCIAL_SCALE"));
  assert.equal(typeof external!.overallScore, "number");
  assert.ok(external!.valuation.low < external!.valuation.high);
});

test("opportunity discovery v2: excludes explicit hold dedupe keys", () => {
  const pipelineRows: OpportunityPipelineRow[] = [
    {
      id: "p1",
      name: "Premier Padel / Ten Toes",
      organization: "Premier Padel",
      opportunity_type: "brand_partnership",
      status: "identified",
      value_estimate: null,
      prestige_score: null,
      probability_score: null,
      owner_agent: "avery",
      next_step: null,
      next_step_due_at: null,
      notes_md: null,
      source: null
    }
  ];

  const candidates = buildOpportunityCandidatesV2({
    pipelineRows,
    externalCandidates: [],
    relationships: [],
    holdExclusions: { dedupeKeys: ["premier padel / ten toes|premier padel"] }
  });

  assert.equal(candidates.length, 0);
});

