import assert from "node:assert/strict";
import test from "node:test";

import {
  qualifySponsorMapCandidatesV1,
  type SponsorMapCandidateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";
import type { CanonicalRelationshipEntityRefV1 } from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";
import {
  resolveSponsorAccessTargetsV1,
  type SponsorAccessTargetResolutionInputV1
} from "../../src/lib/relationship-intelligence/sponsor-access-target-resolution-v1";

const SOURCE_NOW = "2026-09-18T20:00:00.000Z";
const EVALUATED_AT = "2026-09-18T20:30:00.000Z";
const EVIDENCE = ["evidence:sponsor-map-1"] as const;

function known<T>(value: T) {
  return { state: "KNOWN" as const, value, evidenceRefs: EVIDENCE };
}

function candidate(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "candidate-1",
    sourceRef: "official:sponsor-map-1",
    observedAt: "2026-09-18T19:00:00.000Z",
    evidenceRefs: EVIDENCE,
    canonicalOrganizationRef: "org:brand",
    canonicalPersonRef: "person:buyer",
    ecosystemRole: known("SPONSOR_SIDE"),
    decisionFunction: known("SPORTS_MARKETING"),
    authorityClass: known("DECISION_MAKER"),
    accessPath: known("WARM"),
    contactRoute: known("PUBLIC_PROFESSIONAL"),
    planningWindow: known("2027 sponsorship planning cycle"),
    ...overrides
  };
}

function sponsorMap(candidates: readonly SponsorMapCandidateV1[] = [candidate()]) {
  return qualifySponsorMapCandidatesV1({
    candidates,
    now: SOURCE_NOW,
    maximumEvidenceAgeDays: 30
  });
}

function entity(overrides: Partial<CanonicalRelationshipEntityRefV1> = {}): CanonicalRelationshipEntityRefV1 {
  return {
    entityId: "entity:buyer",
    label: "Evidence-backed buyer",
    canonicalRef: "person:buyer",
    ...overrides
  };
}

function resolve(
  source = sponsorMap(),
  entities: readonly CanonicalRelationshipEntityRefV1[] = [entity()],
  overrides: Partial<SponsorAccessTargetResolutionInputV1> = {}
) {
  return resolveSponsorAccessTargetsV1({
    sponsorMap: source,
    entities,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60,
    ...overrides
  });
}

test("maps a qualified sponsor decision to exactly one graph target by canonical person ref only", () => {
  const result = resolve();

  assert.equal(result.status, "READY");
  assert.deepEqual(result.mappings, [{ candidateId: "candidate-1", targetEntityId: "entity:buyer" }]);
  assert.equal(result.decisions[0].disposition, "MAPPED_EXACT_CANONICAL_PERSON");
  assert.equal(result.decisions[0].canonicalPersonRef, "person:buyer");
  assert.equal(result.decisions[0].targetEntityId, "entity:buyer");
  assert.equal(result.matchingPolicy, "EXACT_CANONICAL_PERSON_REF_ONLY");
  assert.equal(result.authority.identityJoinOnly, true);
  assert.equal(result.authority.relationshipInferenceAuthorized, false);
  assert.equal(result.authority.warmAccessInferenceAuthorized, false);
  assert.equal(result.authority.decisionAuthorityInferenceAuthorized, false);
  assert.equal(result.authority.contactDiscoveryAuthorized, false);
  assert.equal(result.authority.relationshipGraphMutationAuthorized, false);
  assert.equal(result.authority.outreachAuthorized, false);
});

test("does not use a matching label when the canonical person ref differs", () => {
  const result = resolve(sponsorMap(), [entity({ canonicalRef: "person:someone-else", label: "Evidence-backed buyer" })]);

  assert.equal(result.mappings.length, 0);
  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("CANONICAL_PERSON_NOT_PRESENT_IN_RELATIONSHIP_GRAPH"));
});

test("requires research when a qualified sponsor candidate lacks a canonical person", () => {
  const result = resolve(sponsorMap([candidate({ canonicalPersonRef: null })]));

  assert.equal(result.mappings.length, 0);
  assert.equal(result.decisions[0].disposition, "RESEARCH_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("CANONICAL_PERSON_REQUIRED_FOR_ACCESS_TARGET"));
});

test("requires verification when one canonical person ref resolves to multiple graph entities", () => {
  const result = resolve(sponsorMap(), [
    entity({ entityId: "entity:buyer-a" }),
    entity({ entityId: "entity:buyer-b" })
  ]);

  assert.equal(result.mappings.length, 0);
  assert.equal(result.decisions[0].disposition, "VERIFY_REQUIRED");
  assert.ok(result.decisions[0].reasonCodes.includes("CANONICAL_PERSON_HAS_MULTIPLE_GRAPH_ENTITIES"));
});

test("preserves sponsor-map research, verification, and suppression rather than mapping around them", () => {
  const source = sponsorMap([
    candidate({
      candidateId: "research",
      decisionFunction: { state: "UNKNOWN", value: null, evidenceRefs: [] },
      duplicateKey: "research"
    }),
    candidate({
      candidateId: "verify",
      accessPath: { state: "PARTIAL", value: "WARM", evidenceRefs: EVIDENCE },
      duplicateKey: "verify"
    }),
    candidate({
      candidateId: "suppressed",
      canonicalOrganizationRef: null,
      duplicateKey: "suppressed"
    })
  ]);
  const result = resolve(source, [entity()]);
  const byId = new Map(result.decisions.map((item) => [item.candidateId, item]));

  assert.equal(byId.get("research")?.disposition, "RESEARCH_REQUIRED");
  assert.equal(byId.get("verify")?.disposition, "VERIFY_REQUIRED");
  assert.equal(byId.get("suppressed")?.disposition, "SUPPRESS");
  assert.equal(result.mappings.length, 0);
});

test("maps multiple distinct candidates deterministically when each has one exact graph identity", () => {
  const source = sponsorMap([
    candidate({ candidateId: "b", canonicalPersonRef: "person:b", duplicateKey: "b" }),
    candidate({ candidateId: "a", canonicalPersonRef: "person:a", duplicateKey: "a" })
  ]);
  const result = resolve(source, [
    entity({ entityId: "entity:b", canonicalRef: "person:b" }),
    entity({ entityId: "entity:a", canonicalRef: "person:a" })
  ]);

  assert.deepEqual(result.mappings, [
    { candidateId: "a", targetEntityId: "entity:a" },
    { candidateId: "b", targetEntityId: "entity:b" }
  ]);
  assert.equal(result.counts.mapped, 2);
});

test("blocks stale and future sponsor-map projections under explicit caller-owned freshness", () => {
  const stale = resolve(sponsorMap(), [entity()], {
    evaluatedAt: "2026-09-18T23:00:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.deepEqual(stale.issues, ["SPONSOR_MAP_STALE"]);

  const future = resolve(sponsorMap(), [entity()], {
    evaluatedAt: "2026-09-18T19:59:00.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(future.status, "BLOCKED");
  assert.deepEqual(future.issues, ["SPONSOR_MAP_GENERATED_IN_FUTURE"]);
});

test("blocks widened upstream mutation or external-action authority", () => {
  const source = sponsorMap();
  const forged = {
    ...source,
    crmMutationPerformed: true,
    externalActionPerformed: true
  } as unknown as typeof source;

  const result = resolve(forged);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.includes("SPONSOR_MAP_CRM_MUTATION_NOT_ALLOWED"));
  assert.ok(result.issues.includes("SPONSOR_MAP_EXTERNAL_ACTION_NOT_ALLOWED"));
  assert.equal(result.mappings.length, 0);
});

test("blocks unsafe provenance, inconsistent source counts, and duplicate candidate identities", () => {
  const source = sponsorMap();
  const unsafe = {
    ...source,
    decisions: [{ ...source.decisions[0], sourceRef: "op://vault/item/field" }]
  } as typeof source;
  assert.ok(resolve(unsafe).issues.includes("SPONSOR_MAP_UNSAFE_OR_INVALID_PROVENANCE"));

  const badCounts = {
    ...source,
    counts: { ...source.counts, reviewed: 2 }
  } as typeof source;
  assert.ok(resolve(badCounts).issues.includes("SPONSOR_MAP_COUNT_MISMATCH"));

  const duplicate = {
    ...source,
    decisions: [source.decisions[0], source.decisions[0]],
    counts: { ...source.counts, reviewed: 2, qualifiedForGraph: 2 }
  } as typeof source;
  assert.ok(resolve(duplicate).issues.includes("SPONSOR_MAP_DUPLICATE_CANDIDATE_ID"));
});

test("rejects duplicate graph entity ids and secret-like graph identity material", () => {
  assert.throws(() => resolve(sponsorMap(), [
    entity({ entityId: "same" }),
    entity({ entityId: "same", canonicalRef: "person:other" })
  ]), /duplicate entityId/);

  assert.throws(() => resolve(sponsorMap(), [
    entity({ canonicalRef: "op://vault/item/field" })
  ]), /credential material/);
});

test("is deterministic, deeply immutable, and never invents a relationship or warm path", () => {
  const source = sponsorMap();
  const entities = [entity()];
  const input: SponsorAccessTargetResolutionInputV1 = {
    sponsorMap: source,
    entities,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60
  };
  const before = JSON.stringify(input);
  const first = resolveSponsorAccessTargetsV1(input);
  const second = resolveSponsorAccessTargetsV1(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.mappings), true);
  assert.equal(Object.isFrozen(first.decisions[0]), true);
  assert.equal(first.authority.relationshipInferenceAuthorized, false);
  assert.equal(first.authority.warmAccessInferenceAuthorized, false);
  assert.equal(first.authority.decisionAuthorityInferenceAuthorized, false);
  assert.equal(first.authority.externalActionAuthorized, false);
});
