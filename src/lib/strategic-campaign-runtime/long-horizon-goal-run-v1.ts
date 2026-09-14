import { createHash } from "node:crypto";

export type GoalRunState = "DRAFT" | "ACTIVE" | "WAITING" | "SUCCEEDED" | "KILLED";
export type BoundaryOperator = "gte" | "lte" | "eq";

export type GoalBoundaryV1 = {
  metric: string;
  operator: BoundaryOperator;
  value: number;
};

export type WakeConditionV1 = {
  kind: "AT_TIME" | "ON_SIGNAL" | "ON_DEPENDENCY";
  value: string;
};

export type GoalPlanV1 = {
  version: number;
  objective: string;
  steps: readonly string[];
  revisedAt: string;
  revisionReason: string;
};

export type GoalRunEventV1 = {
  sequence: number;
  at: string;
  type: "CREATED" | "TRANSITIONED" | "PLAN_REVISED" | "STEERED";
  actor: string;
  detail: Readonly<Record<string, unknown>>;
};

export type LongHorizonGoalRunV1 = {
  id: string;
  dedupKey: string;
  owner: string;
  objective: string;
  state: GoalRunState;
  planVersion: number;
  plans: readonly GoalPlanV1[];
  steeringHistory: readonly Readonly<Record<string, unknown>>[];
  history: readonly GoalRunEventV1[];
  successConditions: readonly GoalBoundaryV1[];
  killConditions: readonly GoalBoundaryV1[];
  wakeCondition: WakeConditionV1 | null;
  terminalReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateGoalRunInputV1 = {
  owner: string;
  objective: string;
  initialPlan: readonly string[];
  successConditions: readonly GoalBoundaryV1[];
  killConditions: readonly GoalBoundaryV1[];
  sourceRef?: string;
  createdAt: string;
};

export class GoalRunContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GoalRunContractError";
  }
}

const TRANSITIONS: Readonly<Record<GoalRunState, readonly GoalRunState[]>> = {
  DRAFT: ["ACTIVE", "KILLED"],
  ACTIVE: ["WAITING", "SUCCEEDED", "KILLED"],
  WAITING: ["ACTIVE", "SUCCEEDED", "KILLED"],
  SUCCEEDED: [],
  KILLED: []
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
}

function goalIdentity(input: Pick<CreateGoalRunInputV1, "owner" | "objective">): string {
  return createHash("sha256").update(JSON.stringify({ owner: normalize(input.owner), objective: normalize(input.objective) })).digest("hex");
}

function event(run: LongHorizonGoalRunV1, at: string, type: GoalRunEventV1["type"], actor: string, detail: Record<string, unknown>): GoalRunEventV1 {
  return freeze({ sequence: run.history.length + 1, at, type, actor, detail: clone(detail) }) as GoalRunEventV1;
}

function next(run: LongHorizonGoalRunV1, values: Partial<LongHorizonGoalRunV1>, nextEvent: GoalRunEventV1): LongHorizonGoalRunV1 {
  return freeze({ ...clone(run), ...clone(values), history: [...run.history, nextEvent] }) as LongHorizonGoalRunV1;
}

export function createLongHorizonGoalRunV1(
  input: CreateGoalRunInputV1,
  existing: readonly LongHorizonGoalRunV1[] = []
): LongHorizonGoalRunV1 {
  const snapshot = clone(input);
  if (!snapshot.owner.trim()) throw new GoalRunContractError("OWNER_REQUIRED", "Campaign owner is required");
  if (!snapshot.objective.trim()) throw new GoalRunContractError("OBJECTIVE_REQUIRED", "Campaign objective is required");
  if (snapshot.initialPlan.length === 0) throw new GoalRunContractError("PLAN_REQUIRED", "Initial plan requires at least one step");
  const dedupKey = goalIdentity(snapshot);
  if (existing.some((run) => run.dedupKey === dedupKey)) {
    throw new GoalRunContractError("DUPLICATE_CAMPAIGN", "An equivalent owner/objective campaign already exists");
  }
  const id = `campaign_${dedupKey.slice(0, 20)}`;
  const plan: GoalPlanV1 = freeze({ version: 1, objective: snapshot.objective.trim(), steps: [...snapshot.initialPlan], revisedAt: snapshot.createdAt, revisionReason: "INITIAL_PLAN" }) as GoalPlanV1;
  const created: LongHorizonGoalRunV1 = {
    id,
    dedupKey,
    owner: snapshot.owner.trim(),
    objective: snapshot.objective.trim(),
    state: "DRAFT",
    planVersion: 1,
    plans: [plan],
    steeringHistory: [],
    history: [],
    successConditions: snapshot.successConditions,
    killConditions: snapshot.killConditions,
    wakeCondition: null,
    terminalReason: null,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt
  };
  created.history = [freeze({ sequence: 1, at: snapshot.createdAt, type: "CREATED", actor: snapshot.owner.trim(), detail: { sourceRef: snapshot.sourceRef ?? null } }) as GoalRunEventV1];
  return freeze(created) as LongHorizonGoalRunV1;
}

export function transitionGoalRunV1(
  run: LongHorizonGoalRunV1,
  target: GoalRunState,
  input: { actor: string; at: string; reason?: string; wakeCondition?: WakeConditionV1 }
): LongHorizonGoalRunV1 {
  if (!TRANSITIONS[run.state].includes(target)) {
    throw new GoalRunContractError("INVALID_TRANSITION", `Cannot transition ${run.state} to ${target}`);
  }
  if (target === "WAITING" && (!input.wakeCondition?.value.trim())) {
    throw new GoalRunContractError("WAKE_CONDITION_REQUIRED", "WAITING requires a concrete wake condition");
  }
  if ((target === "KILLED" || target === "SUCCEEDED") && !input.reason?.trim()) {
    throw new GoalRunContractError("TERMINAL_REASON_REQUIRED", "Terminal transitions require a reason");
  }
  const detail = { from: run.state, to: target, reason: input.reason ?? null, wakeCondition: input.wakeCondition ?? null };
  return next(run, {
    state: target,
    wakeCondition: target === "WAITING" ? clone(input.wakeCondition!) : null,
    terminalReason: target === "KILLED" || target === "SUCCEEDED" ? input.reason!.trim() : null,
    updatedAt: input.at
  }, event(run, input.at, "TRANSITIONED", input.actor, detail));
}

export function reviseGoalRunPlanV1(
  run: LongHorizonGoalRunV1,
  input: { actor: string; at: string; objective?: string; steps: readonly string[]; reason: string }
): LongHorizonGoalRunV1 {
  if (run.state === "SUCCEEDED" || run.state === "KILLED") throw new GoalRunContractError("TERMINAL_IMMUTABLE", "Terminal campaigns cannot be revised");
  if (!input.reason.trim()) throw new GoalRunContractError("REVISION_REASON_REQUIRED", "Plan revision requires an explicit reason");
  if (input.steps.length === 0) throw new GoalRunContractError("PLAN_REQUIRED", "Revised plan requires at least one step");
  const version = run.planVersion + 1;
  const plan: GoalPlanV1 = freeze({ version, objective: input.objective?.trim() || run.objective, steps: [...input.steps], revisedAt: input.at, revisionReason: input.reason.trim() }) as GoalPlanV1;
  return next(run, { planVersion: version, plans: [...run.plans, plan], objective: plan.objective, updatedAt: input.at }, event(run, input.at, "PLAN_REVISED", input.actor, { version, reason: input.reason.trim() }));
}

export function steerGoalRunV1(run: LongHorizonGoalRunV1, input: { actor: string; at: string; instruction: string; rationale: string }): LongHorizonGoalRunV1 {
  if (!input.instruction.trim() || !input.rationale.trim()) throw new GoalRunContractError("STEERING_DETAILS_REQUIRED", "Steering requires instruction and rationale");
  const steering = freeze({ sequence: run.steeringHistory.length + 1, actor: input.actor, at: input.at, instruction: input.instruction.trim(), rationale: input.rationale.trim() });
  return next(run, { steeringHistory: [...run.steeringHistory, steering], updatedAt: input.at }, event(run, input.at, "STEERED", input.actor, { instruction: input.instruction.trim(), rationale: input.rationale.trim() }));
}

function met(condition: GoalBoundaryV1, facts: Readonly<Record<string, number>>): boolean {
  const actual = facts[condition.metric];
  if (!Number.isFinite(actual)) return false;
  if (condition.operator === "gte") return actual >= condition.value;
  if (condition.operator === "lte") return actual <= condition.value;
  return actual === condition.value;
}

export function evaluateGoalRunBoundariesV1(run: LongHorizonGoalRunV1, facts: Readonly<Record<string, number>>): "KILL" | "SUCCESS" | "CONTINUE" {
  if (run.killConditions.some((condition) => met(condition, facts))) return "KILL";
  if (run.successConditions.length > 0 && run.successConditions.every((condition) => met(condition, facts))) return "SUCCESS";
  return "CONTINUE";
}
