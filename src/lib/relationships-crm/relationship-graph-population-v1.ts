export type RelationshipGraphEntityTypeV1 = "PERSON" | "COMPANY";
export type RelationshipGraphKindV1 =
  | "EMPLOYED_BY"
  | "AFFILIATED_WITH"
  | "COMMUNICATED_WITH"
  | "INTRODUCED_TO";
export type RelationshipGraphResolutionV1 = "RESOLVED" | "AMBIGUOUS" | "UNAVAILABLE";
export type RelationshipGraphEvidenceStateV1 = "KNOWN" | "PARTIAL" | "STALE" | "CONFLICTED";
export type RelationshipGraphAuthorityV1 = "EVIDENCE_ONLY";

export type RelationshipGraphEvidenceV1 = {
  sourceEntityType: RelationshipGraphEntityTypeV1;
  sourceCanonicalId: string | null;
  targetEntityType: RelationshipGraphEntityTypeV1;
  targetCanonicalId: string | null;
  relationshipKind: RelationshipGraphKindV1;
  resolution: RelationshipGraphResolutionV1;
  evidenceState: RelationshipGraphEvidenceStateV1;
  observedAt: string;
  freshThrough: string;
  provenanceRef: string;
  evidenceRefs: readonly string[];
  authority: RelationshipGraphAuthorityV1;
};

export type RelationshipGraphProposalV1 = {
  edgeKey: string;
  sourceEntityType: RelationshipGraphEntityTypeV1;
  sourceCanonicalId: string;
  targetEntityType: RelationshipGraphEntityTypeV1;
  targetCanonicalId: string;
  relationshipKind: RelationshipGraphKindV1;
  observedAt: string;
  freshThrough: string;
  provenanceRefs: readonly string[];
  evidenceRefs: readonly string[];
  reviewState: "READY_FOR_INTERNAL_REVIEW";
  externalWritesEnabled: false;
  inferredReverseEdge: false;
  notEstablished: readonly [
    "WARMTH",
    "DECISION_AUTHORITY",
    "SPONSORSHIP",
    "ENDORSEMENT",
    "CONTACT_INFO",
    "INTEREST",
    "OPPORTUNITY_CERTAINTY",
    "CONFIDENCE",
    "MONETARY_VALUE",
    "TIMING"
  ];
};

export type RelationshipGraphWithheldReasonV1 =
  | "AMBIGUOUS_IDENTITY"
  | "IDENTITY_UNAVAILABLE"
  | "CANONICAL_ID_MISSING"
  | "SELF_EDGE"
  | "EVIDENCE_PARTIAL"
  | "EVIDENCE_STALE"
  | "EVIDENCE_CONFLICTED"
  | "FUTURE_DATED"
  | "FRESHNESS_EXPIRED"
  | "EVIDENCE_MISSING"
  | "UNSUPPORTED_ENDPOINTS";

export type RelationshipGraphWithheldV1 = {
  relationshipKind: RelationshipGraphKindV1;
  sourceCanonicalId: string | null;
  targetCanonicalId: string | null;
  reason: RelationshipGraphWithheldReasonV1;
};

export type RelationshipGraphPopulationV1 = {
  proposals: readonly RelationshipGraphProposalV1[];
  withheld: readonly RelationshipGraphWithheldV1[];
  verificationRequired: boolean;
  externalWritesEnabled: false;
};

const INPUT_KEYS = new Set([
  "sourceEntityType",
  "sourceCanonicalId",
  "targetEntityType",
  "targetCanonicalId",
  "relationshipKind",
  "resolution",
  "evidenceState",
  "observedAt",
  "freshThrough",
  "provenanceRef",
  "evidenceRefs",
  "authority"
]);
const ENTITY_TYPES = new Set<RelationshipGraphEntityTypeV1>(["PERSON", "COMPANY"]);
const RELATIONSHIP_KINDS = new Set<RelationshipGraphKindV1>([
  "EMPLOYED_BY",
  "AFFILIATED_WITH",
  "COMMUNICATED_WITH",
  "INTRODUCED_TO"
]);
const RESOLUTIONS = new Set<RelationshipGraphResolutionV1>(["RESOLVED", "AMBIGUOUS", "UNAVAILABLE"]);
const EVIDENCE_STATES = new Set<RelationshipGraphEvidenceStateV1>(["KNOWN", "PARTIAL", "STALE", "CONFLICTED"]);
const NOT_ESTABLISHED = [
  "WARMTH",
  "DECISION_AUTHORITY",
  "SPONSORSHIP",
  "ENDORSEMENT",
  "CONTACT_INFO",
  "INTEREST",
  "OPPORTUNITY_CERTAINTY",
  "CONFIDENCE",
  "MONETARY_VALUE",
  "TIMING"
] as const;

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredText(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(code);
  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTimestamp(value: unknown, code: string): { iso: string; epochMs: number } {
  const text = requiredText(value, code);
  const epochMs = Date.parse(text);
  if (!Number.isFinite(epochMs)) return fail(code);
  return { iso: new Date(epochMs).toISOString(), epochMs };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function endpointsSupported(
  kind: RelationshipGraphKindV1,
  sourceType: RelationshipGraphEntityTypeV1,
  targetType: RelationshipGraphEntityTypeV1
): boolean {
  if (kind === "EMPLOYED_BY" || kind === "AFFILIATED_WITH") {
    return sourceType === "PERSON" && targetType === "COMPANY";
  }
  return sourceType === "PERSON" && targetType === "PERSON";
}

function edgeKey(input: {
  sourceEntityType: RelationshipGraphEntityTypeV1;
  sourceCanonicalId: string;
  relationshipKind: RelationshipGraphKindV1;
  targetEntityType: RelationshipGraphEntityTypeV1;
  targetCanonicalId: string;
}): string {
  return [
    input.sourceEntityType,
    encodeURIComponent(input.sourceCanonicalId),
    input.relationshipKind,
    input.targetEntityType,
    encodeURIComponent(input.targetCanonicalId)
  ].join(":");
}

type NormalizedEvidence = Omit<RelationshipGraphEvidenceV1, "sourceCanonicalId" | "targetCanonicalId"> & {
  sourceCanonicalId: string | null;
  targetCanonicalId: string | null;
  observedAt: string;
  freshThrough: string;
};

function normalize(raw: unknown): NormalizedEvidence {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !INPUT_KEYS.has(key))) {
    return fail("RELATIONSHIP_GRAPH_EVIDENCE_INVALID");
  }
  if (!ENTITY_TYPES.has(raw.sourceEntityType as RelationshipGraphEntityTypeV1) ||
      !ENTITY_TYPES.has(raw.targetEntityType as RelationshipGraphEntityTypeV1)) {
    return fail("RELATIONSHIP_GRAPH_ENTITY_TYPE_INVALID");
  }
  if (!RELATIONSHIP_KINDS.has(raw.relationshipKind as RelationshipGraphKindV1)) {
    return fail("RELATIONSHIP_GRAPH_KIND_INVALID");
  }
  if (!RESOLUTIONS.has(raw.resolution as RelationshipGraphResolutionV1)) {
    return fail("RELATIONSHIP_GRAPH_RESOLUTION_INVALID");
  }
  if (!EVIDENCE_STATES.has(raw.evidenceState as RelationshipGraphEvidenceStateV1)) {
    return fail("RELATIONSHIP_GRAPH_EVIDENCE_STATE_INVALID");
  }
  if (raw.authority !== "EVIDENCE_ONLY") return fail("RELATIONSHIP_GRAPH_AUTHORITY_INVALID");
  if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim())) {
    return fail("RELATIONSHIP_GRAPH_EVIDENCE_REFS_INVALID");
  }

  const observedAt = parseTimestamp(raw.observedAt, "RELATIONSHIP_GRAPH_OBSERVED_AT_INVALID");
  const freshThrough = parseTimestamp(raw.freshThrough, "RELATIONSHIP_GRAPH_FRESH_THROUGH_INVALID");
  if (freshThrough.epochMs < observedAt.epochMs) return fail("RELATIONSHIP_GRAPH_FRESHNESS_RANGE_INVALID");

  return {
    sourceEntityType: raw.sourceEntityType as RelationshipGraphEntityTypeV1,
    sourceCanonicalId: optionalText(raw.sourceCanonicalId),
    targetEntityType: raw.targetEntityType as RelationshipGraphEntityTypeV1,
    targetCanonicalId: optionalText(raw.targetCanonicalId),
    relationshipKind: raw.relationshipKind as RelationshipGraphKindV1,
    resolution: raw.resolution as RelationshipGraphResolutionV1,
    evidenceState: raw.evidenceState as RelationshipGraphEvidenceStateV1,
    observedAt: observedAt.iso,
    freshThrough: freshThrough.iso,
    provenanceRef: requiredText(raw.provenanceRef, "RELATIONSHIP_GRAPH_PROVENANCE_REF_INVALID"),
    evidenceRefs: uniqueSorted((raw.evidenceRefs as string[]).map((ref) => ref.trim())),
    authority: "EVIDENCE_ONLY"
  };
}

function withheldReason(entry: NormalizedEvidence, nowMs: number): RelationshipGraphWithheldReasonV1 | null {
  if (entry.resolution === "AMBIGUOUS") return "AMBIGUOUS_IDENTITY";
  if (entry.resolution === "UNAVAILABLE") return "IDENTITY_UNAVAILABLE";
  if (!entry.sourceCanonicalId || !entry.targetCanonicalId) return "CANONICAL_ID_MISSING";
  if (entry.sourceEntityType === entry.targetEntityType && entry.sourceCanonicalId === entry.targetCanonicalId) return "SELF_EDGE";
  if (entry.evidenceState === "PARTIAL") return "EVIDENCE_PARTIAL";
  if (entry.evidenceState === "STALE") return "EVIDENCE_STALE";
  if (entry.evidenceState === "CONFLICTED") return "EVIDENCE_CONFLICTED";
  if (Date.parse(entry.observedAt) > nowMs) return "FUTURE_DATED";
  if (Date.parse(entry.freshThrough) < nowMs) return "FRESHNESS_EXPIRED";
  if (entry.evidenceRefs.length === 0) return "EVIDENCE_MISSING";
  if (!endpointsSupported(entry.relationshipKind, entry.sourceEntityType, entry.targetEntityType)) return "UNSUPPORTED_ENDPOINTS";
  return null;
}

export function projectRelationshipGraphPopulationV1(input: {
  now: string;
  evidence?: readonly RelationshipGraphEvidenceV1[] | null;
}): RelationshipGraphPopulationV1 {
  if (!isPlainObject(input)) fail("RELATIONSHIP_GRAPH_INPUT_INVALID");
  const now = parseTimestamp(input.now, "RELATIONSHIP_GRAPH_NOW_INVALID");
  if (input.evidence == null) {
    return { proposals: [], withheld: [], verificationRequired: false, externalWritesEnabled: false };
  }
  if (!Array.isArray(input.evidence)) fail("RELATIONSHIP_GRAPH_EVIDENCE_SET_INVALID");

  const normalized = input.evidence.map(normalize);
  const proposalsByKey = new Map<string, RelationshipGraphProposalV1>();
  const withheld: RelationshipGraphWithheldV1[] = [];

  for (const entry of normalized) {
    const reason = withheldReason(entry, now.epochMs);
    if (reason != null) {
      withheld.push({
        relationshipKind: entry.relationshipKind,
        sourceCanonicalId: entry.sourceCanonicalId,
        targetCanonicalId: entry.targetCanonicalId,
        reason
      });
      continue;
    }

    const key = edgeKey({
      sourceEntityType: entry.sourceEntityType,
      sourceCanonicalId: entry.sourceCanonicalId!,
      relationshipKind: entry.relationshipKind,
      targetEntityType: entry.targetEntityType,
      targetCanonicalId: entry.targetCanonicalId!
    });
    const existing = proposalsByKey.get(key);
    if (existing) {
      proposalsByKey.set(key, {
        ...existing,
        observedAt: Date.parse(entry.observedAt) > Date.parse(existing.observedAt) ? entry.observedAt : existing.observedAt,
        freshThrough: Date.parse(entry.freshThrough) < Date.parse(existing.freshThrough) ? entry.freshThrough : existing.freshThrough,
        provenanceRefs: uniqueSorted([...existing.provenanceRefs, entry.provenanceRef]),
        evidenceRefs: uniqueSorted([...existing.evidenceRefs, ...entry.evidenceRefs])
      });
      continue;
    }

    proposalsByKey.set(key, {
      edgeKey: key,
      sourceEntityType: entry.sourceEntityType,
      sourceCanonicalId: entry.sourceCanonicalId!,
      targetEntityType: entry.targetEntityType,
      targetCanonicalId: entry.targetCanonicalId!,
      relationshipKind: entry.relationshipKind,
      observedAt: entry.observedAt,
      freshThrough: entry.freshThrough,
      provenanceRefs: [entry.provenanceRef],
      evidenceRefs: entry.evidenceRefs,
      reviewState: "READY_FOR_INTERNAL_REVIEW",
      externalWritesEnabled: false,
      inferredReverseEdge: false,
      notEstablished: NOT_ESTABLISHED
    });
  }

  const proposals = [...proposalsByKey.values()].sort((left, right) => left.edgeKey.localeCompare(right.edgeKey));
  withheld.sort((left, right) =>
    (left.sourceCanonicalId ?? "").localeCompare(right.sourceCanonicalId ?? "") ||
    left.relationshipKind.localeCompare(right.relationshipKind) ||
    (left.targetCanonicalId ?? "").localeCompare(right.targetCanonicalId ?? "") ||
    left.reason.localeCompare(right.reason)
  );

  return {
    proposals,
    withheld,
    verificationRequired: withheld.length > 0,
    externalWritesEnabled: false
  };
}
