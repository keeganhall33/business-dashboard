import test from "node:test";
import assert from "node:assert/strict";

import {
  compileCrossEngineSynthesisV1,
  type CrossEngineHypothesisV1,
  type CrossEngineSignalV1
} from "../../src/lib/intelligence/cross-engine-synthesis-v1";

const GENERATED_AT = "2026-09-18T15:00:00.000Z";

function signal(
  signalId: string,
  domain: CrossEngineSignalV1["domain"],
  independenceKey: string,
  overrides: Partial<CrossEngineSignalV1> = {}
): CrossEngineSignalV1 {
  return {
    signalId,
    domain,
    kind: "OPPORTUNITY",
    summary: `${domain} observed signal`,
    observedAt: "2026-09-18T14:00:00.000Z",
    truthState: "KNOWN",
    freshness: "FRESH",
    materiality: "HIGH",
    entityRefs: ["entity:seattle-project"],
    evidenceRefs: [`evidence:${signalId}`],
    sourceRefs: [`source:${signalId}`],
    independenceKey,
    synthesisKeys: ["project:seattle-project"],
    ...overrides
  };
}

function hypothesis(
  signalIds: readonly string[],
  overrides: Partial<CrossEngineHypothesisV1> = {}
): CrossEngineHypothesisV1 {
  return {
    hypothesisId: "hypothesis:seattle-demand",
    signalIds,
    classification: "OPPORTUNITY",
    connection: "Independent current signals point to the same explicitly linked project window.",
    whyItMatters: "The shared project may warrant bounded internal review before committing resources.",
    expectedImpact: {
      state: "UNKNOWN",
      unit: null,
      low: null,
      high: null,
      evidenceRefs: []
    },
    decisiveUnknowns: ["Inventory and capacity still need verification."],
    timingWindow: null,
    affectedDecisionRefs: [],
    affectedActionRefs: [],
    nextSafeAction: {
      kind: "REVIEW",
      summary: "Review the linked evidence and verify inventory/capacity before preparing any action."
    },
    ...overrides
  };
}

test("promotes two independent current domains only through an explicit shared synthesis key", () => {
  const result = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party"),
      signal("revenue-1", "REVENUE", "woo:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"])]
  });

  assert.equal(result.status, "READY");
  assert.equal(result.readyCount, 1);
  assert.equal(result.items[0].status, "READY");
  assert.equal(result.items[0].supportMode, "MULTI_DOMAIN_INDEPENDENT");
  assert.deepEqual(result.items[0].domains, ["REVENUE", "SOCIAL"]);
  assert.deepEqual(result.items[0].sharedSynthesisKeys, ["project:seattle-project"]);
  assert.equal(result.items[0].causalAttribution, "NOT_ESTABLISHED");
  assert.equal(result.items[0].expectedImpact.state, "UNKNOWN");
  assert.equal(result.items[0].authority.externalMutationAllowed, false);
  assert.equal(result.items[0].authority.actionExecutionAllowed, false);
  assert.equal(result.items[0].authority.approvalBypassAllowed, false);
  assert.equal(result.externalAccessPerformed, false);
  assert.equal(result.writesPerformed, false);
});

test("fails closed when two projected signals share the same upstream lineage", () => {
  const result = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "shared-export"),
      signal("revenue-1", "REVENUE", "shared-export")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"])]
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.items[0].blockReasons, ["DUPLICATED_LINEAGE"]);
  assert.equal(result.items[0].supportAssessment, "INSUFFICIENT_FOR_DECISION_GRADE_SYNTHESIS");
});

test("requires genuinely different material domains instead of counting multiple rows from one domain", () => {
  const result = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party"),
      signal("social-2", "SOCIAL", "youtube:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "social-2"])]
  });

  assert.equal(result.items[0].status, "BLOCKED");
  assert.ok(result.items[0].blockReasons.includes("INSUFFICIENT_INDEPENDENT_DOMAINS"));
});

test("does not invent a relationship when current independent signals lack a shared canonical synthesis key", () => {
  const result = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party", { synthesisKeys: ["project:a"] }),
      signal("inventory-1", "INVENTORY", "inventory:first-party", { synthesisKeys: ["product:b"] })
    ],
    hypotheses: [hypothesis(["social-1", "inventory-1"])]
  });

  assert.equal(result.items[0].status, "BLOCKED");
  assert.ok(result.items[0].blockReasons.includes("NO_EXPLICIT_SHARED_SYNTHESIS_KEY"));
});

test("blocks stale, partial, unknown, and conflicted support rather than synthesizing around it", () => {
  for (const truthState of ["PARTIAL", "STALE", "UNKNOWN", "CONFLICTED"] as const) {
    const result = compileCrossEngineSynthesisV1({
      generatedAt: GENERATED_AT,
      signals: [
        signal("social-1", "SOCIAL", "instagram:first-party", { truthState }),
        signal("revenue-1", "REVENUE", "woo:first-party")
      ],
      hypotheses: [hypothesis(["social-1", "revenue-1"])]
    });
    assert.equal(result.items[0].status, "BLOCKED");
    assert.ok(result.items[0].blockReasons.includes("SIGNAL_NOT_DECISION_GRADE"));
  }

  const staleFreshness = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party", { freshness: "STALE" }),
      signal("revenue-1", "REVENUE", "woo:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"])]
  });
  assert.ok(staleFreshness.items[0].blockReasons.includes("SIGNAL_NOT_DECISION_GRADE"));
});

test("allows one critical signal to escalate for review without pretending it is cross-domain or causal", () => {
  const result = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [signal("risk-1", "FINANCE", "finance:first-party", {
      kind: "RISK",
      materiality: "CRITICAL",
      synthesisKeys: ["risk:cash-threshold"]
    })],
    hypotheses: [hypothesis(["risk-1"], {
      hypothesisId: "hypothesis:critical-risk",
      classification: "RISK",
      connection: "A critical verified financial signal requires review.",
      whyItMatters: "Critical materiality warrants escalation even without a second domain.",
      nextSafeAction: { kind: "REVIEW", summary: "Review the critical signal and supporting evidence." }
    })]
  });

  assert.equal(result.items[0].status, "READY");
  assert.equal(result.items[0].supportMode, "SINGLE_CRITICAL_SIGNAL");
  assert.equal(result.items[0].supportAssessment, "SINGLE_CRITICAL_SIGNAL_REQUIRES_REVIEW");
  assert.equal(result.items[0].causalAttribution, "NOT_ESTABLISHED");
  assert.equal(result.items[0].authority.spendAllowed, false);
});

test("passes through a supported impact range only when every impact ref is linked to contributing evidence", () => {
  const supported = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party"),
      signal("revenue-1", "REVENUE", "woo:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"], {
      expectedImpact: {
        state: "SUPPORTED",
        unit: "CENTS",
        low: 1000,
        high: 5000,
        evidenceRefs: ["evidence:revenue-1"]
      }
    })]
  });
  assert.deepEqual(supported.items[0].expectedImpact, {
    state: "SUPPORTED",
    unit: "CENTS",
    low: 1000,
    high: 5000,
    evidenceRefs: ["evidence:revenue-1"]
  });

  const unlinked = compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party"),
      signal("revenue-1", "REVENUE", "woo:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"], {
      expectedImpact: {
        state: "SUPPORTED",
        unit: "CENTS",
        low: 1000,
        high: 5000,
        evidenceRefs: ["evidence:not-contributing"]
      }
    })]
  });
  assert.equal(unlinked.items[0].status, "BLOCKED");
  assert.ok(unlinked.items[0].blockReasons.includes("IMPACT_EVIDENCE_NOT_LINKED"));
  assert.equal(unlinked.items[0].expectedImpact.state, "UNKNOWN");
});

test("rejects duplicate identities and future observations rather than silently reconciling them", () => {
  assert.throws(() => compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [
      signal("same", "SOCIAL", "instagram:first-party"),
      signal("same", "REVENUE", "woo:first-party")
    ],
    hypotheses: []
  }), /duplicate signalId/i);

  assert.throws(() => compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [signal("future", "SOCIAL", "instagram:first-party", {
      observedAt: "2026-09-19T00:00:00.000Z"
    })],
    hypotheses: []
  }), /cannot be after generatedAt/i);

  assert.throws(() => compileCrossEngineSynthesisV1({
    generatedAt: GENERATED_AT,
    signals: [signal("social-1", "SOCIAL", "instagram:first-party")],
    hypotheses: [hypothesis(["social-1", "social-1"])]
  }), /duplicate signalIds/i);
});

test("is deterministic, deeply immutable, and leaves caller input unchanged", () => {
  const input = {
    generatedAt: GENERATED_AT,
    signals: [
      signal("social-1", "SOCIAL", "instagram:first-party"),
      signal("revenue-1", "REVENUE", "woo:first-party")
    ],
    hypotheses: [hypothesis(["social-1", "revenue-1"])]
  };
  const before = structuredClone(input);
  const first = compileCrossEngineSynthesisV1(input);
  const second = compileCrossEngineSynthesisV1(input);

  assert.deepEqual(first, second);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.items), true);
  assert.equal(Object.isFrozen(first.items[0]), true);
  assert.equal(Object.isFrozen(first.items[0].authority), true);
});
