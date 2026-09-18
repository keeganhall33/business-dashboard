import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSponsorAccessBriefsV1,
  type SponsorAccessBriefInputV1
} from "../../src/lib/relationship-intelligence/sponsor-access-brief-v1";
import type {
  SponsorMapCandidateV1,
  SponsorMapEvidenceFieldV1,
  SponsorMapTruthStateV1
} from "../../src/lib/relationship-intelligence/sponsor-map-qualification-v1";
import type {
  CanonicalRelationshipEdgeRefV1,
  CanonicalRelationshipEntityRefV1
} from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const NOW = "2026-09-18T07:00:00.000Z";

function field<T>(
  value: T | null,
  state: SponsorMapTruthStateV1 = "KNOWN",
  evidenceRefs: readonly string[] = ["evidence:sponsor-field"]
): SponsorMapEvidenceFieldV1<T> {
  return { state, value, evidenceRefs };
}

function sponsor(overrides: Partial<SponsorMapCandidateV1> = {}): SponsorMapCandidateV1 {
  return {
    candidateId: "sponsor-target",
    sourceRef: "source:official-company-bio",
    observedAt: "2026-09-17T18:00:00.000Z",
    evidenceRefs: ["evidence:sponsor-primary"],
    canonicalOrganizationRef: "org:sponsor-brand",
    canonicalPersonRef: "person:sports-marketing-lead",
    duplicateKey: "sponsor-brand:sports-marketing-lead",
    ecosystemRole: field("SPONSOR_SIDE"),
    decisionFunction: field("SPORTS_MARKETING"),
    authorityClass: field("DECISION_MAKER", "KNOWN", ["evidence:authority"]),
    accessPath: field("WARM", "KNOWN", ["evidence:access"]),
    contactRoute: field("PUBLIC_PROFESSIONAL", "KNOWN", ["evidence:contact"]),
    planningWindow: field("2027 activation planning is underway in Q4 2026.", "KNOWN", ["evidence:planning"]),
    eventOrSeasonDate: field("2027 season", "KNOWN", ["evidence:event"]),
    ...overrides
  };
}

function entities(targetCanonicalRef = "person:sports-marketing-lead"): CanonicalRelationshipEntityRefV1[] {
  return [
    { entityId: "keegan", label: "Keegan", canonicalRef: "person:keegan" },
    { entityId: "introducer", label: "Known introducer", canonicalRef: "person:introducer" },
    { entityId: "target", label: "Sponsor decision maker", canonicalRef: targetCanonicalRef }
  ];
}

function edge(
  edgeId: string,
  fromEntityId: string,
  toEntityId: string,
  overrides: Partial<CanonicalRelationshipEdgeRefV1> = {}
): CanonicalRelationshipEdgeRefV1 {
  return {
    edgeId,
    fromEntityId,
    toEntityId,
    canonicalRef: `relationship:${edgeId}`,
    relationshipState: "KNOWN",
    evidenceQuality: "HIGH",
    evidenceRefs: [`evidence:${edgeId}`],
    strength: "STRONG",
    lastMeaningfulInteractionAt: "2026-09-10T12:00:00.000Z",
    staleAfterDays: 180,
    willingness: {
      state: "KNOWN",
      level: "LIKELY",
      evidenceRefs: [`evidence:${edgeId}:willingness`]
    },
    contextFit: {
      state: "KNOWN",
      level: "HIGH",
      evidenceRefs: [`evidence:${edgeId}:context`]
    },
    introduction: {
      state: "KNOWN",
      appropriate: true,
      reason: "An introduction is explicitly supported by the supplied relationship evidence.",
      evidenceRefs: [`evidence:${edgeId}:intro`]
    },
    targetAuthority: {
      state: "KNOWN",
      level: toEntityId === "target" ? "DECISION_MAKER" : "CONNECTOR",
      roleRelevance: "HIGH",
      evidenceRefs: [`evidence:${edgeId}:authority`]
    },
    timing: {
      state: "KNOWN",
      window: "OPEN",
      rationale: "The supplied evidence says this relationship path can be used now.",
      evidenceRefs: [`evidence:${edgeId}:timing`]
    },
    blockers: [],
    ...overrides
  };
}

function warmEdges(): CanonicalRelationshipEdgeRefV1[] {
  return [
    edge("keegan-introducer", "keegan", "introducer"),
    edge("introducer-target", "introducer", "target")
  ];
}

function input(overrides: Partial<SponsorAccessBriefInputV1> = {}): SponsorAccessBriefInputV1 {
  return {
    sponsorCandidates: [sponsor()],
    candidateTargetMappings: [{ candidateId: "sponsor-target", targetEntityId: "target" }],
    sourceEntityId: "keegan",
    entities: entities(),
    edges: warmEdges(),
    now: NOW,
    ...overrides
  };
}

test("returns ACCESS_READY only when sponsor decision authority and a canonical warm path are both supported", () => {
  const result = buildSponsorAccessBriefsV1(input());
  const brief = result.briefs[0];

  assert.equal(brief.status, "ACCESS_READY");
  assert.equal(brief.nextInternalAction, "PREPARE_INTRO_BRIEF");
  assert.equal(brief.authorityClass.value, "DECISION_MAKER");
  assert.equal(brief.sponsorAccessPath.value, "WARM");
  assert.equal(brief.relationshipPath?.status, "PATHS_FOUND");
  assert.equal(brief.relationshipPath?.primaryPath?.readiness, "READY");
  assert.equal(brief.relationshipPath?.primaryPath?.authorityBoundary.decisionAuthorityConfirmed, true);
  assert.equal(result.counts.ACCESS_READY, 1);
});

test("does not convert a public professional contact route into warm access", () => {
  const result = buildSponsorAccessBriefsV1(
    input({
      sponsorCandidates: [
        sponsor({
          accessPath: field("UNKNOWN", "KNOWN", ["evidence:no-access"]),
          contactRoute: field("PUBLIC_PROFESSIONAL", "KNOWN", ["evidence:public-contact"])
        })
      ]
    })
  );
  const brief = result.briefs[0];

  assert.equal(brief.contactRoute.value, "PUBLIC_PROFESSIONAL");
  assert.equal(brief.status, "RESEARCH_REQUIRED");
  assert.ok(brief.researchOrVerificationGaps.includes("ACCESS_PATH_UNKNOWN"));
  assert.equal(brief.relationshipPath, null);
});

test("treats sponsor-map WARM access without canonical graph proof as unverified", () => {
  const result = buildSponsorAccessBriefsV1(input({ edges: [] }));
  const brief = result.briefs[0];

  assert.equal(brief.status, "VERIFY_REQUIRED");
  assert.equal(brief.relationshipPath?.status, "NO_SUPPORTED_PATH");
  assert.ok(brief.researchOrVerificationGaps.includes("SPONSOR_ACCESS_PATH_NOT_GRAPH_PROVEN"));
  assert.ok(brief.reasonCodes.includes("NON_COLD_ACCESS_REQUIRES_CANONICAL_GRAPH_PROOF"));
});

test("fails closed when sponsor-map COLD conflicts with a graph-supported relationship path", () => {
  const result = buildSponsorAccessBriefsV1(
    input({ sponsorCandidates: [sponsor({ accessPath: field("COLD", "KNOWN", ["evidence:cold"]) })] })
  );
  const brief = result.briefs[0];

  assert.equal(brief.relationshipPath?.primaryPath?.readiness, "READY");
  assert.equal(brief.status, "VERIFY_REQUIRED");
  assert.ok(brief.researchOrVerificationGaps.includes("ACCESS_PATH_CONFLICT_WITH_GRAPH"));
});

test("never free-text resolves a sponsor person when canonical refs disagree", () => {
  const result = buildSponsorAccessBriefsV1(input({ entities: entities("person:different-person") }));
  const brief = result.briefs[0];

  assert.equal(brief.status, "VERIFY_REQUIRED");
  assert.equal(brief.relationshipPath, null);
  assert.ok(brief.researchOrVerificationGaps.includes("CANONICAL_PERSON_TARGET_MISMATCH"));
});

test("returns NO_SUPPORTED_PATH for evidenced cold access when the canonical graph has no path", () => {
  const result = buildSponsorAccessBriefsV1(
    input({
      sponsorCandidates: [sponsor({ accessPath: field("COLD", "KNOWN", ["evidence:cold"]) })],
      edges: []
    })
  );
  const brief = result.briefs[0];

  assert.equal(brief.status, "NO_SUPPORTED_PATH");
  assert.equal(brief.nextInternalAction, "RESEARCH_ACCESS_PATH");
  assert.ok(brief.researchOrVerificationGaps.includes("NO_EVIDENCE_SUPPORTED_RELATIONSHIP_PATH"));
});

test("keeps a supported but blocked path distinct from a missing path", () => {
  const edges = warmEdges();
  edges[1] = edge("introducer-target", "introducer", "target", { blockers: ["INTRODUCER_AVAILABILITY_UNKNOWN"] });
  const result = buildSponsorAccessBriefsV1(input({ edges }));
  const brief = result.briefs[0];

  assert.equal(brief.relationshipPath?.status, "PATHS_FOUND");
  assert.equal(brief.relationshipPath?.primaryPath?.readiness, "BLOCKED");
  assert.equal(brief.status, "PATH_BLOCKED");
  assert.ok(brief.researchOrVerificationGaps.includes("PATH_BLOCKER:INTRODUCER_AVAILABILITY_UNKNOWN"));
});

test("propagates stale or conflicted sponsor evidence to verification without invoking the access graph", () => {
  for (const state of ["STALE", "CONFLICTED"] as const) {
    const result = buildSponsorAccessBriefsV1(
      input({
        sponsorCandidates: [
          sponsor({ planningWindow: field("Q4 planning window", state, [`evidence:planning:${state}`]) })
        ]
      })
    );
    const brief = result.briefs[0];

    assert.equal(brief.status, "VERIFY_REQUIRED");
    assert.equal(brief.relationshipPath, null);
  }
});

test("preserves planning-window evidence separately from event or season timing", () => {
  const result = buildSponsorAccessBriefsV1(input());
  const brief = result.briefs[0];

  assert.equal(brief.planningWindow.value, "2027 activation planning is underway in Q4 2026.");
  assert.equal(brief.eventOrSeasonDate?.value, "2027 season");
  assert.notEqual(brief.planningWindow.value, brief.eventOrSeasonDate?.value);
});

test("unions sponsor and relationship evidence deterministically without duplicating refs", () => {
  const first = buildSponsorAccessBriefsV1(input());
  const second = buildSponsorAccessBriefsV1(input());
  const refs = first.briefs[0].evidenceRefs;

  assert.deepEqual(first, second);
  assert.equal(new Set(refs).size, refs.length);
  assert.deepEqual([...refs], [...refs].sort((a, b) => a.localeCompare(b)));
  assert.ok(refs.includes("evidence:authority"));
  assert.ok(refs.includes("evidence:introducer-target"));
});

test("requires an explicit candidate-to-target mapping rather than inferring identity", () => {
  const result = buildSponsorAccessBriefsV1(input({ candidateTargetMappings: [] }));
  const brief = result.briefs[0];

  assert.equal(brief.status, "RESEARCH_REQUIRED");
  assert.ok(brief.researchOrVerificationGaps.includes("TARGET_ENTITY_MAPPING_REQUIRED"));
  assert.equal(brief.relationshipPath, null);
});

test("is deeply immutable and grants no CRM, contact-discovery, outreach, or external-action authority", () => {
  const original = input();
  const before = structuredClone(original);
  const result = buildSponsorAccessBriefsV1(original);

  assert.deepEqual(original, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.briefs), true);
  assert.equal(Object.isFrozen(result.briefs[0]), true);
  assert.equal(Object.isFrozen(result.briefs[0].evidenceRefs), true);
  assert.deepEqual(result.actionAuthority, {
    analysisOnly: true,
    internalPreparationAllowed: true,
    crmMutationAuthorized: false,
    contactDiscoveryAuthorized: false,
    outreachAuthorized: false,
    externalActionAuthorized: false
  });
});

test("rejects duplicate target mappings deterministically", () => {
  assert.throws(
    () =>
      buildSponsorAccessBriefsV1(
        input({
          candidateTargetMappings: [
            { candidateId: "sponsor-target", targetEntityId: "target" },
            { candidateId: "sponsor-target", targetEntityId: "introducer" }
          ]
        })
      ),
    /duplicate candidateId/
  );
});
