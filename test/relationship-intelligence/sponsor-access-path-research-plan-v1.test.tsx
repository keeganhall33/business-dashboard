import assert from "node:assert/strict";
import test from "node:test";

import type {
  SponsorAccessBriefResultV1,
  SponsorAccessBriefV1
} from "../../src/lib/relationship-intelligence/sponsor-access-brief-v1";
import {
  buildSponsorAccessPathResearchPlanV1,
  type SponsorAccessPathResearchPlanInputV1
} from "../../src/lib/relationship-intelligence/sponsor-access-path-research-plan-v1";
import type { RelationshipPathfinderResultV1 } from "../../src/lib/relationship-intelligence/relationship-pathfinder-v1";

const SOURCE_AT = "2026-09-19T18:00:00.000Z";
const EVALUATED_AT = "2026-09-19T18:30:00.000Z";
const EVIDENCE = ["evidence:sponsor-access-1"] as const;

function known<T>(value: T) {
  return { state: "KNOWN" as const, value, evidenceRefs: EVIDENCE };
}

function noPath(overrides: Partial<RelationshipPathfinderResultV1> = {}): RelationshipPathfinderResultV1 {
  return {
    contractVersion: "RelationshipPathfinderV1",
    policyVersion: "relationship_pathfinder_policy_v1.1.0",
    resultId: "path-result-1",
    generatedAt: SOURCE_AT,
    sourceEntityId: "entity:keegan",
    targetEntityId: "entity:buyer",
    status: "NO_SUPPORTED_PATH",
    primaryPath: null,
    alternatePaths: [],
    noPath: {
      truthState: "UNKNOWN",
      reason: "No evidence-supported path",
      excludedEdgeIds: [],
      informationGainActions: ["Research authorized first-party relationship history"]
    },
    actionAuthority: {
      analysisOnly: true,
      externalActionAuthorized: false,
      outreachAuthorized: false
    },
    ...overrides
  };
}

function blockedPath(readiness: "BLOCKED" | "RESEARCH_REQUIRED" = "BLOCKED"): RelationshipPathfinderResultV1 {
  return {
    ...noPath(),
    status: "PATHS_FOUND",
    primaryPath: {
      pathId: "path-1",
      entityIds: ["entity:keegan", "entity:buyer"],
      edgeIds: ["edge-1"],
      hops: 1,
      readiness,
      weakestEdge: { edgeId: "edge-1", reason: "Needs current evidence" },
      authorityBoundary: {
        targetEntityId: "entity:buyer",
        level: "DECISION_MAKER",
        roleRelevance: "HIGH",
        truthState: "KNOWN",
        decisionAuthorityConfirmed: true
      },
      timing: { weakestWindow: "UNKNOWN", rationale: "Timing is not established" },
      blockers: readiness === "BLOCKED" ? ["INTRODUCTION_WILLINGNESS_UNKNOWN"] : [],
      evidenceRefs: EVIDENCE,
      edges: []
    },
    noPath: null
  };
}

function brief(overrides: Partial<SponsorAccessBriefV1> = {}): SponsorAccessBriefV1 {
  return {
    candidateId: "candidate-1",
    status: "NO_SUPPORTED_PATH",
    canonicalOrganizationRef: "org:brand",
    canonicalPersonRef: "person:buyer",
    targetEntityId: "entity:buyer",
    ecosystemRole: known("SPONSOR_SIDE"),
    decisionFunction: known("SPORTS_MARKETING"),
    authorityClass: known("DECISION_MAKER"),
    sponsorAccessPath: known("WARM"),
    contactRoute: known("PUBLIC_PROFESSIONAL"),
    planningWindow: known("planning window remains separately evidenced"),
    eventOrSeasonDate: null,
    relationshipPath: noPath(),
    evidenceRefs: EVIDENCE,
    researchOrVerificationGaps: ["NO_EVIDENCE_SUPPORTED_RELATIONSHIP_PATH"],
    nextInternalAction: "RESEARCH_ACCESS_PATH",
    reasonCodes: ["CANONICAL_GRAPH_HAS_NO_SUPPORTED_PATH"],
    ...overrides
  };
}

function result(briefs: readonly SponsorAccessBriefV1[] = [brief()]): SponsorAccessBriefResultV1 {
  const counts: SponsorAccessBriefResultV1["counts"] = {
    ACCESS_READY: 0,
    PATH_BLOCKED: 0,
    NO_SUPPORTED_PATH: 0,
    RESEARCH_REQUIRED: 0,
    VERIFY_REQUIRED: 0,
    SUPPRESS: 0
  };
  for (const item of briefs) counts[item.status] += 1;

  return {
    version: "SPONSOR_ACCESS_BRIEF_V1",
    generatedAt: SOURCE_AT,
    sourceEntityId: "entity:keegan",
    briefs,
    counts,
    actionAuthority: {
      analysisOnly: true,
      internalPreparationAllowed: true,
      crmMutationAuthorized: false,
      contactDiscoveryAuthorized: false,
      outreachAuthorized: false,
      externalActionAuthorized: false
    }
  };
}

function plan(
  accessBriefs: SponsorAccessBriefResultV1 = result(),
  overrides: Partial<SponsorAccessPathResearchPlanInputV1> = {}
) {
  return buildSponsorAccessPathResearchPlanV1({
    accessBriefs,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60,
    ...overrides
  });
}

test("creates bounded access-path research only for one exact canonical sponsor target", () => {
  const output = plan();

  assert.equal(output.status, "READY");
  assert.equal(output.tasks.length, 1);
  assert.equal(output.tasks[0].workType, "RESEARCH_SUPPORTED_ACCESS_PATH");
  assert.equal(output.tasks[0].sourceEntityId, "entity:keegan");
  assert.equal(output.tasks[0].targetEntityId, "entity:buyer");
  assert.equal(output.tasks[0].canonicalPersonRef, "person:buyer");
  assert.equal(output.tasks[0].canonicalOrganizationRef, "org:brand");
  assert.deepEqual(output.tasks[0].allowedSourceClasses, [
    "CANONICAL_RELATIONSHIP_GRAPH",
    "AUTHORIZED_FIRST_PARTY_RELATIONSHIP_HISTORY"
  ]);
  assert.equal(output.tasks[0].warmAccess, "NOT_ESTABLISHED");
  assert.equal(output.tasks[0].introductionWillingness, "NOT_ESTABLISHED");
  assert.equal(output.tasks[0].sponsorInterest, "NOT_ESTABLISHED");
  assert.equal(output.tasks[0].decisionAuthority, "NOT_ESTABLISHED");
  assert.equal(output.tasks[0].relationshipInferenceAuthorized, false);
  assert.equal(output.tasks[0].publicSocialProximityInferenceAuthorized, false);
  assert.equal(output.tasks[0].privateContactDiscoveryAuthorized, false);
  assert.equal(output.tasks[0].outreachAuthorized, false);
  assert.equal(output.authority.externalResearchAuthorized, false);
});

test("turns an exact blocked canonical path into blocker-resolution research without inventing willingness", () => {
  const source = result([brief({
    status: "PATH_BLOCKED",
    relationshipPath: blockedPath("BLOCKED"),
    researchOrVerificationGaps: ["PATH_BLOCKER:INTRODUCTION_WILLINGNESS_UNKNOWN"],
    nextInternalAction: "RESOLVE_PATH_BLOCKER",
    reasonCodes: ["SUPPORTED_PATH_HAS_ACTIVE_BLOCKER"]
  })]);
  const output = plan(source);

  assert.equal(output.tasks[0].workType, "RESOLVE_SUPPORTED_PATH_BLOCKER");
  assert.deepEqual(output.tasks[0].gapRefs, ["PATH_BLOCKER:INTRODUCTION_WILLINGNESS_UNKNOWN"]);
  assert.equal(output.tasks[0].introductionWillingness, "NOT_ESTABLISHED");
  assert.equal(output.tasks[0].graphMutationAuthorized, false);
});

test("routes an exact access contradiction to verification rather than treating the warm claim as true", () => {
  const source = result([brief({
    status: "VERIFY_REQUIRED",
    relationshipPath: noPath(),
    researchOrVerificationGaps: ["SPONSOR_ACCESS_PATH_NOT_GRAPH_PROVEN"],
    nextInternalAction: "VERIFY_CONFLICTED_OR_UNPROVEN_EVIDENCE",
    reasonCodes: ["NON_COLD_ACCESS_REQUIRES_CANONICAL_GRAPH_PROOF"]
  })]);
  const output = plan(source);

  assert.equal(output.tasks[0].workType, "VERIFY_ACCESS_PATH_CLAIM");
  assert.equal(output.tasks[0].warmAccess, "NOT_ESTABLISHED");
  assert.equal(output.researchPolicy, "EXACT_CANONICAL_PATH_IDENTITY_AUTHORIZED_FIRST_PARTY_OR_GRAPH_ONLY");
});

test("does not create access research for ready, suppressed, or unrelated review work", () => {
  const source = result([
    brief({
      candidateId: "ready",
      status: "ACCESS_READY",
      relationshipPath: blockedPath("RESEARCH_REQUIRED"),
      researchOrVerificationGaps: [],
      nextInternalAction: "PREPARE_INTRO_BRIEF",
      reasonCodes: ["READY"]
    }),
    brief({
      candidateId: "suppressed",
      status: "SUPPRESS",
      relationshipPath: null,
      canonicalPersonRef: null,
      targetEntityId: null,
      researchOrVerificationGaps: [],
      nextInternalAction: "NONE",
      reasonCodes: ["SUPPRESSED"]
    }),
    brief({
      candidateId: "authority-only",
      status: "RESEARCH_REQUIRED",
      relationshipPath: blockedPath("RESEARCH_REQUIRED"),
      researchOrVerificationGaps: ["DECISION_AUTHORITY_NOT_CONFIRMED"],
      nextInternalAction: "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE",
      reasonCodes: ["GRAPH_PATH_DOES_NOT_CONFIRM_DECISION_AUTHORITY"]
    })
  ]);
  const output = plan(source);

  assert.equal(output.status, "NO_WORK");
  assert.equal(output.tasks.length, 0);
  assert.deepEqual(output.decisions.map((item) => item.disposition), [
    "DEFER_NON_ACCESS_REVIEW",
    "NO_ACCESS_PATH_WORK",
    "NO_ACCESS_PATH_WORK"
  ]);
});

test("defers access research when exact canonical person, organization, or graph target identity is missing", () => {
  const source = result([brief({
    status: "RESEARCH_REQUIRED",
    canonicalPersonRef: null,
    targetEntityId: null,
    relationshipPath: null,
    researchOrVerificationGaps: ["NON_COLD_ACCESS_NOT_EVIDENCED"],
    nextInternalAction: "RESEARCH_MISSING_SPONSOR_OR_ACCESS_EVIDENCE"
  })]);
  const output = plan(source);

  assert.equal(output.status, "NO_WORK");
  assert.equal(output.tasks.length, 0);
  assert.equal(output.decisions[0].disposition, "DEFER_IDENTITY_RESOLUTION");
  assert.ok(output.decisions[0].reasonCodes.includes("EXACT_CANONICAL_ORGANIZATION_PERSON_AND_TARGET_REQUIRED"));
});

test("blocks stale and future source projections under caller-owned freshness", () => {
  const stale = plan(result(), {
    evaluatedAt: "2026-09-19T20:00:01.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(stale.status, "BLOCKED");
  assert.ok(stale.issues.includes("SOURCE_ACCESS_BRIEF_STALE"));

  const future = plan(result(), {
    evaluatedAt: "2026-09-19T17:59:59.000Z",
    maximumProjectionAgeMinutes: 60
  });
  assert.equal(future.status, "BLOCKED");
  assert.ok(future.issues.includes("SOURCE_ACCESS_BRIEF_GENERATED_IN_FUTURE"));
});

test("blocks count drift, widened authority, duplicate candidate identities, and action-status drift", () => {
  const base = result();
  const badCounts = { ...base, counts: { ...base.counts, NO_SUPPORTED_PATH: 2 } } as SponsorAccessBriefResultV1;
  assert.ok(plan(badCounts).issues.includes("SOURCE_ACCESS_BRIEF_COUNT_MISMATCH"));

  const widened = {
    ...base,
    actionAuthority: { ...base.actionAuthority, outreachAuthorized: true }
  } as unknown as SponsorAccessBriefResultV1;
  assert.ok(plan(widened).issues.includes("SOURCE_ACCESS_BRIEF_AUTHORITY_WIDENED"));

  const duplicate = result([brief(), brief()]);
  assert.ok(plan(duplicate).issues.includes("SOURCE_ACCESS_BRIEF_DUPLICATE_CANDIDATE_ID"));

  const drift = result([brief({ nextInternalAction: "PREPARE_INTRO_BRIEF" })]);
  assert.ok(plan(drift).issues.includes("SOURCE_ACCESS_BRIEF_ACTION_STATUS_DRIFT"));
});

test("blocks path identity drift and privacy-unsafe evidence rather than researching the wrong person", () => {
  const wrongTarget = result([brief({
    relationshipPath: noPath({ targetEntityId: "entity:someone-else" })
  })]);
  assert.ok(plan(wrongTarget).issues.includes("RELATIONSHIP_PATH_TARGET_IDENTITY_MISMATCH"));

  const wrongSource = result([brief({
    relationshipPath: noPath({ sourceEntityId: "entity:someone-else" })
  })]);
  assert.ok(plan(wrongSource).issues.includes("RELATIONSHIP_PATH_SOURCE_IDENTITY_MISMATCH"));

  const unsafe = result([brief({ evidenceRefs: ["person@example.com"] })]);
  assert.ok(plan(unsafe).issues.includes("SOURCE_ACCESS_BRIEF_UNSAFE_OR_INVALID_PROVENANCE"));
});

test("honors caller task limits deterministically and is deeply immutable", () => {
  const source = result([
    brief({ candidateId: "b" }),
    brief({ candidateId: "a" })
  ]);
  const input: SponsorAccessPathResearchPlanInputV1 = {
    accessBriefs: source,
    evaluatedAt: EVALUATED_AT,
    maximumProjectionAgeMinutes: 60,
    maximumTasks: 1
  };
  const before = JSON.stringify(input);
  const first = buildSponsorAccessPathResearchPlanV1(input);
  const second = buildSponsorAccessPathResearchPlanV1(input);

  assert.deepEqual(first, second);
  assert.equal(first.tasks.length, 1);
  assert.equal(first.tasks[0].candidateId, "a");
  assert.equal(first.omittedTaskCount, 1);
  assert.equal(first.decisions.find((item) => item.candidateId === "b")?.disposition, "DEFER_NON_ACCESS_REVIEW");
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.tasks), true);
  assert.equal(Object.isFrozen(first.tasks[0]), true);
  assert.equal(Object.isFrozen(first.tasks[0].allowedSourceClasses), true);
});
