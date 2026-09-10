export type LearningEvidenceStateV1 =
  | "KNOWN"
  | "INFERRED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTED";

export type LearningActionStatusV1 =
  | "TAKEN"
  | "NOT_TAKEN"
  | "DEFERRED"
  | "PENDING"
  | "UNKNOWN";

export type LearningEvaluationStateV1 =
  | "PENDING"
  | "OUTCOME_RECORDED"
  | "LEARNING_RECORDED"
  | "UNAVAILABLE";

export type LearningEvidenceRecordV1 = {
  id: string;
  hypothesis?: string | null;
  prediction?: string | null;
  confidence?: string | null;
  evaluationWindow?: string | null;
  actionStatus?: LearningActionStatusV1 | null;
  observedOutcome?: string | null;
  attributionConfidence?: string | null;
  lesson?: string | null;
  calibrationError?: string | null;
  evidenceState?: LearningEvidenceStateV1 | null;
};

export type ExecutiveLearningRecordV1 = {
  id: string;
  hypothesis: string | null;
  prediction: string | null;
  confidence: string | null;
  evaluationWindow: string | null;
  actionStatus: LearningActionStatusV1;
  observedOutcome: string | null;
  attributionConfidence: string | null;
  lesson: string | null;
  calibrationError: string | null;
  evidenceState: LearningEvidenceStateV1;
  evaluationState: LearningEvaluationStateV1;
  verificationRequired: boolean;
};

export type ExecutiveLearningWorkspaceV1 = {
  contractVersion: "executive_learning_workspace_v1";
  coverage: "AVAILABLE" | "UNAVAILABLE";
  coverageReason: string;
  summary: {
    recordCount: number | null;
    pendingCount: number | null;
    outcomeRecordedCount: number | null;
    learningRecordedCount: number | null;
    verificationRequiredCount: number | null;
  };
  records: readonly ExecutiveLearningRecordV1[];
};

const EVIDENCE_STATES = new Set<LearningEvidenceStateV1>([
  "KNOWN",
  "INFERRED",
  "UNKNOWN",
  "STALE",
  "CONFLICTED"
]);

const ACTION_STATUSES = new Set<LearningActionStatusV1>([
  "TAKEN",
  "NOT_TAKEN",
  "DEFERRED",
  "PENDING",
  "UNKNOWN"
]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function evidenceState(value: unknown): LearningEvidenceStateV1 {
  return typeof value === "string" && EVIDENCE_STATES.has(value as LearningEvidenceStateV1)
    ? (value as LearningEvidenceStateV1)
    : "UNKNOWN";
}

function actionStatus(value: unknown): LearningActionStatusV1 {
  return typeof value === "string" && ACTION_STATUSES.has(value as LearningActionStatusV1)
    ? (value as LearningActionStatusV1)
    : "UNKNOWN";
}

function evaluationState(record: {
  observedOutcome: string | null;
  attributionConfidence: string | null;
  lesson: string | null;
  evaluationWindow: string | null;
  evidenceState: LearningEvidenceStateV1;
}): LearningEvaluationStateV1 {
  if (record.observedOutcome) {
    if (
      record.evidenceState === "KNOWN" &&
      record.attributionConfidence &&
      record.lesson
    ) {
      return "LEARNING_RECORDED";
    }
    return "OUTCOME_RECORDED";
  }
  if (record.evaluationWindow) return "PENDING";
  return "UNAVAILABLE";
}

function normalizeRecord(value: LearningEvidenceRecordV1, index: number): ExecutiveLearningRecordV1 {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`learning record ${index} must be an object`);
  }
  const id = text(value.id);
  if (!id) throw new Error(`learning record ${index} requires id`);

  const normalized = {
    hypothesis: text(value.hypothesis),
    prediction: text(value.prediction),
    confidence: text(value.confidence),
    evaluationWindow: text(value.evaluationWindow),
    actionStatus: actionStatus(value.actionStatus),
    observedOutcome: text(value.observedOutcome),
    attributionConfidence: text(value.attributionConfidence),
    lesson: text(value.lesson),
    calibrationError: text(value.calibrationError),
    evidenceState: evidenceState(value.evidenceState)
  };

  return {
    id,
    ...normalized,
    evaluationState: evaluationState(normalized),
    verificationRequired: normalized.evidenceState !== "KNOWN"
  };
}

export function buildExecutiveLearningWorkspaceV1(input: {
  records: readonly LearningEvidenceRecordV1[] | null;
}): ExecutiveLearningWorkspaceV1 {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("learning workspace input must be an object");
  }

  if (input.records === null) {
    return {
      contractVersion: "executive_learning_workspace_v1",
      coverage: "UNAVAILABLE",
      coverageReason: "No verified canonical learning-record feed is connected to this production workspace yet.",
      summary: {
        recordCount: null,
        pendingCount: null,
        outcomeRecordedCount: null,
        learningRecordedCount: null,
        verificationRequiredCount: null
      },
      records: []
    };
  }

  if (!Array.isArray(input.records)) {
    throw new Error("learning workspace records must be an array or null");
  }

  const seen = new Set<string>();
  const records = input.records.map((record, index) => {
    const normalized = normalizeRecord(record, index);
    if (seen.has(normalized.id)) throw new Error(`duplicate learning record id: ${normalized.id}`);
    seen.add(normalized.id);
    return normalized;
  });

  return {
    contractVersion: "executive_learning_workspace_v1",
    coverage: "AVAILABLE",
    coverageReason: records.length
      ? "Verified caller-supplied learning evidence is available."
      : "The canonical learning feed is available but currently contains no records.",
    summary: {
      recordCount: records.length,
      pendingCount: records.filter((record) => record.evaluationState === "PENDING").length,
      outcomeRecordedCount: records.filter((record) => record.evaluationState === "OUTCOME_RECORDED").length,
      learningRecordedCount: records.filter((record) => record.evaluationState === "LEARNING_RECORDED").length,
      verificationRequiredCount: records.filter((record) => record.verificationRequired).length
    },
    records
  };
}
