export type StrategicCampaignStateV1 = "PLANNING" | "ACTIVE" | "PAUSED" | "COMPLETED";

export type CampaignSteeringReviewSignalV1 =
  | "NO_CHANGE_INDICATED"
  | "ASSUMPTION_EVIDENCE_CONFLICT"
  | "EXPERIMENT_RESULT_REQUIRES_REVIEW"
  | "ALLOCATION_CONSTRAINT_CHANGED"
  | "OBJECTIVE_EVIDENCE_CONFLICT"
  | "INCONCLUSIVE";

export type StrategicCampaignSteeringStatusV1 = "WAITING" | "READY" | "BLOCKED";

export type StrategicCampaignSteeringActionV1 =
  | "WAIT_FOR_EVIDENCE"
  | "CONTINUE_OBSERVING"
  | "REVIEW_ASSUMPTIONS"
  | "REVIEW_EXPERIMENT"
  | "REVIEW_REALLOCATION"
  | "REVIEW_OBJECTIVE";

export type StrategicCampaignSteeringReasonCodeV1 =
  | "NO_CHECKPOINT_EVIDENCE"
  | "NO_CHANGE_EVIDENCE"
  | "ASSUMPTION_REVIEW_REQUIRED"
  | "EXPERIMENT_REVIEW_REQUIRED"
  | "REALLOCATION_REVIEW_REQUIRED"
  | "OBJECTIVE_REVIEW_REQUIRED"
  | "PARTIAL_MEASUREMENT"
  | "INCONCLUSIVE_EVIDENCE"
  | "INVALID_INPUT"
  | "CAMPAIGN_MISMATCH"
  | "FUTURE_EVIDENCE"
  | "STALE_EVIDENCE"
  | "DUPLICATE_CHECKPOINT"
  | "MISSING_EXPERIMENT_ID"
  | "MISSING_ALLOCATION_ID"
  | "CONFLICTING_STEERING_SIGNALS"
  | "UNSAFE_PROVENANCE";

export interface StrategicCampaignCheckpointEvidenceV1 {
  checkpointId: string;
  campaignId: string;
  observedAt: string;
  sourceRef: string;
  provenance: "FIRST_PARTY" | "AUTHORIZED_CONNECTOR" | "CANONICAL_MEMORY";
  measurementStatus: "PARTIAL" | "COMPLETE";
  reviewSignal: CampaignSteeringReviewSignalV1;
  decisionId?: string | null;
  experimentId?: string | null;
  allocationId?: string | null;
}

export interface StrategicCampaignSteeringInputV1 {
  campaignId: string;
  objective: string;
  state: StrategicCampaignStateV1;
  asOf: string;
  maxEvidenceAgeDays: number;
  checkpoints: readonly StrategicCampaignCheckpointEvidenceV1[];
}

export interface StrategicCampaignSteeringResultV1 {
  contractVersion: "StrategicCampaignSteeringV1";
  campaignId: string;
  objective: string;
  state: StrategicCampaignStateV1;
  asOf: string;
  status: StrategicCampaignSteeringStatusV1;
  action: StrategicCampaignSteeringActionV1;
  reasonCodes: StrategicCampaignSteeringReasonCodeV1[];
  evidenceRefs: string[];
  causality: "NOT_ESTABLISHED";
  confidence: null;
  monetaryValue: null;
  outcome: null;
  authority: {
    reviewPreparation: boolean;
    campaignMutation: false;
    budgetMutation: false;
    allocationMutation: false;
    experimentMutation: false;
    persistence: false;
    providerWrite: false;
    externalExecution: false;
    approvalBypass: false;
  };
}

const ISO_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MS_PER_DAY = 86_400_000;

const CAMPAIGN_STATES = new Set<StrategicCampaignStateV1>([
  "PLANNING",
  "ACTIVE",
  "PAUSED",
  "COMPLETED"
]);
const PROVENANCE_CLASSES = new Set<StrategicCampaignCheckpointEvidenceV1["provenance"]>([
  "FIRST_PARTY",
  "AUTHORIZED_CONNECTOR",
  "CANONICAL_MEMORY"
]);
const MEASUREMENT_STATUSES = new Set<StrategicCampaignCheckpointEvidenceV1["measurementStatus"]>([
  "PARTIAL",
  "COMPLETE"
]);
const REVIEW_SIGNALS = new Set<CampaignSteeringReviewSignalV1>([
  "NO_CHANGE_INDICATED",
  "ASSUMPTION_EVIDENCE_CONFLICT",
  "EXPERIMENT_RESULT_REQUIRES_REVIEW",
  "ALLOCATION_CONSTRAINT_CHANGED",
  "OBJECTIVE_EVIDENCE_CONFLICT",
  "INCONCLUSIVE"
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseUtcTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC_TIMESTAMP_RE.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksUnsafeReference(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("password=") ||
    normalized.includes("token=") ||
    normalized.includes("api_key=") ||
    normalized.includes("apikey=") ||
    normalized.includes("secret=") ||
    normalized.includes("authorization:") ||
    normalized.includes("bearer ")
  );
}

function baseResult(
  input: StrategicCampaignSteeringInputV1,
  status: StrategicCampaignSteeringStatusV1,
  action: StrategicCampaignSteeringActionV1,
  reasonCodes: StrategicCampaignSteeringReasonCodeV1[],
  evidenceRefs: string[]
): StrategicCampaignSteeringResultV1 {
  const reviewPreparation =
    status === "READY" &&
    action !== "WAIT_FOR_EVIDENCE" &&
    action !== "CONTINUE_OBSERVING";

  return {
    contractVersion: "StrategicCampaignSteeringV1",
    campaignId: typeof input.campaignId === "string" ? input.campaignId.trim() : "",
    objective: typeof input.objective === "string" ? input.objective.trim() : "",
    state: input.state,
    asOf: input.asOf,
    status,
    action,
    reasonCodes: [...new Set(reasonCodes)].sort(),
    evidenceRefs: [...new Set(evidenceRefs)].sort(),
    causality: "NOT_ESTABLISHED",
    confidence: null,
    monetaryValue: null,
    outcome: null,
    authority: {
      reviewPreparation,
      campaignMutation: false,
      budgetMutation: false,
      allocationMutation: false,
      experimentMutation: false,
      persistence: false,
      providerWrite: false,
      externalExecution: false,
      approvalBypass: false
    }
  };
}

function blocked(
  input: StrategicCampaignSteeringInputV1,
  reasonCodes: StrategicCampaignSteeringReasonCodeV1[],
  evidenceRefs: string[] = []
): StrategicCampaignSteeringResultV1 {
  return baseResult(input, "BLOCKED", "WAIT_FOR_EVIDENCE", reasonCodes, evidenceRefs);
}

function actionForSignal(
  signal: CampaignSteeringReviewSignalV1
): StrategicCampaignSteeringActionV1 | null {
  switch (signal) {
    case "ASSUMPTION_EVIDENCE_CONFLICT":
      return "REVIEW_ASSUMPTIONS";
    case "EXPERIMENT_RESULT_REQUIRES_REVIEW":
      return "REVIEW_EXPERIMENT";
    case "ALLOCATION_CONSTRAINT_CHANGED":
      return "REVIEW_REALLOCATION";
    case "OBJECTIVE_EVIDENCE_CONFLICT":
      return "REVIEW_OBJECTIVE";
    default:
      return null;
  }
}

function reasonForAction(
  action: StrategicCampaignSteeringActionV1
): StrategicCampaignSteeringReasonCodeV1 {
  switch (action) {
    case "REVIEW_ASSUMPTIONS":
      return "ASSUMPTION_REVIEW_REQUIRED";
    case "REVIEW_EXPERIMENT":
      return "EXPERIMENT_REVIEW_REQUIRED";
    case "REVIEW_REALLOCATION":
      return "REALLOCATION_REVIEW_REQUIRED";
    case "REVIEW_OBJECTIVE":
      return "OBJECTIVE_REVIEW_REQUIRED";
    default:
      return "NO_CHANGE_EVIDENCE";
  }
}

/**
 * Converts current, explicit campaign checkpoint evidence into internal steering-review work.
 *
 * This compiler intentionally does not decide whether a campaign worked, rank alternatives,
 * change allocation, scale/stop a campaign, mutate an experiment, or execute any external action.
 * A READY review is permission to prepare an internal review only.
 */
export function reviewStrategicCampaignSteeringV1(
  input: StrategicCampaignSteeringInputV1
): StrategicCampaignSteeringResultV1 {
  const asOfMs = parseUtcTimestamp(input.asOf);
  if (
    !isNonEmptyString(input.campaignId) ||
    !isNonEmptyString(input.objective) ||
    !CAMPAIGN_STATES.has(input.state) ||
    asOfMs === null ||
    !Number.isFinite(input.maxEvidenceAgeDays) ||
    input.maxEvidenceAgeDays <= 0 ||
    !Array.isArray(input.checkpoints)
  ) {
    return blocked(input, ["INVALID_INPUT"]);
  }

  if (input.checkpoints.length === 0) {
    return baseResult(input, "WAITING", "WAIT_FOR_EVIDENCE", ["NO_CHECKPOINT_EVIDENCE"], []);
  }

  const campaignId = input.campaignId.trim();
  const seenCheckpointIds = new Set<string>();
  const evidenceRefs: string[] = [];
  const structuralReasons: StrategicCampaignSteeringReasonCodeV1[] = [];
  let hasPartial = false;
  let hasInconclusive = false;
  let hasNoChange = false;
  const actions = new Set<StrategicCampaignSteeringActionV1>();

  for (const checkpoint of input.checkpoints) {
    const checkpointId = isNonEmptyString(checkpoint.checkpointId)
      ? checkpoint.checkpointId.trim()
      : "";
    const checkpointCampaignId = isNonEmptyString(checkpoint.campaignId)
      ? checkpoint.campaignId.trim()
      : "";
    const sourceRef = isNonEmptyString(checkpoint.sourceRef) ? checkpoint.sourceRef.trim() : "";
    const observedAtMs = parseUtcTimestamp(checkpoint.observedAt);

    if (
      !checkpointId ||
      !checkpointCampaignId ||
      !sourceRef ||
      observedAtMs === null ||
      !PROVENANCE_CLASSES.has(checkpoint.provenance) ||
      !MEASUREMENT_STATUSES.has(checkpoint.measurementStatus) ||
      !REVIEW_SIGNALS.has(checkpoint.reviewSignal)
    ) {
      structuralReasons.push("INVALID_INPUT");
      continue;
    }

    if (seenCheckpointIds.has(checkpointId)) {
      structuralReasons.push("DUPLICATE_CHECKPOINT");
    } else {
      seenCheckpointIds.add(checkpointId);
    }

    if (checkpointCampaignId !== campaignId) {
      structuralReasons.push("CAMPAIGN_MISMATCH");
    }

    if (looksUnsafeReference(sourceRef)) {
      structuralReasons.push("UNSAFE_PROVENANCE");
    } else {
      evidenceRefs.push(sourceRef);
    }

    if (observedAtMs > asOfMs) {
      structuralReasons.push("FUTURE_EVIDENCE");
    } else if (asOfMs - observedAtMs > input.maxEvidenceAgeDays * MS_PER_DAY) {
      structuralReasons.push("STALE_EVIDENCE");
    }

    if (
      checkpoint.reviewSignal === "EXPERIMENT_RESULT_REQUIRES_REVIEW" &&
      !isNonEmptyString(checkpoint.experimentId)
    ) {
      structuralReasons.push("MISSING_EXPERIMENT_ID");
    }

    if (
      checkpoint.reviewSignal === "ALLOCATION_CONSTRAINT_CHANGED" &&
      !isNonEmptyString(checkpoint.allocationId)
    ) {
      structuralReasons.push("MISSING_ALLOCATION_ID");
    }

    if (checkpoint.measurementStatus === "PARTIAL") {
      hasPartial = true;
      continue;
    }

    if (checkpoint.reviewSignal === "INCONCLUSIVE") {
      hasInconclusive = true;
      continue;
    }

    if (checkpoint.reviewSignal === "NO_CHANGE_INDICATED") {
      hasNoChange = true;
      continue;
    }

    const action = actionForSignal(checkpoint.reviewSignal);
    if (action) actions.add(action);
  }

  if (structuralReasons.length > 0) {
    return blocked(input, structuralReasons, evidenceRefs);
  }

  if (hasPartial || hasInconclusive) {
    const reasons: StrategicCampaignSteeringReasonCodeV1[] = [];
    if (hasPartial) reasons.push("PARTIAL_MEASUREMENT");
    if (hasInconclusive) reasons.push("INCONCLUSIVE_EVIDENCE");
    return baseResult(input, "WAITING", "WAIT_FOR_EVIDENCE", reasons, evidenceRefs);
  }

  if ((hasNoChange && actions.size > 0) || actions.size > 1) {
    return blocked(input, ["CONFLICTING_STEERING_SIGNALS"], evidenceRefs);
  }

  if (actions.size === 1) {
    const action = [...actions][0];
    return baseResult(input, "READY", action, [reasonForAction(action)], evidenceRefs);
  }

  if (hasNoChange) {
    return baseResult(input, "READY", "CONTINUE_OBSERVING", ["NO_CHANGE_EVIDENCE"], evidenceRefs);
  }

  return baseResult(input, "WAITING", "WAIT_FOR_EVIDENCE", ["INCONCLUSIVE_EVIDENCE"], evidenceRefs);
}
