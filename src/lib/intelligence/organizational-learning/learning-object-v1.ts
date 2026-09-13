/**
 * Organizational Learning Object Contract v2 (BUSINESS_VALUE_V2)
 * 
 * Provides bounded lifecycle, truth, provenance, review, supersession,
 * confidence, timestamp, scope, and size rules for company brain learning.
 */

import type { z } from "zod"

/** Known truth state */
export const KNOWN = Symbol("KNOWN") as const
/** Inferred but not yet verified */
export const INFERRED = Symbol("INFERRED") as const
/** Unknown or insufficient information */
export const UNKNOWN = Symbol("UNKNOWN") as const
/** Stale or outdated */
export const STALE = Symbol("STALE") as const
/** Conflicted or inconsistent */
export const CONFLICTED = Symbol("CONFLICTED") as const

/** Evidence requirement for inference */
export interface InferenceEvidence {
  /** Type of evidence source */
  type: "document" | "observation" | "experiment" | "review"
  /** Source identifier */
  source: string
  /** Optional credibility score 0-1 */
  credibility?: number
}

/** Provenance metadata for canonical promotion */
export interface ReviewerProvenance {
  /** Reviewer identity or reference */
  reviewer: string
  /** Evidence backing the decision */
  evidence: InferenceEvidence | null
  /** Timestamp of review */
  reviewedAt: Date
}

/** Bounded lifecycle state */
export enum LifecycleState {
  CANDIDATE = "CANDIDATE",      // Not yet canonical
  APPROVED = "APPROVED",        // Reviewer-approved, can be canonical
  CANONICAL = "CANONICAL",      // Promoted to company truth
  SUPERSEDED = "SUPERSEDED",    // Replaced by newer version
}

/** Learning object kind */
export enum Kind {
  FACT_CORRECTION = "FACT_CORRECTION",
  STRATEGIC_DECISION = "STRATEGIC_DECISION",
  PREFERENCE_POLICY = "PREFERENCE_POLICY",
  TECHNIQUE_SKILL = "TECHNIQUE_SKILL",
  LESSON_CANONICAL = "LESSON_CANONICAL",
}

/** Valid confidence range */
export const MIN_CONFIDENCE = 0.0 as const
export const MAX_CONFIDENCE = 1.0 as const

/** Maximum allowed text size for learning objects */
export const MAX_TEXT_SIZE_BYTES = 50_000

/** Maximum array items for structured fields */
export const MAX_ARRAY_ITEMS = 1000

/** Learning object interface */
export interface LearningObject {
  /** Unique identifier */
  id: string
  /** Version (semver-like) */
  version: string
  /** Kind of learning */
  kind: Kind
  /** Current lifecycle state */
  state: LifecycleState
  /** Truth state (KNOWN/INFERRED/UNKNOWN/STALE/CONFLICTED) */
  truthState?: typeof KNOWN | typeof INFERRED | typeof UNKNOWN | typeof STALE | typeof CONFLICTED
  /** Content or description */
  content: string | Record<string, unknown>
  /** Metadata/context */
  metadata?: Record<string, unknown>
  /** Created timestamp */
  createdAt: Date
  /** Last modified timestamp (must be monotonic) */
  updatedAt: Date
  /** Scope/audience */
  scope?: "company" | "team" | "individual"
}

/** Zod schema for validation */
export const LearningObjectSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^\d+(\.\d+)?/),
  kind: z.enum(["FACT_CORRECTION", "STRATEGIC_DECISION", "PREFERENCE_POLICY", "TECHNIQUE_SKILL", "LESSON_CANONICAL"]),
  state: z.enum(["CANDIDATE", "APPROVED", "CANONICAL", "SUPERSEDED"]),
  truthState: z.enum(["KNOWN", "INFERRED", "UNKNOWN", "STALE", "CONFLICTED"]).optional(),
  content: z.union([z.string(), z.record(z.unknown())]),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
  scope: z.enum(["company", "team", "individual"]).optional(),
})

/** Validates a LearningObject, fails closed on invalid state */
export function validateLearningObject(obj: unknown): asserts obj is LearningObject {
  const result = LearningObjectSchema.safeParse(obj)
  if (!result.success) {
    throw new Error(`Invalid learning object: ${result.error.message}`)
  }
}

/** Validates lifecycle progression (no backflow) */
export function validateLifecycleTransition(currentState: LifecycleState, nextState: LifecycleState): asserts nextState is LifecycleState {
  const transitions: Record<LifecycleState, LifecycleState[]> = {
    CANDIDATE: ["APPROVED", "CANONICAL"],
    APPROVED: ["CANONICAL", "SUPERSEDED"],
    CANONICAL: ["SUPERSEDED"],
    SUPERSEDED: [], // No forward transitions
  }

  const allowed = transitions[currentState]
  if (!allowed.includes(nextState)) {
    throw new Error(
      `Invalid lifecycle transition from ${currentState} to ${nextState}. ` +
      `Allowed: [${allowed.join(", ")}]`
    )
  }
}

/** Validates monotonic timestamp requirement */
export function validateTimestampMonotonic(currentUpdated: Date, previousUpdated?: Date): asserts void {
  if (previousUpdated && currentUpdated <= previousUpdated) {
    throw new Error("Timestamps must be monotonically increasing")
  }
}

/** Validates confidence is in valid range */
export function validateConfidence(confidence: number): asserts confidence is number {
  if (confidence < MIN_CONFIDENCE || confidence > MAX_CONFIDENCE) {
    throw new Error(`Confidence must be between ${MIN_CONFIDENCE} and ${MAX_CONFIENCE}`)
  }
}

/** Validates text size limit */
export function validateTextSize(text: string): asserts void {
  const byteLength = Buffer.byteLength(text, "utf8")
  if (byteLength > MAX_TEXT_SIZE_BYTES) {
    throw new Error(`Content exceeds maximum size of ${MAX_TEXT_SIZE_BYTES} bytes`)
  }
}

/** Validates array size limit */
export function validateArraySize(items: unknown[]): asserts void {
  if (items.length > MAX_ARRAY_ITEMS) {
    throw new Error(`Arrays cannot exceed ${MAX_ARRAY_ITEMS} items`)
  }
}

/** Creates a new learning object from candidate data */
export function createLearningObject(
  id: string,
  kind: Kind,
  content: string | Record<string, unknown>,
  metadata?: Record<string, unknown>
): LearningObject {
  const now = new Date()
  return {
    id,
    version: "0.1",
    kind,
    state: LifecycleState.CANDIDATE,
    content,
    metadata,
    createdAt: now,
    updatedAt: now,
  }
}

/** Approves a candidate learning object (CANDIDATE -> APPROVED) */
export function approveLearningObject(learningObject: LearningObject): LearningObject {
  const approved = { ...learningObject, state: LifecycleState.APPROVED } as LearningObject
  approved.updatedAt = new Date()
  return approved
}

/** Promotes an approved object to canonical (requires provenance) */
export function promoteToCanonical(learningObject: LearningObject, provenance: ReviewerProvenance): LearningObject {
  const promoted = { ...learningObject, state: LifecycleState.CANONICAL } as LearningObject
  promoted.updatedAt = new Date()
  return promoted
}

/** Supersedes a learning object (preserves predecessor) */
export function supersedeLearningObject(learningObject: LearningObject): LearningObject {
  const superseded = { ...learningObject, state: LifecycleState.SUPERSEDED } as LearningObject
  superseded.updatedAt = new Date()
  return superseded
}

/** Creates fact correction kind */
export function createFactCorrection(
  originalFact: string,
  correctedFact: string,
  evidence: InferenceEvidence
): LearningObject {
  const content = {
    original: originalFact,
    corrected: correctedFact,
    evidenceType: evidence.type,
    source: evidence.source,
  }

  return createLearningObject(`fact-correction-${Date.now()}`, Kind.FACT_CORRECTION, content)
}

/** Creates strategic decision kind */
export function createStrategicDecision(
  decision: string,
  rationale: string,
  evidence: InferenceEvidence
): LearningObject {
  const content = {
    decision,
    rationale,
    evidenceType: evidence.type,
    source: evidence.source,
  }

  return createLearningObject(`decision-${Date.now()}`, Kind.STRATEGIC_DECISION, content)
}

/** Creates preference policy candidate */
export function createPreferencePolicy(
  preference: string,
  context: string,
  frequencyCount?: number
): LearningObject {
  const content = {
    preference,
    context,
    frequencyCount: frequencyCount ?? 1,
  }

  return createLearningObject(`policy-candidate-${Date.now()}`, Kind.PREFERENCE_POLICY, content)
}

/** Creates technique skill */
export function createTechniqueSkill(
  techniqueName: string,
  description: string,
  prerequisites?: string[]
): LearningObject {
  const content = {
    techniqueName,
    description,
    prerequisites: prerequisites ?? [],
  }

  return createLearningObject(`skill-${Date.now()}`, Kind.TECHNIQUE_SKILL, content)
}

/** Creates validated lesson */
export function createLesson(
  topic: string,
  materials: Record<string, unknown>[],
  validationEvidence: InferenceEvidence
): LearningObject {
  const content = {
    topic,
    materials,
    validatedBy: validationEvidence.source,
  }

  return createLearningObject(`lesson-${Date.now()}`, Kind.LESSON_CANONICAL, content)
}

/** Validation suite for all rejections */
export class LearningObjectValidator {
  /** Validates and fails on unsupported kinds */
  validateKind(kind: string): asserts kind is Kind {
    const supportedKinds = Object.values(Kind)
    if (!supportedKinds.includes(kind as Kind)) {
      throw new Error(`Unsupported kind: ${kind}. Supported: [${supportedKinds.join(", ")}]`)
    }
  }

  /** Validates unsupported lifecycle states */
  validateState(state: string): asserts state is LifecycleState {
    const validStates = Object.values(LifecycleState)
    if (!validStates.includes(state as LifecycleState)) {
      throw new Error(`Unsupported state: ${state}. Valid: [${validStates.join(", ")}]`)
    }
  }

  /** Fails on inference without evidence */
  validateEvidence(evidence: unknown): asserts evidence is InferenceEvidence | null {
    if (evidence === null) return
    const inferred = evidence as InferenceEvidence
    if (!inferred.type || !inferred.source) {
      throw new Error("Inference requires valid type and source")
    }
  }

  /** Fails on canonical state without approval/provenance */
  validateCanonicalPromotion(obj: LearningObject, hasProvenance: boolean): asserts void {
    if (obj.state === LifecycleState.CANONICAL && !hasProvenance) {
      throw new Error("Cannot promote to CANONICAL without provenance")
    }
  }

  /** Fails on invalid supersession */
  validateSupersession(predecessorId: string | null, successorId: string): asserts void {
    if (predecessorId === successorId) {
      throw new Error("Cannot supersede with same id")
    }
  }

  /** Fails on circular/self-supersession */
  validateNoCircularSupersession(supersessionChain: Array<{ id: string }>): asserts void {
    const ids = supersessionChain.map((c) => c.id)
    if (ids.includes(ids[0])) {
      throw new Error("Circular or self-supersession detected")
    }
  }

  /** Fails on non-monotonic timestamps */
  validateMonotonicTimestamps(obj: LearningObject, previousObj?: LearningObject): asserts void {
    validateTimestampMonotonic(obj.updatedAt, previousObj?.updatedAt)
  }

  /** Fails on invalid confidence values */
  validateConfidenceValue(confidence: number): asserts void {
    validateConfidence(confidence)
  }
}

/** Default validator instance */
export const learningObjectValidator = new LearningObjectValidator()

/** Export all symbols for testing */
export { KNOWN, INFERRED, UNKNOWN, STALE, CONFLICTED }
