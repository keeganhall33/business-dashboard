import {
  GoalRunContractError,
  reviseGoalRunPlanV1,
  transitionGoalRunV1,
  type LongHorizonGoalRunV1,
  type WakeConditionV1
} from "@/lib/strategic-campaign-runtime/long-horizon-goal-run-v1";

export type CampaignWakeClassV1 = "EVENT" | "SCHEDULE" | "MANUAL" | "DEPENDENCY";
export type CampaignWakeOutcomeV1 = "RESUMED" | "PLAN_REVISED" | "NO_CHANGE" | "DUPLICATE";

export type CampaignWakeRecordV1 = {
  sequence: number;
  wakeId: string;
  wakeClass: CampaignWakeClassV1;
  triggerValue: string;
  actor: string;
  at: string;
  outcome: Exclude<CampaignWakeOutcomeV1, "DUPLICATE">;
  planVersion: number;
};

export type CampaignSteeringSnapshotV1 = {
  contractVersion: "CampaignSteeringSnapshotV1";
  run: LongHorizonGoalRunV1;
  completedStepIds: readonly string[];
  appliedWakeIds: readonly string[];
  wakeHistory: readonly CampaignWakeRecordV1[];
};

export type CampaignWaitInspectionV1 = {
  waiting: boolean;
  stale: boolean;
  reviewRequired: boolean;
  waitReason: string | null;
  wakeCondition: WakeConditionV1 | null;
  reviewAt: string | null;
};

export type CampaignWakeResultV1 = {
  outcome: CampaignWakeOutcomeV1;
  snapshot: CampaignSteeringSnapshotV1;
  pendingStepIds: readonly string[];
  replayedCompletedStepIds: readonly [];
  externalSideEffects: 0;
};

const MAX_WAKE_HISTORY = 100;
const MAX_COMPLETED_STEPS = 1_000;

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new GoalRunContractError("STEERING_INPUT_REQUIRED", `${label} is required`);
  return value.trim();
}

function timestamp(value: unknown, label: string): string {
  const normalized = required(value, label);
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) throw new GoalRunContractError("INVALID_TIMESTAMP", `${label} must be a valid timestamp`);
  return new Date(milliseconds).toISOString();
}

function unique(values: readonly string[], limit: number): string[] {
  const result = [...new Set(values.map((value) => required(value, "step identifier")))].sort((left, right) => left.localeCompare(right));
  if (result.length > limit) throw new GoalRunContractError("STEERING_LIMIT_EXCEEDED", `bounded list exceeds ${limit}`);
  return result;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function currentSteps(snapshot: CampaignSteeringSnapshotV1): readonly string[] {
  return snapshot.run.plans.find((plan) => plan.version === snapshot.run.planVersion)?.steps ?? [];
}

function pendingSteps(snapshot: CampaignSteeringSnapshotV1): string[] {
  const completed = new Set(snapshot.completedStepIds);
  return currentSteps(snapshot).filter((step) => !completed.has(step));
}

function wakeCondition(wakeClass: CampaignWakeClassV1, triggerValue: string): WakeConditionV1 {
  if (wakeClass === "SCHEDULE") return { kind: "AT_TIME", value: timestamp(triggerValue, "schedule trigger") };
  if (wakeClass === "DEPENDENCY") return { kind: "ON_DEPENDENCY", value: required(triggerValue, "dependency trigger") };
  if (wakeClass === "MANUAL") return { kind: "ON_SIGNAL", value: `manual:${required(triggerValue, "manual trigger")}` };
  return { kind: "ON_SIGNAL", value: required(triggerValue, "event trigger") };
}

function materialPlanChange(
  run: LongHorizonGoalRunV1,
  plan: { objective?: string; steps: readonly string[] } | undefined
): boolean {
  if (!plan) return false;
  const activePlan = run.plans.find((candidate) => candidate.version === run.planVersion);
  const objective = plan.objective?.trim() || run.objective;
  return objective !== run.objective || JSON.stringify(plan.steps) !== JSON.stringify(activePlan?.steps ?? []);
}

export function createCampaignSteeringSnapshotV1(
  run: LongHorizonGoalRunV1,
  completedStepIds: readonly string[] = []
): CampaignSteeringSnapshotV1 {
  return freeze({
    contractVersion: "CampaignSteeringSnapshotV1",
    run: clone(run),
    completedStepIds: unique(completedStepIds, MAX_COMPLETED_STEPS),
    appliedWakeIds: [],
    wakeHistory: []
  });
}

export function waitCampaignV1(
  snapshot: CampaignSteeringSnapshotV1,
  input: {
    actor: string;
    at: string;
    reason: string;
    wakeClass?: CampaignWakeClassV1;
    triggerValue?: string;
    reviewAt?: string;
  }
): CampaignSteeringSnapshotV1 {
  if (snapshot.run.state === "SUCCEEDED" || snapshot.run.state === "KILLED") {
    throw new GoalRunContractError("TERMINAL_IMMUTABLE", "Terminal campaigns cannot enter WAITING");
  }
  const reason = required(input.reason, "wait reason");
  const reviewAt = input.reviewAt ? timestamp(input.reviewAt, "reviewAt") : null;
  if (!reviewAt && (!input.wakeClass || !input.triggerValue)) {
    throw new GoalRunContractError("WAKE_CONDITION_REQUIRED", "WAITING requires a wake condition or review time");
  }
  const condition = input.wakeClass && input.triggerValue
    ? wakeCondition(input.wakeClass, input.triggerValue)
    : { kind: "AT_TIME" as const, value: reviewAt! };
  const run = transitionGoalRunV1(snapshot.run, "WAITING", {
    actor: required(input.actor, "actor"),
    at: timestamp(input.at, "at"),
    reason,
    wakeCondition: condition
  });
  const history = clone(run.history);
  const last = history.at(-1);
  if (last) last.detail = freeze({ ...last.detail, waitReason: reason, reviewAt });
  return freeze({ ...clone(snapshot), run: freeze({ ...clone(run), history }) });
}

export function inspectCampaignWaitV1(snapshot: CampaignSteeringSnapshotV1, now: string): CampaignWaitInspectionV1 {
  if (snapshot.run.state !== "WAITING") {
    return freeze({ waiting: false, stale: false, reviewRequired: false, waitReason: null, wakeCondition: null, reviewAt: null });
  }
  const transition = [...snapshot.run.history].reverse().find((event) => event.type === "TRANSITIONED" && event.detail.to === "WAITING");
  const reviewAt = typeof transition?.detail.reviewAt === "string" ? transition.detail.reviewAt : null;
  const waitReason = typeof transition?.detail.waitReason === "string" ? transition.detail.waitReason : null;
  const comparison = timestamp(now, "now");
  const stale = Boolean(reviewAt && Date.parse(comparison) >= Date.parse(reviewAt));
  return freeze({ waiting: true, stale, reviewRequired: stale, waitReason, wakeCondition: clone(snapshot.run.wakeCondition), reviewAt });
}

export function resumeCampaignSnapshotV1(snapshot: CampaignSteeringSnapshotV1): CampaignWakeResultV1 {
  if (snapshot.contractVersion !== "CampaignSteeringSnapshotV1") {
    throw new GoalRunContractError("SNAPSHOT_VERSION_UNSUPPORTED", "Campaign snapshot version is unsupported");
  }
  const normalized = freeze({
    ...clone(snapshot),
    completedStepIds: unique(snapshot.completedStepIds, MAX_COMPLETED_STEPS),
    appliedWakeIds: unique(snapshot.appliedWakeIds, MAX_WAKE_HISTORY),
    wakeHistory: clone(snapshot.wakeHistory).slice(-MAX_WAKE_HISTORY)
  });
  return freeze({
    outcome: "NO_CHANGE",
    snapshot: normalized,
    pendingStepIds: pendingSteps(normalized),
    replayedCompletedStepIds: [] as const,
    externalSideEffects: 0 as const
  });
}

export function wakeCampaignV1(
  snapshot: CampaignSteeringSnapshotV1,
  input: {
    wakeId: string;
    wakeClass: CampaignWakeClassV1;
    triggerValue: string;
    actor: string;
    at: string;
    plan?: { objective?: string; steps: readonly string[]; reason?: string };
  }
): CampaignWakeResultV1 {
  const wakeId = required(input.wakeId, "wakeId");
  if (snapshot.appliedWakeIds.includes(wakeId)) {
    return freeze({ outcome: "DUPLICATE", snapshot, pendingStepIds: pendingSteps(snapshot), replayedCompletedStepIds: [] as const, externalSideEffects: 0 as const });
  }
  if (snapshot.run.state === "SUCCEEDED" || snapshot.run.state === "KILLED") {
    throw new GoalRunContractError("TERMINAL_IMMUTABLE", "Terminal campaigns cannot be steered");
  }
  if (snapshot.run.state !== "WAITING") throw new GoalRunContractError("CAMPAIGN_NOT_WAITING", "Only a WAITING campaign can be woken");
  const trigger = wakeCondition(input.wakeClass, input.triggerValue);
  if (snapshot.run.wakeCondition?.kind !== trigger.kind || snapshot.run.wakeCondition.value !== trigger.value) {
    throw new GoalRunContractError("WAKE_CONDITION_NOT_MET", "Wake trigger does not match the active condition");
  }

  const changed = materialPlanChange(snapshot.run, input.plan);
  let run = snapshot.run;
  if (changed) {
    run = reviseGoalRunPlanV1(run, {
      actor: required(input.actor, "actor"),
      at: timestamp(input.at, "at"),
      objective: input.plan?.objective,
      steps: input.plan!.steps,
      reason: required(input.plan?.reason, "plan revision reason")
    });
  }
  run = transitionGoalRunV1(run, "ACTIVE", { actor: required(input.actor, "actor"), at: timestamp(input.at, "at"), reason: "AUTHORIZED_WAKE" });
  const outcome: Exclude<CampaignWakeOutcomeV1, "DUPLICATE"> = changed ? "PLAN_REVISED" : input.plan ? "NO_CHANGE" : "RESUMED";
  const priorSequence = snapshot.wakeHistory.at(-1)?.sequence ?? 0;
  const record: CampaignWakeRecordV1 = {
    sequence: priorSequence + 1,
    wakeId,
    wakeClass: input.wakeClass,
    triggerValue: trigger.value,
    actor: required(input.actor, "actor"),
    at: timestamp(input.at, "at"),
    outcome,
    planVersion: run.planVersion
  };
  const updated = freeze({
    ...clone(snapshot),
    run,
    appliedWakeIds: unique([...snapshot.appliedWakeIds, wakeId], MAX_WAKE_HISTORY),
    wakeHistory: [...clone(snapshot.wakeHistory), record].slice(-MAX_WAKE_HISTORY)
  });
  return freeze({ outcome, snapshot: updated, pendingStepIds: pendingSteps(updated), replayedCompletedStepIds: [] as const, externalSideEffects: 0 as const });
}
