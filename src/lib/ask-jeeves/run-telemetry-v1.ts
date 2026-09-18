import "@/lib/server-only";

import {
  createSystemRun,
  finishSystemRun,
  upsertSystemRunCheckpoint,
} from "@/lib/supabase/queries";
import type { AgentKey } from "@/lib/types/requests";

export const ASK_JEEVES_RUN_TELEMETRY_VERSION_V1 = "ASK_JEEVES_RUN_TELEMETRY_V1" as const;

export type AskJeevesTelemetryModeV1 =
  | "BUSINESS_LOOKUP"
  | "BUSINESS_ANALYSIS"
  | "STRATEGIC_SYNTHESIS"
  | "EXTERNAL_RESEARCH"
  | "GENERAL";

export type AskJeevesTelemetryStageV1 = "DETERMINISTIC" | "ANSWER" | "SCOUT" | "SYNTHESIZE" | "VERIFY";

export type AskJeevesModelUsageV1 = Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  providerReportedCostUsd: number | null;
  costState: "PROVIDER_REPORTED" | "UNKNOWN";
}>;

export type AskJeevesStageExecutionTelemetryV1 = Readonly<{
  modelId: string | null;
  provider: string | null;
  modelTier: "NONE" | "LOCAL_EFFICIENT" | "BALANCED" | "FRONTIER" | null;
  reasoningEffort: "none" | "low" | "medium" | "high" | null;
  usage: AskJeevesModelUsageV1;
}>;

export type AskJeevesRunFinalDispositionV1 =
  | "DETERMINISTIC"
  | "VERIFIED"
  | "UNABLE_TO_VERIFY"
  | "MODEL_ANSWER_ACCEPTED"
  | "GROUNDED_FALLBACK";

type StageAggregate = {
  attempts: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  usageIncomplete: boolean;
  knownCostUsd: number;
  costIncomplete: boolean;
};

export type AskJeevesRunTelemetryDependenciesV1 = Readonly<{
  createRun: typeof createSystemRun;
  finishRun: typeof finishSystemRun;
  upsertCheckpoint: typeof upsertSystemRunCheckpoint;
  now: () => string;
  warn: (code: string) => void;
}>;

const DEFAULT_DEPENDENCIES: AskJeevesRunTelemetryDependenciesV1 = {
  createRun: createSystemRun,
  finishRun: finishSystemRun,
  upsertCheckpoint: upsertSystemRunCheckpoint,
  now: () => new Date().toISOString(),
  warn: (code) => console.warn("[ask-jeeves] telemetry persistence degraded", { code }),
};

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeAskJeevesModelUsageV1(input: Readonly<{
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
  cachedInputTokens?: unknown;
  providerReportedCostUsd?: unknown;
}> | null | undefined): AskJeevesModelUsageV1 {
  const inputTokens = finiteNonNegative(input?.inputTokens);
  const outputTokens = finiteNonNegative(input?.outputTokens);
  const suppliedTotal = finiteNonNegative(input?.totalTokens);
  const totalTokens = suppliedTotal ?? (
    inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null
  );
  const cachedInputTokens = finiteNonNegative(input?.cachedInputTokens);
  const providerReportedCostUsd = finiteNonNegative(input?.providerReportedCostUsd);
  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    providerReportedCostUsd,
    costState: providerReportedCostUsd == null ? "UNKNOWN" : "PROVIDER_REPORTED",
  });
}

function emptyAggregate(): StageAggregate {
  return {
    attempts: 0,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    usageIncomplete: false,
    knownCostUsd: 0,
    costIncomplete: false,
  };
}

function safeElapsed(startedAtMs: number): number {
  return Math.max(0, Date.now() - startedAtMs);
}

function checkpointKey(stage: AskJeevesTelemetryStageV1) {
  return `ask-jeeves:${stage.toLowerCase()}`;
}

function stageMetadata(input: {
  mode: AskJeevesTelemetryModeV1;
  stage: AskJeevesTelemetryStageV1;
  attempt: number;
  elapsedMs: number | null;
  sourceCount: number | null;
  verificationVerdict: "VERIFIED" | "UNVERIFIED" | "NOT_APPLICABLE" | null;
  acceptedResult: boolean | null;
  execution: AskJeevesStageExecutionTelemetryV1;
  aggregate: StageAggregate;
  failureClass?: string | null;
}) {
  return {
    telemetry_version: ASK_JEEVES_RUN_TELEMETRY_VERSION_V1,
    interface: "ASK_JEEVES",
    mode: input.mode,
    stage: input.stage,
    attempt: input.attempt,
    attempts: input.aggregate.attempts,
    elapsed_ms: input.elapsedMs,
    source_count: input.sourceCount,
    verification_verdict: input.verificationVerdict,
    accepted_result: input.acceptedResult,
    model_id: input.execution.modelId,
    provider: input.execution.provider,
    model_tier: input.execution.modelTier,
    reasoning_effort: input.execution.reasoningEffort,
    input_tokens: input.execution.usage.inputTokens,
    output_tokens: input.execution.usage.outputTokens,
    total_tokens: input.execution.usage.totalTokens,
    cached_input_tokens: input.execution.usage.cachedInputTokens,
    cost_state: input.execution.usage.costState,
    provider_reported_cost_usd: input.execution.usage.providerReportedCostUsd,
    aggregate_model_calls: input.aggregate.modelCalls,
    aggregate_total_tokens: input.aggregate.totalTokens,
    aggregate_cached_input_tokens: input.aggregate.cachedInputTokens,
    aggregate_usage_incomplete: input.aggregate.usageIncomplete,
    aggregate_known_cost_usd: input.aggregate.knownCostUsd,
    aggregate_cost_incomplete: input.aggregate.costIncomplete,
    failure_class: input.failureClass ?? null,
  };
}

function noModelExecution(): AskJeevesStageExecutionTelemetryV1 {
  return {
    modelId: null,
    provider: null,
    modelTier: "NONE",
    reasoningEffort: "none",
    usage: normalizeAskJeevesModelUsageV1({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      providerReportedCostUsd: 0,
    }),
  };
}

export type AskJeevesRunTelemetrySessionV1 = Readonly<{
  runId: string | null;
  stageStarted: (input: {
    stage: AskJeevesTelemetryStageV1;
    attempt: number;
    execution: AskJeevesStageExecutionTelemetryV1;
  }) => Promise<number>;
  stageCompleted: (input: {
    stage: AskJeevesTelemetryStageV1;
    attempt: number;
    startedAtMs: number;
    execution: AskJeevesStageExecutionTelemetryV1;
    sourceCount?: number | null;
    verificationVerdict?: "VERIFIED" | "UNVERIFIED" | "NOT_APPLICABLE" | null;
    acceptedResult?: boolean | null;
  }) => Promise<void>;
  stageFailed: (input: {
    stage: AskJeevesTelemetryStageV1;
    attempt: number;
    startedAtMs: number;
    execution: AskJeevesStageExecutionTelemetryV1;
    failureClass: string;
  }) => Promise<void>;
  recordDeterministic: () => Promise<void>;
  finish: (input: {
    disposition: AskJeevesRunFinalDispositionV1;
    failureClass?: string | null;
  }) => Promise<void>;
}>;

export async function createAskJeevesRunTelemetryV1(input: Readonly<{
  mode: AskJeevesTelemetryModeV1;
  ownerAgent: Extract<AgentKey, "noah" | "sloan" | "avery">;
  dependencies?: Partial<AskJeevesRunTelemetryDependenciesV1>;
}>): Promise<AskJeevesRunTelemetrySessionV1> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...input.dependencies };
  const aggregates = new Map<AskJeevesTelemetryStageV1, StageAggregate>();
  let runId: string | null = null;
  let telemetryDegraded = false;

  const warn = (code: string) => {
    telemetryDegraded = true;
    try {
      deps.warn(code);
    } catch {
      // Telemetry diagnostics must never alter the user-facing read-only answer.
    }
  };

  try {
    const run = await deps.createRun({
      agentKey: input.ownerAgent,
      runType: "manual",
      status: "running",
      startedAt: deps.now(),
    });
    runId = typeof run?.id === "string" ? run.id : null;
    if (!runId) warn("RUN_ID_MISSING");
  } catch {
    warn("RUN_CREATE_FAILED");
  }

  const aggregateFor = (stage: AskJeevesTelemetryStageV1) => {
    const existing = aggregates.get(stage);
    if (existing) return existing;
    const created = emptyAggregate();
    aggregates.set(stage, created);
    return created;
  };

  const persist = async (
    stage: AskJeevesTelemetryStageV1,
    status: "started" | "completed" | "failed",
    metadata: Record<string, unknown>,
  ) => {
    if (!runId) return;
    try {
      await deps.upsertCheckpoint({
        runId,
        agentKey: input.ownerAgent,
        checkpointKey: checkpointKey(stage),
        status,
        metadata,
        startedAtIso: status === "started" ? deps.now() : null,
        finishedAtIso: status === "started" ? null : deps.now(),
      });
    } catch {
      warn(`CHECKPOINT_${status.toUpperCase()}_FAILED`);
    }
  };

  const stageStarted: AskJeevesRunTelemetrySessionV1["stageStarted"] = async ({ stage, attempt, execution }) => {
    const aggregate = aggregateFor(stage);
    aggregate.attempts = Math.max(aggregate.attempts, attempt);
    const startedAtMs = Date.now();
    await persist(stage, "started", stageMetadata({
      mode: input.mode,
      stage,
      attempt,
      elapsedMs: null,
      sourceCount: null,
      verificationVerdict: null,
      acceptedResult: null,
      execution,
      aggregate,
    }));
    return startedAtMs;
  };

  const accumulate = (aggregate: StageAggregate, execution: AskJeevesStageExecutionTelemetryV1) => {
    if (execution.modelId == null) return;
    aggregate.modelCalls += 1;
    const usage = execution.usage;
    if (usage.inputTokens == null || usage.outputTokens == null || usage.totalTokens == null) {
      aggregate.usageIncomplete = true;
    }
    aggregate.inputTokens += usage.inputTokens ?? 0;
    aggregate.outputTokens += usage.outputTokens ?? 0;
    aggregate.totalTokens += usage.totalTokens ?? 0;
    aggregate.cachedInputTokens += usage.cachedInputTokens ?? 0;
    if (usage.costState === "PROVIDER_REPORTED" && usage.providerReportedCostUsd != null) {
      aggregate.knownCostUsd += usage.providerReportedCostUsd;
    } else {
      aggregate.costIncomplete = true;
    }
  };

  const stageCompleted: AskJeevesRunTelemetrySessionV1["stageCompleted"] = async ({
    stage,
    attempt,
    startedAtMs,
    execution,
    sourceCount = null,
    verificationVerdict = null,
    acceptedResult = null,
  }) => {
    const aggregate = aggregateFor(stage);
    aggregate.attempts = Math.max(aggregate.attempts, attempt);
    accumulate(aggregate, execution);
    await persist(stage, "completed", stageMetadata({
      mode: input.mode,
      stage,
      attempt,
      elapsedMs: safeElapsed(startedAtMs),
      sourceCount,
      verificationVerdict,
      acceptedResult,
      execution,
      aggregate,
    }));
  };

  const stageFailed: AskJeevesRunTelemetrySessionV1["stageFailed"] = async ({
    stage,
    attempt,
    startedAtMs,
    execution,
    failureClass,
  }) => {
    const aggregate = aggregateFor(stage);
    aggregate.attempts = Math.max(aggregate.attempts, attempt);
    // A thrown provider call does not expose trustworthy usage/cost. Mark the run
    // incomplete rather than inventing zero spend or zero tokens.
    if (execution.modelId != null) {
      aggregate.modelCalls += 1;
      aggregate.usageIncomplete = true;
      aggregate.costIncomplete = true;
    }
    await persist(stage, "failed", stageMetadata({
      mode: input.mode,
      stage,
      attempt,
      elapsedMs: safeElapsed(startedAtMs),
      sourceCount: null,
      verificationVerdict: null,
      acceptedResult: false,
      execution,
      aggregate,
      failureClass,
    }));
  };

  const recordDeterministic = async () => {
    const stage: AskJeevesTelemetryStageV1 = "DETERMINISTIC";
    const aggregate = aggregateFor(stage);
    aggregate.attempts = 1;
    const execution = noModelExecution();
    await persist(stage, "completed", stageMetadata({
      mode: input.mode,
      stage,
      attempt: 1,
      elapsedMs: 0,
      sourceCount: 0,
      verificationVerdict: "NOT_APPLICABLE",
      acceptedResult: true,
      execution,
      aggregate,
    }));
  };

  const finish: AskJeevesRunTelemetrySessionV1["finish"] = async ({ disposition, failureClass = null }) => {
    if (!runId) return;
    const all = [...aggregates.values()];
    const totalModelCalls = all.reduce((sum, value) => sum + value.modelCalls, 0);
    const totalTokens = all.reduce((sum, value) => sum + value.totalTokens, 0);
    const totalCachedInputTokens = all.reduce((sum, value) => sum + value.cachedInputTokens, 0);
    const knownCostUsd = all.reduce((sum, value) => sum + value.knownCostUsd, 0);
    const usageIncomplete = all.some((value) => value.usageIncomplete);
    const costIncomplete = all.some((value) => value.costIncomplete);
    try {
      await deps.finishRun(runId, {
        status: "completed",
        outputsJson: {
          telemetry_version: ASK_JEEVES_RUN_TELEMETRY_VERSION_V1,
          interface: "ASK_JEEVES",
          mode: input.mode,
          final_disposition: disposition,
          failure_class: failureClass,
          model_calls: totalModelCalls,
          total_tokens: totalTokens,
          cached_input_tokens: totalCachedInputTokens,
          cache_coverage_state: usageIncomplete ? "PARTIAL_OR_UNKNOWN" : "KNOWN",
          known_cost_usd: knownCostUsd,
          cost_complete: !costIncomplete,
          telemetry_degraded: telemetryDegraded,
        },
      });
    } catch {
      warn("RUN_FINISH_FAILED");
    }
  };

  return Object.freeze({
    runId,
    stageStarted,
    stageCompleted,
    stageFailed,
    recordDeterministic,
    finish,
  });
}
