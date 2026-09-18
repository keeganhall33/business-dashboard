import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileDecisionMakerRoleFreshnessV1,
  type DecisionMakerRoleObservationV1,
  type RoleAuthorityClassV1,
  type RoleEvidenceFieldV1,
  type RoleEmploymentStateV1,
  type RoleFreshnessTruthStateV1
} from "../../src/lib/relationship-intelligence/decision-maker-role-freshness-v1";

const NOW = "2026-09-18T08:00:00.000Z";

function field<T>(value: T | null, state: RoleFreshnessTruthStateV1 = "KNOWN", evidenceRefs: readonly string[] = ["evidence:field"]): RoleEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function observation(overrides: Partial<DecisionMakerRoleObservationV1> = {}): DecisionMakerRoleObservationV1 {
  return {
    observationId: "role:1",
    canonicalPersonRef: "person:1",
    canonicalOrganizationRef: "org:brand-a",
    observedAt: "2026-09-17T08:00:00.000Z",
    sourceRef: "source:official-bio",
    evidenceRefs: ["evidence:official-bio"],
    truthState: "KNOWN",
    employmentState: field<RoleEmploymentStateV1>("CURRENT"),
    title: field("VP, Sports Marketing"),
    decisionFunction: field("SPORTS_MARKETING"),
    authorityClass: field<RoleAuthorityClassV1>("DECISION_MAKER"),
    ...overrides
  };
}

test("marks a fresh fully evidenced current decision-maker role usable for the graph", () => {
  const result = reconcileDecisionMakerRoleFreshnessV1({ observations: [observation()], now: NOW });
  const role = result.roles[0];

  assert.equal(role.disposition, "CURRENT_ROLE_SUPPORTED");
  assert.equal(role.currentObservationId, "role:1");
  assert.equal(role.canonicalOrganizationRef, "org:brand-a");
  assert.equal(role.authorityClass, "DECISION_MAKER");
  assert.equal(role.authorityUsableForGraph, true);
  assert.equal(role.authorityRevalidationRequired, false);
  assert.equal(role.relationshipEdgeInvalidated, false);
});

test("a newer KNOWN role supersedes prior role authority without claiming the relationship disappeared", () => {
  const oldRole = observation({
    observationId: "role:old",
    observedAt: "2026-05-01T08:00:00Z",
    canonicalOrganizationRef: "org:brand-a",
    title: field("Director, Partnerships"),
    decisionFunction: field("PARTNERSHIPS"),
    authorityClass: field<RoleAuthorityClassV1>("INFLUENCER")
  });
  const newRole = observation({
    observationId: "role:new",
    observedAt: "2026-09-17T08:00:00Z",
    canonicalOrganizationRef: "org:brand-b",
    title: field("VP, Brand Partnerships"),
    decisionFunction: field("BRAND_PARTNERSHIPS"),
    authorityClass: field<RoleAuthorityClassV1>("DECISION_MAKER")
  });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [oldRole, newRole], now: NOW }).roles[0];

  assert.equal(role.currentObservationId, "role:new");
  assert.equal(role.canonicalOrganizationRef, "org:brand-b");
  assert.deepEqual(role.supersededObservationIds, ["role:old"]);
  assert.equal(role.authorityRevalidationRequired, true);
  assert.equal(role.relationshipEdgeInvalidated, false);
  assert.deepEqual(role.reasonCodes, ["NEWER_KNOWN_ROLE_SUPERSEDES_PRIOR_ROLE_AUTHORITY"]);
});

test("explicit KNOWN departure removes old decision authority but does not erase relationship history", () => {
  const current = observation({ observationId: "role:old", observedAt: "2026-06-01T08:00:00Z" });
  const departure = observation({
    observationId: "role:departure",
    observedAt: "2026-09-17T08:00:00Z",
    employmentState: field<RoleEmploymentStateV1>("DEPARTED"),
    title: field("VP, Sports Marketing"),
    decisionFunction: field("SPORTS_MARKETING"),
    authorityClass: field<RoleAuthorityClassV1>("DECISION_MAKER")
  });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [current, departure], now: NOW }).roles[0];

  assert.equal(role.disposition, "NO_CURRENT_ROLE_SUPPORTED");
  assert.equal(role.currentObservationId, null);
  assert.equal(role.authorityUsableForGraph, false);
  assert.equal(role.authorityRevalidationRequired, true);
  assert.equal(role.relationshipEdgeInvalidated, false);
  assert.deepEqual(role.supersededObservationIds, ["role:old"]);
});

test("same-time conflicting KNOWN role evidence fails closed", () => {
  const first = observation({ observationId: "role:a", canonicalOrganizationRef: "org:a" });
  const second = observation({
    observationId: "role:b",
    canonicalOrganizationRef: "org:b",
    title: field("Chief Marketing Officer")
  });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [first, second], now: NOW }).roles[0];

  assert.equal(role.disposition, "CONFLICTED");
  assert.equal(role.currentObservationId, null);
  assert.equal(role.authorityUsableForGraph, false);
  assert.equal(role.authorityRevalidationRequired, true);
  assert.deepEqual(role.reasonCodes, ["CONFLICTING_LATEST_KNOWN_ROLE_EVIDENCE"]);
});

test("stale evidence cannot remain usable decision-maker authority", () => {
  const stale = observation({ observedAt: "2026-01-01T08:00:00Z" });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [stale], now: NOW, maximumEvidenceAgeDays: 120 }).roles[0];

  assert.equal(role.disposition, "VERIFY_REQUIRED");
  assert.equal(role.authorityUsableForGraph, false);
  assert.ok(role.reasonCodes.includes("LATEST_ROLE_EVIDENCE_STALE_BY_AGE"));
});

test("inferred, partial, unknown, stale, and conflicted role evidence stays verification-required", () => {
  for (const state of ["INFERRED", "PARTIAL", "UNKNOWN", "STALE", "CONFLICTED"] as const) {
    const candidate = observation({ observationId: `role:${state}`, truthState: state });
    const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [candidate], now: NOW }).roles[0];

    assert.equal(role.disposition, "VERIFY_REQUIRED");
    assert.equal(role.authorityUsableForGraph, false);
    assert.ok(role.reasonCodes.includes(`ROLE_TRUTH_${state}_REQUIRES_VERIFICATION`));
  }
});

test("a known current title with unknown authority stays a research gap rather than becoming a decision maker", () => {
  const candidate = observation({
    authorityClass: field<RoleAuthorityClassV1>("UNKNOWN", "KNOWN"),
    decisionFunction: field<string>(null, "KNOWN")
  });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [candidate], now: NOW }).roles[0];

  assert.equal(role.disposition, "CURRENT_ROLE_NEEDS_RESEARCH");
  assert.equal(role.title, "VP, Sports Marketing");
  assert.equal(role.authorityUsableForGraph, false);
  assert.deepEqual(role.reasonCodes, ["CURRENT_ROLE_EVIDENCED_BUT_DECISION_FUNCTION_OR_AUTHORITY_MISSING"]);
});

test("an UNKNOWN current-employment state cannot be promoted to current authority", () => {
  const candidate = observation({ employmentState: field<RoleEmploymentStateV1>("UNKNOWN", "UNKNOWN") });
  const role = reconcileDecisionMakerRoleFreshnessV1({ observations: [candidate], now: NOW }).roles[0];

  assert.equal(role.disposition, "VERIFY_REQUIRED");
  assert.equal(role.authorityUsableForGraph, false);
  assert.ok(role.reasonCodes.includes("CURRENT_EMPLOYMENT_NOT_CONFIRMED"));
});

test("keeps separate canonical people separate even when titles and organizations match", () => {
  const first = observation({ observationId: "role:p1", canonicalPersonRef: "person:1" });
  const second = observation({ observationId: "role:p2", canonicalPersonRef: "person:2" });
  const result = reconcileDecisionMakerRoleFreshnessV1({ observations: [first, second], now: NOW });

  assert.equal(result.roles.length, 2);
  assert.deepEqual(result.roles.map((role) => role.canonicalPersonRef), ["person:1", "person:2"]);
});

test("rejects duplicate observation identities and future-dated evidence", () => {
  assert.throws(
    () => reconcileDecisionMakerRoleFreshnessV1({ observations: [observation(), observation()], now: NOW }),
    /duplicate observationId/
  );
  assert.throws(
    () => reconcileDecisionMakerRoleFreshnessV1({ observations: [observation({ observedAt: "2026-09-19T08:00:00Z" })], now: NOW }),
    /must not be future-dated/
  );
});

test("is deterministic, deeply immutable, and performs no research, CRM, relationship, or external mutation", () => {
  const input = { observations: [observation()], now: NOW } as const;
  const first = reconcileDecisionMakerRoleFreshnessV1(input);
  const second = reconcileDecisionMakerRoleFreshnessV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.externalResearchPerformed, false);
  assert.equal(first.crmMutationPerformed, false);
  assert.equal(first.relationshipMutationPerformed, false);
  assert.equal(first.externalActionPerformed, false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.roles), true);
  assert.equal(Object.isFrozen(first.roles[0]), true);
  assert.equal(Object.isFrozen(first.roles[0].evidenceRefs), true);
});
