export type OwnershipTruthStateV1 = "KNOWN" | "UNKNOWN" | "STALE" | "CONFLICTED";

export type OwnershipIssueClassV1 =
  | "DELAYED_FULFILLMENT"
  | "VIP_SERVICE_EXCEPTION"
  | "REFUND_REPLACEMENT_FRICTION"
  | "DELIVERY_UNCERTAINTY"
  | "ROUTINE_SERVICE";

export type OwnershipSeverityV1 = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type OwnershipResolutionStateV1 = "OPEN" | "RESOLVED";
export type OwnershipValueContextV1 = "VIP" | "HIGH_VALUE" | "STANDARD";

export type OwnershipApprovalClassV1 =
  | "AUTO_EXECUTE_SAFE"
  | "PREPARE_FOR_APPROVAL"
  | "KEEGAN_APPROVAL_REQUIRED";

export type OwnershipSafeActionV1 =
  | "VERIFY_FULFILLMENT_EVIDENCE"
  | "PREPARE_VIP_SERVICE_REVIEW"
  | "PREPARE_REFUND_REPLACEMENT_REVIEW"
  | "VERIFY_DELIVERY_STATE"
  | "REVIEW_ROUTINE_SERVICE"
  | "VERIFY_RESOLUTION_EVIDENCE";

export type OwnershipLearningMetricV1 =
  | "FULFILLMENT_DELAY_DAYS"
  | "SERVICE_RECOVERY_TIME_DAYS"
  | "REFUND_REPLACEMENT_FRICTION_DAYS"
  | "DELIVERY_VERIFICATION_LAG_DAYS"
  | "OWNERSHIP_EXCEPTION_AGE_DAYS";

export type OwnershipExperienceExceptionV1 = {
  id: string;
  orderRef: string;
  customerRef: string;
  projectRef?: string | null;
  issueClass: OwnershipIssueClassV1;
  severity: OwnershipSeverityV1;
  openedAt: string;
  expectedBy?: string | null;
  evidenceTruthState: OwnershipTruthStateV1;
  evidenceRefs: readonly string[];
  resolutionState: OwnershipResolutionStateV1;
  resolutionTruthState: OwnershipTruthStateV1;
  resolutionEvidenceRefs: readonly string[];
  valueContext: OwnershipValueContextV1;
  nextSafeAction: OwnershipSafeActionV1;
  approvalClass: OwnershipApprovalClassV1;
  learningMetric: OwnershipLearningMetricV1;
};

export type OwnershipExceptionQueueItemV1 = {
  id: string;
  orderRef: string;
  customerRef: string;
  projectRef: string | null;
  issueClass: OwnershipIssueClassV1;
  severity: OwnershipSeverityV1;
  truthState: OwnershipTruthStateV1;
  valueContext: OwnershipValueContextV1;
  effectiveStatus: "OPEN" | "NEEDS_VERIFICATION";
  ageDays: number;
  expectationGapDays: number | null;
  priorityScore: number;
  priorityFactors: {
    severity: number;
    issueClass: number;
    age: number;
    expectationGap: number;
    evidenceRisk: number;
    valueContext: number;
  };
  whatChanged: string;
  whyItMatters: string;
  nextBestAction: OwnershipSafeActionV1;
  approvalClass: OwnershipApprovalClassV1;
  learningMetric: OwnershipLearningMetricV1;
  evidenceRefs: string[];
  resolutionEvidenceRefs: string[];
};

export type OwnershipExceptionQueueV1 = {
  generatedAt: string;
  activeCount: number;
  suppressedResolvedCount: number;
  items: OwnershipExceptionQueueItemV1[];
};

const DAY_MS = 86_400_000;

const ISSUE_CLASSES = new Set<OwnershipIssueClassV1>([
  "DELAYED_FULFILLMENT",
  "VIP_SERVICE_EXCEPTION",
  "REFUND_REPLACEMENT_FRICTION",
  "DELIVERY_UNCERTAINTY",
  "ROUTINE_SERVICE"
]);
const SEVERITIES = new Set<OwnershipSeverityV1>(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const TRUTH_STATES = new Set<OwnershipTruthStateV1>(["KNOWN", "UNKNOWN", "STALE", "CONFLICTED"]);
const RESOLUTION_STATES = new Set<OwnershipResolutionStateV1>(["OPEN", "RESOLVED"]);
const VALUE_CONTEXTS = new Set<OwnershipValueContextV1>(["VIP", "HIGH_VALUE", "STANDARD"]);
const APPROVAL_CLASSES = new Set<OwnershipApprovalClassV1>([
  "AUTO_EXECUTE_SAFE",
  "PREPARE_FOR_APPROVAL",
  "KEEGAN_APPROVAL_REQUIRED"
]);
const SAFE_ACTIONS = new Set<OwnershipSafeActionV1>([
  "VERIFY_FULFILLMENT_EVIDENCE",
  "PREPARE_VIP_SERVICE_REVIEW",
  "PREPARE_REFUND_REPLACEMENT_REVIEW",
  "VERIFY_DELIVERY_STATE",
  "REVIEW_ROUTINE_SERVICE",
  "VERIFY_RESOLUTION_EVIDENCE"
]);
const LEARNING_METRICS = new Set<OwnershipLearningMetricV1>([
  "FULFILLMENT_DELAY_DAYS",
  "SERVICE_RECOVERY_TIME_DAYS",
  "REFUND_REPLACEMENT_FRICTION_DAYS",
  "DELIVERY_VERIFICATION_LAG_DAYS",
  "OWNERSHIP_EXCEPTION_AGE_DAYS"
]);

const SEVERITY_WEIGHT: Record<OwnershipSeverityV1, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100
};
const ISSUE_WEIGHT: Record<OwnershipIssueClassV1, number> = {
  VIP_SERVICE_EXCEPTION: 90,
  REFUND_REPLACEMENT_FRICTION: 85,
  DELAYED_FULFILLMENT: 80,
  DELIVERY_UNCERTAINTY: 75,
  ROUTINE_SERVICE: 10
};
const TRUTH_RISK_WEIGHT: Record<OwnershipTruthStateV1, number> = {
  CONFLICTED: 55,
  UNKNOWN: 45,
  STALE: 35,
  KNOWN: 0
};
const VALUE_WEIGHT: Record<OwnershipValueContextV1, number> = {
  VIP: 50,
  HIGH_VALUE: 25,
  STANDARD: 0
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value == null) return null;
  return requiredString(value, label);
}

function enumValue<T extends string>(value: unknown, values: Set<T>, label: string): T {
  if (typeof value !== "string" || !values.has(value as T)) throw new Error(`${label} is unsupported`);
  return value as T;
}

function timestamp(value: unknown, label: string): number {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp`);
  return parsed;
}

function evidenceRefs(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const normalized = value.map((entry, index) => requiredString(entry, `${label}[${index}]`));
  if (!allowEmpty && normalized.length === 0) throw new Error(`${label} must not be empty`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates`);
  return normalized;
}

function floorDays(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("time delta must be non-negative and finite");
  return Math.floor(deltaMs / DAY_MS);
}

function validateException(value: unknown, nowMs: number): OwnershipExperienceExceptionV1 {
  if (!isPlainObject(value)) throw new Error("exception must be a plain object");
  const allowed = new Set([
    "id",
    "orderRef",
    "customerRef",
    "projectRef",
    "issueClass",
    "severity",
    "openedAt",
    "expectedBy",
    "evidenceTruthState",
    "evidenceRefs",
    "resolutionState",
    "resolutionTruthState",
    "resolutionEvidenceRefs",
    "valueContext",
    "nextSafeAction",
    "approvalClass",
    "learningMetric"
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`exception contains unsupported keys: ${unknown.join(", ")}`);

  const openedAtMs = timestamp(value.openedAt, "openedAt");
  if (openedAtMs > nowMs) throw new Error("openedAt cannot be in the future");
  if (value.expectedBy != null) timestamp(value.expectedBy, "expectedBy");

  const resolutionState = enumValue(value.resolutionState, RESOLUTION_STATES, "resolutionState");
  const resolutionTruthState = enumValue(value.resolutionTruthState, TRUTH_STATES, "resolutionTruthState");
  const resolutionRefs = evidenceRefs(value.resolutionEvidenceRefs, "resolutionEvidenceRefs", resolutionState === "OPEN");
  if (resolutionState === "RESOLVED" && resolutionRefs.length === 0) {
    throw new Error("resolved exceptions require resolution evidence");
  }

  return {
    id: requiredString(value.id, "id"),
    orderRef: requiredString(value.orderRef, "orderRef"),
    customerRef: requiredString(value.customerRef, "customerRef"),
    projectRef: optionalString(value.projectRef, "projectRef"),
    issueClass: enumValue(value.issueClass, ISSUE_CLASSES, "issueClass"),
    severity: enumValue(value.severity, SEVERITIES, "severity"),
    openedAt: new Date(openedAtMs).toISOString(),
    expectedBy: value.expectedBy == null ? null : new Date(timestamp(value.expectedBy, "expectedBy")).toISOString(),
    evidenceTruthState: enumValue(value.evidenceTruthState, TRUTH_STATES, "evidenceTruthState"),
    evidenceRefs: evidenceRefs(value.evidenceRefs, "evidenceRefs", false),
    resolutionState,
    resolutionTruthState,
    resolutionEvidenceRefs: resolutionRefs,
    valueContext: enumValue(value.valueContext, VALUE_CONTEXTS, "valueContext"),
    nextSafeAction: enumValue(value.nextSafeAction, SAFE_ACTIONS, "nextSafeAction"),
    approvalClass: enumValue(value.approvalClass, APPROVAL_CLASSES, "approvalClass"),
    learningMetric: enumValue(value.learningMetric, LEARNING_METRICS, "learningMetric")
  };
}

function whatChanged(issueClass: OwnershipIssueClassV1, status: "OPEN" | "NEEDS_VERIFICATION"): string {
  if (status === "NEEDS_VERIFICATION") return "A previously resolved ownership issue no longer has current, trustworthy resolution evidence.";
  switch (issueClass) {
    case "DELAYED_FULFILLMENT":
      return "A fulfillment commitment is overdue or aging beyond the expected ownership timeline.";
    case "VIP_SERVICE_EXCEPTION":
      return "A high-value collector experience has an unresolved service exception.";
    case "REFUND_REPLACEMENT_FRICTION":
      return "A refund or replacement case remains unresolved and is creating service friction.";
    case "DELIVERY_UNCERTAINTY":
      return "Delivery evidence is incomplete, stale, or conflicting.";
    case "ROUTINE_SERVICE":
      return "A routine ownership-service issue remains open.";
  }
}

function whyItMatters(issueClass: OwnershipIssueClassV1, valueContext: OwnershipValueContextV1, status: "OPEN" | "NEEDS_VERIFICATION"): string {
  if (status === "NEEDS_VERIFICATION") return "Treating uncertain evidence as resolved could hide a real customer problem and distort retention or service learning.";
  const valuePrefix = valueContext === "VIP" ? "This involves a VIP collector, so " : valueContext === "HIGH_VALUE" ? "This involves a high-value customer, so " : "";
  switch (issueClass) {
    case "DELAYED_FULFILLMENT":
      return `${valuePrefix}continued delay can damage trust, retention, and the ownership experience.`;
    case "VIP_SERVICE_EXCEPTION":
      return `${valuePrefix}service quality can affect collector progression, advocacy, and relationship strength.`;
    case "REFUND_REPLACEMENT_FRICTION":
      return `${valuePrefix}unresolved recovery friction can increase churn, reputation risk, and support cost.`;
    case "DELIVERY_UNCERTAINTY":
      return `${valuePrefix}the business cannot safely conclude the ownership experience succeeded until delivery evidence is trustworthy.`;
    case "ROUTINE_SERVICE":
      return `${valuePrefix}the issue should be monitored without displacing materially higher-risk ownership exceptions.`;
  }
}

function toQueueItem(exception: OwnershipExperienceExceptionV1, nowMs: number): OwnershipExceptionQueueItemV1 {
  const openedAtMs = timestamp(exception.openedAt, "openedAt");
  const ageDays = floorDays(nowMs - openedAtMs);
  const expectationGapDays = exception.expectedBy == null
    ? null
    : Math.max(0, floorDays(Math.max(0, nowMs - timestamp(exception.expectedBy, "expectedBy"))));
  const needsVerification = exception.resolutionState === "RESOLVED" && exception.resolutionTruthState !== "KNOWN";
  const effectiveStatus = needsVerification ? "NEEDS_VERIFICATION" : "OPEN";
  const effectiveTruthState = needsVerification ? exception.resolutionTruthState : exception.evidenceTruthState;

  const factors = {
    severity: SEVERITY_WEIGHT[exception.severity],
    issueClass: ISSUE_WEIGHT[exception.issueClass],
    age: Math.min(ageDays, 60),
    expectationGap: Math.min(expectationGapDays ?? 0, 90) * 2,
    evidenceRisk: TRUTH_RISK_WEIGHT[effectiveTruthState],
    valueContext: VALUE_WEIGHT[exception.valueContext]
  };
  const priorityScore = Object.values(factors).reduce((sum, value) => sum + value, 0);

  return {
    id: exception.id,
    orderRef: exception.orderRef,
    customerRef: exception.customerRef,
    projectRef: exception.projectRef ?? null,
    issueClass: exception.issueClass,
    severity: exception.severity,
    truthState: effectiveTruthState,
    valueContext: exception.valueContext,
    effectiveStatus,
    ageDays,
    expectationGapDays,
    priorityScore,
    priorityFactors: factors,
    whatChanged: whatChanged(exception.issueClass, effectiveStatus),
    whyItMatters: whyItMatters(exception.issueClass, exception.valueContext, effectiveStatus),
    nextBestAction: needsVerification ? "VERIFY_RESOLUTION_EVIDENCE" : exception.nextSafeAction,
    approvalClass: exception.approvalClass,
    learningMetric: exception.learningMetric,
    evidenceRefs: [...exception.evidenceRefs],
    resolutionEvidenceRefs: [...exception.resolutionEvidenceRefs]
  };
}

export function buildOwnershipExperienceExceptionQueueV1(
  rawExceptions: readonly OwnershipExperienceExceptionV1[],
  options: { now?: Date } = {}
): OwnershipExceptionQueueV1 {
  if (!Array.isArray(rawExceptions)) throw new Error("exceptions must be an array");
  if (!isPlainObject(options)) throw new Error("options must be a plain object");
  const unknownOptions = Object.keys(options).filter((key) => key !== "now");
  if (unknownOptions.length > 0) throw new Error(`options contains unsupported keys: ${unknownOptions.join(", ")}`);

  const now = options.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("options.now must be a valid Date");
  const nowMs = now.getTime();

  const validated = rawExceptions.map((entry) => validateException(entry, nowMs));
  const ids = new Set<string>();
  for (const exception of validated) {
    if (ids.has(exception.id)) throw new Error(`duplicate exception id ${exception.id}`);
    ids.add(exception.id);
  }

  const suppressedResolvedCount = validated.filter(
    (exception) => exception.resolutionState === "RESOLVED" && exception.resolutionTruthState === "KNOWN"
  ).length;

  const items = validated
    .filter((exception) => !(exception.resolutionState === "RESOLVED" && exception.resolutionTruthState === "KNOWN"))
    .map((exception) => toQueueItem(exception, nowMs))
    .sort((left, right) =>
      right.priorityScore - left.priorityScore ||
      right.ageDays - left.ageDays ||
      left.id.localeCompare(right.id)
    );

  return {
    generatedAt: now.toISOString(),
    activeCount: items.length,
    suppressedResolvedCount,
    items
  };
}
