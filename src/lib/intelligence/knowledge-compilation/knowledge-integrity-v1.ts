export const KNOWLEDGE_INTEGRITY_CONTRACT_VERSION = "KNOWLEDGE_INTEGRITY_V1" as const;

export const KNOWLEDGE_INTEGRITY_LIMITS = Object.freeze({
  maxObservations: 128,
  maxIdentifierLength: 256,
  maxAffectedCanonicalIds: 16,
  maxEvidenceRefs: 16,
  maxSourceLineageRefs: 16
});

export type KnowledgeIntegrityFindingType =
  | "DUPLICATE_ENTITY_CANDIDATE"
  | "CONTRADICTORY_FACT"
  | "STALE_CANONICAL_OBJECT"
  | "MISSING_PROVENANCE"
  | "ORPHANED_RELATIONSHIP"
  | "ORPHANED_OPPORTUNITY"
  | "MISSING_NEXT_ACTION"
  | "OVERDUE_COMMITMENT"
  | "UNRESOLVED_REFERENCE"
  | "AMBIGUOUS_ENTITY_RESOLUTION"
  | "STALE_DERIVED_SUMMARY"
  | "UNRESOLVED_LEARNING_REVIEW"
  | "SILENT_SUPERSESSION_RISK"
  | "DUPLICATE_SOURCE_LINEAGE"
  | "UNKNOWN_OWNER"
  | "INVALID_TEMPORAL_ORDER";

export type KnowledgeIntegritySeverity = "INFO" | "REVIEW" | "IMPORTANT" | "BLOCKING";
export type KnowledgeIntegrityTruthState = "KNOWN" | "INFERRED" | "UNKNOWN" | "STALE" | "CONFLICTED";
export type KnowledgeIntegrityFreshnessState = "FRESH" | "STALE" | "UNKNOWN";
export type KnowledgeIntegrityBusinessImpact = "NONE" | "ACTIVE_DECISION" | "ACTIVE_HIGH_VALUE_OPPORTUNITY";
export type KnowledgeIntegrityTimeState = "NOT_TIME_SENSITIVE" | "TIME_SENSITIVE" | "OVERDUE";

export type KnowledgeIntegrityNextStepClass =
  | "REVIEW_ENTITY_RESOLUTION"
  | "REVIEW_CONFLICT"
  | "VERIFY_FRESHNESS"
  | "RESTORE_PROVENANCE"
  | "REVIEW_LINKAGE"
  | "REVIEW_NEXT_ACTION"
  | "REVIEW_COMMITMENT"
  | "REBUILD_DERIVED_STATE"
  | "REVIEW_LEARNING"
  | "REVIEW_SUPERSESSION"
  | "REVIEW_SOURCE_LINEAGE"
  | "ASSIGN_OWNER"
  | "REVIEW_TEMPORAL_ORDER";

export type KnowledgeIntegrityObservationV1 = Readonly<{
  observation_id: string;
  finding_type: KnowledgeIntegrityFindingType;
  affected_canonical_ids: readonly string[];
  evidence_refs: readonly string[];
  source_lineage_refs: readonly string[];
  truth_state: KnowledgeIntegrityTruthState;
  freshness_state: KnowledgeIntegrityFreshnessState;
  business_impact: KnowledgeIntegrityBusinessImpact;
  time_state: KnowledgeIntegrityTimeState;
  direct_evidence: boolean;
  first_seen: string | null;
  observed_at: string;
}>;

export type KnowledgeIntegrityEvaluationInputV1 = Readonly<{
  observations: readonly KnowledgeIntegrityObservationV1[];
}>;

export type KnowledgeIntegrityFindingV1 = Readonly<{
  contract_version: typeof KNOWLEDGE_INTEGRITY_CONTRACT_VERSION;
  finding_id: string;
  finding_type: KnowledgeIntegrityFindingType;
  severity: KnowledgeIntegritySeverity;
  affected_canonical_ids: readonly string[];
  evidence_refs: readonly string[];
  source_lineage_refs: readonly string[];
  truth_state: KnowledgeIntegrityTruthState;
  freshness_state: KnowledgeIntegrityFreshnessState;
  business_impact: KnowledgeIntegrityBusinessImpact;
  time_state: KnowledgeIntegrityTimeState;
  direct_evidence: boolean;
  reason_code: string;
  recommended_next_step: KnowledgeIntegrityNextStepClass;
  review_required: boolean;
  first_seen: string | null;
  observed_at: string;
}>;

const FINDING_TYPES = new Set<KnowledgeIntegrityFindingType>([
  "DUPLICATE_ENTITY_CANDIDATE",
  "CONTRADICTORY_FACT",
  "STALE_CANONICAL_OBJECT",
  "MISSING_PROVENANCE",
  "ORPHANED_RELATIONSHIP",
  "ORPHANED_OPPORTUNITY",
  "MISSING_NEXT_ACTION",
  "OVERDUE_COMMITMENT",
  "UNRESOLVED_REFERENCE",
  "AMBIGUOUS_ENTITY_RESOLUTION",
  "STALE_DERIVED_SUMMARY",
  "UNRESOLVED_LEARNING_REVIEW",
  "SILENT_SUPERSESSION_RISK",
  "DUPLICATE_SOURCE_LINEAGE",
  "UNKNOWN_OWNER",
  "INVALID_TEMPORAL_ORDER"
]);

const TRUTH_STATES = new Set<KnowledgeIntegrityTruthState>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<KnowledgeIntegrityFreshnessState>(["FRESH", "STALE", "UNKNOWN"]);
const BUSINESS_IMPACTS = new Set<KnowledgeIntegrityBusinessImpact>([
  "NONE",
  "ACTIVE_DECISION",
  "ACTIVE_HIGH_VALUE_OPPORTUNITY"
]);
const TIME_STATES = new Set<KnowledgeIntegrityTimeState>(["NOT_TIME_SENSITIVE", "TIME_SENSITIVE", "OVERDUE"]);

const INPUT_KEYS = new Set(["observations"]);
const OBSERVATION_KEYS = new Set([
  "observation_id",
  "finding_type",
  "affected_canonical_ids",
  "evidence_refs",
  "source_lineage_refs",
  "truth_state",
  "freshness_state",
  "business_impact",
  "time_state",
  "direct_evidence",
  "first_seen",
  "observed_at"
]);
const FORBIDDEN_KEY_PATTERN = /(^|_)(body|raw|content|payload|secret|credential|password|token|prompt)(_|$)/i;

const REASON_CODES: Readonly<Record<KnowledgeIntegrityFindingType, string>> = Object.freeze({
  DUPLICATE_ENTITY_CANDIDATE: "POSSIBLE_DUPLICATE_CANONICAL_IDENTITY",
  CONTRADICTORY_FACT: "MATERIAL_FACT_DISAGREEMENT",
  STALE_CANONICAL_OBJECT: "CANONICAL_OBJECT_EXPLICITLY_STALE",
  MISSING_PROVENANCE: "AUTHORITATIVE_PROVENANCE_MISSING",
  ORPHANED_RELATIONSHIP: "RELATIONSHIP_ENDPOINT_UNRESOLVED",
  ORPHANED_OPPORTUNITY: "OPPORTUNITY_LINKAGE_UNRESOLVED",
  MISSING_NEXT_ACTION: "ACTIVE_OBJECT_NEXT_ACTION_MISSING",
  OVERDUE_COMMITMENT: "COMMITMENT_PAST_SUPPORTED_DUE_TIME",
  UNRESOLVED_REFERENCE: "REFERENCE_IDENTITY_UNRESOLVED",
  AMBIGUOUS_ENTITY_RESOLUTION: "MULTIPLE_PLAUSIBLE_ENTITY_MATCHES",
  STALE_DERIVED_SUMMARY: "DERIVED_STATE_EXPLICITLY_STALE",
  UNRESOLVED_LEARNING_REVIEW: "LEARNING_AWAITS_GOVERNED_REVIEW",
  SILENT_SUPERSESSION_RISK: "SUCCESSOR_LINEAGE_OR_REVIEW_INCOMPLETE",
  DUPLICATE_SOURCE_LINEAGE: "DUPLICATE_UNDERLYING_SOURCE_LINEAGE",
  UNKNOWN_OWNER: "ACCOUNTABLE_OWNER_UNKNOWN",
  INVALID_TEMPORAL_ORDER: "TEMPORAL_SEQUENCE_INCONSISTENT"
});

const NEXT_STEPS: Readonly<Record<KnowledgeIntegrityFindingType, KnowledgeIntegrityNextStepClass>> = Object.freeze({
  DUPLICATE_ENTITY_CANDIDATE: "REVIEW_ENTITY_RESOLUTION",
  CONTRADICTORY_FACT: "REVIEW_CONFLICT",
  STALE_CANONICAL_OBJECT: "VERIFY_FRESHNESS",
  MISSING_PROVENANCE: "RESTORE_PROVENANCE",
  ORPHANED_RELATIONSHIP: "REVIEW_LINKAGE",
  ORPHANED_OPPORTUNITY: "REVIEW_LINKAGE",
  MISSING_NEXT_ACTION: "REVIEW_NEXT_ACTION",
  OVERDUE_COMMITMENT: "REVIEW_COMMITMENT",
  UNRESOLVED_REFERENCE: "REVIEW_ENTITY_RESOLUTION",
  AMBIGUOUS_ENTITY_RESOLUTION: "REVIEW_ENTITY_RESOLUTION",
  STALE_DERIVED_SUMMARY: "REBUILD_DERIVED_STATE",
  UNRESOLVED_LEARNING_REVIEW: "REVIEW_LEARNING",
  SILENT_SUPERSESSION_RISK: "REVIEW_SUPERSESSION",
  DUPLICATE_SOURCE_LINEAGE: "REVIEW_SOURCE_LINEAGE",
  UNKNOWN_OWNER: "ASSIGN_OWNER",
  INVALID_TEMPORAL_ORDER: "REVIEW_TEMPORAL_ORDER"
});

const WRONG_CONCLUSION_RISK: Readonly<Record<KnowledgeIntegrityFindingType, number>> = Object.freeze({
  CONTRADICTORY_FACT: 100,
  SILENT_SUPERSESSION_RISK: 95,
  INVALID_TEMPORAL_ORDER: 90,
  AMBIGUOUS_ENTITY_RESOLUTION: 88,
  MISSING_PROVENANCE: 86,
  DUPLICATE_ENTITY_CANDIDATE: 80,
  OVERDUE_COMMITMENT: 76,
  ORPHANED_RELATIONSHIP: 72,
  ORPHANED_OPPORTUNITY: 72,
  UNRESOLVED_REFERENCE: 68,
  MISSING_NEXT_ACTION: 64,
  STALE_CANONICAL_OBJECT: 60,
  STALE_DERIVED_SUMMARY: 58,
  UNRESOLVED_LEARNING_REVIEW: 54,
  UNKNOWN_OWNER: 50,
  DUPLICATE_SOURCE_LINEAGE: 46
});

const TRUTH_PROVENANCE_BREAKAGE = new Set<KnowledgeIntegrityFindingType>([
  "CONTRADICTORY_FACT",
  "MISSING_PROVENANCE",
  "AMBIGUOUS_ENTITY_RESOLUTION",
  "SILENT_SUPERSESSION_RISK",
  "DUPLICATE_SOURCE_LINEAGE",
  "INVALID_TEMPORAL_ORDER"
]);

function fail(code: string): never {
  throw new Error(`KNOWLEDGE_INTEGRITY_V1_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertBoundedString(value: unknown, field: string): string {
  if (typeof value !== "string") fail(`${field.toUpperCase()}_REQUIRED`);
  const normalized = value.trim();
  if (!normalized) fail(`${field.toUpperCase()}_REQUIRED`);
  if (normalized.length > KNOWLEDGE_INTEGRITY_LIMITS.maxIdentifierLength) fail(`${field.toUpperCase()}_TOO_LONG`);
  return normalized;
}

function assertIsoTimestamp(value: unknown, field: string, required: boolean): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) fail(`${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const text = assertBoundedString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail(`${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function boundedUniqueStrings(value: unknown, field: string, maximum: number): readonly string[] {
  if (!Array.isArray(value)) fail(`${field.toUpperCase()}_INVALID`);
  if (value.length > maximum) fail(`${field.toUpperCase()}_TOO_MANY`);
  const normalized = value.map((item) => assertBoundedString(item, field));
  if (new Set(normalized).size !== normalized.length) fail(`${field.toUpperCase()}_DUPLICATE`);
  return Object.freeze([...normalized].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function canonicalObservation(value: unknown): KnowledgeIntegrityObservationV1 {
  if (!isRecord(value)) fail("OBSERVATION_INVALID");
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) fail("RAW_OR_SECRET_FIELD_FORBIDDEN");
    if (!OBSERVATION_KEYS.has(key)) fail(`OBSERVATION_UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }

  const observationId = assertBoundedString(value.observation_id, "observation_id");
  if (typeof value.finding_type !== "string" || !FINDING_TYPES.has(value.finding_type as KnowledgeIntegrityFindingType)) {
    fail("FINDING_TYPE_INVALID");
  }
  if (typeof value.truth_state !== "string" || !TRUTH_STATES.has(value.truth_state as KnowledgeIntegrityTruthState)) {
    fail("TRUTH_STATE_INVALID");
  }
  if (typeof value.freshness_state !== "string" || !FRESHNESS_STATES.has(value.freshness_state as KnowledgeIntegrityFreshnessState)) {
    fail("FRESHNESS_STATE_INVALID");
  }
  if (typeof value.business_impact !== "string" || !BUSINESS_IMPACTS.has(value.business_impact as KnowledgeIntegrityBusinessImpact)) {
    fail("BUSINESS_IMPACT_INVALID");
  }
  if (typeof value.time_state !== "string" || !TIME_STATES.has(value.time_state as KnowledgeIntegrityTimeState)) {
    fail("TIME_STATE_INVALID");
  }
  if (typeof value.direct_evidence !== "boolean") fail("DIRECT_EVIDENCE_REQUIRED");

  const observedAt = assertIsoTimestamp(value.observed_at, "observed_at", true) as string;
  const firstSeen = assertIsoTimestamp(value.first_seen, "first_seen", false);

  return deepFreeze({
    observation_id: observationId,
    finding_type: value.finding_type as KnowledgeIntegrityFindingType,
    affected_canonical_ids: boundedUniqueStrings(
      value.affected_canonical_ids,
      "affected_canonical_ids",
      KNOWLEDGE_INTEGRITY_LIMITS.maxAffectedCanonicalIds
    ),
    evidence_refs: boundedUniqueStrings(value.evidence_refs, "evidence_refs", KNOWLEDGE_INTEGRITY_LIMITS.maxEvidenceRefs),
    source_lineage_refs: boundedUniqueStrings(
      value.source_lineage_refs,
      "source_lineage_refs",
      KNOWLEDGE_INTEGRITY_LIMITS.maxSourceLineageRefs
    ),
    truth_state: value.truth_state as KnowledgeIntegrityTruthState,
    freshness_state: value.freshness_state as KnowledgeIntegrityFreshnessState,
    business_impact: value.business_impact as KnowledgeIntegrityBusinessImpact,
    time_state: value.time_state as KnowledgeIntegrityTimeState,
    direct_evidence: value.direct_evidence,
    first_seen: firstSeen,
    observed_at: observedAt
  });
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function observationFingerprint(observation: KnowledgeIntegrityObservationV1): string {
  const lineage = observation.source_lineage_refs.join("|");
  const affected = observation.affected_canonical_ids.join("|");
  if (observation.finding_type === "DUPLICATE_SOURCE_LINEAGE" && lineage) {
    return `${observation.finding_type}|${lineage}`;
  }
  return `${observation.finding_type}|${affected}|${lineage || observation.observation_id}`;
}

function impactRank(value: KnowledgeIntegrityBusinessImpact): number {
  if (value === "ACTIVE_HIGH_VALUE_OPPORTUNITY") return 2;
  if (value === "ACTIVE_DECISION") return 1;
  return 0;
}

function timeRank(value: KnowledgeIntegrityTimeState): number {
  if (value === "OVERDUE") return 2;
  if (value === "TIME_SENSITIVE") return 1;
  return 0;
}

function severityFor(observation: KnowledgeIntegrityObservationV1): KnowledgeIntegritySeverity {
  const activeImpact = observation.business_impact !== "NONE";
  if (
    observation.finding_type === "CONTRADICTORY_FACT" &&
    observation.direct_evidence &&
    observation.truth_state === "CONFLICTED" &&
    activeImpact
  ) {
    return "BLOCKING";
  }
  if (
    (observation.finding_type === "SILENT_SUPERSESSION_RISK" ||
      observation.finding_type === "INVALID_TEMPORAL_ORDER" ||
      observation.finding_type === "AMBIGUOUS_ENTITY_RESOLUTION" ||
      observation.finding_type === "DUPLICATE_ENTITY_CANDIDATE" ||
      observation.finding_type === "ORPHANED_RELATIONSHIP" ||
      observation.finding_type === "ORPHANED_OPPORTUNITY") &&
    activeImpact
  ) {
    return "IMPORTANT";
  }
  if (observation.finding_type === "OVERDUE_COMMITMENT" && observation.time_state === "OVERDUE") return "IMPORTANT";
  if (observation.finding_type === "MISSING_PROVENANCE") return "IMPORTANT";
  if (observation.finding_type === "DUPLICATE_SOURCE_LINEAGE" && !activeImpact) return "INFO";
  return "REVIEW";
}

function reviewRequired(observation: KnowledgeIntegrityObservationV1, severity: KnowledgeIntegritySeverity): boolean {
  if (severity === "BLOCKING" || severity === "IMPORTANT") return true;
  if (observation.finding_type === "DUPLICATE_SOURCE_LINEAGE") return observation.business_impact !== "NONE";
  if (observation.finding_type === "STALE_CANONICAL_OBJECT" || observation.finding_type === "STALE_DERIVED_SUMMARY") {
    return observation.business_impact !== "NONE";
  }
  return true;
}

function findingFromObservation(observation: KnowledgeIntegrityObservationV1): KnowledgeIntegrityFindingV1 {
  const severity = severityFor(observation);
  const fingerprint = observationFingerprint(observation);
  return deepFreeze({
    contract_version: KNOWLEDGE_INTEGRITY_CONTRACT_VERSION,
    finding_id: `integrity:${fnv1a(fingerprint)}`,
    finding_type: observation.finding_type,
    severity,
    affected_canonical_ids: observation.affected_canonical_ids,
    evidence_refs: observation.evidence_refs,
    source_lineage_refs: observation.source_lineage_refs,
    truth_state: observation.truth_state,
    freshness_state: observation.freshness_state,
    business_impact: observation.business_impact,
    time_state: observation.time_state,
    direct_evidence: observation.direct_evidence,
    reason_code: REASON_CODES[observation.finding_type],
    recommended_next_step: NEXT_STEPS[observation.finding_type],
    review_required: reviewRequired(observation, severity),
    first_seen: observation.first_seen,
    observed_at: observation.observed_at
  });
}

function priorityTuple(finding: KnowledgeIntegrityFindingV1): readonly [number, number, number, number, number] {
  return [
    WRONG_CONCLUSION_RISK[finding.finding_type],
    impactRank(finding.business_impact),
    TRUTH_PROVENANCE_BREAKAGE.has(finding.finding_type) ? 1 : 0,
    timeRank(finding.time_state),
    Date.parse(finding.observed_at)
  ];
}

function compareFindings(a: KnowledgeIntegrityFindingV1, b: KnowledgeIntegrityFindingV1): number {
  const aTuple = priorityTuple(a);
  const bTuple = priorityTuple(b);
  for (let index = 0; index < aTuple.length; index += 1) {
    if (aTuple[index] !== bTuple[index]) return bTuple[index] - aTuple[index];
  }
  return a.finding_id.localeCompare(b.finding_id);
}

function deduplicate(observations: readonly KnowledgeIntegrityObservationV1[]): readonly KnowledgeIntegrityObservationV1[] {
  const ordered = [...observations].sort((a, b) => {
    const fingerprintOrder = observationFingerprint(a).localeCompare(observationFingerprint(b));
    if (fingerprintOrder !== 0) return fingerprintOrder;
    const priority = compareFindings(findingFromObservation(a), findingFromObservation(b));
    if (priority !== 0) return priority;
    return a.observation_id.localeCompare(b.observation_id);
  });

  const selected = new Map<string, KnowledgeIntegrityObservationV1>();
  for (const observation of ordered) {
    const fingerprint = observationFingerprint(observation);
    if (!selected.has(fingerprint)) selected.set(fingerprint, observation);
  }
  return Object.freeze([...selected.values()]);
}

export function evaluateKnowledgeIntegrityV1(input: KnowledgeIntegrityEvaluationInputV1): readonly KnowledgeIntegrityFindingV1[] {
  if (!isRecord(input)) fail("INPUT_INVALID");
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) fail("RAW_OR_SECRET_FIELD_FORBIDDEN");
    if (!INPUT_KEYS.has(key)) fail(`UNSUPPORTED_FIELD_${key.toUpperCase()}`);
  }
  if (!Array.isArray(input.observations)) fail("OBSERVATIONS_INVALID");
  if (input.observations.length > KNOWLEDGE_INTEGRITY_LIMITS.maxObservations) fail("OBSERVATIONS_TOO_MANY");

  const observations = input.observations.map(canonicalObservation);
  const findings = deduplicate(observations).map(findingFromObservation).sort(compareFindings);
  return deepFreeze(findings);
}
