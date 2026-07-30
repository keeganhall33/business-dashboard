type ExecEnv = "staging" | "local";

export type ExecutionKillSwitchSnapshot = {
  allowed: boolean;
  reasons: string[];
  env: ExecEnv | "unknown";
  flags: {
    enableExecutionBoundary: boolean;
    enableMockExecution: boolean;
  };
};

function isProdProjectRef(host: string): boolean {
  // Hard-coded production project ref guard (Milestone 11 precedent).
  // If this changes, update with explicit operator review.
  return host.includes("ibjsjosplgbqevmnvvpf");
}

function detectEnvFromSupabaseHost(host: string): ExecEnv | "unknown" {
  if (!host) return "unknown";
  if (isProdProjectRef(host)) return "unknown";
  // For now, treat non-production refs as staging.
  return "staging";
}

export function evaluateExecutionKillSwitches(input: {
  nodeEnv: string | undefined;
  supabaseUrl: string;
  enableExecutionBoundaryFlag: string | undefined;
  enableMockExecutionFlag: string | undefined;
}): ExecutionKillSwitchSnapshot {
  const reasons: string[] = [];
  const nodeEnv = (input.nodeEnv ?? "").toLowerCase();
  if (nodeEnv === "production") reasons.push("NODE_ENV=production blocks execution");

  const host = new URL(input.supabaseUrl).host;
  if (isProdProjectRef(host)) reasons.push("Production Supabase project ref blocks execution");

  const env = detectEnvFromSupabaseHost(host);
  if (env === "unknown") reasons.push("Unknown execution environment blocks execution");

  const enableExecutionBoundary = (input.enableExecutionBoundaryFlag ?? "").toLowerCase();
  const enableMockExecution = (input.enableMockExecutionFlag ?? "").toLowerCase();

  const boundaryOn = enableExecutionBoundary === "1" || enableExecutionBoundary === "true";
  const mockOn = enableMockExecution === "1" || enableMockExecution === "true";
  if (!boundaryOn) reasons.push("ACTIONS_ENABLE_EXECUTION_BOUNDARY must be enabled");
  if (!mockOn) reasons.push("ACTIONS_ENABLE_MOCK_EXECUTION must be enabled");

  return {
    allowed: reasons.length === 0,
    reasons,
    env,
    flags: { enableExecutionBoundary: boundaryOn, enableMockExecution: mockOn }
  };
}

