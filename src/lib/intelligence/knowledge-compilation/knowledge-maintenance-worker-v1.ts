import type {
  KnowledgeIntegrityFindingV1,
  KnowledgeIntegrityTruthState
} from "./knowledge-integrity-v1";
import type { UnresolvedReferenceV1 } from "./unresolved-reference-v1";
import {
  validateLearningObjectV1,
  type LearningObjectV1,
  type LearningTruthState
} from "../organizational-learning/learning-object-v1";

export const KNOWLEDGE_MAINTENANCE_CONTRACT_VERSION = "KNOWLEDGE_MAINTENANCE_V1" as const;
export const KNOWLEDGE_MAINTENANCE_CURSOR_VERSION = "KNOWLEDGE_MAINTENANCE_CURSOR_V1" as const;

export const KNOWLEDGE_MAINTENANCE_LIMITS = Object.freeze({
  maxSourceItems: 256,
  maxChanges: 128,
  maxFindings: 128,
  maxReferences: 128,
  maxLearningObjects: 128,
  maxReviewCandidates: 128,
  maxIdentifierLength: 256,
  maxEvidenceRefs: 16
});

export type KnowledgeMaintenanceCadence = "DAILY_DELTA" | "WEEKLY_SYNTHESIS" | "MONTHLY_REVIEW";
export type KnowledgeMaintenanceStatus = "WORK_READY" | "NO_MATERIAL_CHANGE" | "BREAKER_TRIPPED";
export type KnowledgeMaintenanceBreakerReason = "SOURCE_WINDOW_TOO_LARGE" | "INCOMPLETE_SOURCE_WINDOW" | "SOURCE_WINDOW_MISMATCH";
export type KnowledgeMaintenanceTruthState = KnowledgeIntegrityTruthState | LearningTruthState;
export type KnowledgeMaintenanceFreshnessState = "FRESH" | "STALE" | "UNKNOWN";
export type KnowledgeMaintenanceChangeKind = "CANONICAL_CHANGE" | "DERIVED_CHANGE" | "LEARNING_CHANGE" | "REFERENCE_CHANGE";
export type KnowledgeMaintenanceReviewSource = "INTEGRITY_FINDING" | "UNRESOLVED_REFERENCE" | "LEARNING_OBJECT";

export type KnowledgeMaintenanceChangeV1 = Readonly<{
  change_id: string;
  object_id: string;
  kind: KnowledgeMaintenanceChangeKind;
  truth_state: KnowledgeMaintenanceTruthState;
  freshness_state: KnowledgeMaintenanceFreshnessState;
  material: boolean;
  updated_at: string;
  evidence_refs: readonly string[];
}>;

export type KnowledgeMaintenanceSourceWindowV1 = Readonly<{
  snapshot_fingerprint: string;
  total_candidates: number;
  supplied_candidates: number;
  complete: boolean;
}>;

export type KnowledgeMaintenanceCursorV1 = Readonly<{
  contract_version: typeof KNOWLEDGE_MAINTENANCE_CURSOR_VERSION;
  cadence: KnowledgeMaintenanceCadence;
  sequence: number;
  snapshot_fingerprint: string;
  last_processed_updated_at: string;
  generated_at: string;
  cursor_fingerprint: string;
}>;

export type KnowledgeMaintenanceReviewCandidateV1 = Readonly<{
  candidate_id: string;
  source_type: KnowledgeMaintenanceReviewSource;
  source_ref: string;
  truth_state: KnowledgeMaintenanceTruthState;
  reason_code: string;
  review_required: boolean;
  observed_at: string;
  evidence_refs: readonly string[];
}>;

export type KnowledgeMaintenanceInputV1 = Readonly<{
  cadence: KnowledgeMaintenanceCadence;
  now: string;
  source_window: KnowledgeMaintenanceSourceWindowV1;
  previous_cursor?: KnowledgeMaintenanceCursorV1 | null;
  changes: readonly KnowledgeMaintenanceChangeV1[];
  integrity_findings: readonly KnowledgeIntegrityFindingV1[];
  unresolved_references: readonly UnresolvedReferenceV1[];
  learning_objects: readonly LearningObjectV1[];
}>;

export type KnowledgeMaintenancePlanV1 = Readonly<{
  contract_version: typeof KNOWLEDGE_MAINTENANCE_CONTRACT_VERSION;
  cadence: KnowledgeMaintenanceCadence;
  status: KnowledgeMaintenanceStatus;
  breaker_reason: KnowledgeMaintenanceBreakerReason | null;
  source_snapshot_fingerprint: string;
  cursor: KnowledgeMaintenanceCursorV1 | null;
  material_change_refs: readonly string[];
  integrity_finding_refs: readonly string[];
  unresolved_conflict_refs: readonly string[];
  review_candidates: readonly KnowledgeMaintenanceReviewCandidateV1[];
  no_material_change_reason: "NO_MATERIAL_CHANGE" | null;
}>;

const CADENCES = new Set<KnowledgeMaintenanceCadence>(["DAILY_DELTA", "WEEKLY_SYNTHESIS", "MONTHLY_REVIEW"]);
const CHANGE_KINDS = new Set<KnowledgeMaintenanceChangeKind>([
  "CANONICAL_CHANGE",
  "DERIVED_CHANGE",
  "LEARNING_CHANGE",
  "REFERENCE_CHANGE"
]);
const TRUTH_STATES = new Set<KnowledgeMaintenanceTruthState>(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]);
const FRESHNESS_STATES = new Set<KnowledgeMaintenanceFreshnessState>(["FRESH", "STALE", "UNKNOWN"]);

function fail(code: string): never {
  throw new Error(`KNOWLEDGE_MAINTENANCE_V1_${code}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, field: string): string {
  if (typeof value !== "string") fail(`${field.toUpperCase()}_REQUIRED`);
  const normalized = value.trim();
  if (!normalized) fail(`${field.toUpperCase()}_REQUIRED`);
  if (normalized.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxIdentifierLength) fail(`${field.toUpperCase()}_TOO_LONG`);
  return normalized;
}

function isoTimestamp(value: unknown, field: string): string {
  const text = boundedString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) {
    fail(`${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(`${field.toUpperCase()}_INVALID`);
  return value;
}

function boundedRefs(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${field.toUpperCase()}_INVALID`);
  if (value.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxEvidenceRefs) fail(`${field.toUpperCase()}_TOO_MANY`);
  const refs = value.map((entry) => boundedString(entry, field));
  if (new Set(refs).size !== refs.length) fail(`${field.toUpperCase()}_DUPLICATE`);
  return Object.freeze([...refs].sort((a, b) => a.localeCompare(b)));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function cursorFingerprint(cursor: Omit<KnowledgeMaintenanceCursorV1, "cursor_fingerprint" | "contract_version">): string {
  return `fnv1a:${fnv1a(JSON.stringify(cursor))}`;
}

function validateCursor(value: KnowledgeMaintenanceCursorV1, cadence: KnowledgeMaintenanceCadence): KnowledgeMaintenanceCursorV1 {
  if (!isRecord(value)) fail("CURSOR_INVALID");
  if (value.contract_version !== KNOWLEDGE_MAINTENANCE_CURSOR_VERSION) fail("CURSOR_CONTRACT_INVALID");
  if (value.cadence !== cadence) fail("CURSOR_CADENCE_MISMATCH");
  if (!Number.isInteger(value.sequence) || value.sequence < 1) fail("CURSOR_SEQUENCE_INVALID");
  const snapshot = boundedString(value.snapshot_fingerprint, "cursor_snapshot_fingerprint");
  const lastProcessed = isoTimestamp(value.last_processed_updated_at, "cursor_last_processed_updated_at");
  const generatedAt = isoTimestamp(value.generated_at, "cursor_generated_at");
  const suppliedFingerprint = boundedString(value.cursor_fingerprint, "cursor_fingerprint");
  const expected = cursorFingerprint({
    cadence: value.cadence,
    sequence: value.sequence,
    snapshot_fingerprint: snapshot,
    last_processed_updated_at: lastProcessed,
    generated_at: generatedAt
  });
  if (suppliedFingerprint !== expected) fail("CURSOR_FINGERPRINT_INVALID");
  return deepFreeze({ ...value });
}

function canonicalChange(value: unknown): KnowledgeMaintenanceChangeV1 {
  if (!isRecord(value)) fail("CHANGE_INVALID");
  const changeId = boundedString(value.change_id, "change_id");
  const objectId = boundedString(value.object_id, "object_id");
  if (typeof value.kind !== "string" || !CHANGE_KINDS.has(value.kind as KnowledgeMaintenanceChangeKind)) fail("CHANGE_KIND_INVALID");
  if (typeof value.truth_state !== "string" || !TRUTH_STATES.has(value.truth_state as KnowledgeMaintenanceTruthState)) fail("CHANGE_TRUTH_STATE_INVALID");
  if (typeof value.freshness_state !== "string" || !FRESHNESS_STATES.has(value.freshness_state as KnowledgeMaintenanceFreshnessState)) fail("CHANGE_FRESHNESS_STATE_INVALID");
  if (typeof value.material !== "boolean") fail("CHANGE_MATERIAL_REQUIRED");
  return deepFreeze({
    change_id: changeId,
    object_id: objectId,
    kind: value.kind as KnowledgeMaintenanceChangeKind,
    truth_state: value.truth_state as KnowledgeMaintenanceTruthState,
    freshness_state: value.freshness_state as KnowledgeMaintenanceFreshnessState,
    material: value.material,
    updated_at: isoTimestamp(value.updated_at, "change_updated_at"),
    evidence_refs: boundedRefs(value.evidence_refs, "change_evidence_refs")
  });
}

function validateFinding(value: KnowledgeIntegrityFindingV1): KnowledgeIntegrityFindingV1 {
  if (!isRecord(value) || value.contract_version !== "KNOWLEDGE_INTEGRITY_V1") fail("INTEGRITY_FINDING_INVALID");
  boundedString(value.finding_id, "finding_id");
  isoTimestamp(value.observed_at, "finding_observed_at");
  if (!TRUTH_STATES.has(value.truth_state)) fail("FINDING_TRUTH_STATE_INVALID");
  return value;
}

function validateReference(value: UnresolvedReferenceV1): UnresolvedReferenceV1 {
  if (!isRecord(value) || value.contract_version !== "UNRESOLVED_REFERENCE_V1") fail("UNRESOLVED_REFERENCE_INVALID");
  boundedString(value.reference_id, "reference_id");
  isoTimestamp(value.created_at, "reference_created_at");
  if (!TRUTH_STATES.has(value.truth_state)) fail("REFERENCE_TRUTH_STATE_INVALID");
  return value;
}

function referenceObservedAt(reference: UnresolvedReferenceV1): string {
  return reference.observed_at ?? reference.effective_at ?? reference.created_at;
}

function integrityNeedsReview(finding: KnowledgeIntegrityFindingV1, cadence: KnowledgeMaintenanceCadence): boolean {
  if (finding.truth_state === "CONFLICTED") return true;
  if (finding.severity === "BLOCKING" || finding.severity === "IMPORTANT") return true;
  if (cadence === "DAILY_DELTA") return finding.review_required;
  if (cadence === "WEEKLY_SYNTHESIS") return finding.review_required || finding.freshness_state === "STALE";
  return finding.severity !== "INFO" || finding.review_required || finding.freshness_state !== "FRESH";
}

function referenceNeedsReview(reference: UnresolvedReferenceV1, cadence: KnowledgeMaintenanceCadence): boolean {
  if (reference.truth_state === "CONFLICTED") return true;
  if (reference.status === "REVIEW_REQUIRED" || reference.status === "CANDIDATES_FOUND") return true;
  if (cadence === "DAILY_DELTA") return false;
  if (reference.status === "UNRESOLVED" || reference.status === "STALE") return true;
  return cadence === "MONTHLY_REVIEW" && reference.truth_state !== "KNOWN" && reference.status !== "RESOLVED" && reference.status !== "REJECTED";
}

function learningNeedsReview(learning: LearningObjectV1, cadence: KnowledgeMaintenanceCadence): boolean {
  if (learning.truth_state === "CONFLICTED") return true;
  if (learning.lifecycle_state === "CANDIDATE" || learning.lifecycle_state === "APPROVED") return true;
  if (cadence === "DAILY_DELTA") return false;
  if (learning.truth_state === "STALE") return true;
  return cadence === "MONTHLY_REVIEW" && learning.truth_state === "UNKNOWN";
}

function reviewCandidateFromFinding(finding: KnowledgeIntegrityFindingV1): KnowledgeMaintenanceReviewCandidateV1 {
  return deepFreeze({
    candidate_id: `review:integrity:${finding.finding_id}`,
    source_type: "INTEGRITY_FINDING",
    source_ref: finding.finding_id,
    truth_state: finding.truth_state,
    reason_code: finding.reason_code,
    review_required: finding.review_required || finding.truth_state === "CONFLICTED",
    observed_at: finding.observed_at,
    evidence_refs: Object.freeze([...finding.evidence_refs].sort((a, b) => a.localeCompare(b)))
  });
}

function reviewCandidateFromReference(reference: UnresolvedReferenceV1): KnowledgeMaintenanceReviewCandidateV1 {
  const reasonCode = reference.truth_state === "CONFLICTED"
    ? "REFERENCE_CONFLICT_REVIEW"
    : reference.status === "REVIEW_REQUIRED"
      ? "REFERENCE_REVIEW_REQUIRED"
      : reference.status === "CANDIDATES_FOUND"
        ? "REFERENCE_CANDIDATES_REVIEW"
        : reference.status === "STALE"
          ? "REFERENCE_STALE"
          : "REFERENCE_UNRESOLVED";
  return deepFreeze({
    candidate_id: `review:reference:${reference.reference_id}`,
    source_type: "UNRESOLVED_REFERENCE",
    source_ref: reference.reference_id,
    truth_state: reference.truth_state,
    reason_code: reasonCode,
    review_required: true,
    observed_at: referenceObservedAt(reference),
    evidence_refs: Object.freeze([...reference.provenance_refs].sort((a, b) => a.localeCompare(b)))
  });
}

function reviewCandidateFromLearning(learning: LearningObjectV1): KnowledgeMaintenanceReviewCandidateV1 {
  const reasonCode = learning.truth_state === "CONFLICTED"
    ? "LEARNING_CONFLICT_REVIEW"
    : learning.truth_state === "STALE"
      ? "LEARNING_STALE_REVIEW"
      : learning.truth_state === "UNKNOWN"
        ? "LEARNING_UNKNOWN_REVIEW"
        : learning.lifecycle_state === "APPROVED"
          ? "LEARNING_APPROVED_AWAITING_PROMOTION"
          : "LEARNING_CANDIDATE_REVIEW";
  return deepFreeze({
    candidate_id: `review:learning:${learning.learning_id}:${learning.version}`,
    source_type: "LEARNING_OBJECT",
    source_ref: learning.learning_id,
    truth_state: learning.truth_state,
    reason_code: reasonCode,
    review_required: true,
    observed_at: learning.updated_at,
    evidence_refs: Object.freeze(
      [...new Set(learning.evidence.map((item) => item.evidence_id))].sort((a, b) => a.localeCompare(b))
    )
  });
}

function truthPriority(state: KnowledgeMaintenanceTruthState): number {
  if (state === "CONFLICTED") return 4;
  if (state === "UNKNOWN") return 3;
  if (state === "STALE") return 2;
  if (state === "INFERRED") return 1;
  return 0;
}

function sourcePriority(source: KnowledgeMaintenanceReviewSource): number {
  if (source === "INTEGRITY_FINDING") return 3;
  if (source === "UNRESOLVED_REFERENCE") return 2;
  return 1;
}

function compareReviewCandidates(a: KnowledgeMaintenanceReviewCandidateV1, b: KnowledgeMaintenanceReviewCandidateV1): number {
  const truth = truthPriority(b.truth_state) - truthPriority(a.truth_state);
  if (truth !== 0) return truth;
  const source = sourcePriority(b.source_type) - sourcePriority(a.source_type);
  if (source !== 0) return source;
  const observed = Date.parse(b.observed_at) - Date.parse(a.observed_at);
  if (observed !== 0) return observed;
  return a.candidate_id.localeCompare(b.candidate_id);
}

function latestTimestamp(now: string, previous: KnowledgeMaintenanceCursorV1 | null, timestamps: readonly string[]): string {
  if (timestamps.length === 0) return previous?.last_processed_updated_at ?? now;
  const candidates = previous ? [previous.last_processed_updated_at, ...timestamps] : timestamps;
  return [...candidates].sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function buildCursor(
  cadence: KnowledgeMaintenanceCadence,
  sourceWindow: KnowledgeMaintenanceSourceWindowV1,
  now: string,
  previous: KnowledgeMaintenanceCursorV1 | null,
  timestamps: readonly string[]
): KnowledgeMaintenanceCursorV1 {
  const base = {
    cadence,
    sequence: (previous?.sequence ?? 0) + 1,
    snapshot_fingerprint: sourceWindow.snapshot_fingerprint,
    last_processed_updated_at: latestTimestamp(now, previous, timestamps),
    generated_at: now
  };
  return deepFreeze({
    contract_version: KNOWLEDGE_MAINTENANCE_CURSOR_VERSION,
    ...base,
    cursor_fingerprint: cursorFingerprint(base)
  });
}

function breakerPlan(
  cadence: KnowledgeMaintenanceCadence,
  sourceWindow: KnowledgeMaintenanceSourceWindowV1,
  previous: KnowledgeMaintenanceCursorV1 | null,
  reason: KnowledgeMaintenanceBreakerReason
): KnowledgeMaintenancePlanV1 {
  return deepFreeze({
    contract_version: KNOWLEDGE_MAINTENANCE_CONTRACT_VERSION,
    cadence,
    status: "BREAKER_TRIPPED",
    breaker_reason: reason,
    source_snapshot_fingerprint: sourceWindow.snapshot_fingerprint,
    cursor: previous,
    material_change_refs: Object.freeze([]),
    integrity_finding_refs: Object.freeze([]),
    unresolved_conflict_refs: Object.freeze([]),
    review_candidates: Object.freeze([]),
    no_material_change_reason: null
  });
}

export function planKnowledgeMaintenanceV1(input: KnowledgeMaintenanceInputV1): KnowledgeMaintenancePlanV1 {
  if (!isRecord(input)) fail("INPUT_INVALID");
  if (typeof input.cadence !== "string" || !CADENCES.has(input.cadence as KnowledgeMaintenanceCadence)) fail("CADENCE_INVALID");
  const cadence = input.cadence as KnowledgeMaintenanceCadence;
  const now = isoTimestamp(input.now, "now");
  if (!isRecord(input.source_window)) fail("SOURCE_WINDOW_INVALID");
  const sourceWindow: KnowledgeMaintenanceSourceWindowV1 = deepFreeze({
    snapshot_fingerprint: boundedString(input.source_window.snapshot_fingerprint, "snapshot_fingerprint"),
    total_candidates: nonNegativeInteger(input.source_window.total_candidates, "total_candidates"),
    supplied_candidates: nonNegativeInteger(input.source_window.supplied_candidates, "supplied_candidates"),
    complete: input.source_window.complete === true
  });
  if (typeof input.source_window.complete !== "boolean") fail("SOURCE_WINDOW_COMPLETE_REQUIRED");

  const previous = input.previous_cursor ? validateCursor(input.previous_cursor, cadence) : null;
  if (!Array.isArray(input.changes) || !Array.isArray(input.integrity_findings) || !Array.isArray(input.unresolved_references) || !Array.isArray(input.learning_objects)) {
    fail("SOURCE_ARRAY_INVALID");
  }

  const suppliedCount = input.changes.length + input.integrity_findings.length + input.unresolved_references.length + input.learning_objects.length;
  if (sourceWindow.supplied_candidates !== suppliedCount) {
    return breakerPlan(cadence, sourceWindow, previous, "SOURCE_WINDOW_MISMATCH");
  }
  if (!sourceWindow.complete) {
    return breakerPlan(cadence, sourceWindow, previous, "INCOMPLETE_SOURCE_WINDOW");
  }
  if (
    sourceWindow.total_candidates > KNOWLEDGE_MAINTENANCE_LIMITS.maxSourceItems ||
    suppliedCount > KNOWLEDGE_MAINTENANCE_LIMITS.maxSourceItems ||
    input.changes.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxChanges ||
    input.integrity_findings.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxFindings ||
    input.unresolved_references.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxReferences ||
    input.learning_objects.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxLearningObjects
  ) {
    return breakerPlan(cadence, sourceWindow, previous, "SOURCE_WINDOW_TOO_LARGE");
  }

  const changes = input.changes.map(canonicalChange);
  const findings = input.integrity_findings.map(validateFinding);
  const references = input.unresolved_references.map(validateReference);
  const learningObjects = input.learning_objects.map((item) => validateLearningObjectV1(item));

  const materialChangeRefs = Object.freeze(
    changes.filter((change) => change.material).map((change) => change.change_id).sort((a, b) => a.localeCompare(b))
  );
  const integrityFindingRefs = Object.freeze(
    findings
      .filter((finding) => integrityNeedsReview(finding, cadence))
      .map((finding) => finding.finding_id)
      .sort((a, b) => a.localeCompare(b))
  );
  const unresolvedConflictRefs = Object.freeze(
    references
      .filter((reference) => reference.truth_state === "CONFLICTED" || reference.status === "REVIEW_REQUIRED")
      .map((reference) => reference.reference_id)
      .sort((a, b) => a.localeCompare(b))
  );

  const reviewCandidates = [
    ...findings.filter((finding) => integrityNeedsReview(finding, cadence)).map(reviewCandidateFromFinding),
    ...references.filter((reference) => referenceNeedsReview(reference, cadence)).map(reviewCandidateFromReference),
    ...learningObjects.filter((learning) => learningNeedsReview(learning, cadence)).map(reviewCandidateFromLearning)
  ].sort(compareReviewCandidates);

  if (reviewCandidates.length > KNOWLEDGE_MAINTENANCE_LIMITS.maxReviewCandidates) {
    return breakerPlan(cadence, sourceWindow, previous, "SOURCE_WINDOW_TOO_LARGE");
  }

  const timestamps = [
    ...changes.map((change) => change.updated_at),
    ...findings.map((finding) => finding.observed_at),
    ...references.map(referenceObservedAt),
    ...learningObjects.map((learning) => learning.updated_at)
  ];
  const cursor = buildCursor(cadence, sourceWindow, now, previous, timestamps);
  const hasWork = materialChangeRefs.length > 0 || integrityFindingRefs.length > 0 || reviewCandidates.length > 0;

  return deepFreeze({
    contract_version: KNOWLEDGE_MAINTENANCE_CONTRACT_VERSION,
    cadence,
    status: hasWork ? "WORK_READY" : "NO_MATERIAL_CHANGE",
    breaker_reason: null,
    source_snapshot_fingerprint: sourceWindow.snapshot_fingerprint,
    cursor,
    material_change_refs: materialChangeRefs,
    integrity_finding_refs: integrityFindingRefs,
    unresolved_conflict_refs: unresolvedConflictRefs,
    review_candidates: Object.freeze(reviewCandidates),
    no_material_change_reason: hasWork ? null : "NO_MATERIAL_CHANGE"
  });
}
