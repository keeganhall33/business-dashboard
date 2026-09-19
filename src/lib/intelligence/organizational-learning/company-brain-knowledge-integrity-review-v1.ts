import {
  DECISION_MEMORY_POLICY_VERSION_V1,
  type DecisionMemoryRecordV1
} from "./decision-memory-v1";
import {
  LEARNING_OBJECT_CONTRACT_VERSION,
  validateLearningObjectV1,
  type LearningObjectV1
} from "./learning-object-v1";

export const COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_VERSION_V1 =
  "CompanyBrainKnowledgeIntegrityReviewV1" as const;
export const COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_POLICY_VERSION_V1 =
  "company_brain_knowledge_integrity_review_v1.0.0" as const;
export const MAX_COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_RECORDS_V1 = 1_000;

export type CompanyBrainKnowledgeIntegrityStateV1 =
  | "READY"
  | "REVIEW_REQUIRED"
  | "VERIFY_SOURCE";

export type CompanyBrainKnowledgeIntegritySeverityV1 =
  | "REVIEW_REQUIRED"
  | "VERIFY_SOURCE";

export type CompanyBrainKnowledgeIntegrityIssueCodeV1 =
  | "DECISION_RECORD_INVALID"
  | "DUPLICATE_DECISION_RECORD_ID"
  | "DECISION_REVISION_PREDECESSOR_MISSING"
  | "DECISION_REVISION_FORK"
  | "DECISION_REVISION_CHAIN_INVALID"
  | "DECISION_SOURCE_EVIDENCE_MISSING"
  | "DECISION_AUTHORITY_WIDENED"
  | "DECISION_INTEGRITY_FLAGS_PRESENT"
  | "ACTIVE_DECISION_EXPIRED"
  | "DECISION_OUTCOME_CHRONOLOGY_INVALID"
  | "DECISION_OUTCOME_EVIDENCE_MISSING"
  | "DECISION_ATTRIBUTION_EVIDENCE_MISSING"
  | "DECISION_SUPERSESSION_PREDECESSOR_MISSING"
  | "DECISION_SUPERSESSION_SELF_REFERENCE"
  | "DECISION_SUPERSESSION_FORK"
  | "DECISION_SUPERSESSION_CYCLE"
  | "DECISION_SUPERSESSION_CHRONOLOGY_INVALID"
  | "LEARNING_OBJECT_INVALID"
  | "DUPLICATE_LEARNING_VERSION"
  | "LEARNING_VERSION_CHRONOLOGY_INVALID"
  | "CANONICAL_LEARNING_EVIDENCE_MISSING"
  | "ACTIVE_LEARNING_STALE"
  | "ACTIVE_LEARNING_UNSAFE_TRUTH"
  | "LEARNING_SUPERSESSION_SUCCESSOR_MISSING"
  | "LEARNING_SUPERSESSION_SUCCESSOR_NOT_AUTHORITATIVE"
  | "LEARNING_SUPERSESSION_CYCLE";

export type CompanyBrainKnowledgeIntegrityIssueV1 = Readonly<{
  code: CompanyBrainKnowledgeIntegrityIssueCodeV1;
  severity: CompanyBrainKnowledgeIntegritySeverityV1;
  subjectRef: string;
  relatedRef: string | null;
}>;

export type CompanyBrainCurrentDecisionV1 = Readonly<{
  decisionId: string;
  recordId: string;
}>;

export type CompanyBrainCurrentLearningV1 = Readonly<{
  learningId: string;
  version: number;
  kind: LearningObjectV1["kind"];
}>;

export type CompanyBrainKnowledgeIntegrityReviewV1 = Readonly<{
  contractVersion: typeof COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_VERSION_V1;
  policyVersion: typeof COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_POLICY_VERSION_V1;
  state: CompanyBrainKnowledgeIntegrityStateV1;
  generatedAt: string;
  suppliedDecisionRecords: number;
  suppliedLearningObjects: number;
  currentDecisions: readonly CompanyBrainCurrentDecisionV1[];
  currentLearning: readonly CompanyBrainCurrentLearningV1[];
  reviewDecisionIds: readonly string[];
  reviewLearningIds: readonly string[];
  issues: readonly CompanyBrainKnowledgeIntegrityIssueV1[];
  causalInterpretation: "NOT_ESTABLISHED";
  confidence: "NOT_ESTABLISHED";
  monetaryValue: null;
  inferredOutcome: null;
  limitations: readonly string[];
  authority: Readonly<{
    analysisOnly: true;
    persistenceAuthorized: false;
    decisionMutationAuthorized: false;
    learningMutationAuthorized: false;
    policyPromotionAuthorized: false;
    capabilityPromotionAuthorized: false;
    portfolioMutationAuthorized: false;
    reallocationAuthorized: false;
    pricingChangeAuthorized: false;
    negotiationActionAuthorized: false;
    campaignExecutionAuthorized: false;
    experimentExecutionAuthorized: false;
    externalActionAuthorized: false;
    approvalBypassAuthorized: false;
  }>;
}>;

export type CompanyBrainKnowledgeIntegrityReviewInputV1 = Readonly<{
  generatedAt: string;
  decisionRecords: readonly DecisionMemoryRecordV1[];
  learningObjects: readonly LearningObjectV1[];
}>;

const AUTHORITY = Object.freeze({
  analysisOnly: true as const,
  persistenceAuthorized: false as const,
  decisionMutationAuthorized: false as const,
  learningMutationAuthorized: false as const,
  policyPromotionAuthorized: false as const,
  capabilityPromotionAuthorized: false as const,
  portfolioMutationAuthorized: false as const,
  reallocationAuthorized: false as const,
  pricingChangeAuthorized: false as const,
  negotiationActionAuthorized: false as const,
  campaignExecutionAuthorized: false as const,
  experimentExecutionAuthorized: false as const,
  externalActionAuthorized: false as const,
  approvalBypassAuthorized: false as const
});

const LIMITATIONS = Object.freeze([
  "This review checks canonical knowledge lineage and integrity only. It does not create, repair, supersede, persist, approve, or execute any decision or learning object.",
  "A clean integrity review does not establish causality, confidence, monetary value, expected future performance, or an outcome that was not explicitly recorded.",
  "Expired decisions and stale canonical learning are routed to review rather than silently reused or automatically replaced.",
  "Ambiguous revision or supersession lineage fails closed. Older records are never resurrected merely because a newer record requires review.",
  "No allocation, reallocation, pricing, negotiation, campaign, experiment, provider, or external action is authorized."
] as const);

const EXPECTED_DECISION_AUTHORITY_KEYS = Object.freeze([
  "analysisOnly",
  "externalActionAuthorized",
  "negotiationAuthorized",
  "persistenceAuthorized",
  "pricingChangeAuthorized",
  "publishAuthorized",
  "spendAuthorized"
] as const);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value as Readonly<T>;
}

function decisionAuthorityHolds(record: DecisionMemoryRecordV1): boolean {
  const authority = record.actionAuthority as unknown as Record<string, unknown>;
  const keys = Object.keys(authority).sort((a, b) => a.localeCompare(b));
  const expected = [...EXPECTED_DECISION_AUTHORITY_KEYS].sort((a, b) => a.localeCompare(b));
  return keys.length === expected.length
    && keys.every((key, index) => key === expected[index])
    && authority.analysisOnly === true
    && authority.persistenceAuthorized === false
    && authority.externalActionAuthorized === false
    && authority.pricingChangeAuthorized === false
    && authority.negotiationAuthorized === false
    && authority.spendAuthorized === false
    && authority.publishAuthorized === false;
}

function issueKey(issue: CompanyBrainKnowledgeIntegrityIssueV1): string {
  return `${issue.severity}:${issue.code}:${issue.subjectRef}:${issue.relatedRef ?? ""}`;
}

function addIssue(
  issues: Map<string, CompanyBrainKnowledgeIntegrityIssueV1>,
  issue: CompanyBrainKnowledgeIntegrityIssueV1
): void {
  issues.set(issueKey(issue), Object.freeze(issue));
}

function sortedUnique(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function reviewState(
  issues: readonly CompanyBrainKnowledgeIntegrityIssueV1[]
): CompanyBrainKnowledgeIntegrityStateV1 {
  if (issues.some((issue) => issue.severity === "VERIFY_SOURCE")) return "VERIFY_SOURCE";
  if (issues.some((issue) => issue.severity === "REVIEW_REQUIRED")) return "REVIEW_REQUIRED";
  return "READY";
}

function latestAuthoritativeLearning(
  group: readonly Readonly<LearningObjectV1>[]
): Readonly<LearningObjectV1> | null {
  const authoritative = group.filter(
    (item) => item.lifecycle_state === "CANONICAL" || item.lifecycle_state === "SUPERSEDED"
  );
  if (authoritative.length === 0) return null;
  return [...authoritative].sort((a, b) => b.version - a.version)[0] ?? null;
}

export function reviewCompanyBrainKnowledgeIntegrityV1(
  input: CompanyBrainKnowledgeIntegrityReviewInputV1
): CompanyBrainKnowledgeIntegrityReviewV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_INPUT");
  }
  const generatedAtMs = timestampMs(input.generatedAt);
  if (generatedAtMs == null) throw new Error("INVALID_GENERATED_AT");
  if (!Array.isArray(input.decisionRecords) || !Array.isArray(input.learningObjects)) {
    throw new Error("INVALID_INPUT");
  }
  if (
    input.decisionRecords.length > MAX_COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_RECORDS_V1
    || input.learningObjects.length > MAX_COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_RECORDS_V1
  ) {
    throw new Error("BOUNDS_EXCEEDED");
  }

  const issues = new Map<string, CompanyBrainKnowledgeIntegrityIssueV1>();
  const blockedDecisionIds = new Set<string>();
  const reviewDecisionIds = new Set<string>();
  const decisionGroups = new Map<string, DecisionMemoryRecordV1[]>();
  const decisionRecordIds = new Map<string, string>();

  for (const record of input.decisionRecords) {
    const decisionId = text(record?.decisionId) ?? "<unknown-decision>";
    const recordId = text(record?.recordId) ?? "<unknown-record>";
    const decidedAtMs = timestampMs(record?.decidedAt);
    if (
      record?.contractVersion !== "DecisionMemoryV1"
      || record?.policyVersion !== DECISION_MEMORY_POLICY_VERSION_V1
      || decisionId === "<unknown-decision>"
      || recordId === "<unknown-record>"
      || decidedAtMs == null
      || decidedAtMs > generatedAtMs
    ) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_RECORD_INVALID",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: recordId
      });
      continue;
    }
    if (!decisionAuthorityHolds(record)) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_AUTHORITY_WIDENED",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: recordId
      });
    }
    const priorOwner = decisionRecordIds.get(recordId);
    if (priorOwner) {
      blockedDecisionIds.add(priorOwner);
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DUPLICATE_DECISION_RECORD_ID",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: recordId
      });
    } else {
      decisionRecordIds.set(recordId, decisionId);
    }
    const group = decisionGroups.get(decisionId) ?? [];
    group.push(record);
    decisionGroups.set(decisionId, group);
  }

  const decisionTips = new Map<string, DecisionMemoryRecordV1>();
  for (const [decisionId, group] of decisionGroups) {
    const byRecordId = new Map(group.map((record) => [record.recordId, record]));
    const children = new Map<string, string[]>();
    let chainInvalid = false;

    for (const record of group) {
      if (record.priorRecordId == null) continue;
      const priorRecord = byRecordId.get(record.priorRecordId);
      if (!priorRecord) {
        chainInvalid = true;
        addIssue(issues, {
          code: "DECISION_REVISION_PREDECESSOR_MISSING",
          severity: "VERIFY_SOURCE",
          subjectRef: decisionId,
          relatedRef: record.priorRecordId
        });
        continue;
      }
      const nextChildren = children.get(record.priorRecordId) ?? [];
      nextChildren.push(record.recordId);
      children.set(record.priorRecordId, nextChildren);
    }

    for (const [predecessor, childIds] of children) {
      if (childIds.length <= 1) continue;
      chainInvalid = true;
      addIssue(issues, {
        code: "DECISION_REVISION_FORK",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: predecessor
      });
    }

    const roots = group.filter((record) => record.priorRecordId == null);
    const tips = group.filter((record) => !children.has(record.recordId));
    if (roots.length !== 1 || tips.length !== 1) chainInvalid = true;

    if (!chainInvalid && tips[0]) {
      const visited = new Set<string>();
      let cursor: DecisionMemoryRecordV1 | undefined = tips[0];
      while (cursor) {
        if (visited.has(cursor.recordId)) {
          chainInvalid = true;
          break;
        }
        visited.add(cursor.recordId);
        cursor = cursor.priorRecordId ? byRecordId.get(cursor.priorRecordId) : undefined;
      }
      if (visited.size !== group.length) chainInvalid = true;
    }

    if (chainInvalid || !tips[0]) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_REVISION_CHAIN_INVALID",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: null
      });
      continue;
    }

    const tip = tips[0];
    decisionTips.set(decisionId, tip);

    if (!Array.isArray(tip.sourceRefs) || tip.sourceRefs.length === 0) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_SOURCE_EVIDENCE_MISSING",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: tip.recordId
      });
    }
    if (Array.isArray(tip.integrityFlags) && tip.integrityFlags.length > 0) {
      blockedDecisionIds.add(decisionId);
      reviewDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_INTEGRITY_FLAGS_PRESENT",
        severity: "REVIEW_REQUIRED",
        subjectRef: decisionId,
        relatedRef: tip.recordId
      });
    }
    const validUntilMs = tip.validUntil == null ? null : timestampMs(tip.validUntil);
    if (tip.validUntil != null && (validUntilMs == null || validUntilMs < generatedAtMs)) {
      blockedDecisionIds.add(decisionId);
      reviewDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "ACTIVE_DECISION_EXPIRED",
        severity: "REVIEW_REQUIRED",
        subjectRef: decisionId,
        relatedRef: tip.recordId
      });
    }

    const outcome = tip.outcomeObservation;
    if (outcome) {
      const observedAtMs = timestampMs(outcome.observedAt);
      const decidedAtMs = timestampMs(tip.decidedAt);
      if (
        observedAtMs == null
        || decidedAtMs == null
        || observedAtMs < decidedAtMs
        || observedAtMs > generatedAtMs
      ) {
        blockedDecisionIds.add(decisionId);
        addIssue(issues, {
          code: "DECISION_OUTCOME_CHRONOLOGY_INVALID",
          severity: "VERIFY_SOURCE",
          subjectRef: decisionId,
          relatedRef: outcome.observationId
        });
      }
      if (!Array.isArray(outcome.sourceRefs) || outcome.sourceRefs.length === 0) {
        blockedDecisionIds.add(decisionId);
        addIssue(issues, {
          code: "DECISION_OUTCOME_EVIDENCE_MISSING",
          severity: "VERIFY_SOURCE",
          subjectRef: decisionId,
          relatedRef: outcome.observationId
        });
      }
      if (
        outcome.attributionClass !== "UNKNOWN"
        && (!Array.isArray(outcome.attributionEvidenceRefs) || outcome.attributionEvidenceRefs.length === 0)
      ) {
        blockedDecisionIds.add(decisionId);
        addIssue(issues, {
          code: "DECISION_ATTRIBUTION_EVIDENCE_MISSING",
          severity: "VERIFY_SOURCE",
          subjectRef: decisionId,
          relatedRef: outcome.observationId
        });
      }
    }
  }

  const supersededDecisionIds = new Set<string>();
  const decisionSuccessors = new Map<string, string[]>();
  for (const [decisionId, tip] of decisionTips) {
    const predecessorId = tip.supersedesDecisionId;
    if (!predecessorId) continue;
    if (predecessorId === decisionId) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_SUPERSESSION_SELF_REFERENCE",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: predecessorId
      });
      continue;
    }
    const predecessor = decisionTips.get(predecessorId);
    if (!predecessor) {
      blockedDecisionIds.add(decisionId);
      addIssue(issues, {
        code: "DECISION_SUPERSESSION_PREDECESSOR_MISSING",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: predecessorId
      });
      continue;
    }
    const predecessorAt = timestampMs(predecessor.decidedAt);
    const successorAt = timestampMs(tip.decidedAt);
    if (predecessorAt == null || successorAt == null || successorAt < predecessorAt) {
      blockedDecisionIds.add(decisionId);
      blockedDecisionIds.add(predecessorId);
      addIssue(issues, {
        code: "DECISION_SUPERSESSION_CHRONOLOGY_INVALID",
        severity: "VERIFY_SOURCE",
        subjectRef: decisionId,
        relatedRef: predecessorId
      });
      continue;
    }
    supersededDecisionIds.add(predecessorId);
    const successors = decisionSuccessors.get(predecessorId) ?? [];
    successors.push(decisionId);
    decisionSuccessors.set(predecessorId, successors);
  }

  for (const [predecessorId, successors] of decisionSuccessors) {
    if (successors.length <= 1) continue;
    blockedDecisionIds.add(predecessorId);
    for (const successor of successors) blockedDecisionIds.add(successor);
    addIssue(issues, {
      code: "DECISION_SUPERSESSION_FORK",
      severity: "VERIFY_SOURCE",
      subjectRef: predecessorId,
      relatedRef: [...successors].sort((a, b) => a.localeCompare(b)).join(",")
    });
  }

  for (const decisionId of decisionTips.keys()) {
    const visited = new Set<string>();
    let cursor: string | null = decisionId;
    while (cursor) {
      if (visited.has(cursor)) {
        for (const member of visited) blockedDecisionIds.add(member);
        addIssue(issues, {
          code: "DECISION_SUPERSESSION_CYCLE",
          severity: "VERIFY_SOURCE",
          subjectRef: decisionId,
          relatedRef: cursor
        });
        break;
      }
      visited.add(cursor);
      cursor = decisionTips.get(cursor)?.supersedesDecisionId ?? null;
    }
  }

  const learningGroups = new Map<string, Readonly<LearningObjectV1>[]>();
  const blockedLearningIds = new Set<string>();
  const reviewLearningIds = new Set<string>();

  for (const raw of input.learningObjects) {
    const rawId = text(raw?.learning_id) ?? "<unknown-learning>";
    try {
      const validated = validateLearningObjectV1(raw);
      if (validated.contract_version !== LEARNING_OBJECT_CONTRACT_VERSION) {
        throw new Error("INVALID_CONTRACT");
      }
      const group = learningGroups.get(validated.learning_id) ?? [];
      group.push(validated);
      learningGroups.set(validated.learning_id, group);
    } catch {
      blockedLearningIds.add(rawId);
      addIssue(issues, {
        code: "LEARNING_OBJECT_INVALID",
        severity: "VERIFY_SOURCE",
        subjectRef: rawId,
        relatedRef: null
      });
    }
  }

  const authoritativeLearning = new Map<string, Readonly<LearningObjectV1>>();
  for (const [learningId, group] of learningGroups) {
    const versions = new Map<number, number>();
    for (const item of group) versions.set(item.version, (versions.get(item.version) ?? 0) + 1);
    for (const [version, count] of versions) {
      if (count <= 1) continue;
      blockedLearningIds.add(learningId);
      addIssue(issues, {
        code: "DUPLICATE_LEARNING_VERSION",
        severity: "VERIFY_SOURCE",
        subjectRef: learningId,
        relatedRef: String(version)
      });
    }

    const sorted = [...group].sort((a, b) => a.version - b.version);
    for (let index = 1; index < sorted.length; index += 1) {
      if (Date.parse(sorted[index].updated_at) < Date.parse(sorted[index - 1].updated_at)) {
        blockedLearningIds.add(learningId);
        addIssue(issues, {
          code: "LEARNING_VERSION_CHRONOLOGY_INVALID",
          severity: "VERIFY_SOURCE",
          subjectRef: learningId,
          relatedRef: String(sorted[index].version)
        });
      }
    }

    const authoritative = latestAuthoritativeLearning(group);
    if (!authoritative) continue;
    authoritativeLearning.set(learningId, authoritative);

    if (authoritative.lifecycle_state === "CANONICAL") {
      if (authoritative.evidence.length === 0) {
        blockedLearningIds.add(learningId);
        addIssue(issues, {
          code: "CANONICAL_LEARNING_EVIDENCE_MISSING",
          severity: "VERIFY_SOURCE",
          subjectRef: learningId,
          relatedRef: String(authoritative.version)
        });
      }
      if (authoritative.truth_state === "STALE") {
        blockedLearningIds.add(learningId);
        reviewLearningIds.add(learningId);
        addIssue(issues, {
          code: "ACTIVE_LEARNING_STALE",
          severity: "REVIEW_REQUIRED",
          subjectRef: learningId,
          relatedRef: String(authoritative.version)
        });
      } else if (authoritative.truth_state === "UNKNOWN" || authoritative.truth_state === "CONFLICTED") {
        blockedLearningIds.add(learningId);
        addIssue(issues, {
          code: "ACTIVE_LEARNING_UNSAFE_TRUTH",
          severity: "VERIFY_SOURCE",
          subjectRef: learningId,
          relatedRef: String(authoritative.version)
        });
      }
    }
  }

  const supersededLearningIds = new Set<string>();
  for (const [learningId, authoritative] of authoritativeLearning) {
    if (authoritative.lifecycle_state !== "SUPERSEDED") continue;
    supersededLearningIds.add(learningId);
    const successorId = text(authoritative.supersession?.successor_id);
    if (!successorId) {
      blockedLearningIds.add(learningId);
      addIssue(issues, {
        code: "LEARNING_SUPERSESSION_SUCCESSOR_MISSING",
        severity: "VERIFY_SOURCE",
        subjectRef: learningId,
        relatedRef: null
      });
      continue;
    }
    if (!authoritativeLearning.has(successorId)) {
      blockedLearningIds.add(learningId);
      addIssue(issues, {
        code: "LEARNING_SUPERSESSION_SUCCESSOR_NOT_AUTHORITATIVE",
        severity: "VERIFY_SOURCE",
        subjectRef: learningId,
        relatedRef: successorId
      });
    }
  }

  for (const learningId of authoritativeLearning.keys()) {
    const visited = new Set<string>();
    let cursor: string | null = learningId;
    while (cursor) {
      if (visited.has(cursor)) {
        for (const member of visited) blockedLearningIds.add(member);
        addIssue(issues, {
          code: "LEARNING_SUPERSESSION_CYCLE",
          severity: "VERIFY_SOURCE",
          subjectRef: learningId,
          relatedRef: cursor
        });
        break;
      }
      visited.add(cursor);
      const current = authoritativeLearning.get(cursor);
      cursor = current?.lifecycle_state === "SUPERSEDED"
        ? text(current.supersession?.successor_id)
        : null;
    }
  }

  const currentDecisions = [...decisionTips.entries()]
    .filter(([decisionId]) => !supersededDecisionIds.has(decisionId) && !blockedDecisionIds.has(decisionId))
    .map(([decisionId, record]) => Object.freeze({ decisionId, recordId: record.recordId }))
    .sort((a, b) => a.decisionId.localeCompare(b.decisionId));

  const currentLearning = [...authoritativeLearning.entries()]
    .filter(([learningId, object]) =>
      object.lifecycle_state === "CANONICAL"
      && !supersededLearningIds.has(learningId)
      && !blockedLearningIds.has(learningId)
    )
    .map(([learningId, object]) => Object.freeze({
      learningId,
      version: object.version,
      kind: object.kind
    }))
    .sort((a, b) => a.learningId.localeCompare(b.learningId));

  const sortedIssues = [...issues.values()].sort((a, b) => issueKey(a).localeCompare(issueKey(b)));

  return deepFreeze({
    contractVersion: COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_VERSION_V1,
    policyVersion: COMPANY_BRAIN_KNOWLEDGE_INTEGRITY_REVIEW_POLICY_VERSION_V1,
    state: reviewState(sortedIssues),
    generatedAt: input.generatedAt,
    suppliedDecisionRecords: input.decisionRecords.length,
    suppliedLearningObjects: input.learningObjects.length,
    currentDecisions: Object.freeze(currentDecisions),
    currentLearning: Object.freeze(currentLearning),
    reviewDecisionIds: sortedUnique(reviewDecisionIds),
    reviewLearningIds: sortedUnique(reviewLearningIds),
    issues: Object.freeze(sortedIssues),
    causalInterpretation: "NOT_ESTABLISHED" as const,
    confidence: "NOT_ESTABLISHED" as const,
    monetaryValue: null,
    inferredOutcome: null,
    limitations: LIMITATIONS,
    authority: AUTHORITY
  });
}
