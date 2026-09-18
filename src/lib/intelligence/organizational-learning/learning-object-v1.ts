import { z } from "zod";

export const KNOWN = "KNOWN" as const;
export const INFERRED = "INFERRED" as const;
export const UNKNOWN = "UNKNOWN" as const;
export const STALE = "STALE" as const;
export const CONFLICTED = "CONFLICTED" as const;

export const LEARNING_OBJECT_CONTRACT_VERSION = "LEARNING_OBJECT_V1" as const;
export const MAX_LEARNING_TEXT_BYTES = 50_000;
export const MAX_LEARNING_ARRAY_ITEMS = 100;

export const learningTruthStates = [KNOWN, INFERRED, UNKNOWN, STALE, CONFLICTED] as const;
export const learningKinds = [
  "FACT_CORRECTION",
  "STRATEGIC_DECISION",
  "PREFERENCE_POLICY",
  "TECHNIQUE_SKILL",
  "VALIDATED_LESSON"
] as const;
export const learningLifecycleStates = ["CANDIDATE", "APPROVED", "CANONICAL", "SUPERSEDED"] as const;

export type LearningTruthState = (typeof learningTruthStates)[number];
export type LearningKind = (typeof learningKinds)[number];
export type LearningLifecycleState = (typeof learningLifecycleStates)[number];
export type LearningScope = "COMPANY" | "TEAM" | "INDIVIDUAL";

export interface LearningEvidenceV1 {
  evidence_id: string;
  source_lineage_id: string;
  observed_at: string;
}

export interface LearningApprovalV1 {
  reviewer_id: string;
  reviewed_at: string;
  decision: "APPROVE";
}

export interface LearningSupersessionV1 {
  predecessor_id: string;
  successor_id?: string;
  reason: string;
  superseded_at: string;
}

export interface LearningObjectV1 {
  contract_version: typeof LEARNING_OBJECT_CONTRACT_VERSION;
  learning_id: string;
  version: number;
  kind: LearningKind;
  lifecycle_state: LearningLifecycleState;
  truth_state: LearningTruthState;
  scope: LearningScope;
  title: string;
  content: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  evidence: readonly LearningEvidenceV1[];
  approval: LearningApprovalV1 | null;
  supersession: LearningSupersessionV1 | null;
}

const nonEmpty = z.string().trim().min(1);
const isoTimestamp = z.string().datetime({ offset: true });

export const LearningEvidenceV1Schema = z.object({
  evidence_id: nonEmpty,
  source_lineage_id: nonEmpty,
  observed_at: isoTimestamp
}).strict();

export const LearningApprovalV1Schema = z.object({
  reviewer_id: nonEmpty,
  reviewed_at: isoTimestamp,
  decision: z.literal("APPROVE")
}).strict();

export const LearningSupersessionV1Schema = z.object({
  predecessor_id: nonEmpty,
  successor_id: nonEmpty.optional(),
  reason: nonEmpty,
  superseded_at: isoTimestamp
}).strict();

export const LearningObjectV1Schema = z.object({
  contract_version: z.literal(LEARNING_OBJECT_CONTRACT_VERSION),
  learning_id: nonEmpty,
  version: z.number().int().positive(),
  kind: z.enum(learningKinds),
  lifecycle_state: z.enum(learningLifecycleStates),
  truth_state: z.enum(learningTruthStates),
  scope: z.enum(["COMPANY", "TEAM", "INDIVIDUAL"]),
  title: nonEmpty,
  content: nonEmpty,
  confidence: z.number().finite().min(0).max(1),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  evidence: z.array(LearningEvidenceV1Schema).max(MAX_LEARNING_ARRAY_ITEMS),
  approval: LearningApprovalV1Schema.nullable(),
  supersession: LearningSupersessionV1Schema.nullable()
}).strict();

function assertBoundedText(label: string, value: string): void {
  if (Buffer.byteLength(value, "utf8") > MAX_LEARNING_TEXT_BYTES) {
    throw new Error(`${label}_TOO_LARGE`);
  }
}

function assertTimestampOrder(earlier: string, later: string, reason: string): void {
  if (Date.parse(later) < Date.parse(earlier)) throw new Error(reason);
}

function freezeLearningObject(value: LearningObjectV1): Readonly<LearningObjectV1> {
  const evidence = value.evidence
    .map((item) => Object.freeze({ ...item }))
    .sort((a, b) =>
      `${a.observed_at}:${a.source_lineage_id}:${a.evidence_id}`.localeCompare(
        `${b.observed_at}:${b.source_lineage_id}:${b.evidence_id}`
      )
    );
  return Object.freeze({
    ...value,
    evidence: Object.freeze(evidence),
    approval: value.approval ? Object.freeze({ ...value.approval }) : null,
    supersession: value.supersession ? Object.freeze({ ...value.supersession }) : null
  });
}

export function validateLearningObjectV1(input: unknown): Readonly<LearningObjectV1> {
  const parsed = LearningObjectV1Schema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_LEARNING_OBJECT");
  const value = parsed.data;
  assertBoundedText("TITLE", value.title);
  assertBoundedText("CONTENT", value.content);
  assertTimestampOrder(value.created_at, value.updated_at, "NON_MONOTONIC_TIMESTAMP");

  if (value.truth_state === INFERRED && value.lifecycle_state === "CANONICAL" && value.evidence.length === 0) {
    throw new Error("INFERENCE_REQUIRES_EVIDENCE");
  }
  if (value.lifecycle_state === "CANONICAL" && value.approval === null) {
    throw new Error("CANONICAL_REQUIRES_APPROVAL");
  }
  if (value.lifecycle_state === "SUPERSEDED") {
    if (!value.supersession) throw new Error("SUPERSESSION_REQUIRED");
    if (value.supersession.successor_id === value.learning_id) throw new Error("SELF_SUPERSESSION");
    assertTimestampOrder(value.created_at, value.supersession.superseded_at, "NON_MONOTONIC_SUPERSESSION");
  } else if (value.supersession !== null) {
    throw new Error("UNEXPECTED_SUPERSESSION");
  }
  return freezeLearningObject(value);
}

export interface LearningCandidateInputV1 {
  learning_id: string;
  kind: LearningKind;
  truth_state: LearningTruthState;
  scope: LearningScope;
  title: string;
  content: string;
  confidence: number;
  observed_at: string;
  evidence?: readonly LearningEvidenceV1[];
}

export function createLearningCandidateV1(input: LearningCandidateInputV1): Readonly<LearningObjectV1> {
  return validateLearningObjectV1({
    contract_version: LEARNING_OBJECT_CONTRACT_VERSION,
    learning_id: input.learning_id,
    version: 1,
    kind: input.kind,
    lifecycle_state: "CANDIDATE",
    truth_state: input.truth_state,
    scope: input.scope,
    title: input.title,
    content: input.content,
    confidence: input.confidence,
    created_at: input.observed_at,
    updated_at: input.observed_at,
    evidence: input.evidence ?? [],
    approval: null,
    supersession: null
  });
}

export function approveLearningCandidateV1(
  candidate: LearningObjectV1,
  approval: LearningApprovalV1
): Readonly<LearningObjectV1> {
  const current = validateLearningObjectV1(candidate);
  if (current.lifecycle_state !== "CANDIDATE") throw new Error("INVALID_APPROVAL_TRANSITION");
  assertTimestampOrder(current.updated_at, approval.reviewed_at, "NON_MONOTONIC_TIMESTAMP");
  return validateLearningObjectV1({
    ...current,
    lifecycle_state: "APPROVED",
    approval,
    updated_at: approval.reviewed_at
  });
}

export function promoteLearningToCanonicalV1(
  approved: LearningObjectV1,
  promoted_at: string
): Readonly<LearningObjectV1> {
  const current = validateLearningObjectV1(approved);
  if (current.lifecycle_state !== "APPROVED" || current.approval === null) {
    throw new Error("CANONICAL_REQUIRES_APPROVED_CANDIDATE");
  }
  if (current.truth_state === INFERRED && current.evidence.length === 0) {
    throw new Error("INFERENCE_REQUIRES_EVIDENCE");
  }
  assertTimestampOrder(current.updated_at, promoted_at, "NON_MONOTONIC_TIMESTAMP");
  return validateLearningObjectV1({
    ...current,
    lifecycle_state: "CANONICAL",
    version: current.version + 1,
    updated_at: promoted_at
  });
}

export function supersedeLearningV1(
  predecessor: LearningObjectV1,
  successor_id: string,
  reason: string,
  superseded_at: string,
  known_chain: readonly string[] = []
): Readonly<LearningObjectV1> {
  const current = validateLearningObjectV1(predecessor);
  if (current.lifecycle_state !== "CANONICAL") throw new Error("INVALID_SUPERSESSION_TRANSITION");
  if (!successor_id.trim() || successor_id === current.learning_id) throw new Error("SELF_SUPERSESSION");
  if (known_chain.includes(successor_id) || new Set(known_chain).size !== known_chain.length) {
    throw new Error("CIRCULAR_SUPERSESSION");
  }
  assertTimestampOrder(current.updated_at, superseded_at, "NON_MONOTONIC_TIMESTAMP");
  return validateLearningObjectV1({
    ...current,
    lifecycle_state: "SUPERSEDED",
    version: current.version + 1,
    updated_at: superseded_at,
    supersession: {
      predecessor_id: current.learning_id,
      successor_id: successor_id.trim(),
      reason,
      superseded_at
    }
  });
}

export function createFactCorrectionCandidateV1(input: Omit<LearningCandidateInputV1, "kind">) {
  return createLearningCandidateV1({ ...input, kind: "FACT_CORRECTION" });
}

export function createPreferencePolicyCandidateV1(input: Omit<LearningCandidateInputV1, "kind">) {
  return createLearningCandidateV1({ ...input, kind: "PREFERENCE_POLICY" });
}

export function createTechniqueSkillCandidateV1(input: Omit<LearningCandidateInputV1, "kind">) {
  return createLearningCandidateV1({ ...input, kind: "TECHNIQUE_SKILL" });
}

export function createValidatedLessonCandidateV1(input: Omit<LearningCandidateInputV1, "kind">) {
  return createLearningCandidateV1({ ...input, kind: "VALIDATED_LESSON" });
}
