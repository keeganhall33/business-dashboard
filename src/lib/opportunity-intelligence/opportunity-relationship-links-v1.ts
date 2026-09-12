export type OpportunityRelationshipEntityTypeV1 = "PERSON" | "COMPANY";
export type OpportunityRelationshipEvidenceStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";
export type OpportunityRelationshipResolutionV1 = "RESOLVED" | "AMBIGUOUS" | "UNAVAILABLE";

export type OpportunityRelationshipEvidenceV1 = {
  opportunityId: string;
  entityType: OpportunityRelationshipEntityTypeV1;
  canonicalId: string | null;
  label: string | null;
  href: string | null;
  resolution: OpportunityRelationshipResolutionV1;
  evidenceState: OpportunityRelationshipEvidenceStateV1;
  evidenceRefs: readonly string[];
};

export type OpportunityRelationshipLinkV1 = {
  entityType: OpportunityRelationshipEntityTypeV1;
  canonicalId: string;
  label: string;
  href: string;
  evidenceRefs: readonly string[];
};

export type OpportunityRelationshipWithheldReasonV1 =
  | "AMBIGUOUS"
  | "UNAVAILABLE"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED"
  | "CANONICAL_ID_MISSING"
  | "LABEL_MISSING"
  | "UNSUPPORTED_HREF"
  | "EVIDENCE_MISSING"
  | "DUPLICATE_CONFLICT";

export type OpportunityRelationshipWithheldV1 = {
  entityType: OpportunityRelationshipEntityTypeV1;
  canonicalId: string | null;
  reason: OpportunityRelationshipWithheldReasonV1;
};

export type OpportunityRelationshipLinksV1 = {
  opportunityId: string;
  links: readonly OpportunityRelationshipLinkV1[];
  withheld: readonly OpportunityRelationshipWithheldV1[];
  verificationRequired: boolean;
};

const EVIDENCE_KEYS = new Set([
  "opportunityId",
  "entityType",
  "canonicalId",
  "label",
  "href",
  "resolution",
  "evidenceState",
  "evidenceRefs"
]);
const ENTITY_TYPES = new Set<OpportunityRelationshipEntityTypeV1>(["PERSON", "COMPANY"]);
const RESOLUTIONS = new Set<OpportunityRelationshipResolutionV1>(["RESOLVED", "AMBIGUOUS", "UNAVAILABLE"]);
const EVIDENCE_STATES = new Set<OpportunityRelationshipEvidenceStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED"
]);

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

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function expectedHref(entityType: OpportunityRelationshipEntityTypeV1, canonicalId: string): string {
  const base = entityType === "PERSON" ? "/relationships/people/" : "/relationships/companies/";
  return `${base}${encodeURIComponent(canonicalId)}`;
}

type NormalizedEvidence = {
  opportunityId: string;
  entityType: OpportunityRelationshipEntityTypeV1;
  canonicalId: string | null;
  label: string | null;
  href: string | null;
  resolution: OpportunityRelationshipResolutionV1;
  evidenceState: OpportunityRelationshipEvidenceStateV1;
  evidenceRefs: readonly string[];
};

function normalizeEvidence(raw: unknown, opportunityId: string): NormalizedEvidence {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !EVIDENCE_KEYS.has(key))) {
    return fail("OPPORTUNITY_RELATIONSHIP_EVIDENCE_INVALID");
  }
  if (requiredText(raw.opportunityId, "OPPORTUNITY_RELATIONSHIP_OPPORTUNITY_ID_INVALID") !== opportunityId) {
    return fail("OPPORTUNITY_RELATIONSHIP_SCOPE_MISMATCH");
  }
  if (!ENTITY_TYPES.has(raw.entityType as OpportunityRelationshipEntityTypeV1)) {
    return fail("OPPORTUNITY_RELATIONSHIP_ENTITY_TYPE_INVALID");
  }
  if (!RESOLUTIONS.has(raw.resolution as OpportunityRelationshipResolutionV1)) {
    return fail("OPPORTUNITY_RELATIONSHIP_RESOLUTION_INVALID");
  }
  if (!EVIDENCE_STATES.has(raw.evidenceState as OpportunityRelationshipEvidenceStateV1)) {
    return fail("OPPORTUNITY_RELATIONSHIP_EVIDENCE_STATE_INVALID");
  }
  if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.some((value) => typeof value !== "string" || !value.trim())) {
    return fail("OPPORTUNITY_RELATIONSHIP_EVIDENCE_REFS_INVALID");
  }

  return {
    opportunityId,
    entityType: raw.entityType as OpportunityRelationshipEntityTypeV1,
    canonicalId: optionalText(raw.canonicalId),
    label: optionalText(raw.label),
    href: optionalText(raw.href),
    resolution: raw.resolution as OpportunityRelationshipResolutionV1,
    evidenceState: raw.evidenceState as OpportunityRelationshipEvidenceStateV1,
    evidenceRefs: uniqueSorted((raw.evidenceRefs as string[]).map((value) => value.trim()))
  };
}

function withheldReason(evidence: NormalizedEvidence): OpportunityRelationshipWithheldReasonV1 | null {
  if (evidence.resolution === "AMBIGUOUS") return "AMBIGUOUS";
  if (evidence.resolution === "UNAVAILABLE") return "UNAVAILABLE";
  if (evidence.evidenceState !== "KNOWN") return evidence.evidenceState;
  if (!evidence.canonicalId) return "CANONICAL_ID_MISSING";
  if (!evidence.label) return "LABEL_MISSING";
  if (!evidence.href || evidence.href !== expectedHref(evidence.entityType, evidence.canonicalId)) return "UNSUPPORTED_HREF";
  if (evidence.evidenceRefs.length === 0) return "EVIDENCE_MISSING";
  return null;
}

function entityOrder(entityType: OpportunityRelationshipEntityTypeV1): number {
  return entityType === "PERSON" ? 0 : 1;
}

export function projectOpportunityRelationshipLinksV1(input: {
  opportunityId: string;
  evidence?: readonly OpportunityRelationshipEvidenceV1[] | null;
}): OpportunityRelationshipLinksV1 {
  if (!isPlainObject(input)) fail("OPPORTUNITY_RELATIONSHIP_INPUT_INVALID");
  const opportunityId = requiredText(input.opportunityId, "OPPORTUNITY_RELATIONSHIP_OPPORTUNITY_ID_INVALID");
  if (input.evidence == null) {
    return { opportunityId, links: [], withheld: [], verificationRequired: false };
  }
  if (!Array.isArray(input.evidence)) fail("OPPORTUNITY_RELATIONSHIP_EVIDENCE_SET_INVALID");

  const normalized = input.evidence.map((entry) => normalizeEvidence(entry, opportunityId));
  const grouped = new Map<string, NormalizedEvidence[]>();
  const keyFor = (entry: NormalizedEvidence) => `${entry.entityType}:${entry.canonicalId ?? "<missing>"}`;
  for (const entry of normalized) {
    const key = keyFor(entry);
    const bucket = grouped.get(key) ?? [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  const links: OpportunityRelationshipLinkV1[] = [];
  const withheld: OpportunityRelationshipWithheldV1[] = [];

  for (const bucket of grouped.values()) {
    const first = bucket[0];
    const reasons = bucket.map(withheldReason);
    const signatures = new Set(bucket.map((entry) => JSON.stringify({
      entityType: entry.entityType,
      canonicalId: entry.canonicalId,
      label: entry.label,
      href: entry.href,
      resolution: entry.resolution,
      evidenceState: entry.evidenceState
    })));

    if (bucket.length > 1 && signatures.size > 1) {
      withheld.push({ entityType: first.entityType, canonicalId: first.canonicalId, reason: "DUPLICATE_CONFLICT" });
      continue;
    }

    const reason = reasons[0];
    if (reason != null) {
      withheld.push({ entityType: first.entityType, canonicalId: first.canonicalId, reason });
      continue;
    }

    links.push({
      entityType: first.entityType,
      canonicalId: first.canonicalId!,
      label: first.label!,
      href: first.href!,
      evidenceRefs: uniqueSorted(bucket.flatMap((entry) => [...entry.evidenceRefs]))
    });
  }

  links.sort((left, right) =>
    entityOrder(left.entityType) - entityOrder(right.entityType) ||
    left.label.localeCompare(right.label) ||
    left.canonicalId.localeCompare(right.canonicalId)
  );
  withheld.sort((left, right) =>
    entityOrder(left.entityType) - entityOrder(right.entityType) ||
    (left.canonicalId ?? "").localeCompare(right.canonicalId ?? "") ||
    left.reason.localeCompare(right.reason)
  );

  return {
    opportunityId,
    links,
    withheld,
    verificationRequired: withheld.length > 0
  };
}
