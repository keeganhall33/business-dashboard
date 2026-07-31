import type { ExecuteResult } from "@/lib/actions/execution/adapter-contract";

import type { MockAdapterMode } from "@/lib/actions/execution/adapters/mock/mock-adapter-modes";

export type MockAdapterStep = {
  name: string;
  status: "succeeded" | "failed" | "skipped";
};

export type MockAdapterExecutionSnapshot = {
  mode: MockAdapterMode;
  providerExecutionId: string;
  steps: MockAdapterStep[];
  result: Record<string, unknown>;
};

export function buildMockExecuteResult(input: {
  ok: boolean;
  status: ExecuteResult["status"];
  providerExecutionId: string;
  steps: MockAdapterStep[];
  rollbackEligible: boolean;
  result: Record<string, unknown>;
}): ExecuteResult {
  return {
    ok: input.ok,
    status: input.status,
    externalSideEffects: 0,
    providerExecutionId: input.providerExecutionId,
    completedSteps: input.steps.filter((s) => s.status === "succeeded").map((s) => s.name),
    failedSteps: input.steps.filter((s) => s.status === "failed").map((s) => s.name),
    rollbackEligible: input.rollbackEligible,
    result: input.result
  };
}

