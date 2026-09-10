import { listActions } from "@/lib/actions/action-store";
import type { DurableAction } from "@/lib/actions/action-contract";
import type {
  LearningActionStatusV1,
  LearningEvidenceRecordV1
} from "@/lib/learning/executive-learning-v1";

export type ProductionLearningCapabilityV1 =
  | "IMPLEMENTED_NEEDS_OUTCOME"
  | "LESSON_CANDIDATE_AVAILABLE";

export type ProductionLearningRecordV1 = LearningEvidenceRecordV1 & {
  source: "CANONICAL_DURABLE_ACTION";
  recommendationId: string | null;
  decisionId: string | null;
  expectedMechanism: string | null;
  predictedOutcomeRange: Record<string, unknown> | null;
  keyAssumptions: string[];
  successMetric: string | null;
  confounders: string[];
  unknowns: string[];
  lessonState: "NO_LESSON" | "LESSON_CANDIDATE";
  policyUpdateAllowed: false;
  traceability: {
    actionId: string;
    recommendationId: string | null;
    evidenceSnapshotId: string | null;
    evidenceFingerprint: string | null;
  };
};

export type ProductionLearningFeedV1 =
  | {
      status: "AVAILABLE";
      capability: ProductionLearningCapabilityV1;
      reason: string;
      records: ProductionLearningRecordV1[];
    }
  | {
      status: "UNAVAILABLE";
      capability: "IMPLEMENTED_NEEDS_OUTCOME";
      reason: string;
      records: [];
    };

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstText(
  source: Record<string, unknown> | null,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(text).filter((item): item is string => Boolean(item)))];
}

function firstStringList(
  sources: Array<Record<string, unknown> | null>,
  keys: readonly string[]
): string[] {
  for (const source of sources) {
    for (const key of keys) {
      const values = stringList(source?.[key]);
      if (values.length > 0) return values;
    }
  }
  return [];
}

function actionStatus(status: DurableAction["status"]): LearningActionStatusV1 {
  if (["executing", "executed", "measuring", "successful", "unsuccessful", "inconclusive"].includes(status)) {
    return "TAKEN";
  }
  if (["rejected", "expired", "cancelled"].includes(status)) return "NOT_TAKEN";
  if (status === "snoozed") return "DEFERRED";
  if (
    ["detected", "analyzed", "recommended", "draft_prepared", "awaiting_approval", "approved", "needs_revalidation", "execution_blocked"].includes(status)
  ) {
    return "PENDING";
  }
  return "UNKNOWN";
}

function evaluationWindow(action: DurableAction): string | null {
  const window = object(action.measurement_window);
  const start = firstText(window, ["start", "startDate", "start_at", "baseline_start"]);
  const end = firstText(window, ["end", "endDate", "end_at", "evaluation_end"]);
  if (start && end) return `${start} through ${end}`;
  return firstText(window, ["evaluation_window", "window", "duration"]);
}

function outcomeSummary(action: DurableAction): string | null {
  const outcome = object(action.outcome);
  const result = object(action.result_snapshot);
  const direct =
    firstText(outcome, ["summary", "observed_outcome", "result", "description"]) ??
    firstText(result, ["summary", "observed_outcome", "result", "description"]);
  if (direct) return direct;

  const metric =
    firstText(outcome, ["metric", "metric_name"]) ??
    firstText(result, ["metric", "metric_name"]);
  const value = outcome?.value ?? result?.value;
  if (metric && (typeof value === "number" || typeof value === "string")) {
    const unit = firstText(outcome, ["unit"]) ?? firstText(result, ["unit"]);
    return `${metric}: ${String(value)}${unit ? ` ${unit}` : ""}`;
  }
  return null;
}

function attributionConfidence(action: DurableAction): string | null {
  const outcome = object(action.outcome);
  const result = object(action.result_snapshot);
  const value =
    firstText(outcome, ["attribution_confidence", "outcome_confidence"]) ??
    firstText(result, ["attribution_confidence", "outcome_confidence"]);
  const normalized = value?.toUpperCase() ?? null;
  return normalized && ["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(normalized)
    ? normalized
    : null;
}

function calibrationError(action: DurableAction): string | null {
  const outcome = object(action.outcome);
  const result = object(action.result_snapshot);
  return (
    firstText(outcome, ["calibration_error", "confidence_calibration_result"]) ??
    firstText(result, ["calibration_error", "confidence_calibration_result"])
  );
}

export function projectDurableActionToLearningRecordV1(
  action: DurableAction
): ProductionLearningRecordV1 {
  const snapshot = object(action.evidence_snapshot);
  const outcome = object(action.outcome);
  const result = object(action.result_snapshot);
  const observedOutcome = outcomeSummary(action);
  const hypothesis = firstText(snapshot, ["HYPOTHESIS", "hypothesis"]);
  const successMetric =
    firstText(object(action.measurement_window), [
      "success_metric",
      "validation_metric",
      "metric"
    ]) ??
    firstText(snapshot, ["success_metric", "validation_metric"]);
  const confounders = firstStringList(
    [outcome, result],
    ["confounders", "unknowns"]
  );
  const unknowns = [...action.limitations];
  if (!hypothesis) unknowns.push("Hypothesis is not present in the canonical action record.");
  if (!successMetric) unknowns.push("Success metric is not present in the canonical action record.");
  if (!evaluationWindow(action)) unknowns.push("Evaluation window is not present in the canonical action record.");
  if (!observedOutcome) unknowns.push("Observed outcome has not been recorded.");

  const lesson = observedOutcome ? text(action.lessons) : null;

  return {
    id: action.id,
    source: "CANONICAL_DURABLE_ACTION",
    recommendationId: text(action.recommendation_id),
    decisionId: firstText(snapshot, ["decision_id", "DECISION_ID"]),
    hypothesis,
    prediction: text(action.expected_outcome),
    expectedMechanism: firstText(snapshot, [
      "expected_mechanism",
      "EXPECTED_MECHANISM",
      "mechanism"
    ]),
    predictedOutcomeRange:
      Object.keys(action.estimated_impact).length > 0
        ? { ...action.estimated_impact }
        : null,
    confidence: text(action.confidence),
    keyAssumptions: [...action.assumptions],
    successMetric,
    evaluationWindow: evaluationWindow(action),
    actionStatus: actionStatus(action.status),
    observedOutcome,
    attributionConfidence: attributionConfidence(action),
    confounders,
    unknowns: [...new Set(unknowns)],
    lesson,
    lessonState: lesson ? "LESSON_CANDIDATE" : "NO_LESSON",
    calibrationError: calibrationError(action),
    evidenceState:
      action.evidence_snapshot_id && action.evidence_snapshot_hash
        ? "KNOWN"
        : "UNKNOWN",
    policyUpdateAllowed: false,
    traceability: {
      actionId: action.id,
      recommendationId: text(action.recommendation_id),
      evidenceSnapshotId: text(action.evidence_snapshot_id),
      evidenceFingerprint: text(action.evidence_snapshot_hash)
    }
  };
}

export async function loadProductionLearningRecordsV1(options: {
  list?: () => Promise<DurableAction[]>;
} = {}): Promise<ProductionLearningFeedV1> {
  try {
    const actions = await (options.list ?? listActions)();
    const records = actions.map(projectDurableActionToLearningRecordV1);
    const hasLessonCandidate = records.some(
      (record) => record.lessonState === "LESSON_CANDIDATE"
    );

    return {
      status: "AVAILABLE",
      capability: hasLessonCandidate
        ? "LESSON_CANDIDATE_AVAILABLE"
        : "IMPLEMENTED_NEEDS_OUTCOME",
      reason: records.length
        ? "Canonical durable recommendation and action records are connected read-only."
        : "The canonical durable action store is connected but currently contains no records.",
      records
    };
  } catch {
    return {
      status: "UNAVAILABLE",
      capability: "IMPLEMENTED_NEEDS_OUTCOME",
      reason: "Canonical durable action records are unavailable. No synthetic learning records were substituted.",
      records: []
    };
  }
}
