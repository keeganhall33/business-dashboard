import { ExecutionDomainError } from "@/lib/actions/execution/domain-errors";
import { normalizeOperatorId, requireHumanOperatorId } from "@/lib/actions/execution/operator";

// Phase 5: server-derived actor identity.
// Dashboard auth is the outer gate; we still block agent identities for execution.

export function getExecutionActor(request: Request): { actor: string; synthetic: boolean } {
  const base = "dashboard";
  const raw = String(request.headers.get("x-m12-harness-actor") ?? "").trim();
  const harness = String(request.headers.get("x-m12-harness") ?? "").trim();

  if (process.env.NODE_ENV !== "production" && harness === "1" && raw) {
    // Synthetic-only override for staging harness.
    const normalized = normalizeOperatorId(raw);
    if (!normalized) throw new ExecutionDomainError({ code: "EXECUTION_SELF_CONFIRMATION_BLOCKED", message: "Missing operator identity", httpStatus: 400 });
    // Still enforce human operator rule (blocks agent identities).
    return { actor: requireHumanOperatorId(normalized), synthetic: true };
  }

  return { actor: base, synthetic: false };
}

export type HarnessGateOverrides = {
  executionBoundaryEnabled?: boolean;
  mockExecutionEnabled?: boolean;
  adapterEnabled?: boolean;
  categoryEnabled?: boolean;
  emergencyStop?: boolean;
};

export function getHarnessGateOverrides(request: Request): HarnessGateOverrides {
  const harness = String(request.headers.get("x-m12-harness") ?? "").trim();
  if (!(process.env.NODE_ENV !== "production" && harness === "1")) return {};

  function boolHeader(name: string): boolean | undefined {
    const raw = request.headers.get(name);
    if (raw == null) return undefined;
    const v = String(raw).trim().toLowerCase();
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
    return undefined;
  }

  return {
    executionBoundaryEnabled: boolHeader("x-m12-execution-boundary-enabled"),
    mockExecutionEnabled: boolHeader("x-m12-mock-execution-enabled"),
    adapterEnabled: boolHeader("x-m12-adapter-enabled"),
    categoryEnabled: boolHeader("x-m12-category-enabled"),
    emergencyStop: boolHeader("x-m12-emergency-stop")
  };
}
