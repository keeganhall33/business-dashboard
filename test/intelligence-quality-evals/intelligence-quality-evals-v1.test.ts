import assert from "node:assert/strict";
import test from "node:test";

import { evaluateIntelligenceRecommendationQualityV1 } from "@/lib/intelligence-quality-evals/evaluator";
import {
  INTELLIGENCE_QUALITY_BAD_FIXTURE_V1,
  INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1,
  REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1
} from "@/lib/intelligence-quality-evals/fixtures";
import type { BusinessDomainV1, IntelligenceQualityDimensionV1 } from "@/lib/intelligence-quality-evals/contracts";

test("realistic synthetic fixtures cover broad business domains without private credentials", () => {
  const domains = new Set(REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1.map((item) => item.domain));
  const required: BusinessDomainV1[] = [
    "STRATEGY",
    "FINANCIAL",
    "RELATIONSHIPS",
    "CAPACITY",
    "RISK",
    "RIGHTS",
    "MARKET",
    "CREATIVE",
    "OPERATIONS",
    "CRM",
    "EVENTS",
    "COLLECTORS",
    "PROJECTS",
    "ORDERS_REVENUE",
    "MARKETING_MEDIA",
    "PARTNERSHIPS",
    "MEMORY_EMAIL_STYLE",
    "OUTCOME_LEARNING"
  ];

  for (const domain of required) assert.ok(domains.has(domain), `missing ${domain}`);
  assert.ok(REALISTIC_SYNTHETIC_BUSINESS_EVIDENCE_V1.every((item) => /fixture/i.test(item.source_label)));
});

test("good intelligence fixture passes decision-quality dimensions without fake precision", () => {
  const evaluation = evaluateIntelligenceRecommendationQualityV1(INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1);

  assert.equal(evaluation.contract_version, "intelligence_quality_eval_v1");
  assert.deepEqual(evaluation.failed_dimensions, []);
  assert.equal(evaluation.scorecard.fail_count, 0);
  assert.equal(evaluation.scorecard.artificial_precision, false);
  assert.equal(evaluation.scorecard.executive_ui_safe, false);
  assert.ok(evaluation.synthetic_domains_covered.length >= 18);
  assert.ok(evaluation.dimensions.every((item) => item.state === "PASS"));
});

test("known bad behavior identifies exact quality dimensions that regressed", () => {
  const evaluation = evaluateIntelligenceRecommendationQualityV1(INTELLIGENCE_QUALITY_BAD_FIXTURE_V1);
  const failed = new Set<IntelligenceQualityDimensionV1>(evaluation.failed_dimensions);

  assert.ok(failed.has("EVIDENCE_GROUNDING"));
  assert.ok(failed.has("UNCERTAINTY_HONESTY"));
  assert.ok(failed.has("INTERNAL_CONSISTENCY"));
  assert.ok(failed.has("NON_DUPLICATION"));
  assert.ok(failed.has("ACTIONABILITY"));
  assert.ok(failed.has("PRIORITIZATION"));
  assert.ok(failed.has("REVISION_AFTER_NEW_EVIDENCE"));
  assert.ok(failed.has("DOWNSIDE_VISIBILITY"));
  assert.ok(failed.has("OPPORTUNITY_COST"));
  assert.ok(failed.has("STRONGEST_CASE_AGAINST"));
  assert.equal(evaluation.scorecard.fail_count, evaluation.failed_dimensions.length);
});

test("missing data remains UNKNOWN and proxy evidence cannot become direct evidence", () => {
  const good = evaluateIntelligenceRecommendationQualityV1(INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1);
  const uncertainty = good.dimensions.find((item) => item.dimension === "UNCERTAINTY_HONESTY");
  const calibration = good.dimensions.find((item) => item.dimension === "EVIDENCE_CALIBRATION");

  assert.equal(uncertainty?.state, "PASS");
  assert.match(uncertainty?.reason ?? "", /UNKNOWN remains explicit/);
  assert.equal(calibration?.state, "PASS");
  assert.match(calibration?.reason ?? "", /Direct, proxy, inferred, and unknown evidence classes remain distinct/);
});

test("recommendation revision changes next action while preserving prior rationale and history", () => {
  const evaluation = evaluateIntelligenceRecommendationQualityV1(INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1);
  const revision = evaluation.dimensions.find((item) => item.dimension === "REVISION_AFTER_NEW_EVIDENCE");

  assert.equal(revision?.state, "PASS");
  assert.notEqual(
    INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1.revision?.previous_action,
    INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1.revision?.new_action
  );
  assert.deepEqual(INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1.revision?.history_versions, [1, 2]);
  assert.ok(INTELLIGENCE_QUALITY_GOOD_FIXTURE_V1.revision?.preserved_prior_rationale.length);
});
