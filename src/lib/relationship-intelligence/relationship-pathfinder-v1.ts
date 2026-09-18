import { createHash } from "node:crypto";

import type {
  RelationshipEvidenceQualityV1,
  RelationshipTruthStateV1
} from "@/lib/relationship-intelligence/contracts";

export const RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1 = "relationship_pathfinder_policy_v1.0.0" as const;

export type RelationshipStrengthV1 = "STRONG" | "MEDIUM" | "WEAK" | "UNKNOWN";
export type RelationshipWillingnessV1 = "LIKELY" | "POSSIBLE" | "UNLIKELY" | "UNKNOWN";
export type RelationshipContextFitV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RelationshipTimingWindowV1 = "OPEN" | "SOON" | "WAIT" | "CLOSED" | "UNKNOWN";
export type RelationshipAuthorityLevelV1 = "DECISION_MAKER" | "INFLUENCER" | "CONNECTOR" | "NONE" | "UNKNOWN";
export type RelationshipRoleRelevanceV1 = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type RelationshipPathReadinessV1 = "READY" | "BLOCKED" | "RESEARCH_REQUIRED";

export type CanonicalRelationshipEntityRefV1 = {
  entityId: string;
  label: string;
  canonicalRef: string;
};

export type CanonicalRelationshipEdgeRefV1 = {
  edgeId: string;
  fromEntityId: string;
  toEntityId: string;
  canonicalRef: string;
  relationshipState: RelationshipTruthStateV1;
  evidenceQuality: RelationshipEvidenceQualityV1;
  evidenceRefs: readonly string[];
  strength: RelationshipStrengthV1;
  lastMeaningfulInteractionAt: string | null;
  staleAfterDays: number;
  willingness: {
    state: RelationshipTruthStateV1;
    level: RelationshipWillingnessV1;
    evidenceRefs: readonly string[];
  };
  contextFit: {
    state: RelationshipTruthStateV1;
    level: RelationshipContextFitV1;
    evidenceRefs: readonly string[];
  };
  introduction: {
    state: RelationshipTruthStateV1;
    appropriate: boolean | null;
    reason: string | null;
    evidenceRefs: readonly string[];
  };
  targetAuthority: {
    state: RelationshipTruthStateV1;
    level: RelationshipAuthorityLevelV1;
    roleRelevance: RelationshipRoleRelevanceV1;
    evidenceRefs: readonly string[];
  };
  timing: {
    state: RelationshipTruthStateV1;
    window: RelationshipTimingWindowV1;
    rationale: string;
    evidenceRefs: readonly string[];
  };
  blockers: readonly string[];
};

export type RelationshipPathfinderInputV1 = {
  sourceEntityId: string;
  targetEntityId: string;
  entities: readonly CanonicalRelationshipEntityRefV1[];
  edges: readonly CanonicalRelationshipEdgeRefV1[];
  generatedAt: string;
  requiresDecisionAuthority?: boolean;
  maxHops?: number;
  maxAlternatePaths?: number;
};

export type RelationshipPathEdgeProjectionV1 = {
  edgeId: string;
  canonicalRef: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipState: RelationshipTruthStateV1;
  evidenceQuality: RelationshipEvidenceQualityV1;
  strength: RelationshipStrengthV1;
  freshness: "FRESH" | "STALE" | "UNKNOWN";
  willingness: RelationshipWillingnessV1;
  contextFit: RelationshipContextFitV1;
  introductionAppropriate: true;
  introductionReason: string;
  targetAuthority: RelationshipAuthorityLevelV1;
  targetRoleRelevance: RelationshipRoleRelevanceV1;
  timing: RelationshipTimingWindowV1;
  blockers: readonly string[];
  evidenceRefs: readonly string[];
};

export type RelationshipPathV1 = {
  pathId: string;
  entityIds: readonly string[];
  edgeIds: readonly string[];
  hops: number;
  readiness: RelationshipPathReadinessV1;
  weakestEdge: {
    edgeId: string;
    reason: string;
  };
  authorityBoundary: {
    targetEntityId: string;
    level: RelationshipAuthorityLevelV1;
    roleRelevance: RelationshipRoleRelevanceV1;
    truthState: RelationshipTruthStateV1;
    decisionAuthorityConfirmed: boolean;
  };
  timing: {
    weakestWindow: RelationshipTimingWindowV1;
    rationale: string;
  };
  blockers: readonly string[];
  evidenceRefs: readonly string[];
  edges: readonly RelationshipPathEdgeProjectionV1[];
};

export type RelationshipPathfinderResultV1 = {
  contractVersion: "RelationshipPathfinderV1";
  policyVersion: typeof RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1;
  resultId: string;
  generatedAt: string;
  sourceEntityId: string;
  targetEntityId: string;
  status: "PATHS_FOUND" | "NO_SUPPORTED_PATH";
  primaryPath: RelationshipPathV1 | null;
  alternatePaths: readonly RelationshipPathV1[];
  noPath: null | {
    truthState: "UNKNOWN";
    reason: string;
    excludedEdgeIds: readonly string[];
    informationGainActions: readonly string[];
  };
  actionAuthority: {
    analysisOnly: true;
    externalActionAuthorized: false;
    outreachAuthorized: false;
  };
};

export class RelationshipPathfinderError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "RelationshipPathfinderError";
  }
}

const SUPPORTED_TRUTH = new Set<RelationshipTruthStateV1>(["KNOWN", "INFERRED"]);
const MAX_ENTITIES = 500;
const MAX_EDGES = 2_000;
const MAX_HOPS = 5;
const MAX_ALTERNATES = 5;
const MAX_EVIDENCE_REFS = 100;

const strengthRank: Record<RelationshipStrengthV1, number> = { STRONG: 3, MEDIUM: 2, WEAK: 1, UNKNOWN: 0 };
const evidenceRank: Record<RelationshipEvidenceQualityV1, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const willingnessRank: Record<RelationshipWillingnessV1, number> = { LIKELY: 3, POSSIBLE: 2, UNLIKELY: 1, UNKNOWN: 0 };
const contextRank: Record<RelationshipContextFitV1, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
const timingRank: Record<RelationshipTimingWindowV1, number> = { OPEN: 4, SOON: 3, WAIT: 2, CLOSED: 1, UNKNOWN: 0 };
const authorityRank: Record<RelationshipAuthorityLevelV1, number> = { DECISION_MAKER: 4, INFLUENCER: 3, CONNECTOR: 2, NONE: 1, UNKNOWN: 0 };
const roleRank: Record<RelationshipRoleRelevanceV1, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new RelationshipPathfinderError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function timestamp(value: string, label: string): string {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new RelationshipPathfinderError("INVALID_TIMESTAMP", `${label} is invalid`);
  return normalized;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new RelationshipPathfinderError("INVALID_BOUND", `${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return normalized;
}

function refs(values: readonly string[], label: string): string[] {
  if (!Array.isArray(values) || values.length > MAX_EVIDENCE_REFS) throw new RelationshipPathfinderError("INVALID_EVIDENCE", `${label} is invalid`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
}

function stableId(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0, 24);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function freshness(edge: CanonicalRelationshipEdgeRefV1, generatedAt: string): "FRESH" | "STALE" | "UNKNOWN" {
  if (edge.lastMeaningfulInteractionAt == null) return "UNKNOWN";
  const observedAt = Date.parse(timestamp(edge.lastMeaningfulInteractionAt, `${edge.edgeId}.lastMeaningfulInteractionAt`));
  if (!Number.isInteger(edge.staleAfterDays) || edge.staleAfterDays < 1 || edge.staleAfterDays > 3_650) {
    throw new RelationshipPathfinderError("INVALID_STALENESS", `${edge.edgeId}.staleAfterDays is invalid`);
  }
  const ageDays = Math.max(0, (Date.parse(generatedAt) - observedAt) / 86_400_000);
  return ageDays > edge.staleAfterDays ? "STALE" : "FRESH";
}

function edgeEvidenceRefs(edge: CanonicalRelationshipEdgeRefV1): string[] {
  return refs([
    ...edge.evidenceRefs,
    ...edge.willingness.evidenceRefs,
    ...edge.contextFit.evidenceRefs,
    ...edge.introduction.evidenceRefs,
    ...edge.targetAuthority.evidenceRefs,
    ...edge.timing.evidenceRefs
  ], `${edge.edgeId}.evidenceRefs`);
}

function exclusionReasons(edge: CanonicalRelationshipEdgeRefV1, generatedAt: string): string[] {
  const reasons: string[] = [];
  if (!SUPPORTED_TRUTH.has(edge.relationshipState)) reasons.push(`RELATIONSHIP_${edge.relationshipState}`);
  if (edge.evidenceQuality === "UNKNOWN" || edge.evidenceRefs.length === 0) reasons.push("RELATIONSHIP_EVIDENCE_UNSUPPORTED");
  const edgeFreshness = freshness(edge, generatedAt);
  if (edgeFreshness !== "FRESH") reasons.push(`RELATIONSHIP_${edgeFreshness}`);
  if (!SUPPORTED_TRUTH.has(edge.willingness.state) || edge.willingness.level === "UNKNOWN") reasons.push("WILLINGNESS_UNSUPPORTED");
  if (edge.willingness.level === "UNLIKELY") reasons.push("WILLINGNESS_UNLIKELY");
  if (!SUPPORTED_TRUTH.has(edge.contextFit.state) || edge.contextFit.level === "UNKNOWN") reasons.push("CONTEXT_FIT_UNSUPPORTED");
  if (edge.contextFit.level === "LOW") reasons.push("CONTEXT_FIT_LOW");
  if (!SUPPORTED_TRUTH.has(edge.introduction.state) || edge.introduction.appropriate == null) reasons.push("INTRODUCTION_UNSUPPORTED");
  if (edge.introduction.appropriate === false) reasons.push("INTRODUCTION_INAPPROPRIATE");
  if (edge.introduction.appropriate === true && !edge.introduction.reason?.trim()) reasons.push("INTRODUCTION_REASON_MISSING");
  if (!SUPPORTED_TRUTH.has(edge.timing.state) || edge.timing.window === "UNKNOWN") reasons.push("TIMING_UNSUPPORTED");
  if (edge.timing.window === "CLOSED") reasons.push("TIMING_CLOSED");
  return [...new Set(reasons)].sort((a, b) => a.localeCompare(b));
}

function projection(edge: CanonicalRelationshipEdgeRefV1, generatedAt: string): RelationshipPathEdgeProjectionV1 {
  return {
    edgeId: edge.edgeId,
    canonicalRef: edge.canonicalRef,
    fromEntityId: edge.fromEntityId,
    toEntityId: edge.toEntityId,
    relationshipState: edge.relationshipState,
    evidenceQuality: edge.evidenceQuality,
    strength: edge.strength,
    freshness: freshness(edge, generatedAt),
    willingness: edge.willingness.level,
    contextFit: edge.contextFit.level,
    introductionAppropriate: true,
    introductionReason: required(edge.introduction.reason, `${edge.edgeId}.introduction.reason`),
    targetAuthority: edge.targetAuthority.level,
    targetRoleRelevance: edge.targetAuthority.roleRelevance,
    timing: edge.timing.window,
    blockers: [...new Set(edge.blockers.map((item) => required(item, `${edge.edgeId}.blockers`)))].sort((a, b) => a.localeCompare(b)),
    evidenceRefs: edgeEvidenceRefs(edge)
  };
}

function pathDimensions(path: RelationshipPathV1): number[] {
  const weakestStrength = Math.min(...path.edges.map((edge) => strengthRank[edge.strength]));
  const weakestEvidence = Math.min(...path.edges.map((edge) => evidenceRank[edge.evidenceQuality]));
  const weakestWillingness = Math.min(...path.edges.map((edge) => willingnessRank[edge.willingness]));
  const weakestContext = Math.min(...path.edges.map((edge) => contextRank[edge.contextFit]));
  const weakestTiming = Math.min(...path.edges.map((edge) => timingRank[edge.timing]));
  return [
    path.readiness === "READY" ? 2 : path.readiness === "BLOCKED" ? 1 : 0,
    weakestStrength,
    weakestEvidence,
    weakestWillingness,
    weakestContext,
    authorityRank[path.authorityBoundary.level],
    roleRank[path.authorityBoundary.roleRelevance],
    weakestTiming,
    -path.blockers.length,
    -path.hops
  ];
}

function comparePaths(left: RelationshipPathV1, right: RelationshipPathV1): number {
  const a = pathDimensions(left);
  const b = pathDimensions(right);
  for (let index = 0; index < a.length; index += 1) {
    const delta = b[index] - a[index];
    if (delta !== 0) return delta;
  }
  return left.pathId.localeCompare(right.pathId);
}

function weakestEdge(edges: readonly RelationshipPathEdgeProjectionV1[]): { edgeId: string; reason: string } {
  const ordered = [...edges].sort((a, b) => {
    const aKey = [strengthRank[a.strength], evidenceRank[a.evidenceQuality], willingnessRank[a.willingness], contextRank[a.contextFit], timingRank[a.timing]];
    const bKey = [strengthRank[b.strength], evidenceRank[b.evidenceQuality], willingnessRank[b.willingness], contextRank[b.contextFit], timingRank[b.timing]];
    for (let index = 0; index < aKey.length; index += 1) {
      if (aKey[index] !== bKey[index]) return aKey[index] - bKey[index];
    }
    return a.edgeId.localeCompare(b.edgeId);
  });
  const edge = ordered[0];
  const reason = edge.strength === "WEAK" ? "WEAK_RELATIONSHIP_STRENGTH"
    : edge.evidenceQuality === "LOW" ? "LOW_EVIDENCE_QUALITY"
      : edge.willingness === "POSSIBLE" ? "WILLINGNESS_ONLY_POSSIBLE"
        : edge.contextFit === "MEDIUM" ? "CONTEXT_FIT_ONLY_MEDIUM"
          : edge.timing !== "OPEN" ? `TIMING_${edge.timing}`
            : "SUPPORTED_BOTTLENECK";
  return { edgeId: edge.edgeId, reason };
}

function buildPath(
  edgePath: readonly CanonicalRelationshipEdgeRefV1[],
  sourceEntityId: string,
  targetEntityId: string,
  generatedAt: string,
  requiresDecisionAuthority: boolean
): RelationshipPathV1 {
  const projectedEdges = edgePath.map((edge) => projection(edge, generatedAt));
  const last = edgePath[edgePath.length - 1];
  const allBlockers = [...new Set(projectedEdges.flatMap((edge) => edge.blockers))].sort((a, b) => a.localeCompare(b));
  const authorityKnown = SUPPORTED_TRUTH.has(last.targetAuthority.state);
  const authorityConfirmed = authorityKnown && last.targetAuthority.level === "DECISION_MAKER" && last.targetAuthority.roleRelevance !== "UNKNOWN";
  const researchRequired = !authorityKnown || last.targetAuthority.level === "UNKNOWN" || last.targetAuthority.roleRelevance === "UNKNOWN" || (requiresDecisionAuthority && !authorityConfirmed);
  const readiness: RelationshipPathReadinessV1 = researchRequired ? "RESEARCH_REQUIRED" : allBlockers.length > 0 ? "BLOCKED" : "READY";
  const entityIds = [sourceEntityId, ...edgePath.map((edge) => edge.toEntityId)];
  const evidenceRefs = [...new Set(projectedEdges.flatMap((edge) => edge.evidenceRefs))].sort((a, b) => a.localeCompare(b));
  const weakestTimingEdge = [...projectedEdges].sort((a, b) => timingRank[a.timing] - timingRank[b.timing] || a.edgeId.localeCompare(b.edgeId))[0];
  const pathId = `relpath_${stableId({ entityIds, edgeIds: projectedEdges.map((edge) => edge.edgeId), policy: RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1 })}`;
  return {
    pathId,
    entityIds,
    edgeIds: projectedEdges.map((edge) => edge.edgeId),
    hops: projectedEdges.length,
    readiness,
    weakestEdge: weakestEdge(projectedEdges),
    authorityBoundary: {
      targetEntityId,
      level: last.targetAuthority.level,
      roleRelevance: last.targetAuthority.roleRelevance,
      truthState: last.targetAuthority.state,
      decisionAuthorityConfirmed: authorityConfirmed
    },
    timing: {
      weakestWindow: weakestTimingEdge.timing,
      rationale: required(edgePath.find((edge) => edge.edgeId === weakestTimingEdge.edgeId)!.timing.rationale, `${weakestTimingEdge.edgeId}.timing.rationale`)
    },
    blockers: allBlockers,
    evidenceRefs,
    edges: projectedEdges
  };
}

function informationGainFor(excluded: ReadonlyMap<string, readonly string[]>): string[] {
  const actions = new Set<string>();
  for (const reasons of excluded.values()) {
    for (const reason of reasons) {
      if (reason.includes("STALE")) actions.add("REFRESH_STALE_RELATIONSHIP_EVIDENCE");
      else if (reason.includes("CONFLICTED")) actions.add("RESOLVE_CONFLICTED_RELATIONSHIP_EVIDENCE");
      else if (reason.includes("RELATIONSHIP_UNKNOWN") || reason === "RELATIONSHIP_EVIDENCE_UNSUPPORTED") actions.add("VERIFY_CANONICAL_RELATIONSHIP_EDGE");
      else if (reason.startsWith("WILLINGNESS")) actions.add("VERIFY_INTRODUCER_WILLINGNESS");
      else if (reason.startsWith("CONTEXT_FIT")) actions.add("VERIFY_CONTEXT_FIT");
      else if (reason.startsWith("INTRODUCTION")) actions.add("VERIFY_INTRODUCTION_APPROPRIATENESS");
      else if (reason.startsWith("TIMING")) actions.add("VERIFY_TIMING_WINDOW");
    }
  }
  if (actions.size === 0) actions.add("IDENTIFY_EVIDENCE_BACKED_ACCESS_PATH");
  return [...actions].sort((a, b) => a.localeCompare(b));
}

export function findRelationshipPathsV1(input: RelationshipPathfinderInputV1): RelationshipPathfinderResultV1 {
  const snapshot = structuredClone(input);
  const sourceEntityId = required(snapshot.sourceEntityId, "sourceEntityId");
  const targetEntityId = required(snapshot.targetEntityId, "targetEntityId");
  if (sourceEntityId === targetEntityId) throw new RelationshipPathfinderError("IDENTITY_COLLISION", "source and target must differ");
  const generatedAt = timestamp(snapshot.generatedAt, "generatedAt");
  const maxHops = boundedInteger(snapshot.maxHops, 3, 1, MAX_HOPS, "maxHops");
  const maxAlternatePaths = boundedInteger(snapshot.maxAlternatePaths, 3, 0, MAX_ALTERNATES, "maxAlternatePaths");
  const requiresDecisionAuthority = snapshot.requiresDecisionAuthority ?? false;

  if (!Array.isArray(snapshot.entities) || snapshot.entities.length < 2 || snapshot.entities.length > MAX_ENTITIES) {
    throw new RelationshipPathfinderError("INVALID_ENTITIES", "entities must contain a bounded canonical set");
  }
  if (!Array.isArray(snapshot.edges) || snapshot.edges.length > MAX_EDGES) {
    throw new RelationshipPathfinderError("INVALID_EDGES", "edges must be bounded");
  }

  const entityIds = new Set<string>();
  for (const entity of snapshot.entities) {
    entity.entityId = required(entity.entityId, "entity.entityId");
    required(entity.label, `${entity.entityId}.label`);
    required(entity.canonicalRef, `${entity.entityId}.canonicalRef`);
    if (entityIds.has(entity.entityId)) throw new RelationshipPathfinderError("DUPLICATE_ENTITY", `Duplicate entity ${entity.entityId}`);
    entityIds.add(entity.entityId);
  }
  if (!entityIds.has(sourceEntityId) || !entityIds.has(targetEntityId)) {
    throw new RelationshipPathfinderError("UNKNOWN_ENTITY", "source and target must be canonical entities supplied by the caller");
  }

  const edgeIds = new Set<string>();
  const eligible: CanonicalRelationshipEdgeRefV1[] = [];
  const excluded = new Map<string, readonly string[]>();
  for (const edge of snapshot.edges) {
    edge.edgeId = required(edge.edgeId, "edge.edgeId");
    edge.canonicalRef = required(edge.canonicalRef, `${edge.edgeId}.canonicalRef`);
    edge.fromEntityId = required(edge.fromEntityId, `${edge.edgeId}.fromEntityId`);
    edge.toEntityId = required(edge.toEntityId, `${edge.edgeId}.toEntityId`);
    if (edgeIds.has(edge.edgeId)) throw new RelationshipPathfinderError("DUPLICATE_EDGE", `Duplicate edge ${edge.edgeId}`);
    edgeIds.add(edge.edgeId);
    if (!entityIds.has(edge.fromEntityId) || !entityIds.has(edge.toEntityId)) throw new RelationshipPathfinderError("UNKNOWN_EDGE_ENTITY", `${edge.edgeId} references an unknown canonical entity`);
    if (edge.fromEntityId === edge.toEntityId) throw new RelationshipPathfinderError("SELF_EDGE", `${edge.edgeId} cannot self-reference`);
    edgeEvidenceRefs(edge);
    const reasons = exclusionReasons(edge, generatedAt);
    if (reasons.length === 0) eligible.push(edge);
    else excluded.set(edge.edgeId, reasons);
  }

  const adjacency = new Map<string, CanonicalRelationshipEdgeRefV1[]>();
  for (const edge of eligible) {
    const list = adjacency.get(edge.fromEntityId) ?? [];
    list.push(edge);
    adjacency.set(edge.fromEntityId, list);
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  const found: CanonicalRelationshipEdgeRefV1[][] = [];
  const visit = (entityId: string, path: CanonicalRelationshipEdgeRefV1[], visited: Set<string>): void => {
    if (path.length >= maxHops) return;
    for (const edge of adjacency.get(entityId) ?? []) {
      if (visited.has(edge.toEntityId)) continue;
      const next = [...path, edge];
      if (edge.toEntityId === targetEntityId) {
        found.push(next);
        continue;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(edge.toEntityId);
      visit(edge.toEntityId, next, nextVisited);
    }
  };
  visit(sourceEntityId, [], new Set([sourceEntityId]));

  const paths = found
    .map((path) => buildPath(path, sourceEntityId, targetEntityId, generatedAt, requiresDecisionAuthority))
    .sort(comparePaths);

  const resultIdentity = {
    sourceEntityId,
    targetEntityId,
    generatedAt,
    maxHops,
    maxAlternatePaths,
    requiresDecisionAuthority,
    policyVersion: RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1,
    paths: paths.map((path) => path.pathId)
  };

  if (paths.length === 0) {
    return freeze({
      contractVersion: "RelationshipPathfinderV1" as const,
      policyVersion: RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1,
      resultId: `relpath_result_${stableId(resultIdentity)}`,
      generatedAt,
      sourceEntityId,
      targetEntityId,
      status: "NO_SUPPORTED_PATH" as const,
      primaryPath: null,
      alternatePaths: [],
      noPath: {
        truthState: "UNKNOWN" as const,
        reason: "No evidence-supported directed relationship path exists within the bounded hop policy.",
        excludedEdgeIds: [...excluded.keys()].sort((a, b) => a.localeCompare(b)),
        informationGainActions: informationGainFor(excluded)
      },
      actionAuthority: { analysisOnly: true as const, externalActionAuthorized: false as const, outreachAuthorized: false as const }
    });
  }

  return freeze({
    contractVersion: "RelationshipPathfinderV1" as const,
    policyVersion: RELATIONSHIP_PATHFINDER_POLICY_VERSION_V1,
    resultId: `relpath_result_${stableId(resultIdentity)}`,
    generatedAt,
    sourceEntityId,
    targetEntityId,
    status: "PATHS_FOUND" as const,
    primaryPath: paths[0],
    alternatePaths: paths.slice(1, 1 + maxAlternatePaths),
    noPath: null,
    actionAuthority: { analysisOnly: true as const, externalActionAuthorized: false as const, outreachAuthorized: false as const }
  });
}
