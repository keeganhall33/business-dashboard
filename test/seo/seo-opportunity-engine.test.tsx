import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeoOpportunityPlanV1,
  validateSeoEvidenceV1,
  type SeoEvidenceV1
} from "@/lib/seo/seo-opportunity-engine";

function evidence(
  id: string,
  overrides: Partial<SeoEvidenceV1> = {}
): SeoEvidenceV1 {
  return {
    id,
    url: `https://keeganhall.com/${id}`,
    pageType: "ARTWORK",
    findingType: "QUERY",
    query: `query ${id}`,
    metrics: {
      clicks: 40,
      impressions: 2_000,
      ctr: 0.02,
      averagePosition: 11,
      conversions: null,
      revenueCents: null,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      source: "Search Console"
    },
    finding: `Evidence finding ${id}`,
    recommendedAction: `Improve existing page ${id}`,
    effort: "LOW",
    commercialIntent: "MEDIUM",
    businessOutcome: "QUALIFIED_TRAFFIC",
    provenance: {
      source: "Search Console",
      observed_at: "2026-09-01T12:00:00.000Z",
      confidence: "HIGH"
    },
    safetyFlags: [],
    ...overrides
  };
}

test("page-two, high-impression, low-CTR existing-page evidence becomes a deterministic quick win", () => {
  const input = [evidence("page-two")];
  const first = buildSeoOpportunityPlanV1(input);
  const second = buildSeoOpportunityPlanV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.opportunities.length, 1);
  assert.equal(first.opportunities[0]?.horizon, "QUICK_WIN");
  assert.equal(first.opportunities[0]?.expectedBusinessImpact, "MEDIUM");
  assert.equal(first.opportunities[0]?.evidenceConfidence, "HIGH");
  assert.equal(first.monthlyActions[0]?.id, "page-two");
  assert.ok((first.opportunities[0]?.priorityScore ?? 0) >= 70);
});

test("commercially qualified evidence outranks vanity traffic without business intent", () => {
  const highIntent = evidence("commission-intent", {
    commercialIntent: "HIGH",
    businessOutcome: "ORIGINAL_COMMISSION",
    metrics: {
      clicks: 8,
      impressions: 80,
      ctr: 0.1,
      averagePosition: 22,
      conversions: 1,
      revenueCents: null,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      source: "Search Console + CRM"
    }
  });
  const vanity = evidence("vanity-traffic", {
    commercialIntent: "LOW",
    businessOutcome: "QUALIFIED_TRAFFIC",
    metrics: {
      clicks: 12_000,
      impressions: 250_000,
      ctr: 0.048,
      averagePosition: 2,
      conversions: 0,
      revenueCents: 0,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      source: "Search Console"
    }
  });

  const plan = buildSeoOpportunityPlanV1([vanity, highIntent]);
  assert.equal(plan.opportunities[0]?.id, "commission-intent");
  assert.equal(plan.opportunities[0]?.expectedBusinessImpact, "HIGH");
  assert.ok(
    (plan.opportunities[0]?.priorityScore ?? 0) > (plan.opportunities[1]?.priorityScore ?? 0),
    "conversion/commercial evidence should outweigh raw traffic volume"
  );
});

test("UNKNOWN inputs stay UNKNOWN and provenance/confidence remain attached", () => {
  const unknown = evidence("unknown", {
    commercialIntent: "UNKNOWN",
    businessOutcome: "UNKNOWN",
    effort: "UNKNOWN",
    metrics: {
      clicks: null,
      impressions: null,
      ctr: null,
      averagePosition: null,
      conversions: null,
      revenueCents: null,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      source: "Search Console"
    },
    provenance: {
      source: "manual-audit",
      observed_at: "2026-09-02T12:00:00.000Z",
      confidence: "UNKNOWN"
    }
  });

  const opportunity = buildSeoOpportunityPlanV1([unknown]).opportunities[0];
  assert.ok(opportunity);
  assert.equal(opportunity.expectedBusinessImpact, "UNKNOWN");
  assert.equal(opportunity.effort, "UNKNOWN");
  assert.equal(opportunity.evidenceConfidence, "UNKNOWN");
  assert.deepEqual(opportunity.provenance, [unknown.provenance]);
  assert.equal(opportunity.businessOutcome, "UNKNOWN");
});

test("duplicate findings collapse while retaining independent provenance", () => {
  const first = evidence("duplicate-a", {
    url: "https://keeganhall.com/michael-jordan-art",
    query: "michael jordan art",
    finding: "High impressions with low CTR",
    provenance: {
      source: "Search Console",
      observed_at: "2026-09-01T12:00:00.000Z",
      confidence: "HIGH"
    }
  });
  const second = evidence("duplicate-b", {
    url: "https://keeganhall.com/michael-jordan-art",
    query: "Michael Jordan Art",
    finding: "  High   impressions with low CTR  ",
    provenance: {
      source: "monthly-seo-audit",
      observed_at: "2026-09-02T12:00:00.000Z",
      confidence: "MEDIUM"
    }
  });

  const plan = buildSeoOpportunityPlanV1([first, second]);
  assert.equal(plan.opportunities.length, 1);
  assert.equal(plan.opportunities[0]?.provenance.length, 2);
  assert.deepEqual(
    plan.opportunities[0]?.provenance.map((item) => item.source),
    ["monthly-seo-audit", "Search Console"]
  );
  assert.equal(plan.opportunities[0]?.evidenceConfidence, "HIGH");
});

test("monthly action plan is capped at five with stable ordering", () => {
  const items = Array.from({ length: 7 }, (_, index) =>
    evidence(`candidate-${index + 1}`, {
      commercialIntent: index < 2 ? "HIGH" : "MEDIUM",
      metrics: {
        clicks: 10 + index,
        impressions: 500 + index * 100,
        ctr: 0.02,
        averagePosition: 8 + index,
        conversions: index === 0 ? 1 : null,
        revenueCents: null,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        source: "Search Console"
      }
    })
  );

  const first = buildSeoOpportunityPlanV1(items);
  const reversed = buildSeoOpportunityPlanV1([...items].reverse());
  assert.equal(first.opportunities.length, 7);
  assert.equal(first.monthlyActions.length, 5);
  assert.deepEqual(first.monthlyActions, reversed.monthlyActions);
});

test("brand-diluting, doorway, thin-content, and unsupported ranking-factor tactics are rejected", () => {
  const keywordStuffing = evidence("keyword-stuffing", { safetyFlags: ["KEYWORD_STUFFING"] });
  const doorway = evidence("doorway", { findingType: "CONTENT_GAP", safetyFlags: ["DOORWAY_PAGE", "MASS_CITY_PAGES"] });
  const thin = evidence("thin-ai", { findingType: "CONTENT_GAP", safetyFlags: ["THIN_AI_CONTENT"] });
  const fakeLocal = evidence("fake-local", { findingType: "GBP", safetyFlags: ["FAKE_LOCAL_RELEVANCE"] });
  const unsupported = evidence("ranking-myth", { findingType: "GBP", safetyFlags: ["UNSUPPORTED_RANKING_FACTOR"] });

  const plan = buildSeoOpportunityPlanV1([keywordStuffing, doorway, thin, fakeLocal, unsupported]);
  assert.equal(plan.opportunities.length, 0);
  assert.equal(plan.rejected.length, 5);
  assert.equal(plan.rejected.find((item) => item.id === "ranking-myth")?.reason, "UNSUPPORTED_RANKING_FACTOR");
  for (const id of ["keyword-stuffing", "doorway", "thin-ai", "fake-local"]) {
    assert.equal(plan.rejected.find((item) => item.id === id)?.reason, "BRAND_OR_SPAM_RISK");
  }
});

test("athlete or celebrity rights risk is surfaced and penalized rather than hidden", () => {
  const safe = evidence("safe-artwork", {
    query: "sports pencil art",
    commercialIntent: "HIGH",
    businessOutcome: "ARTWORK_SALE"
  });
  const rightsRisk = evidence("celebrity-rights", {
    query: "celebrity signed art",
    commercialIntent: "HIGH",
    businessOutcome: "ARTWORK_SALE",
    safetyFlags: ["RIGHTS_RISK"]
  });

  const plan = buildSeoOpportunityPlanV1([rightsRisk, safe]);
  const risky = plan.opportunities.find((item) => item.id === "celebrity-rights");
  const safeOpportunity = plan.opportunities.find((item) => item.id === "safe-artwork");
  assert.ok(risky);
  assert.ok(safeOpportunity);
  assert.deepEqual(risky.safetyFlags, ["RIGHTS_RISK"]);
  assert.match(risky.recommendedAction, /^Resolve athlete\/celebrity commercial-rights risk before acting\./);
  assert.ok(risky.priorityScore < safeOpportunity.priorityScore);
});

test("malformed dates, metrics, URLs, duplicate ids, and unsupported evidence fail closed", () => {
  assert.throws(
    () => validateSeoEvidenceV1([evidence("bad-observed", { provenance: { source: "audit", observed_at: "not-a-date", confidence: "HIGH" } })]),
    /observed_at must be a canonical ISO timestamp/
  );

  const badCtr = evidence("bad-ctr");
  badCtr.metrics = { ...badCtr.metrics!, ctr: 1.2 };
  assert.throws(() => validateSeoEvidenceV1([badCtr]), /metrics\.ctr must be null or a finite number/);

  const negativeImpressions = evidence("bad-impressions");
  negativeImpressions.metrics = { ...negativeImpressions.metrics!, impressions: -1 };
  assert.throws(() => validateSeoEvidenceV1([negativeImpressions]), /metrics\.impressions must be null or a finite number/);

  const badPosition = evidence("bad-position");
  badPosition.metrics = { ...badPosition.metrics!, averagePosition: 0 };
  assert.throws(() => validateSeoEvidenceV1([badPosition]), /metrics\.averagePosition must be null or a finite number/);

  assert.throws(() => validateSeoEvidenceV1([evidence("bad-url", { url: "not-a-url" })]), /url must be an absolute URL/);
  assert.throws(() => validateSeoEvidenceV1([evidence("same"), evidence("same")]), /Duplicate evidence id same/);
  assert.throws(
    () => validateSeoEvidenceV1([{ ...evidence("bad-confidence"), provenance: { source: "audit", observed_at: "2026-09-01T12:00:00.000Z", confidence: "CERTAIN" } }]),
    /provenance\.confidence is unsupported/
  );
});
