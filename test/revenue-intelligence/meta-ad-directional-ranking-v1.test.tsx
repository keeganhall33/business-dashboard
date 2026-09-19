import assert from "node:assert/strict";
import test from "node:test";

import {
  rankMetaAdDirectionalMovementV1,
  type MetaAdDirectionalPairV1,
  type MetaAdDirectionalWindowV1,
} from "../../src/lib/revenue-intelligence/meta-ad-directional-ranking-v1";

const GENERATED_AT = "2026-09-19T11:00:00.000Z";
const CURRENT_RANGE = { startDate: "2026-09-12", endDate: "2026-09-18" };
const PRIOR_RANGE = { startDate: "2026-09-05", endDate: "2026-09-11" };

function window(
  period: "current" | "prior",
  adId: string,
  value: number,
  sampleSize: number,
  overrides: Partial<MetaAdDirectionalWindowV1> = {},
): MetaAdDirectionalWindowV1 {
  const range = period === "current" ? CURRENT_RANGE : PRIOR_RANGE;
  return {
    adAccountId: "act_123",
    campaignId: "campaign_1",
    adSetId: "adset_1",
    adId,
    metricName: "purchase_roas",
    metricDefinitionId: "meta_purchase_roas_v1",
    metricDirection: "HIGHER_IS_BETTER",
    range,
    observedAt: "2026-09-19T10:00:00.000Z",
    completeThrough: "2026-09-18",
    truthState: "COMPLETE",
    value,
    sampleSize,
    evidenceRefs: [`meta:${adId}:${period}:purchase_roas`],
    ...overrides,
  };
}

function pair(
  adId: string,
  currentValue: number,
  priorValue: number,
  currentSample = 1000,
  priorSample = 1000,
): MetaAdDirectionalPairV1 {
  return {
    current: window("current", adId, currentValue, currentSample),
    prior: window("prior", adId, priorValue, priorSample),
  };
}

function rank(pairs: readonly MetaAdDirectionalPairV1[]) {
  return rankMetaAdDirectionalMovementV1({
    generatedAt: GENERATED_AT,
    windowDays: 7,
    maximumEvidenceAgeHours: 48,
    minimumSampleSize: 100,
    materialChangeRatio: 0.2,
    pairs,
  });
}

test("classifies evidence-backed ad-level winner, loser, and insufficient-sample candidates without causal claims", () => {
  const result = rank([
    pair("winner", 1.5, 1.0),
    pair("loser", 0.7, 1.0),
    pair("thin", 2.0, 1.0, 50, 1000),
  ]);

  assert.equal(result.status, "READY");
  assert.deepEqual(
    Object.fromEntries(result.entries.map((entry) => [entry.adId, entry.classification])),
    {
      winner: "WINNER_CANDIDATE",
      loser: "LOSER_CANDIDATE",
      thin: "INSUFFICIENT_SAMPLE",
    },
  );
  const thin = result.entries.find((entry) => entry.adId === "thin");
  assert.equal(thin?.relativeChange, null);
  assert.equal(thin?.nextInternalStep, "COLLECT_MORE_SAMPLE");
  assert.equal(result.statisticalSignificanceEstablished, false);
  assert.equal(result.causalityEstablished, false);
  assert.equal(result.attributionEstablished, false);
  assert.equal(result.confidence, null);
  assert.equal(result.monetaryImpact, null);
  assert.equal(result.authority.metaWriteAllowed, false);
  assert.equal(result.authority.approvalBypassAllowed, false);
  assert.equal(result.externalMutationPerformed, false);
});

test("respects lower-is-better metric direction", () => {
  const result = rank([
    {
      current: window("current", "cpc-improved", 0.7, 1000, {
        metricName: "cpc",
        metricDefinitionId: "meta_cpc_v1",
        metricDirection: "LOWER_IS_BETTER",
      }),
      prior: window("prior", "cpc-improved", 1.0, 1000, {
        metricName: "cpc",
        metricDefinitionId: "meta_cpc_v1",
        metricDirection: "LOWER_IS_BETTER",
      }),
    },
    {
      current: window("current", "cpc-worse", 1.3, 1000, {
        metricName: "cpc",
        metricDefinitionId: "meta_cpc_v1",
        metricDirection: "LOWER_IS_BETTER",
      }),
      prior: window("prior", "cpc-worse", 1.0, 1000, {
        metricName: "cpc",
        metricDefinitionId: "meta_cpc_v1",
        metricDirection: "LOWER_IS_BETTER",
      }),
    },
  ]);

  assert.equal(result.status, "READY");
  assert.equal(
    result.entries.find((entry) => entry.adId === "cpc-improved")?.classification,
    "WINNER_CANDIDATE",
  );
  assert.equal(
    result.entries.find((entry) => entry.adId === "cpc-worse")?.classification,
    "LOSER_CANDIDATE",
  );
});

test("withholds relative direction when a nonzero current value follows a zero baseline", () => {
  const result = rank([pair("zero-base", 1, 0)]);
  assert.equal(result.status, "READY");
  assert.equal(result.entries[0]?.classification, "UNRESOLVED_ZERO_BASELINE");
  assert.equal(result.entries[0]?.relativeChange, null);
  assert.equal(result.entries[0]?.nextInternalStep, "VERIFY_ZERO_BASELINE");
});

test("fails closed on exact ad or metric identity drift", () => {
  const mismatched = pair("ad-1", 1.4, 1.0);
  const result = rank([
    {
      current: mismatched.current,
      prior: { ...mismatched.prior, adId: "different-ad" },
    },
  ]);

  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "PAIR_IDENTITY_OR_METRIC_DRIFT");
  assert.deepEqual(result.entries, []);
});

test("fails closed on non-adjacent or wrong-duration fixed windows", () => {
  const base = pair("ad-1", 1.4, 1.0);
  const result = rank([
    {
      current: base.current,
      prior: {
        ...base.prior,
        range: { startDate: "2026-09-04", endDate: "2026-09-10" },
      },
    },
  ]);

  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "FIXED_WINDOWS_NOT_COMPARABLE");
  assert.deepEqual(result.entries, []);
});

test("fails closed when evidence is partial, stale, future-dated, incomplete-through, or missing a metric value", () => {
  const variants: Partial<MetaAdDirectionalWindowV1>[] = [
    { truthState: "PARTIAL" },
    { observedAt: "2026-09-16T10:00:00.000Z" },
    { observedAt: "2026-09-19T12:00:00.000Z" },
    { completeThrough: "2026-09-17" },
    { value: null },
    { sampleSize: null },
  ];

  for (const overrides of variants) {
    const base = pair("ad-1", 1.4, 1.0);
    const result = rank([
      {
        current: { ...base.current, ...overrides },
        prior: base.prior,
      },
    ]);
    assert.equal(result.status, "VERIFY_EVIDENCE", JSON.stringify(overrides));
    assert.equal(result.reasonCode, "EVIDENCE_NOT_DECISION_GRADE");
    assert.deepEqual(result.entries, []);
  }
});

test("rejects duplicate ad+metric pairs so repeated evidence cannot inflate ranking", () => {
  const duplicate = pair("same-ad", 1.4, 1.0);
  const result = rank([duplicate, duplicate]);
  assert.equal(result.status, "VERIFY_EVIDENCE");
  assert.equal(result.reasonCode, "PAIR_IDENTITY_OR_METRIC_DRIFT");
  assert.deepEqual(result.entries, []);
});

test("rejects secret-looking provenance references", () => {
  const base = pair("ad-1", 1.4, 1.0);
  const result = rank([
    {
      current: { ...base.current, evidenceRefs: ["access_token=should-not-be-here"] },
      prior: base.prior,
    },
  ]);
  assert.equal(result.status, "INVALID_INPUT");
  assert.equal(result.reasonCode, "INVALID_OR_UNBOUNDED_INPUT");
});
