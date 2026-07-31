// Phase 5 security: actor identity must not be derived from request headers.
// For Milestone 12 we use a deterministic server-side actor label.

export function getExecutionActor(request: Request): { actor: string; synthetic: boolean } {
  void request;
  return { actor: "dashboard", synthetic: false };
}

export function isM12HarnessModeEnabled(): boolean {
  // Strong server-side harness boundary:
  // - Disabled by default
  // - Must be explicitly enabled via env
  // - Must not be active in production
  // - Must require dashboard auth to be configured (token present)
  const enabled = String(process.env.ACTIONS_ENABLE_M12_HARNESS ?? "") === "1";
  const nonProd = String(process.env.NODE_ENV ?? "") !== "production";
  const hasDashboardToken = Boolean(process.env.DASHBOARD_ADMIN_TOKEN?.trim());
  return enabled && nonProd && hasDashboardToken;
}

export type ExecutionRuntimeOverrides = {
  nodeEnv?: string;
  enableExecutionBoundaryFlag?: string;
  enableMockExecutionFlag?: string;
};

export function applyM12HarnessOverrides(input: {
  registry: {
    isAdapterEnabled(id: string): boolean;
    isCategoryEnabled(category: string): boolean;
    isEmergencyStopEnabled(actionId: string): boolean;
  };
  actionId: string;
  adapterId: string;
  category: string;
  overrides: HarnessGateOverrides;
  runtime?: ExecutionRuntimeOverrides;
}): { adapterEnabled: boolean; categoryEnabled: boolean; emergencyStop: boolean; runtime: ExecutionRuntimeOverrides } {
  const serverBoundary = input.runtime?.enableExecutionBoundaryFlag ?? String(process.env.ACTIONS_ENABLE_EXECUTION_BOUNDARY ?? "");
  const serverMock = input.runtime?.enableMockExecutionFlag ?? String(process.env.ACTIONS_ENABLE_MOCK_EXECUTION ?? "");

  return {
    // Monotonic: can only disable, never enable.
    adapterEnabled: input.registry.isAdapterEnabled(input.adapterId) && input.overrides.adapterDisabled !== true,
    categoryEnabled: input.registry.isCategoryEnabled(input.category) && input.overrides.categoryDisabled !== true,
    // Monotonic: can only enable an emergency stop, never disable one.
    emergencyStop: input.registry.isEmergencyStopEnabled(input.actionId) || input.overrides.emergencyStopEnabled === true,
    // Kill-switch flags are interpreted inside evaluateExecutionKillSwitches.
    runtime: {
      nodeEnv: input.runtime?.nodeEnv,
      enableExecutionBoundaryFlag: input.overrides.executionBoundaryDisabled === true ? "0" : serverBoundary,
      enableMockExecutionFlag: input.overrides.mockExecutionDisabled === true ? "0" : serverMock
    }
  };
}

export type HarnessGateOverrides = {
  // Disable-only overrides (monotonic). Any missing/invalid value must preserve
  // server configuration.
  executionBoundaryDisabled?: true;
  mockExecutionDisabled?: true;
  adapterDisabled?: true;
  categoryDisabled?: true;

  // Stop-only override (cannot disable an existing stop).
  emergencyStopEnabled?: true;
};

export function getHarnessGateOverrides(request: Request): HarnessGateOverrides {
  const harness = String(request.headers.get("x-m12-harness") ?? "").trim();
  if (!(isM12HarnessModeEnabled() && harness === "1")) return {};

  function disableOnly(name: string): true | undefined {
    const raw = request.headers.get(name);
    if (raw == null) return undefined;
    const v = String(raw).trim().toLowerCase();
    // Only accept the disabling value. Any other value preserves server config.
    if (v === "0" || v === "false") return true;
    return undefined;
  }

  function stopOnly(name: string): true | undefined {
    const raw = request.headers.get(name);
    if (raw == null) return undefined;
    const v = String(raw).trim().toLowerCase();
    // Only accept the enabling value. A caller cannot disable a stop.
    if (v === "1" || v === "true") return true;
    return undefined;
  }

  return {
    executionBoundaryDisabled: disableOnly("x-m12-execution-boundary-enabled"),
    mockExecutionDisabled: disableOnly("x-m12-mock-execution-enabled"),
    adapterDisabled: disableOnly("x-m12-adapter-enabled"),
    categoryDisabled: disableOnly("x-m12-category-enabled"),
    emergencyStopEnabled: stopOnly("x-m12-emergency-stop")
  };
}
