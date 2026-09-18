import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAskJeevesExecutionTelemetryV1,
  createAskJeevesRunTelemetryV1,
  normalizeAskJeevesModelUsageV1,
  type AskJeevesRunTelemetryDependenciesV1,
} from "../../src/lib/ask-jeeves/run-telemetry-v1";

type CheckpointWrite = {
  runId: string;
  agentKey: string;
  checkpointKey: string;
  status: string;
  metadata?: Record<string, unknown>;
};

function harness(options?: { failCreate?: boolean; failCheckpoint?: boolean; failFinish?: boolean }) {
  const runCreates: Array<Record<string, unknown>> = [];
  const checkpoints: CheckpointWrite[] = [];
  const finishes: Array<{ id: string; input: Record<string, unknown> }> = [];
  const warnings: string[] = [];

  const dependencies: AskJeevesRunTelemetryDependenciesV1 = {
    createRun: (async (input: Record<string, unknown>) => {
      runCreates.push(input);
      if (options?.failCreate) throw new Error("persistence unavailable");
      return { id: "run-1" };
    }) as AskJeevesRunTelemetryDependenciesV1["createRun"],
    upsertCheckpoint: (async (input: CheckpointWrite) => {
      checkpoints.push(structuredClone(input));
      if (options?.failCheckpoint) throw new Error("checkpoint unavailable");
      return { id: `${input.runId}:${input.checkpointKey}` };
    }) as AskJeevesRunTelemetryDependenciesV1["upsertCheckpoint"],
    finishRun: (async (id: string, input: Record<string, unknown>) => {
      finishes.push({ id, input: structuredClone(input) });
      if (options?.failFinish) throw new Error("finish unavailable");
      return { id };
    }) as AskJeevesRunTelemetryDependenciesV1["finishRun"],
    now: () => "2026-09-18T16:00:00.000Z",
    warn: (code) => warnings.push(code),
  };

  return { dependencies, runCreates, checkpoints, finishes, warnings };
}

test("normalizes provider usage without inventing missing tokens or cost", () => {
  assert.deepEqual(
    normalizeAskJeevesModelUsageV1({ inputTokens: 100, outputTokens: 25, cachedInputTokens: 40 }),
    {
      inputTokens: 100,
      outputTokens: 25,
      totalTokens: 125,
      cachedInputTokens: 40,
      providerReportedCostUsd: null,
      costState: "UNKNOWN",
    },
  );

  assert.deepEqual(
    normalizeAskJeevesModelUsageV1({ totalTokens: 500, providerReportedCostUsd: 0.42 }),
    {
      inputTokens: null,
      outputTokens: null,
      totalTokens: 500,
      cachedInputTokens: null,
      providerReportedCostUsd: 0.42,
      costState: "PROVIDER_REPORTED",
    },
  );
});

test("creates one canonical run and reuses one checkpoint key across retries", async () => {
  const state = harness();
  const session = await createAskJeevesRunTelemetryV1({
    mode: "EXTERNAL_RESEARCH",
    ownerAgent: "noah",
    dependencies: state.dependencies,
  });
  const execution = buildAskJeevesExecutionTelemetryV1({
    modelCallAttempted: true,
    modelId: "openai/gpt-5.6-terra",
    provider: "openai",
    modelTier: "BALANCED",
    reasoningEffort: "medium",
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150, cachedInputTokens: 20 },
  });

  const firstStarted = await session.stageStarted({ stage: "SCOUT", attempt: 1, execution });
  await session.stageFailed({
    stage: "SCOUT",
    attempt: 1,
    startedAtMs: firstStarted,
    execution,
    failureClass: "TRANSIENT_PROVIDER_FAILURE",
  });
  const secondStarted = await session.stageStarted({ stage: "SCOUT", attempt: 2, execution });
  await session.stageCompleted({
    stage: "SCOUT",
    attempt: 2,
    startedAtMs: secondStarted,
    execution,
    sourceCount: 4,
    verificationVerdict: "NOT_APPLICABLE",
    acceptedResult: true,
  });
  await session.finish({ disposition: "VERIFIED" });

  assert.equal(state.runCreates.length, 1);
  assert.equal(state.runCreates[0].agentKey, "noah");
  assert.equal(state.runCreates[0].runType, "manual");
  assert.ok(state.checkpoints.length >= 4);
  assert.deepEqual(new Set(state.checkpoints.map((row) => row.checkpointKey)), new Set(["ask-jeeves:scout"]));
  assert.equal(state.checkpoints.at(-1)?.metadata?.attempts, 2);
  assert.equal(state.checkpoints.at(-1)?.metadata?.source_count, 4);
  assert.equal(state.checkpoints.at(-1)?.metadata?.aggregate_model_calls, 2);

  const output = state.finishes[0].input.outputsJson as Record<string, unknown>;
  assert.equal(output.model_calls, 2);
  assert.equal(output.total_tokens, 150);
  assert.equal(output.cost_complete, false);
  assert.equal(output.telemetry_degraded, false);
});

test("records deterministic lookup as zero model calls without a fake provider cost", async () => {
  const state = harness();
  const session = await createAskJeevesRunTelemetryV1({
    mode: "BUSINESS_LOOKUP",
    ownerAgent: "sloan",
    dependencies: state.dependencies,
  });

  await session.recordDeterministic();
  await session.finish({ disposition: "DETERMINISTIC" });

  const checkpoint = state.checkpoints.at(-1)!;
  assert.equal(checkpoint.checkpointKey, "ask-jeeves:deterministic");
  assert.equal(checkpoint.metadata?.model_call_attempted, false);
  assert.equal(checkpoint.metadata?.provider, null);
  assert.equal(checkpoint.metadata?.model_id, null);
  assert.equal(checkpoint.metadata?.provider_reported_cost_usd, null);
  assert.equal(checkpoint.metadata?.cost_state, "UNKNOWN");

  const output = state.finishes[0].input.outputsJson as Record<string, unknown>;
  assert.equal(output.model_calls, 0);
  assert.equal(output.total_tokens, 0);
  assert.equal(output.known_cost_usd, 0);
  assert.equal(output.cost_complete, true);
  assert.equal(output.cache_coverage_state, "NOT_APPLICABLE");
});

test("keeps privacy-sensitive content outside persisted telemetry metadata", async () => {
  const state = harness();
  const session = await createAskJeevesRunTelemetryV1({
    mode: "STRATEGIC_SYNTHESIS",
    ownerAgent: "avery",
    dependencies: state.dependencies,
  });
  const execution = buildAskJeevesExecutionTelemetryV1({
    modelCallAttempted: true,
    modelTier: "FRONTIER",
    reasoningEffort: "high",
    usage: {},
  });
  const started = await session.stageStarted({ stage: "ANSWER", attempt: 1, execution });
  await session.stageCompleted({
    stage: "ANSWER",
    attempt: 1,
    startedAtMs: started,
    execution,
    sourceCount: 0,
    verificationVerdict: "NOT_APPLICABLE",
    acceptedResult: true,
  });
  await session.finish({ disposition: "MODEL_ANSWER_ACCEPTED" });

  const persisted = JSON.stringify({
    runCreates: state.runCreates,
    checkpoints: state.checkpoints,
    finishes: state.finishes,
  });
  for (const forbidden of ["question", "prompt", "source_body", "email_body", "reasoning_trace", "credential", "cookie"]) {
    assert.equal(persisted.toLowerCase().includes(forbidden), false);
  }
});

test("telemetry persistence failures fail open and expose only safe diagnostic codes", async () => {
  const createFailure = harness({ failCreate: true });
  const noRun = await createAskJeevesRunTelemetryV1({
    mode: "GENERAL",
    ownerAgent: "avery",
    dependencies: createFailure.dependencies,
  });
  assert.equal(noRun.runId, null);
  await noRun.recordDeterministic();
  await noRun.finish({ disposition: "GROUNDED_FALLBACK" });
  assert.deepEqual(createFailure.warnings, ["RUN_CREATE_FAILED"]);

  const checkpointFailure = harness({ failCheckpoint: true });
  const session = await createAskJeevesRunTelemetryV1({
    mode: "GENERAL",
    ownerAgent: "avery",
    dependencies: checkpointFailure.dependencies,
  });
  await session.recordDeterministic();
  await session.finish({ disposition: "DETERMINISTIC" });
  assert.ok(checkpointFailure.warnings.includes("CHECKPOINT_COMPLETED_FAILED"));
  const output = checkpointFailure.finishes[0].input.outputsJson as Record<string, unknown>;
  assert.equal(output.telemetry_degraded, true);
});

test("reported cost is preserved as reported while UNKNOWN remains incomplete", async () => {
  const state = harness();
  const session = await createAskJeevesRunTelemetryV1({
    mode: "GENERAL",
    ownerAgent: "avery",
    dependencies: state.dependencies,
  });
  const execution = buildAskJeevesExecutionTelemetryV1({
    modelCallAttempted: true,
    modelId: "openai/gpt-5.6-luna",
    provider: "openai",
    modelTier: "LOCAL_EFFICIENT",
    reasoningEffort: "low",
    usage: {
      inputTokens: 300,
      outputTokens: 50,
      totalTokens: 350,
      cachedInputTokens: 120,
      providerReportedCostUsd: 0.015,
    },
  });
  const started = await session.stageStarted({ stage: "ANSWER", attempt: 1, execution });
  await session.stageCompleted({
    stage: "ANSWER",
    attempt: 1,
    startedAtMs: started,
    execution,
    acceptedResult: true,
  });
  await session.finish({ disposition: "MODEL_ANSWER_ACCEPTED" });

  const output = state.finishes[0].input.outputsJson as Record<string, unknown>;
  assert.equal(output.total_tokens, 350);
  assert.equal(output.cached_input_tokens, 120);
  assert.equal(output.known_cost_usd, 0.015);
  assert.equal(output.cost_complete, true);
});
