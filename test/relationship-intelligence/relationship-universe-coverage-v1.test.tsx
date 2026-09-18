import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRelationshipUniverseCoverageV1,
  type RelationshipUniverseCoverageDimensionV1,
  type RelationshipUniverseTargetV1,
  type RelationshipUniverseTruthStateV1
} from "../../src/lib/relationship-intelligence/relationship-universe-coverage-v1";

const NOW = "2026-09-18T06:00:00.000Z";

function dimension(
  state: RelationshipUniverseTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:dimension"]
) {
  return { state, evidenceRefs };
}

const CORE_REQUIREMENTS: readonly RelationshipUniverseCoverageDimensionV1[] = [
  "DECISION_FUNCTION",
  "DECISION_AUTHORITY",
  "ACCESS_PATH",
  "PLANNING_WINDOW"
];

function target(overrides: Partial<RelationshipUniverseTargetV1> = {}): RelationshipUniverseTargetV1 {
  return {
    targetId: "college:priority-1",
    canonicalEntityRef: "org:priority-1",
    domain: "COLLEGE_ATHLETICS",
    priorityTier: "TIER_1",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:record", "evidence:record"],
    requiredDimensions: CORE_REQUIREMENTS,
    dimensions: {
      DECISION_FUNCTION: dimension(),
      DECISION_AUTHORITY: dimension(),
      ACCESS_PATH: dimension(),
      PLANNING_WINDOW: dimension()
    },
    ...overrides
  };
}

function build(targets: readonly RelationshipUniverseTargetV1[]) {
  return buildRelationshipUniverseCoverageV1({ targets, now: NOW });
}

test("marks a target complete only when every explicitly required dimension is current KNOWN evidence", () => {
  const result = build([target()]);
  const coverage = result.targets[0];

  assert.equal(coverage.disposition, "COMPLETE");
  assert.deepEqual(coverage.knownDimensions, CORE_REQUIREMENTS);
  assert.deepEqual(coverage.missingDimensions, []);
  assert.deepEqual(coverage.verificationDimensions, []);
  assert.equal(result.aggregateCoveragePercentage, null);
});

test("scores only dimensions explicitly required for the target", () => {
  const result = build([
    target({
      targetId: "music:representation",
      canonicalEntityRef: "org:music-target",
      domain: "MUSIC",
      priorityTier: "TIER_2",
      requiredDimensions: ["CURRENT_ROLE", "ACCESS_PATH"],
      dimensions: {
        CURRENT_ROLE: dimension(),
        ACCESS_PATH: dimension()
      }
    })
  ]);
  const coverage = result.targets[0];

  assert.equal(coverage.disposition, "COMPLETE");
  assert.deepEqual(coverage.requiredDimensions, ["ACCESS_PATH", "CURRENT_ROLE"]);
  assert.equal(coverage.missingDimensions.includes("SPONSOR_ECOSYSTEM"), false);
  assert.equal(result.groups[0].requiredDimensionCounts.SPONSOR_ECOSYSTEM, 0);
});

test("keeps UNKNOWN and absent required facts as explicit research gaps", () => {
  const result = build([
    target({
      dimensions: {
        DECISION_FUNCTION: dimension(),
        DECISION_AUTHORITY: dimension("UNKNOWN", []),
        ACCESS_PATH: dimension(),
        PLANNING_WINDOW: undefined
      }
    })
  ]);
  const coverage = result.targets[0];

  assert.equal(coverage.disposition, "GAPS");
  assert.deepEqual(coverage.missingDimensions, ["DECISION_AUTHORITY", "PLANNING_WINDOW"]);
  assert.deepEqual(
    result.researchPriorities.map((priority) => [priority.dimension, priority.workType]),
    [
      ["DECISION_AUTHORITY", "RESEARCH_MISSING_FACT"],
      ["PLANNING_WINDOW", "RESEARCH_MISSING_FACT"]
    ]
  );
});

test("routes inferred, partial, stale, and conflicted required facts to verification", () => {
  const states: readonly RelationshipUniverseTruthStateV1[] = ["INFERRED", "PARTIAL", "STALE", "CONFLICTED"];
  const targets = states.map((state) =>
    target({
      targetId: `target:${state}`,
      canonicalEntityRef: `org:${state}`,
      dimensions: {
        DECISION_FUNCTION: dimension(state),
        DECISION_AUTHORITY: dimension(),
        ACCESS_PATH: dimension(),
        PLANNING_WINDOW: dimension()
      }
    })
  );
  const result = build(targets);

  for (const coverage of result.targets) {
    assert.equal(coverage.disposition, "NEEDS_VERIFICATION");
    assert.deepEqual(coverage.verificationDimensions, ["DECISION_FUNCTION"]);
  }
});

test("treats an otherwise known record as verification-needed when its observation is stale", () => {
  const result = buildRelationshipUniverseCoverageV1({
    targets: [target({ observedAt: "2025-01-01T00:00:00.000Z" })],
    now: NOW,
    maximumEvidenceAgeDays: 180
  });
  const coverage = result.targets[0];

  assert.equal(coverage.disposition, "NEEDS_VERIFICATION");
  assert.equal(coverage.verificationDimensions.length, CORE_REQUIREMENTS.length);
  assert.ok(coverage.reasonCodes.includes("RECORD_EVIDENCE_STALE"));
});

test("fails closed when a target lacks a canonical entity anchor or record provenance", () => {
  const result = build([
    target({ targetId: "missing-anchor", canonicalEntityRef: null }),
    target({ targetId: "missing-provenance", canonicalEntityRef: "org:missing-provenance", evidenceRefs: [] })
  ]);

  assert.equal(result.targets.find((item) => item.targetId === "missing-anchor")?.disposition, "SUPPRESS");
  assert.equal(result.targets.find((item) => item.targetId === "missing-provenance")?.disposition, "SUPPRESS");
  assert.equal(result.researchPriorities.length, 0);
});

test("groups coverage by domain and priority tier with dimension-level counts rather than a fake score", () => {
  const result = build([
    target(),
    target({
      targetId: "college:priority-2",
      canonicalEntityRef: "org:priority-2",
      priorityTier: "TIER_2",
      dimensions: {
        DECISION_FUNCTION: dimension(),
        DECISION_AUTHORITY: dimension("UNKNOWN", []),
        ACCESS_PATH: dimension(),
        PLANNING_WINDOW: dimension()
      }
    }),
    target({
      targetId: "brand:priority-1",
      canonicalEntityRef: "org:brand-priority-1",
      domain: "BRAND_CORPORATE",
      priorityTier: "TIER_1",
      requiredDimensions: ["DECISION_FUNCTION", "SPONSOR_ECOSYSTEM", "PLANNING_WINDOW"],
      dimensions: {
        DECISION_FUNCTION: dimension(),
        SPONSOR_ECOSYSTEM: dimension(),
        PLANNING_WINDOW: dimension()
      }
    })
  ]);

  assert.equal(result.groups.length, 3);
  const collegeTier1 = result.groups.find((group) => group.domain === "COLLEGE_ATHLETICS" && group.priorityTier === "TIER_1");
  const collegeTier2 = result.groups.find((group) => group.domain === "COLLEGE_ATHLETICS" && group.priorityTier === "TIER_2");
  const brandTier1 = result.groups.find((group) => group.domain === "BRAND_CORPORATE" && group.priorityTier === "TIER_1");

  assert.equal(collegeTier1?.completeCount, 1);
  assert.equal(collegeTier2?.gapCount, 1);
  assert.equal(collegeTier2?.missingDimensionCounts.DECISION_AUTHORITY, 1);
  assert.equal(brandTier1?.requiredDimensionCounts.SPONSOR_ECOSYSTEM, 1);
  assert.equal(brandTier1?.knownDimensionCounts.SPONSOR_ECOSYSTEM, 1);
  assert.equal(result.aggregateCoveragePercentage, null);
});

test("prioritizes Tier 1 research before lower tiers and uses deterministic dimension order", () => {
  const result = build([
    target({
      targetId: "tier-2",
      canonicalEntityRef: "org:tier-2",
      priorityTier: "TIER_2",
      dimensions: {
        DECISION_FUNCTION: dimension("UNKNOWN", []),
        DECISION_AUTHORITY: dimension(),
        ACCESS_PATH: dimension(),
        PLANNING_WINDOW: dimension()
      }
    }),
    target({
      targetId: "tier-1",
      canonicalEntityRef: "org:tier-1",
      priorityTier: "TIER_1",
      dimensions: {
        DECISION_FUNCTION: dimension(),
        DECISION_AUTHORITY: dimension("UNKNOWN", []),
        ACCESS_PATH: dimension("UNKNOWN", []),
        PLANNING_WINDOW: dimension()
      }
    })
  ]);

  assert.deepEqual(
    result.researchPriorities.map((priority) => `${priority.targetId}:${priority.dimension}`),
    ["tier-1:DECISION_AUTHORITY", "tier-1:ACCESS_PATH", "tier-2:DECISION_FUNCTION"]
  );
});

test("requires provenance for a KNOWN required fact", () => {
  assert.throws(
    () =>
      build([
        target({
          dimensions: {
            DECISION_FUNCTION: dimension("KNOWN", []),
            DECISION_AUTHORITY: dimension(),
            ACCESS_PATH: dimension(),
            PLANNING_WINDOW: dimension()
          }
        })
      ]),
    /KNOWN state requires evidenceRefs/
  );
});

test("rejects duplicate IDs, future evidence, empty requirement sets, and excessive priority caps", () => {
  assert.throws(() => build([target(), target()]), /duplicate targetId/);
  assert.throws(() => build([target({ observedAt: "2026-09-19T00:00:00.000Z" })]), /must not be future-dated/);
  assert.throws(() => build([target({ requiredDimensions: [] })]), /at least one dimension/);
  assert.throws(
    () => buildRelationshipUniverseCoverageV1({ targets: [target()], now: NOW, maximumResearchPriorities: 501 }),
    /maximumResearchPriorities/
  );
});

test("is deterministic, deeply immutable, bounded, and performs zero external side effects", () => {
  const input = { targets: [target()], now: NOW } as const;
  const first = buildRelationshipUniverseCoverageV1(input);
  const second = buildRelationshipUniverseCoverageV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first.targets[0].evidenceRefs, ["evidence:record"]);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.targets), true);
  assert.equal(Object.isFrozen(first.targets[0]), true);
  assert.equal(Object.isFrozen(first.groups[0]), true);
  assert.equal(Object.isFrozen(first.researchPriorities), true);
});
