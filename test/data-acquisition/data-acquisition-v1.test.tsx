import assert from "node:assert/strict";
import test from "node:test";

import { hasUnknownRequiredFact, requiresExplicitApproval } from "@/lib/data-acquisition/contracts";
import { DATA_ACQUISITION_COVERAGE_FIXTURES_V1 } from "@/lib/data-acquisition/fixtures";
import { buildDataAcquisitionResearchQueueV1 } from "@/lib/data-acquisition/research-queue";

function fixture(id: string) {
  const item = DATA_ACQUISITION_COVERAGE_FIXTURES_V1.find((map) => map.map_id === id);
  assert.ok(item, `missing fixture ${id}`);
  return item;
}

test("fixtures cover healthy, stale, conflicted, missing public, protected private, and low-value proxy cases", () => {
  assert.deepEqual(
    DATA_ACQUISITION_COVERAGE_FIXTURES_V1.map((map) => map.map_id),
    [
      "coverage-conflicted-attribution",
      "coverage-healthy-first-party-commerce",
      "coverage-low-value-proxy-trend",
      "coverage-missing-public-research",
      "coverage-protected-private-source",
      "coverage-stale-first-party-analytics"
    ]
  );
  assert.ok(DATA_ACQUISITION_COVERAGE_FIXTURES_V1.every((map) => map.contract_version === "data_acquisition_coverage_map_v1.0"));
});

test("KNOWN INFERRED UNKNOWN STALE CONFLICTED and NEEDS_RESEARCH states are preserved", () => {
  const states = new Set(DATA_ACQUISITION_COVERAGE_FIXTURES_V1.flatMap((map) => map.REQUIRED_FACTS.map((fact) => fact.truth_state)));

  assert.ok(states.has("KNOWN"));
  assert.ok(states.has("INFERRED"));
  assert.ok(states.has("UNKNOWN"));
  assert.ok(states.has("STALE"));
  assert.ok(states.has("CONFLICTED"));
  assert.ok(states.has("NEEDS_RESEARCH"));
});

test("UNKNOWN never becomes zero false or silently covered", () => {
  const protectedPrivate = fixture("coverage-protected-private-source");
  const missingPublic = fixture("coverage-missing-public-research");

  assert.equal(hasUnknownRequiredFact(protectedPrivate), true);
  assert.equal(protectedPrivate.REQUIRED_FACTS[0]?.truth_state, "UNKNOWN");
  assert.equal(protectedPrivate.REQUIRED_FACTS[0]?.covered_by_source_ids.length, 0);
  assert.equal(protectedPrivate.COVERAGE_STATE, "UNKNOWN");
  assert.equal(protectedPrivate.FRESHNESS, "UNKNOWN");
  assert.equal(protectedPrivate.CURRENT_SOURCES[0]?.evidence_quality, "UNKNOWN");

  assert.equal(hasUnknownRequiredFact(missingPublic), true);
  assert.equal(missingPublic.REQUIRED_FACTS[0]?.truth_state, "NEEDS_RESEARCH");
  assert.equal(missingPublic.CURRENT_SOURCES[0]?.covers_fact_ids.length, 0);
});

test("protected private source remains approval gated and is not auto-queued above safe public research", () => {
  const queue = buildDataAcquisitionResearchQueueV1(DATA_ACQUISITION_COVERAGE_FIXTURES_V1);
  const protectedPrivate = fixture("coverage-protected-private-source");
  const protectedItem = queue.items.find((item) => item.map_id === protectedPrivate.map_id);
  const publicItem = queue.items.find((item) => item.map_id === "coverage-missing-public-research");

  assert.ok(protectedItem);
  assert.ok(publicItem);
  assert.equal(requiresExplicitApproval(protectedPrivate), true);
  assert.equal(protectedItem.approval_class, "KEEGAN_APPROVAL_REQUIRED");
  assert.equal(protectedItem.next_best_action.safety, "APPROVAL_GATED_PRIVATE_SOURCE");
  assert.equal(protectedPrivate.STOP_RESEARCH_RULE, "Stop before private-source work unless Keegan explicitly approves it.");
  assert.ok(queue.items.indexOf(publicItem) < queue.items.indexOf(protectedItem));
  assert.equal(queue.keegan_action_required, "NO");
});

test("research queue prioritizes decision materiality and value of information without fake precision", () => {
  const queue = buildDataAcquisitionResearchQueueV1(DATA_ACQUISITION_COVERAGE_FIXTURES_V1);

  assert.equal(queue.queue_version, "data_acquisition_research_queue_v1.0");
  assert.deepEqual(
    queue.items.filter((item) => !item.suppressed).map((item) => item.map_id),
    [
      "coverage-missing-public-research",
      "coverage-conflicted-attribution",
      "coverage-stale-first-party-analytics",
      "coverage-protected-private-source"
    ]
  );
  assert.equal(queue.items[0]?.value_of_information, "CRITICAL");
  assert.equal(queue.items[0]?.cost_or_effort_class, "LOW");
  assert.equal(queue.items[0]?.critical_gap_fact_ids[0], "fact-institutional-program-fit");
});

test("low-value research is suppressible and healthy coverage does not consume acquisition queue attention", () => {
  const queue = buildDataAcquisitionResearchQueueV1(DATA_ACQUISITION_COVERAGE_FIXTURES_V1);
  const lowValue = queue.items.find((item) => item.map_id === "coverage-low-value-proxy-trend");
  const healthy = queue.items.find((item) => item.map_id === "coverage-healthy-first-party-commerce");

  assert.ok(lowValue);
  assert.ok(healthy);
  assert.equal(lowValue.suppressed, true);
  assert.match(lowValue.suppression_reason ?? "", /Low value of information/);
  assert.equal(healthy.suppressed, true);
  assert.match(healthy.suppression_reason ?? "", /Low value of information/);
  assert.ok(queue.items.indexOf(lowValue) > queue.items.findIndex((item) => !item.suppressed));
});

test("source class distinctions remain visible for dashboard consumers", () => {
  const classes = new Set(DATA_ACQUISITION_COVERAGE_FIXTURES_V1.flatMap((map) => map.CURRENT_SOURCES.map((source) => source.SOURCE_CLASS)));

  assert.ok(classes.has("FIRST_PARTY"));
  assert.ok(classes.has("PRIMARY"));
  assert.ok(classes.has("PROXY"));
  assert.ok(classes.has("PROTECTED_PRIVATE"));
  assert.equal(fixture("coverage-conflicted-attribution").CONFLICTS.length, 1);
  assert.equal(fixture("coverage-stale-first-party-analytics").SOURCE_HEALTH, "STALE");
});
