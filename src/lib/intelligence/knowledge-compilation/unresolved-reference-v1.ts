export const UNRESOLVED_REFERENCE_CONTRACT_VERSION = "UNRESOLVED_REFERENCE_V1" as const;

export const UNRESOLVED_REFERENCE_LIMITS = Object.freeze({
  maxLabelLength: 160,
  maxIdentifierLength: 256,
  maxReasonLength: 320,
  maxProvenanceRefs: 16,
  maxAffectedCanonicalIds: 16,
  maxCandidates: 8,
  maxEvidenceRefsPerCandidate: 8,
  maxResolutionEvidenceRefs: 8
});

export type UnresolvedReferenceKind =
  | "PERSON"
  | "ORGANIZATION"
  | "PROJECT"
  | "OPPORTUNITY"
  | "CONCEPT"
  | "RELATIONSHIP"
  | "COMMITMENT"
  | "OTHER";

export type UnresolvedReferenceStatus =
  | "UNRESOLVED"
  | "CANDIDATES_FOUND"
  | "REVIEW_REQUIRED"
  | "RESOLVED"
  | "REJECTED"
  | "STALE";

export type UnresolvedReferenceTruthState = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";

export type UnresolvedReferenceCandidateV1 = Readonly<{
  entity_id: string;
  match_evidence_refs: readonly string[];
  truth_state: UnresolvedReferenceTruthState;
  confidence: number | null;
  direct_identity_evidence: boolean;
}>;

export type UnresolvedReferenceV1 = Readonly<{
  contract_version: typeof UNRESOLVED_REFERENCE_CONTRACT_VERSION;
  reference_id: string;
  reference_kind: UnresolvedReferenceKind;
  display_label: string;
  normalized_label: string;
  provenance_refs: readonly string[];
  source_context_id: string;
  observed_at: string | null;
  effective_at: string | null;
  affected_canonical_object_ids: readonly string[];
  candidates: readonly UnresolvedReferenceCandidateV1[];
  status: UnresolvedReferenceStatus;
  truth_state: UnresolvedReferenceTruthState;
  confidence: number | null;
  resolved_canonical_id: string | null;
  resolution_reason: string | null;
  resolution_evidence_refs: readonly string[];
  created_at: string;
}>;

export type CreateUnresolvedReferenceV1Input = Readonly<{
  reference_id: string;
  reference_kind: UnresolvedReferenceKind;
  display_label: string;
  provenance_refs: readonly string[];
  source_context_id: string;
  observed_at?: string | null;
  effective_at?: string | null;
  affected_canonical_object_ids?: readonly string[];
  created_at: string;
}>;

export type ResolveUnresolvedReferenceV1Input = Readonly<{
  candidates: readonly UnresolvedReferenceCandidateV1[];
  supplied_canonical_ids: readonly string[];
  policy: Readonly<{
    allow_deterministic_resolution: boolean;
    minimum_confidence: number;
  }>;
  resolution_reason?: string | null;
  resolution_evidence_refs?: readonly string[];
}>;

const KINDS = new Set<UnresolvedReferenceKind>([
  "PERSON",
  "ORGANIZATION",
  "PROJECT",
  "OPPORTUNITY",
  "CONCEPT",
  "RELATIONSHIP",
  "COMMITMENT",
  "OTHER"
]);

const TRUTH_STATES = new Set<UnresolvedReferenceTruthState>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED"
]);

const CREATE_KEYS = new Set([
  "reference_id",
  "reference_kind",
  "display_label",
  "provenance_refs",
  "source_context_id",
  "observed_at",
  "effective_at",
  "affected_canonical_object_ids",
  "created_at"
]);

const FORBIDDEN_KEY_PATTERN = /(^|_)(body|raw|content|payload|secret|credential|password|token)(_|$)/i;

function fail(code: string): never {
  throw new Error(`UNRESOLVED_REFERENCE_V1_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBoundedString(
  value: unknown,
  field: string,
  maxLength: number = UNRESOLVED_REFERENCE_LIMITS.maxIdentifierLength
): string {
  if (typeof value !== "string") fail(`${field.toUpperCase()}_REQUIRED`);
  const trimmed = value.trim();
  if (!trimmed) fail(`${field.toUpperCase()}_REQUIRED`);
  if (trimmed.length > maxLength) fail(`${field.toUpperCase()}_TOO_LONG`);
  return trimmed;
}

function assertIsoTimestamp(value: unknown, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const text = assertBoundedString(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail(`${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function assertConfidence(value: unknown, field = "confidence"): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${field.toUpperCase()}_INVALID`);
  }
  return value;
}

function boundedUniqueStrings(value: unknown, field: string, maximum: number, required = false): readonly string[] {
  if (!Array.isArray(value)) fail(`${field.toUpperCase()}_INVALID`);
  if (required && value.length === 0) fail(`${field.toUpperCase()}_REQUIRED`);
  if (value.length > maximum) fail(`${field.toUpperCase()}_TOO_MANY`);
  const normalized = value.map((item) => assertBoundedString(item, field));
  if (new Set(normalized).size !== normalized.length) fail(`${field.toUpperCase()}_DUPLICATE`);
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function validateCreateObject(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) fail("INPUT_INVALID");
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) fail("RAW_OR_SECRET_FIELD_FORBIDDEN");
    if (!CREATE_KEYS.has(key)) fail(`UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }
  return input;
}

function canonicalCandidate(candidate: unknown): UnresolvedReferenceCandidateV1 {
  if (!isRecord(candidate)) fail("CANDIDATE_INVALID");
  const allowed = new Set(["entity_id", "match_evidence_refs", "truth_state", "confidence", "direct_identity_evidence"]);
  for (const key of Object.keys(candidate)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) fail("CANDIDATE_RAW_OR_SECRET_FIELD_FORBIDDEN");
    if (!allowed.has(key)) fail(`CANDIDATE_UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }

  const entityId = assertBoundedString(candidate.entity_id, "candidate_entity_id");
  const evidenceRefs = boundedUniqueStrings(
    candidate.match_evidence_refs,
    "candidate_match_evidence_refs",
    UNRESOLVED_REFERENCE_LIMITS.maxEvidenceRefsPerCandidate,
    true
  );
  if (typeof candidate.truth_state !== "string" || !TRUTH_STATES.has(candidate.truth_state as UnresolvedReferenceTruthState)) {
    fail("CANDIDATE_TRUTH_STATE_INVALID");
  }
  const truthState = candidate.truth_state as UnresolvedReferenceTruthState;
  const confidence = assertConfidence(candidate.confidence, "candidate_confidence");
  if (typeof candidate.direct_identity_evidence !== "boolean") fail("CANDIDATE_DIRECT_EVIDENCE_REQUIRED");

  return deepFreeze({
    entity_id: entityId,
    match_evidence_refs: evidenceRefs,
    truth_state: truthState,
    confidence,
    direct_identity_evidence: candidate.direct_identity_evidence
  });
}

function canonicalCandidates(value: unknown): readonly UnresolvedReferenceCandidateV1[] {
  if (!Array.isArray(value)) fail("CANDIDATES_INVALID");
  if (value.length > UNRESOLVED_REFERENCE_LIMITS.maxCandidates) fail("CANDIDATES_TOO_MANY");
  const candidates = value.map(canonicalCandidate).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  if (new Set(candidates.map((candidate) => candidate.entity_id)).size !== candidates.length) fail("CANDIDATE_ENTITY_DUPLICATE");
  return deepFreeze(candidates);
}

function candidateTruthState(candidates: readonly UnresolvedReferenceCandidateV1[]): UnresolvedReferenceTruthState {
  if (candidates.some((candidate) => candidate.truth_state === "CONFLICTED")) return "CONFLICTED";
  if (candidates.length > 0 && candidates.every((candidate) => candidate.truth_state === "STALE")) return "STALE";
  if (candidates.some((candidate) => candidate.truth_state === "KNOWN")) return "KNOWN";
  if (candidates.some((candidate) => candidate.truth_state === "INFERRED")) return "INFERRED";
  return "UNKNOWN";
}

export function createUnresolvedReferenceV1(input: CreateUnresolvedReferenceV1Input): UnresolvedReferenceV1 {
  const raw = validateCreateObject(input);
  const referenceId = assertBoundedString(raw.reference_id, "reference_id");
  if (typeof raw.reference_kind !== "string" || !KINDS.has(raw.reference_kind as UnresolvedReferenceKind)) {
    fail("REFERENCE_KIND_INVALID");
  }
  const displayLabel = assertBoundedString(raw.display_label, "display_label", UNRESOLVED_REFERENCE_LIMITS.maxLabelLength);
  const provenanceRefs = boundedUniqueStrings(
    raw.provenance_refs,
    "provenance_refs",
    UNRESOLVED_REFERENCE_LIMITS.maxProvenanceRefs,
    true
  );
  const sourceContextId = assertBoundedString(raw.source_context_id, "source_context_id");
  const affectedCanonicalIds = boundedUniqueStrings(
    raw.affected_canonical_object_ids ?? [],
    "affected_canonical_object_ids",
    UNRESOLVED_REFERENCE_LIMITS.maxAffectedCanonicalIds
  );

  return deepFreeze({
    contract_version: UNRESOLVED_REFERENCE_CONTRACT_VERSION,
    reference_id: referenceId,
    reference_kind: raw.reference_kind as UnresolvedReferenceKind,
    display_label: displayLabel,
    normalized_label: normalizeLabel(displayLabel),
    provenance_refs: provenanceRefs,
    source_context_id: sourceContextId,
    observed_at: assertIsoTimestamp(raw.observed_at, "observed_at", false),
    effective_at: assertIsoTimestamp(raw.effective_at, "effective_at", false),
    affected_canonical_object_ids: affectedCanonicalIds,
    candidates: Object.freeze([]),
    status: "UNRESOLVED" as const,
    truth_state: "UNKNOWN" as const,
    confidence: null,
    resolved_canonical_id: null,
    resolution_reason: null,
    resolution_evidence_refs: Object.freeze([]),
    created_at: assertIsoTimestamp(raw.created_at, "created_at", true) as string
  });
}

export function resolveUnresolvedReferenceV1(
  reference: UnresolvedReferenceV1,
  input: ResolveUnresolvedReferenceV1Input
): UnresolvedReferenceV1 {
  if (!isRecord(reference) || reference.contract_version !== UNRESOLVED_REFERENCE_CONTRACT_VERSION) fail("REFERENCE_INVALID");
  if (!isRecord(input)) fail("RESOLUTION_INPUT_INVALID");
  if (!isRecord(input.policy)) fail("RESOLUTION_POLICY_INVALID");
  if (typeof input.policy.allow_deterministic_resolution !== "boolean") fail("RESOLUTION_POLICY_AUTHORIZATION_REQUIRED");
  const minimumConfidence = assertConfidence(input.policy.minimum_confidence, "minimum_confidence");
  if (minimumConfidence === null) fail("MINIMUM_CONFIDENCE_REQUIRED");

  const candidates = canonicalCandidates(input.candidates);
  const canonicalIds = boundedUniqueStrings(
    input.supplied_canonical_ids,
    "supplied_canonical_ids",
    UNRESOLVED_REFERENCE_LIMITS.maxAffectedCanonicalIds
  );
  const reason = input.resolution_reason == null
    ? null
    : assertBoundedString(input.resolution_reason, "resolution_reason", UNRESOLVED_REFERENCE_LIMITS.maxReasonLength);
  const resolutionEvidenceRefs = boundedUniqueStrings(
    input.resolution_evidence_refs ?? [],
    "resolution_evidence_refs",
    UNRESOLVED_REFERENCE_LIMITS.maxResolutionEvidenceRefs
  );

  if (reference.status === "RESOLVED") return reference;
  if (candidates.length === 0) {
    return deepFreeze({
      ...reference,
      candidates,
      status: "UNRESOLVED" as const,
      truth_state: "UNKNOWN" as const,
      confidence: null,
      resolved_canonical_id: null,
      resolution_reason: null,
      resolution_evidence_refs: Object.freeze([])
    });
  }

  if (candidates.length > 1) {
    return deepFreeze({
      ...reference,
      candidates,
      status: "REVIEW_REQUIRED" as const,
      truth_state: "CONFLICTED" as const,
      confidence: null,
      resolved_canonical_id: null,
      resolution_reason: null,
      resolution_evidence_refs: Object.freeze([])
    });
  }

  const candidate = candidates[0];
  const stale = candidate.truth_state === "STALE";
  const resolvableTruth = candidate.truth_state === "KNOWN";
  const confidenceMeetsPolicy = candidate.confidence !== null && candidate.confidence >= minimumConfidence;
  const policyAllowsResolution = input.policy.allow_deterministic_resolution;
  const hasDirectEvidence = candidate.direct_identity_evidence;
  const canAutoResolve = policyAllowsResolution && !stale && resolvableTruth && confidenceMeetsPolicy && hasDirectEvidence;

  if (!canAutoResolve) {
    return deepFreeze({
      ...reference,
      candidates,
      status: stale ? ("STALE" as const) : ("CANDIDATES_FOUND" as const),
      truth_state: candidateTruthState(candidates),
      confidence: candidate.confidence,
      resolved_canonical_id: null,
      resolution_reason: null,
      resolution_evidence_refs: Object.freeze([])
    });
  }

  if (candidate.entity_id === reference.reference_id) fail("SELF_RESOLUTION_FORBIDDEN");
  if (!canonicalIds.includes(candidate.entity_id)) fail("RESOLUTION_CANONICAL_ID_NOT_SUPPLIED");
  if (!reason) fail("RESOLUTION_REASON_REQUIRED");
  if (resolutionEvidenceRefs.length === 0) fail("RESOLUTION_EVIDENCE_REQUIRED");

  return deepFreeze({
    ...reference,
    candidates,
    status: "RESOLVED" as const,
    truth_state: "KNOWN" as const,
    confidence: candidate.confidence,
    resolved_canonical_id: candidate.entity_id,
    resolution_reason: reason,
    resolution_evidence_refs: resolutionEvidenceRefs
  });
}
