import { createHash } from "node:crypto";

const REQUIRED_SOURCES = ["GA4", "META", "WOO"];
const SAFE_OPERATIONS = new Set(["SET_BUDGET", "SET_STATUS"]);
const SAFE_STATUSES = new Set(["ACTIVE", "PAUSED"]);

export class MetaAutopilotReviewBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MetaAutopilotReviewBridgeError";
    this.code = code;
  }
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new MetaAutopilotReviewBridgeError("REQUIRED_FIELD", `${label} is required`);
  return value.trim();
}

function number(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new MetaAutopilotReviewBridgeError("INVALID_NUMBER", `${label} must be finite`);
  return value;
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

function validateEvidence(evidence) {
  if (!Array.isArray(evidence) || evidence.length !== REQUIRED_SOURCES.length) {
    throw new MetaAutopilotReviewBridgeError("EVIDENCE_INCOMPLETE", "Exactly one Meta, GA4, and Woo evidence record is required");
  }
  const bySource = new Map();
  for (const item of evidence) {
    const source = required(item?.source, "evidence source").toUpperCase();
    if (!REQUIRED_SOURCES.includes(source) || bySource.has(source)) {
      throw new MetaAutopilotReviewBridgeError("EVIDENCE_CONFLICT", "Evidence sources must be unique Meta, GA4, and Woo records");
    }
    if (item.state !== "AVAILABLE" || !["MEDIUM", "HIGH"].includes(item.confidence)) {
      throw new MetaAutopilotReviewBridgeError("EVIDENCE_NOT_REVIEWABLE", `${source} evidence is not current and reviewable`);
    }
    const observedAt = required(item.observedAt, `${source} observedAt`);
    if (!Number.isFinite(Date.parse(observedAt))) throw new MetaAutopilotReviewBridgeError("INVALID_TIMESTAMP", `${source} observedAt is invalid`);
    if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) {
      throw new MetaAutopilotReviewBridgeError("EVIDENCE_INCOMPLETE", `${source} evidence references are required`);
    }
    bySource.set(source, {
      source,
      state: "AVAILABLE",
      confidence: item.confidence,
      observedAt: new Date(Date.parse(observedAt)).toISOString(),
      evidenceRefs: [...new Set(item.evidenceRefs.map((ref) => required(ref, `${source} evidenceRef`)))].sort()
    });
  }
  return REQUIRED_SOURCES.map((source) => bySource.get(source));
}

function proposedState(simulation) {
  if (simulation.operation === "SET_BUDGET") {
    const fields = Object.keys(simulation.mutation ?? {}).filter((field) => field !== "adjustmentPercent");
    if (fields.length !== 1 || !["daily_budget", "lifetime_budget"].includes(fields[0])) {
      throw new MetaAutopilotReviewBridgeError("MALFORMED_MUTATION", "Budget simulation must contain exactly one supported budget field");
    }
    const field = fields[0];
    const before = number(simulation.rollbackMetadata?.restore?.[field], `rollback ${field}`);
    const after = number(simulation.mutation[field], `proposed ${field}`);
    const expectedPercent = ((after - before) / before) * 100;
    const suppliedPercent = number(simulation.mutation.adjustmentPercent, "adjustmentPercent");
    if (before <= 0 || after <= 0 || Math.abs(expectedPercent - suppliedPercent) > 1e-9 || Math.abs(expectedPercent) > 20 + Number.EPSILON) {
      throw new MetaAutopilotReviewBridgeError("ROLLBACK_OR_BOUND_MISMATCH", "Budget mutation, rollback, and 20% bound do not agree");
    }
    return { beforeState: { [field]: before }, proposedState: { [field]: after } };
  }
  if (simulation.operation === "SET_STATUS") {
    const before = required(simulation.rollbackMetadata?.restore?.status, "rollback status").toUpperCase();
    const after = required(simulation.mutation?.status, "proposed status").toUpperCase();
    if (!SAFE_STATUSES.has(before) || !SAFE_STATUSES.has(after) || before === after) {
      throw new MetaAutopilotReviewBridgeError("ROLLBACK_OR_BOUND_MISMATCH", "Status mutation and rollback do not form a supported reversible change");
    }
    return { beforeState: { status: before }, proposedState: { status: after } };
  }
  throw new MetaAutopilotReviewBridgeError("OPERATION_FORBIDDEN", "Only budget and status simulations can enter review mode");
}

export function compileMetaAutopilotReviewInputV1(simulation, options = {}) {
  if (!simulation || typeof simulation !== "object" || Array.isArray(simulation)) {
    throw new MetaAutopilotReviewBridgeError("INVALID_INPUT", "Simulation must be an object");
  }
  if (simulation.contractVersion !== "MetaAutopilotSimulationV1" || simulation.mode !== "SIMULATION_ONLY" || simulation.status !== "SIMULATION_READY") {
    throw new MetaAutopilotReviewBridgeError("SIMULATION_NOT_READY", "Only a ready MetaAutopilotSimulationV1 can enter review mode");
  }
  if (simulation.executionState || simulation.liveWritesEnabled !== false || simulation.credentialsAccessed !== false || simulation.externalCallsPerformed !== 0 || simulation.writesPerformed !== 0) {
    throw new MetaAutopilotReviewBridgeError("LIVE_AUTHORITY_FORBIDDEN", "Simulation must contain no live authority, execution, credential access, calls, or writes");
  }
  const operation = required(simulation.operation, "operation").toUpperCase();
  if (!SAFE_OPERATIONS.has(operation)) throw new MetaAutopilotReviewBridgeError("OPERATION_FORBIDDEN", "Operation cannot enter review mode");
  const objectType = required(simulation.target?.objectType, "target objectType").toLowerCase();
  const objectId = required(simulation.target?.objectId, "target objectId");
  if (!new Set(["campaign", "adset"]).has(objectType)) throw new MetaAutopilotReviewBridgeError("TARGET_UNSUPPORTED", "Target must be a campaign or ad set");
  if (options.expectedTarget && (options.expectedTarget.objectType !== objectType || options.expectedTarget.objectId !== objectId)) {
    throw new MetaAutopilotReviewBridgeError("TARGET_MOVED", "Simulation target differs from the expected review target");
  }
  const accountTotalBudget = number(simulation.accountTotalBudget, "accountTotalBudget");
  if (options.expectedAccountTotalBudget != null && accountTotalBudget !== options.expectedAccountTotalBudget) {
    throw new MetaAutopilotReviewBridgeError("TOTAL_BUDGET_MISMATCH", "Account total budget changed after simulation");
  }
  if (simulation.approvalRequired !== true || simulation.approvalClass !== "KEEGAN") {
    throw new MetaAutopilotReviewBridgeError("APPROVAL_BOUNDARY_WEAKENED", "Simulation must require Keegan approval");
  }
  if (simulation.rollbackMetadata?.reversible !== true) {
    throw new MetaAutopilotReviewBridgeError("ROLLBACK_REQUIRED", "A reversible rollback is required");
  }
  const evidence = validateEvidence(simulation.evidence);
  const states = proposedState({ ...simulation, operation });
  const simulationKey = required(simulation.idempotencyKey, "simulation idempotencyKey");
  const proposer = required(options.proposer ?? "META_AUTOPILOT_POLICY_V1", "proposer");
  const identity = { simulationKey, objectType, objectId, operation, evidence, ...states, accountTotalBudget };
  const bridgeFingerprint = createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex");
  const confidence = evidence.every((item) => item.confidence === "HIGH") ? "HIGH" : "MEDIUM";

  return freeze({
    contractVersion: "MetaAutopilotReviewInputV1",
    simulationId: required(simulation.proposalId, "simulation proposalId"),
    bridgeFingerprint,
    reviewInput: {
      objectType,
      objectId,
      proposedState: states.proposedState,
      rationale: required(simulation.rationale, "rationale"),
      supportingMetrics: {
        operation,
        evidence,
        expectedUpside: required(simulation.expectedUpside, "expectedUpside"),
        downside: required(simulation.downside, "downside"),
        measurementWindow: simulation.measurementWindow,
        stopConditions: [...simulation.stopConditions],
        rollbackMetadata: simulation.rollbackMetadata,
        accountTotalBudget,
        simulationIdempotencyKey: simulationKey
      },
      confidence,
      riskTier: "BOUNDED_REVIEW",
      proposer,
      idempotencyKey: `meta_review_${bridgeFingerprint}`
    },
    beforeStateEvidence: states.beforeState,
    approvalRequired: true,
    approvalClass: "KEEGAN",
    executionMode: "DRY_RUN_ONLY",
    liveWritesEnabled: false,
    credentialsAccessed: false,
    externalCallsPerformed: 0,
    approvalsPerformed: 0,
    writesPerformed: 0
  });
}
