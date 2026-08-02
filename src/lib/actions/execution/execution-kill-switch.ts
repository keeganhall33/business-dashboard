import { evaluateExecutionKillSwitches } from "@/lib/actions/execution/kill-switch";

export type ExecutionGateEvaluation = {
  allowed: boolean;
  blockingReasons: string[];
  evaluatedAtUtc: string;
  env: string;
  adapter: string;
  category: string;
  actionId: string;
  gates: {
    productionBlocked: boolean;
    globalEnabled: boolean;
    envEnabled: boolean;
    adapterEnabled: boolean;
    categoryEnabled: boolean;
    emergencyStop: boolean;
  };
};

export type ExecutionRuntimeOverrides = {
  nodeEnv?: string;
  enableExecutionBoundaryFlag?: string;
  enableMockExecutionFlag?: string;
};

export function evaluateExecutionGates(input: {
  actionId: string;
  category: string;
  adapterId: string;
  supabaseUrl: string;
  emergencyStop: boolean;
  adapterEnabled: boolean;
  categoryEnabled: boolean;
  runtime?: ExecutionRuntimeOverrides;
}): ExecutionGateEvaluation {
  const base = evaluateExecutionKillSwitches({
    nodeEnv: input.runtime?.nodeEnv ?? process.env.NODE_ENV,
    supabaseUrl: input.supabaseUrl,
    enableExecutionBoundaryFlag: input.runtime?.enableExecutionBoundaryFlag ?? process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY,
    enableMockExecutionFlag: input.runtime?.enableMockExecutionFlag ?? process.env.ACTIONS_ENABLE_MOCK_EXECUTION
  });

  const reasons = [...base.reasons];
  const productionBlocked = base.reasons.some((r) => r.includes("production") || r.includes("Unknown execution environment"));
  const globalEnabled = base.flags.enableExecutionBoundary;
  const envEnabled = base.env !== "unknown";
  const adapterEnabled = input.adapterEnabled;
  const categoryEnabled = input.categoryEnabled;
  const emergencyStop = input.emergencyStop;

  if (!adapterEnabled) reasons.push("Adapter gate disabled");
  if (!categoryEnabled) reasons.push("Category gate disabled");
  if (emergencyStop) reasons.push("Per-action emergency stop enabled");

  return {
    allowed: reasons.length === 0,
    blockingReasons: reasons,
    evaluatedAtUtc: new Date().toISOString(),
    env: base.env,
    adapter: input.adapterId,
    category: input.category,
    actionId: input.actionId,
    gates: {
      productionBlocked,
      globalEnabled,
      envEnabled,
      adapterEnabled,
      categoryEnabled,
      emergencyStop
    }
  };
}
