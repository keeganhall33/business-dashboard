import { createHash } from "node:crypto";

const SOURCES = ["GA4", "META", "WOO"];
const CONFIDENCE_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const SAFE_OPERATIONS = new Set(["SET_BUDGET", "SET_STATUS"]);
const FORBIDDEN_OPERATIONS = new Set(["CHANGE_CREATIVE", "CHANGE_CATALOG", "CHANGE_DESTINATION", "CHANGE_BILLING", "CHANGE_PERMISSIONS"]);
const SAFE_STATUSES = new Set(["ACTIVE", "PAUSED"]);

export class MetaAutopilotPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MetaAutopilotPolicyError";
    this.code = code;
  }
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new MetaAutopilotPolicyError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function timestamp(value, label) {
  const normalized = required(value, label);
  if (!Number.isFinite(Date.parse(normalized))) throw new MetaAutopilotPolicyError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  return new Date(Date.parse(normalized)).toISOString();
}

function number(value, label, minimum = 0) {
  const normalized = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isFinite(normalized) || normalized < minimum) {
    throw new MetaAutopilotPolicyError("INVALID_NUMBER", `${label} must be a finite number of at least ${minimum}`);
  }
  return normalized;
}

function sortedUnique(values, label) {
  if (!Array.isArray(values) || values.length === 0) throw new MetaAutopilotPolicyError("REQUIRED_LIST", `${label} requires at least one item`);
  if (values.length > 50) throw new MetaAutopilotPolicyError("BOUND_EXCEEDED", `${label} exceeds 50 items`);
  return [...new Set(values.map((value) => required(value, label)))].sort((a, b) => a.localeCompare(b));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function validateEvidence(evidence, now, maxEvidenceAgeHours) {
  if (!Array.isArray(evidence)) throw new MetaAutopilotPolicyError("EVIDENCE_REQUIRED", "Evidence must be an array");
  const bySource = new Map();
  for (const item of evidence) {
    const source = required(item?.source, "evidence source").toUpperCase();
    if (!SOURCES.includes(source)) continue;
    if (bySource.has(source)) throw new MetaAutopilotPolicyError("CONFLICTED_EVIDENCE", `Multiple ${source} evidence records are not allowed`);
    const state = required(item.state, `${source} state`).toUpperCase();
    if (state !== "AVAILABLE") throw new MetaAutopilotPolicyError("EVIDENCE_NOT_AVAILABLE", `${source} evidence is ${state}`);
    if (item.conflicted === true) throw new MetaAutopilotPolicyError("CONFLICTED_EVIDENCE", `${source} evidence is conflicted`);
    const confidence = required(item.confidence, `${source} confidence`).toUpperCase();
    if (!(confidence in CONFIDENCE_RANK) || CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK.MEDIUM) {
      throw new MetaAutopilotPolicyError("INSUFFICIENT_CONFIDENCE", `${source} evidence confidence is insufficient`);
    }
    const observedAt = timestamp(item.observedAt, `${source} observedAt`);
    if (Date.parse(now) - Date.parse(observedAt) > maxEvidenceAgeHours * 3_600_000) {
      throw new MetaAutopilotPolicyError("STALE_EVIDENCE", `${source} evidence is stale`);
    }
    const evidenceRefs = sortedUnique(item.evidenceRefs, `${source} evidenceRefs`);
    bySource.set(source, { source, state: "AVAILABLE", confidence, observedAt, evidenceRefs });
  }
  const missing = SOURCES.filter((source) => !bySource.has(source));
  if (missing.length) throw new MetaAutopilotPolicyError("MISSING_REQUIRED_SOURCE", `Missing required evidence: ${missing.join(", ")}`);
  return SOURCES.map((source) => bySource.get(source));
}

export function compileMetaAutopilotSimulationV1(input, options) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new MetaAutopilotPolicyError("INVALID_INPUT", "Input must be an object");
  const now = timestamp(options?.now, "now");
  const maxEvidenceAgeHours = options?.maxEvidenceAgeHours ?? 48;
  if (!Number.isFinite(maxEvidenceAgeHours) || maxEvidenceAgeHours <= 0 || maxEvidenceAgeHours > 168) {
    throw new MetaAutopilotPolicyError("INVALID_BOUND", "maxEvidenceAgeHours must be between 0 and 168");
  }
  const operation = required(input.operation, "operation").toUpperCase();
  if (FORBIDDEN_OPERATIONS.has(operation)) throw new MetaAutopilotPolicyError("OPERATION_FORBIDDEN", `${operation} is disabled`);
  if (!SAFE_OPERATIONS.has(operation)) throw new MetaAutopilotPolicyError("OPERATION_UNSUPPORTED", `${operation} is unsupported`);
  const objectType = required(input.target?.objectType, "target objectType").toLowerCase();
  if (!new Set(["campaign", "adset"]).has(objectType)) throw new MetaAutopilotPolicyError("OBJECT_TYPE_UNSUPPORTED", "Only campaign and ad-set simulations are supported");
  const objectId = required(input.target?.objectId, "target objectId");
  const evidence = validateEvidence(input.evidence, now, maxEvidenceAgeHours);
  const beforeState = input.beforeState;
  const proposedState = input.proposedState;
  if (!beforeState || !proposedState || typeof beforeState !== "object" || typeof proposedState !== "object") {
    throw new MetaAutopilotPolicyError("STATE_REQUIRED", "Before and proposed state are required");
  }
  const beforeTotal = number(input.accountTotalBudgetBefore, "accountTotalBudgetBefore");
  const afterTotal = number(input.accountTotalBudgetAfter, "accountTotalBudgetAfter");
  if (beforeTotal !== afterTotal) throw new MetaAutopilotPolicyError("TOTAL_BUDGET_CHANGE_FORBIDDEN", "Simulation must preserve total account budget");

  let mutation;
  let rollback;
  if (operation === "SET_BUDGET") {
    const field = required(input.budgetField, "budgetField");
    if (!new Set(["daily_budget", "lifetime_budget"]).has(field)) throw new MetaAutopilotPolicyError("BUDGET_FIELD_UNSUPPORTED", "Budget field is unsupported");
    const before = number(beforeState[field], `beforeState.${field}`, Number.EPSILON);
    const after = number(proposedState[field], `proposedState.${field}`, Number.EPSILON);
    const adjustmentPercent = ((after - before) / before) * 100;
    if (Math.abs(adjustmentPercent) > 20 + Number.EPSILON) throw new MetaAutopilotPolicyError("BUDGET_ADJUSTMENT_EXCEEDS_LIMIT", "A simulated budget adjustment cannot exceed 20%");
    mutation = { [field]: proposedState[field], adjustmentPercent };
    rollback = { [field]: beforeState[field] };
  } else {
    const before = required(beforeState.status, "beforeState.status").toUpperCase();
    const after = required(proposedState.status, "proposedState.status").toUpperCase();
    if (!SAFE_STATUSES.has(before) || !SAFE_STATUSES.has(after)) throw new MetaAutopilotPolicyError("STATUS_UNSUPPORTED", "Status must be ACTIVE or PAUSED");
    if (before === after) throw new MetaAutopilotPolicyError("NO_CHANGE", "Simulation must propose a material change");
    mutation = { status: after };
    rollback = { status: before };
  }

  const measurementStart = timestamp(input.measurementWindow?.startAt, "measurementWindow.startAt");
  const measurementEnd = timestamp(input.measurementWindow?.endAt, "measurementWindow.endAt");
  if (Date.parse(measurementEnd) <= Date.parse(measurementStart)) throw new MetaAutopilotPolicyError("INVALID_MEASUREMENT_WINDOW", "Measurement window end must follow start");
  const stopConditions = sortedUnique(input.stopConditions, "stopConditions");
  const rationale = required(input.rationale, "rationale");
  const expectedUpside = required(input.expectedUpside, "expectedUpside");
  const downside = required(input.downside, "downside");
  const identity = { objectType, objectId, operation, mutation, evidence, rationale, expectedUpside, downside, measurementStart, measurementEnd, stopConditions };
  const idempotencyKey = createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex");

  return freeze({
    contractVersion: "MetaAutopilotSimulationV1",
    proposalId: `meta_sim_${idempotencyKey.slice(0, 20)}`,
    idempotencyKey,
    mode: "SIMULATION_ONLY",
    status: "SIMULATION_READY",
    target: { objectType, objectId },
    operation,
    mutation,
    evidence,
    rationale,
    expectedUpside,
    downside,
    measurementWindow: { startAt: measurementStart, endAt: measurementEnd },
    stopConditions,
    rollbackMetadata: { reversible: true, restore: rollback },
    accountTotalBudget: beforeTotal,
    approvalRequired: true,
    approvalClass: "KEEGAN",
    liveWritesEnabled: false,
    credentialsAccessed: false,
    externalCallsPerformed: 0,
    writesPerformed: 0
  });
}
